import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { updateStock, getConversionFactors } from '../services/inventory.service.js'
import { log } from '../services/audit.service.js'
import { resolveBranchScope, canAccessBranch } from '../lib/branch-scope.js'
import { requirePermission } from '../lib/permissions.js'
import { resolveOpenRegisterId } from './cash-registers.js'
import { currentUnitCosts } from '../lib/saleCost.js'

const itemSchema = z.object({
  productId: z.string().optional(),
  variationId: z.string().optional(),
  // A one-off line not from the catalog (ej. something not normally sold,
  // included just this one time) — see the schema comment on
  // QuotationItem.customName. Exactly one of productId/customName must be
  // set, enforced by the .refine() below.
  customName: z.string().min(1).max(200).optional(),
  quantity: z.number().min(0.001),
  unitPrice: z.number().min(0),
  discount: z.number().min(0).max(1).default(0),
  total: z.number().min(0),
}).refine(item => !!item.productId || !!item.customName, {
  message: 'Cada línea necesita un producto del catálogo o un nombre personalizado',
})

const createSchema = z.object({
  branchId: z.string(),
  customerId: z.string(),
  items: z.array(itemSchema).min(1),
  subtotal: z.number().min(0),
  tax: z.number().min(0).default(0),
  discount: z.number().min(0).default(0),
  total: z.number().min(0),
  validUntil: z.string(),
  notes: z.string().optional(),
})

const include = {
  branch: true,
  customer: true,
  createdBy: { select: { id: true, name: true } },
  items: { include: { product: { select: { id: true, name: true } }, variation: true } },
}

export default async function quotationRoutes(fastify: FastifyInstance) {
  fastify.get('/', { preHandler: [fastify.authenticate, requirePermission('quotations.view')] }, async (request, reply) => {
    const q = request.query as { status?: string; customerId?: string; branchId?: string; page?: string; limit?: string }
    const branchId = resolveBranchScope(request, q.branchId)
    const statusWhere = {
      ...(branchId ? { branchId } : {}),
      ...(q.customerId ? { customerId: q.customerId } : {}),
    }
    const where = {
      ...statusWhere,
      ...(q.status ? { status: q.status as any } : {}),
    }

    // Paginated path — opt-in via `page`, used by the Quotations page. No
    // natural cap otherwise (grows with every quotation ever created). Stats
    // reflect every status (not just the one currently selected) so the
    // status cards stay meaningful regardless of which filter is active.
    if (q.page) {
      const page = Math.max(1, parseInt(q.page, 10) || 1)
      const limit = Math.min(200, Math.max(1, parseInt(q.limit ?? '50', 10) || 50))
      const [data, total, statusTotal, statusCounts] = await Promise.all([
        prisma.quotation.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
        prisma.quotation.count({ where }),
        prisma.quotation.count({ where: statusWhere }),
        prisma.quotation.groupBy({ by: ['status'], where: statusWhere, _count: { status: true } }),
      ])
      const countByStatus = new Map(statusCounts.map(s => [s.status, s._count.status]))
      return reply.send({
        data,
        total,
        page,
        limit,
        stats: {
          total: statusTotal,
          draft: countByStatus.get('DRAFT') ?? 0,
          sent: countByStatus.get('SENT') ?? 0,
          accepted: countByStatus.get('ACCEPTED') ?? 0,
          rejected: (countByStatus.get('REJECTED') ?? 0) + (countByStatus.get('EXPIRED') ?? 0) + (countByStatus.get('CANCELLED') ?? 0),
        },
      })
    }

    return reply.send(await prisma.quotation.findMany({ where, include, orderBy: { createdAt: 'desc' } }))
  })

  fastify.get('/:id', { preHandler: [fastify.authenticate, requirePermission('quotations.view')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const q = await prisma.quotation.findUnique({ where: { id }, include })
    if (!q) return reply.status(404).send({ error: 'Cotización no encontrada' })
    if (!canAccessBranch(request, q.branchId)) return reply.status(403).send({ error: 'Acceso denegado' })
    return reply.send(q)
  })

  fastify.post('/', { preHandler: [fastify.authenticate, requirePermission('quotations.create')] }, async (request, reply) => {
    const body = createSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    if (!canAccessBranch(request, body.data.branchId)) return reply.status(403).send({ error: 'Acceso denegado' })

    const quotationNumber = `COT-${Date.now().toString().slice(-8)}`
    const q = await prisma.quotation.create({
      data: {
        quotationNumber,
        branchId: body.data.branchId,
        customerId: body.data.customerId,
        subtotal: body.data.subtotal,
        tax: body.data.tax,
        discount: body.data.discount,
        total: body.data.total,
        validUntil: new Date(body.data.validUntil),
        notes: body.data.notes,
        createdById: request.user.id,
        items: { create: body.data.items },
      },
      include,
    })
    await log({ userId: request.user.id, action: 'CREATE', entity: 'Quotation', entityId: q.id })
    return reply.status(201).send(q)
  })

  fastify.put('/:id', { preHandler: [fastify.authenticate, requirePermission('quotations.create')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const q = await prisma.quotation.findUnique({ where: { id } })
    if (!q || q.status !== 'DRAFT') return reply.status(400).send({ error: 'Solo se pueden editar cotizaciones en borrador' })
    if (!canAccessBranch(request, q.branchId)) return reply.status(403).send({ error: 'Acceso denegado' })

    const body = createSchema.partial().safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const { items, validUntil, ...rest } = body.data

    const updated = await prisma.quotation.update({
      where: { id },
      data: {
        ...rest,
        ...(validUntil ? { validUntil: new Date(validUntil) } : {}),
        ...(items ? { items: { deleteMany: {}, create: items } } : {}),
      },
      include,
    })
    return reply.send(updated)
  })

  fastify.put('/:id/send', { preHandler: [fastify.authenticate, requirePermission('quotations.create')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const q = await prisma.quotation.findUnique({ where: { id } })
    if (!q || q.status !== 'DRAFT') return reply.status(400).send({ error: 'Solo se pueden enviar cotizaciones en borrador' })
    if (!canAccessBranch(request, q.branchId)) return reply.status(403).send({ error: 'Acceso denegado' })
    return reply.send(await prisma.quotation.update({ where: { id }, data: { status: 'SENT' }, include }))
  })

  fastify.put('/:id/accept', { preHandler: [fastify.authenticate, requirePermission('quotations.create')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const q = await prisma.quotation.findUnique({ where: { id } })
    if (!q || q.status !== 'SENT') return reply.status(400).send({ error: 'Solo se pueden aceptar cotizaciones enviadas' })
    if (!canAccessBranch(request, q.branchId)) return reply.status(403).send({ error: 'Acceso denegado' })
    return reply.send(await prisma.quotation.update({ where: { id }, data: { status: 'ACCEPTED' }, include }))
  })

  fastify.put('/:id/reject', { preHandler: [fastify.authenticate, requirePermission('quotations.create')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const q = await prisma.quotation.findUnique({ where: { id } })
    if (!q || q.status !== 'SENT') return reply.status(400).send({ error: 'Solo se pueden rechazar cotizaciones enviadas' })
    if (!canAccessBranch(request, q.branchId)) return reply.status(403).send({ error: 'Acceso denegado' })
    return reply.send(await prisma.quotation.update({ where: { id }, data: { status: 'REJECTED' }, include }))
  })

  // Cancel — distinct from "reject" (customer declined): this is us pulling
  // back a quotation that's still ours to withdraw (draft or already sent).
  fastify.put('/:id/cancel', { preHandler: [fastify.authenticate, requirePermission('quotations.create')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const q = await prisma.quotation.findUnique({ where: { id } })
    if (!q || !['DRAFT', 'SENT'].includes(q.status)) return reply.status(400).send({ error: 'Solo se pueden cancelar cotizaciones en borrador o enviadas' })
    if (!canAccessBranch(request, q.branchId)) return reply.status(403).send({ error: 'Acceso denegado' })
    return reply.send(await prisma.quotation.update({ where: { id }, data: { status: 'CANCELLED' }, include }))
  })

  // Convert ACCEPTED quotation → Sale
  fastify.post('/:id/convert', { preHandler: [fastify.authenticate, requirePermission('quotations.convert')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      cashRegisterId: z.string().optional(),
      paymentMethod: z.enum(['CASH', 'CARD', 'TRANSFER', 'MIXED', 'CREDIT']).default('CASH'),
      // Optional: sell only the catalog lines and leave the custom ones out.
      // By default every line is sold — custom ones become custom sale lines.
      partial: z.boolean().optional(),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const quot = await prisma.quotation.findUnique({
      where: { id },
      include: { items: true, portalOrder: { include: { items: { where: { productId: null } } } } },
    })
    if (!quot || quot.status !== 'ACCEPTED') return reply.status(400).send({ error: 'Solo se pueden convertir cotizaciones aceptadas' })
    if (!canAccessBranch(request, quot.branchId)) return reply.status(403).send({ error: 'Acceso denegado' })

    // Custom (non-catalog) lines are sold as custom sale lines: no stock, no
    // per-product tracking, never a throwaway Product row (client rule).
    const customItems = quot.items.filter(item => !item.productId)
    const itemsToConvert = body.data.partial ? quot.items.filter(item => !!item.productId) : quot.items
    if (itemsToConvert.length === 0) {
      return reply.status(400).send({ error: 'No hay productos en esta cotización para convertir' })
    }
    const catalogLines = itemsToConvert.filter((i): i is typeof i & { productId: string } => !!i.productId)
    // A custom line that came from a teacher-portal order keeps the cost the
    // provider typed there, so the school's profit report stays right.
    const portalCustomCost = new Map((quot.portalOrder?.items ?? []).map(i => [i.productName.toLowerCase(), Number(i.unitCost ?? 0)]))

    // Recompute totals from only the included lines when converting
    // partially — quot.subtotal/tax/total reflect EVERY line, custom ones
    // included, so reusing them here would overcharge (or just be wrong)
    // once some lines are left out. The original discount % is preserved
    // proportionally rather than reapplying the original flat amount.
    const subtotal = itemsToConvert.reduce((s, item) => s + Number(item.total), 0)
    const discountRatio = Number(quot.subtotal) > 0 ? Number(quot.discount) / Number(quot.subtotal) : 0
    const discount = subtotal * discountRatio
    const afterDiscount = subtotal - discount
    const tax = afterDiscount * 0.12
    const total = afterDiscount + tax

    // Stock — mirrors the same check in sales.ts's POST /: a quotation can
    // sit accepted for a while, so stock may have moved since it was quoted.
    const convFactors = await getConversionFactors(catalogLines.map(item => item.variationId))
    const inventoryRows = await prisma.inventory.findMany({
      where: { branchId: quot.branchId, productId: { in: catalogLines.map(item => item.productId) } },
      include: { product: { select: { name: true } } },
    })
    const stockByProduct = new Map(inventoryRows.map(inv => [inv.productId, { qty: Number(inv.quantity), name: inv.product.name }]))
    for (const item of catalogLines) {
      const convFactor = convFactors.get(item.variationId ?? '') ?? 1
      const effectiveQty = Number(item.quantity) * convFactor
      const qtyLabel = convFactor !== 1 ? `${item.quantity} (${effectiveQty} unidades base)` : String(item.quantity)
      const stock = stockByProduct.get(item.productId)
      const available = stock?.qty ?? 0
      if (available < effectiveQty) {
        return reply.status(400).send({
          error: `Stock insuficiente de "${stock?.name ?? item.productId}": disponible ${available}, solicitado ${qtyLabel}`,
        })
      }
    }

    // Same stale-session guard as a POS sale (see resolveOpenRegisterId):
    // a register another device already closed would leave this sale out of
    // every cash close.
    let cashRegisterId = body.data.cashRegisterId
    if (cashRegisterId) {
      const resolved = await resolveOpenRegisterId(cashRegisterId, quot.branchId)
      if (!resolved) return reply.status(409).send({ error: 'La caja seleccionada ya fue cerrada — selecciona una caja abierta', code: 'REGISTER_CLOSED' })
      cashRegisterId = resolved.id
    }
    const unitCosts = await currentUnitCosts(catalogLines.map(i => ({ productId: i.productId, variationId: i.variationId ?? undefined })))

    // Claim the quotation before creating anything: two near-simultaneous
    // converts (a double click on a slow connection) used to both pass the
    // ACCEPTED check above and create two sales.
    const claimed = await prisma.quotation.updateMany({ where: { id, status: 'ACCEPTED' }, data: { status: 'CONVERTED' } })
    if (claimed.count === 0) return reply.status(409).send({ error: 'Esta cotización ya fue convertida' })

    // Same atomic per-branch receipt correlativo as a normal POS sale (see
    // sales.ts) — this is a real Sale row too, it needs a real number.
    const receiptBranch = await prisma.branch.update({
      where: { id: quot.branchId },
      data: { receiptNextNumber: { increment: 1 } },
      select: { receiptSeries: true, receiptNextNumber: true },
    })
    const invoiceNumber = `${receiptBranch.receiptSeries || 'REC'}-${receiptBranch.receiptNextNumber - 1}`
    const sale = await prisma.sale.create({
      data: {
        invoiceNumber,
        branchId: quot.branchId,
        cashierId: request.user.id,
        customerId: quot.customerId,
        cashRegisterId,
        subtotal,
        tax,
        discount,
        total,
        paymentMethod: body.data.paymentMethod,
        saleType: 'CASH',
        items: {
          create: itemsToConvert.map(item => ({
            productId: item.productId ?? null,
            customName: item.productId ? null : item.customName,
            variationId: item.productId ? item.variationId : null,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount,
            total: item.total,
            unitCost: item.productId
              ? (unitCosts.get(`${item.productId}:${item.variationId ?? ''}`) ?? 0)
              : (portalCustomCost.get((item.customName ?? '').toLowerCase()) ?? 0),
          })),
        },
      },
    }).catch(async (err: unknown) => {
      // Release the claim so the conversion can be retried.
      await prisma.quotation.update({ where: { id }, data: { status: 'ACCEPTED' } })
      throw err
    })

    await prisma.quotation.update({
      where: { id },
      data: { convertedToSaleId: sale.id },
    })

    // sale.create above never touched Inventory — unlike a POS sale, a
    // quotation conversion has no separate "checkout" step to hang this on,
    // so it has to happen here. Same rule as sales.ts: a quantity is in the
    // variation's own unit, stock is in base units, so the actual stock
    // impact is quantity * variation.conversionFactor.
    for (const item of catalogLines) {
      const convFactor = convFactors.get(item.variationId ?? '') ?? 1
      await updateStock(item.productId, quot.branchId, -(Number(item.quantity) * convFactor), {
        type: 'SALE',
        performedById: request.user.id,
        referenceId: sale.id,
      })
    }

    await log({ userId: request.user.id, action: 'CONVERT', entity: 'Quotation', entityId: id, newValues: { saleId: sale.id, partial: !!body.data.partial } })
    return reply.status(201).send({
      sale,
      message: body.data.partial && customItems.length > 0
        ? `Venta creada solo con los ${itemsToConvert.length} producto(s) de catálogo — se dejaron fuera ${customItems.length} producto(s) personalizado(s)`
        : 'Cotización convertida a venta',
      skippedCustomItems: body.data.partial ? customItems.length : 0,
    })
  })

  fastify.delete('/:id', { preHandler: [fastify.authenticate, requirePermission('quotations.create')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const q = await prisma.quotation.findUnique({ where: { id } })
    if (!q || q.status !== 'DRAFT') return reply.status(400).send({ error: 'Solo se pueden eliminar cotizaciones en borrador' })
    if (!canAccessBranch(request, q.branchId)) return reply.status(403).send({ error: 'Acceso denegado' })
    await prisma.quotation.delete({ where: { id } })
    return reply.send({ message: 'Cotización eliminada' })
  })
}
