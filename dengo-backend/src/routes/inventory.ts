import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { updateStock, setStock } from '../services/inventory.service.js'
import { resolveBranchScope, canAccessBranch } from '../lib/branch-scope.js'
import { hasPermission, requirePermission } from '../lib/permissions.js'
import { multiWordSearch } from '../lib/search.js'

// Same thresholds as the frontend's computeStatus() — duplicated here because
// 'low'/'critical'/'overstock' compares two columns from different tables
// (Inventory.quantity vs Product.minStock) row-by-row, which Prisma's typed
// `where` can't express without raw SQL.
const STATUS_CASE_SQL = Prisma.sql`(CASE
  WHEN i."QUANTITY" = 0 THEN 'critical'
  WHEN i."QUANTITY" <= p."MIN_STOCK" * 0.5 THEN 'critical'
  WHEN i."QUANTITY" <= p."MIN_STOCK" THEN 'low'
  WHEN i."QUANTITY" > p."MIN_STOCK" * 3 THEN 'overstock'
  ELSE 'normal'
END)`

export default async function inventoryRoutes(fastify: FastifyInstance) {
  // GET /api/inventory?branchId=
  fastify.get('/', { preHandler: [fastify.authenticate, requirePermission('inventory.view')] }, async (request, reply) => {
    const q = request.query as { branchId?: string; search?: string; category?: string; status?: string; page?: string; limit?: string }
    const branchId = resolveBranchScope(request, q.branchId)
    const where = {
      ...(branchId ? { branchId } : {}),
      ...((q.search || q.category) ? {
        product: {
          ...(q.search ? multiWordSearch(q.search, word => [
            { name: { contains: word, mode: 'insensitive' as const } },
            { barcode: { contains: word, mode: 'insensitive' as const } },
            { sku: { contains: word, mode: 'insensitive' as const } },
          ]) : {}),
          ...(q.category ? { category: { name: q.category } } : {}),
        },
      } : {}),
    }

    // Paginated path — opt-in via `page`, used by the Inventory management
    // page. Search/category/status are all applied server-side (via raw SQL,
    // since status is a computed cross-table comparison) so a filter like
    // "Abarrotes" matches across the whole branch, not just the current
    // page's 50 rows. Stats stay unaffected by any of these filters — always
    // the whole branch — same as before pagination existed.
    if (q.page) {
      const page = Math.max(1, parseInt(q.page, 10) || 1)
      const limit = Math.min(200, Math.max(1, parseInt(q.limit ?? '50', 10) || 50))

      const conditions: Prisma.Sql[] = []
      if (branchId) conditions.push(Prisma.sql`i."BRANCH_ID" = ${branchId}`)
      if (q.search) {
        // Same multi-word AND-of-OR as multiWordSearch() — "hojas bond"
        // matches "Hojas de Papel Bond" even though the words aren't
        // adjacent, which a single ILIKE '%hojas bond%' would miss.
        for (const word of q.search.trim().split(/\s+/).filter(Boolean)) {
          const w = `%${word}%`
          conditions.push(Prisma.sql`(p."NAME" ILIKE ${w} OR p."BARCODE" ILIKE ${w} OR p."SKU" ILIKE ${w})`)
        }
      }
      if (q.category) conditions.push(Prisma.sql`c."NAME" = ${q.category}`)
      if (q.status) conditions.push(Prisma.sql`${STATUS_CASE_SQL} = ${q.status}`)
      const whereSql = conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.sql``

      const [rows, countRows, statsRows] = await Promise.all([
        prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
          SELECT i."ID" as id
          FROM "INVENTORY" i
          JOIN "PRODUCTS" p ON p."ID" = i."PRODUCT_ID"
          JOIN "CATEGORIES" c ON c."ID" = p."CATEGORY_ID"
          ${whereSql}
          ORDER BY p."NAME" ASC
          LIMIT ${limit} OFFSET ${(page - 1) * limit}
        `),
        prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
          SELECT COUNT(*)::bigint as count
          FROM "INVENTORY" i
          JOIN "PRODUCTS" p ON p."ID" = i."PRODUCT_ID"
          JOIN "CATEGORIES" c ON c."ID" = p."CATEGORY_ID"
          ${whereSql}
        `),
        prisma.inventory.findMany({
          where: branchId ? { branchId } : {},
          select: { quantity: true, product: { select: { minStock: true, basePrice: true, cost: true } } },
        }),
      ])

      const total = Number(countRows[0]?.count ?? 0)
      const ids = rows.map(r => r.id)
      const items = ids.length ? await prisma.inventory.findMany({
        where: { id: { in: ids } },
        include: {
          product: { include: { category: true, baseUnit: true } },
          branch: { select: { id: true, name: true } },
        },
      }) : []
      const byId = new Map(items.map(it => [it.id, it]))
      const data = ids.map(id => byId.get(id)).filter((x): x is typeof items[number] => !!x)

      let lowStock = 0, overstock = 0, totalValue = 0, totalSaleValue = 0
      for (const row of statsRows) {
        const qty = Number(row.quantity)
        const minStock = Number(row.product.minStock ?? 0)
        if (qty <= minStock) lowStock++
        else if (qty > minStock * 3) overstock++
        totalValue += qty * Number(row.product.cost ?? 0)
        totalSaleValue += qty * Number(row.product.basePrice ?? 0)
      }

      return reply.send({
        data,
        total,
        page,
        limit,
        stats: { totalProducts: statsRows.length, totalValue, totalSaleValue, lowStock, overstock },
      })
    }

    const inventory = await prisma.inventory.findMany({
      where,
      include: {
        product: { include: { category: true, baseUnit: true } },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { product: { name: 'asc' } },
    })
    return reply.send(inventory)
  })

  // GET /api/inventory/movements
  fastify.get('/movements', { preHandler: [fastify.authenticate, requirePermission('inventory.view')] }, async (request, reply) => {
    const q = request.query as { branchId?: string; productId?: string; from?: string; to?: string; type?: string }
    const branchId = resolveBranchScope(request, q.branchId)
    const movements = await prisma.stockMovement.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        ...(q.productId ? { productId: q.productId } : {}),
        ...(q.type ? { type: q.type as any } : {}),
        ...(q.from || q.to ? {
          createdAt: {
            ...(q.from ? { gte: new Date(q.from) } : {}),
            ...(q.to ? { lte: new Date(q.to) } : {}),
          },
        } : {}),
      },
      include: {
        product: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        performedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    })
    return reply.send(movements)
  })

  // GET /api/inventory/:productId/:branchId
  fastify.get('/:productId/:branchId', { preHandler: [fastify.authenticate, requirePermission('inventory.view')] }, async (request, reply) => {
    const { productId, branchId } = request.params as { productId: string; branchId: string }
    if (!canAccessBranch(request, branchId)) return reply.status(403).send({ error: 'Acceso denegado' })
    const inv = await prisma.inventory.findUnique({
      where: { productId_branchId: { productId, branchId } },
      include: { product: true, branch: true },
    })
    return reply.send({ quantity: Number(inv?.quantity ?? 0), inventory: inv })
  })

  // GET /api/inventory/:productId/all-branches — cross-branch stock lookup
  // for the POS ("¿tienen esto en otra sucursal?"). Deliberately NOT branch-
  // scoped like everything else here: the whole point is seeing branches the
  // cashier doesn't work at, to tell a customer where to go instead — stock
  // levels aren't sensitive the way sales/financials are.
  fastify.get('/:productId/all-branches', { preHandler: [fastify.authenticate, requirePermission('inventory.view')] }, async (request, reply) => {
    const { productId } = request.params as { productId: string }
    const branches = await prisma.branch.findMany({ where: { status: 'active' }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
    const stock = await prisma.inventory.findMany({ where: { productId }, select: { branchId: true, quantity: true } })
    const byBranch = new Map(stock.map(s => [s.branchId, Number(s.quantity)]))
    return reply.send(branches.map(b => ({ branchId: b.id, branchName: b.name, quantity: byBranch.get(b.id) ?? 0 })))
  })

  // PUT /api/inventory/:productId/:branchId  (manual adjustment)
  fastify.put('/:productId/:branchId', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { productId, branchId } = request.params as { productId: string; branchId: string }
    if (!canAccessBranch(request, branchId)) return reply.status(403).send({ error: 'Acceso denegado' })
    if (!hasPermission(request, 'inventory.adjust')) return reply.status(403).send({ error: 'Acceso denegado' })
    const body = z.object({
      quantity: z.number().min(0),
      reason: z.string().optional(),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    await setStock(productId, branchId, body.data.quantity, {
      type: 'ADJUSTMENT',
      reason: body.data.reason ?? 'Ajuste manual',
      performedById: request.user.id,
    })
    return reply.send({ message: 'Stock actualizado', quantity: body.data.quantity })
  })

  // POST /api/inventory/movements (manual IN/OUT)
  fastify.post('/movements', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = z.object({
      productId: z.string(),
      branchId: z.string(),
      type: z.enum(['IN', 'OUT', 'ADJUSTMENT', 'RETURN']),
      quantity: z.number().min(0.001),
      reason: z.string().optional(),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    if (!canAccessBranch(request, body.data.branchId)) return reply.status(403).send({ error: 'Acceso denegado' })
    if (!hasPermission(request, 'inventory.adjust')) return reply.status(403).send({ error: 'Acceso denegado' })

    const delta = body.data.type === 'OUT' ? -body.data.quantity : body.data.quantity
    await updateStock(body.data.productId, body.data.branchId, delta, {
      type: body.data.type,
      ...(body.data.reason !== undefined ? { reason: body.data.reason } : {}),
      performedById: request.user.id,
    })
    return reply.status(201).send({ message: 'Movimiento registrado' })
  })

  // POST /api/inventory/intake  (batch stock intake — used by Purchases module)
  fastify.post('/intake', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = z.object({
      branchId: z.string(),
      supplierId: z.string().optional(),
      items: z.array(z.object({
        productId: z.string(),
        productName: z.string(),
        quantity: z.number().min(0.001),
        unitCost: z.number().min(0),
        unitPrice: z.number().min(0).optional(),
      })).min(1),
      notes: z.string().optional(),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    if (!canAccessBranch(request, body.data.branchId)) return reply.status(403).send({ error: 'Acceso denegado' })
    if (!hasPermission(request, 'purchases.receive')) return reply.status(403).send({ error: 'Acceso denegado' })

    // Receiving merchandise is also where the cashier already knows this
    // batch's real cost/sale price — persisting them here to the product
    // (gated the same as the dedicated price-edit screen) avoids the double
    // work of entering the intake and then separately editing the product.
    const canEditPrice = hasPermission(request, 'inventory.editPrice')

    // Resolve supplier name for the reason field
    let supplierName = ''
    if (body.data.supplierId) {
      const sup = await prisma.supplier.findUnique({ where: { id: body.data.supplierId }, select: { name: true } })
      supplierName = sup?.name ?? ''
    }

    const referenceId = `INTAKE-${Date.now()}`
    for (const item of body.data.items) {
      const reason = [
        supplierName ? `Proveedor: ${supplierName}` : '',
        body.data.notes ?? `Ingreso — ${item.productName}`,
      ].filter(Boolean).join(' | ')
      await updateStock(item.productId, body.data.branchId, item.quantity, {
        type: 'IN',
        performedById: request.user.id,
        referenceId,
        reason,
      })

      if (canEditPrice) {
        const old = await prisma.product.findUnique({ where: { id: item.productId }, select: { cost: true, basePrice: true } })
        if (old) {
          const data: { cost?: number; basePrice?: number } = {}
          if (Number(old.cost) !== item.unitCost) data.cost = item.unitCost
          if (item.unitPrice !== undefined && Number(old.basePrice) !== item.unitPrice) data.basePrice = item.unitPrice
          if (Object.keys(data).length > 0) {
            await prisma.product.update({ where: { id: item.productId }, data })
            if (data.cost !== undefined) {
              await prisma.priceHistory.create({
                data: { productId: item.productId, field: 'Cost', oldValue: old.cost, newValue: data.cost, changedById: request.user.id },
              })
            }
            if (data.basePrice !== undefined) {
              await prisma.priceHistory.create({
                data: { productId: item.productId, field: 'BasePrice', oldValue: old.basePrice, newValue: data.basePrice, changedById: request.user.id },
              })
            }
          }
        }
      }
    }

    return reply.status(201).send({
      referenceId,
      itemCount: body.data.items.length,
      totalUnits: body.data.items.reduce((s, i) => s + i.quantity, 0),
    })
  })
}
