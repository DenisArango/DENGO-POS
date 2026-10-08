import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { updateStock, setStock } from '../services/inventory.service.js'
import { resolveBranchScope, canAccessBranch } from '../lib/branch-scope.js'
import { hasPermission, requirePermission } from '../lib/permissions.js'
import { multiWordSearch } from '../lib/search.js'
import { parseBusinessDateParam } from '../lib/timezone.js'

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
    // Comma-separated so Purchases.tsx can ask for "IN,ADJUSTMENT" in one
    // request — a Compras edit's reversal rows are type ADJUSTMENT (see
    // PUT /intake/:referenceId), and without them the signed-delta grouping
    // there has no way to net a correction back to the purchase's true
    // current total.
    const types = q.type?.split(',').map(t => t.trim()).filter(Boolean)
    const movements = await prisma.stockMovement.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        ...(q.productId ? { productId: q.productId } : {}),
        ...(types && types.length === 1 ? { type: types[0] } : {}),
        ...(types && types.length > 1 ? { type: { in: types } } : {}),
        ...(q.from || q.to ? {
          createdAt: {
            ...(q.from ? { gte: parseBusinessDateParam(q.from) } : {}),
            ...(q.to ? { lte: parseBusinessDateParam(q.to) } : {}),
          },
        } : {}),
      },
      include: {
        product: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        performedBy: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
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

  const intakeItemSchema = z.object({
    productId: z.string(),
    productName: z.string(),
    quantity: z.number().min(0.001),
    unitCost: z.number().min(0),
    unitPrice: z.number().min(0).optional(),
  })

  // Persisting cost/sale price here (gated the same as the dedicated
  // price-edit screen) avoids the double work of entering the intake and
  // then separately editing the product. Shared by both create and edit —
  // an edit that corrects a unit cost should update the product the same
  // way the original intake did.
  async function persistIntakePrices(
    items: z.infer<typeof intakeItemSchema>[],
    changedById: string,
  ): Promise<void> {
    for (const item of items) {
      const old = await prisma.product.findUnique({ where: { id: item.productId }, select: { cost: true, basePrice: true } })
      if (!old) continue
      const data: { cost?: number; basePrice?: number } = {}
      if (Number(old.cost) !== item.unitCost) data.cost = item.unitCost
      if (item.unitPrice !== undefined && Number(old.basePrice) !== item.unitPrice) data.basePrice = item.unitPrice
      if (Object.keys(data).length === 0) continue
      await prisma.product.update({ where: { id: item.productId }, data })
      if (data.cost !== undefined) {
        await prisma.priceHistory.create({
          data: { productId: item.productId, field: 'Cost', oldValue: old.cost, newValue: data.cost, changedById },
        })
      }
      if (data.basePrice !== undefined) {
        await prisma.priceHistory.create({
          data: { productId: item.productId, field: 'BasePrice', oldValue: old.basePrice, newValue: data.basePrice, changedById },
        })
      }
    }
  }

  async function resolveSupplierName(supplierId?: string): Promise<string> {
    if (!supplierId) return ''
    const sup = await prisma.supplier.findUnique({ where: { id: supplierId }, select: { name: true } })
    return sup?.name ?? ''
  }

  function buildIntakeReason(supplierName: string, notes: string | undefined, productName: string): string {
    return [
      supplierName ? `Proveedor: ${supplierName}` : '',
      notes ?? `Ingreso — ${productName}`,
    ].filter(Boolean).join(' | ')
  }

  // Global sequential "número de compra" — COMPRA-N, short and stable,
  // unlike the old INTAKE-${Date.now()} which was never shown anywhere.
  // Atomic per-row increment (same pattern as Branch.receiptNextNumber),
  // kept as its own single-row table since it must stay global: referenceId
  // groups movements across the whole system, not scoped to one branch, so
  // a per-branch counter would let two branches collide on the same number.
  async function nextPurchaseNumber(): Promise<number> {
    let counter = await prisma.purchaseCounter.findFirst()
    if (!counter) counter = await prisma.purchaseCounter.create({ data: {} })
    const updated = await prisma.purchaseCounter.update({
      where: { id: counter.id },
      data: { nextNumber: { increment: 1 } },
    })
    return updated.nextNumber - 1
  }

  // POST /api/inventory/intake  (batch stock intake — used by Purchases module)
  fastify.post('/intake', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = z.object({
      branchId: z.string(),
      supplierId: z.string().optional(),
      items: z.array(intakeItemSchema).min(1),
      notes: z.string().optional(),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    if (!canAccessBranch(request, body.data.branchId)) return reply.status(403).send({ error: 'Acceso denegado' })
    if (!hasPermission(request, 'purchases.receive')) return reply.status(403).send({ error: 'Acceso denegado' })

    const supplierName = await resolveSupplierName(body.data.supplierId)
    const referenceId = `COMPRA-${await nextPurchaseNumber()}`

    for (const item of body.data.items) {
      await updateStock(item.productId, body.data.branchId, item.quantity, {
        type: 'IN',
        performedById: request.user.id,
        referenceId,
        reason: buildIntakeReason(supplierName, body.data.notes, item.productName),
        unitCost: item.unitCost,
        ...(body.data.supplierId ? { supplierId: body.data.supplierId } : {}),
      })
    }

    if (hasPermission(request, 'inventory.editPrice')) {
      await persistIntakePrices(body.data.items, request.user.id)
    }

    return reply.status(201).send({
      referenceId,
      itemCount: body.data.items.length,
      totalUnits: body.data.items.reduce((s, i) => s + i.quantity, 0),
    })
  })

  // PUT /api/inventory/intake/:referenceId  (correct a closed purchase)
  //
  // There's no dedicated Purchase entity — a "compra" is just every
  // StockMovement sharing one referenceId. Editing one can't simply update
  // those rows' quantities in place: inventory.ts's grouping (Purchases.tsx)
  // trusts quantityBefore/quantityAfter against *all other* movements for
  // that product that have happened since, and rewriting history under them
  // would desync it from what live Inventory.quantity actually reflects.
  //
  // So an edit is realized the same way `PUT /api/sales/:id` already
  // corrects a past sale's items: reverse every old movement's effect at
  // its original branch (a RETURN), then (re)apply the corrected item list
  // at the (possibly different) destination branch (a fresh IN) — both
  // under the SAME referenceId. If the branch changed, that reverse-then-
  // reapply IS the inventory move the user asked for (out of the old
  // branch, into the new one), not just a label change. Purchases.tsx's
  // grouping sums quantityAfter-quantityBefore (signed) rather than the
  // always-positive `quantity` column specifically so this nets out to the
  // true final state instead of double-counting the reversal.
  fastify.put('/intake/:referenceId', { preHandler: [fastify.authenticate, requirePermission('purchases.edit')] }, async (request, reply) => {
    const { referenceId } = request.params as { referenceId: string }
    const body = z.object({
      branchId: z.string(),
      supplierId: z.string().optional(),
      items: z.array(intakeItemSchema).min(1),
      notes: z.string().optional(),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    // Every movement ever filed under this referenceId, including any left
    // by a PREVIOUS edit of this same purchase (its own reversal + reapply
    // pair). Only type IN would miss that a prior edit's reversal already
    // cancelled part of it out — querying every type and netting their
    // signed quantityAfter-quantityBefore (not the always-positive
    // `quantity` column, and not `type`, which elsewhere in this codebase
    // doesn't reliably imply direction — see the ADJUSTMENT reversal below)
    // is what correctly reduces to "what this purchase currently amounts
    // to", however many times it's been edited before.
    const existing = await prisma.stockMovement.findMany({
      where: { referenceId },
      orderBy: { createdAt: 'asc' },
    })
    if (existing.length === 0) return reply.status(404).send({ error: 'Compra no encontrada' })

    const oldBranchId = existing[existing.length - 1]!.branchId
    if (!canAccessBranch(request, oldBranchId)) return reply.status(403).send({ error: 'Acceso denegado' })
    if (!canAccessBranch(request, body.data.branchId)) return reply.status(403).send({ error: 'Acceso denegado' })

    const supplierName = await resolveSupplierName(body.data.supplierId)

    const netByProduct = new Map<string, number>()
    for (const m of existing) {
      const delta = Number(m.quantityAfter) - Number(m.quantityBefore)
      netByProduct.set(m.productId, (netByProduct.get(m.productId) ?? 0) + delta)
    }

    // Reverse what this purchase currently amounts to, at its current (old)
    // branch — type ADJUSTMENT, not RETURN: the manual-movements endpoint
    // above already treats RETURN as always-positive ("stock coming back
    // in"), so reusing it here with a negative delta would contradict that.
    for (const [productId, net] of netByProduct) {
      if (Math.abs(net) < 0.0005) continue
      await updateStock(productId, oldBranchId, -net, {
        type: 'ADJUSTMENT',
        performedById: request.user.id,
        referenceId,
        reason: 'Reverso por edición de compra',
      })
    }

    // Re-apply the corrected item list at the (possibly new) destination.
    for (const item of body.data.items) {
      await updateStock(item.productId, body.data.branchId, item.quantity, {
        type: 'IN',
        performedById: request.user.id,
        referenceId,
        reason: buildIntakeReason(supplierName, body.data.notes, item.productName),
        unitCost: item.unitCost,
        ...(body.data.supplierId ? { supplierId: body.data.supplierId } : {}),
      })
    }

    if (hasPermission(request, 'inventory.editPrice')) {
      await persistIntakePrices(body.data.items, request.user.id)
    }

    return reply.send({
      referenceId,
      itemCount: body.data.items.length,
      totalUnits: body.data.items.reduce((s, i) => s + i.quantity, 0),
      branchMoved: body.data.branchId !== oldBranchId,
    })
  })
}
