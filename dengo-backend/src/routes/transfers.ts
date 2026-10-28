import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { updateStock } from '../services/inventory.service.js'
import { log } from '../services/audit.service.js'
import { canAccessBranch, allowedBranchIds } from '../lib/branch-scope.js'
import { hasPermission, requirePermission } from '../lib/permissions.js'

const include = {
  fromBranch: true, toBranch: true,
  requestedBy: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
  receivedBy: { select: { id: true, name: true } },
  cancelledBy: { select: { id: true, name: true } },
  items: {
    include: {
      product: { select: { id: true, name: true, barcode: true, sku: true, cost: true, basePrice: true } },
      variation: { select: { id: true, name: true, conversionFactor: true, price: true } },
    },
  },
}

// A barcode accidentally scanned into the quantity box (a real thing that
// happens with handheld scanners) would otherwise move billions of units.
const MAX_LINE_QUANTITY = 1_000_000

const itemSchema = z.object({
  productId: z.string(),
  variationId: z.string().optional(),
  quantity: z.number().min(0.001).max(MAX_LINE_QUANTITY, `La cantidad por línea no puede superar ${MAX_LINE_QUANTITY.toLocaleString('en-US')} — ¿se escaneó un código de barras en la cantidad?`),
})

type ItemInput = z.infer<typeof itemSchema>

interface StoredItem {
  productId: string
  quantity: unknown
  conversionFactor: unknown
}

interface ItemRow {
  productId: string
  variationId: string | null
  quantity: number
  conversionFactor: number
  unitCost: number
  unitPrice: number
}

// Resolves cost/price/factor server-side from the catalog — the client only
// ever says which product/presentation and how many, never what it's worth
// or how many base units it represents.
async function buildItemRows(items: ItemInput[]): Promise<{ rows: ItemRow[] } | { error: string }> {
  const productIds = [...new Set(items.map(i => i.productId))]
  const variationIds = [...new Set(items.map(i => i.variationId).filter((v): v is string => !!v))]
  const [products, variations] = await Promise.all([
    prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, cost: true, basePrice: true } }),
    variationIds.length
      ? prisma.productVariation.findMany({ where: { id: { in: variationIds } }, select: { id: true, productId: true, conversionFactor: true, price: true } })
      : Promise.resolve([]),
  ])
  const productById = new Map(products.map(p => [p.id, p]))
  const variationById = new Map(variations.map(v => [v.id, v]))

  const rows: ItemRow[] = []
  for (const item of items) {
    const product = productById.get(item.productId)
    if (!product) return { error: `Producto no encontrado (${item.productId})` }
    const variation = item.variationId ? variationById.get(item.variationId) : undefined
    if (item.variationId && (!variation || variation.productId !== item.productId)) {
      return { error: `La presentación seleccionada no pertenece a "${product.name}"` }
    }
    const conversionFactor = variation ? Number(variation.conversionFactor) : 1
    rows.push({
      productId: item.productId,
      variationId: variation ? variation.id : null,
      quantity: item.quantity,
      conversionFactor,
      unitCost: Number(product.cost) * conversionFactor,
      unitPrice: variation ? Number(variation.price) : Number(product.basePrice),
    })
  }
  return { rows }
}

// Net stock effect (in base units) a transfer in a given status has already
// had on each product+branch. Edit and void are both expressed as
// "effects(after) - effects(before)", so every status combination nets out
// correctly without a separate code path per case.
function stockEffects(status: string, fromBranchId: string, toBranchId: string, items: StoredItem[]): Map<string, number> {
  const effects = new Map<string, number>()
  const add = (productId: string, branchId: string, delta: number) => {
    const key = `${productId}|${branchId}`
    effects.set(key, (effects.get(key) ?? 0) + delta)
  }
  const shipped = status === 'APPROVED' || status === 'IN_TRANSIT' || status === 'RECEIVED'
  const received = status === 'RECEIVED'
  for (const item of items) {
    const base = Number(item.quantity) * Number(item.conversionFactor ?? 1)
    if (shipped) add(item.productId, fromBranchId, -base)
    if (received) add(item.productId, toBranchId, base)
  }
  return effects
}

function diffEffects(after: Map<string, number>, before: Map<string, number>): Map<string, number> {
  const keys = new Set([...after.keys(), ...before.keys()])
  const diff = new Map<string, number>()
  for (const key of keys) {
    const delta = (after.get(key) ?? 0) - (before.get(key) ?? 0)
    if (Math.abs(delta) > 0.00005) diff.set(key, delta)
  }
  return diff
}

// A void/edit that has to take stock back OUT of a branch must not silently
// clamp at zero (updateStock never goes negative) — that would let a void
// return units to the origin that were never actually recovered from the
// destination, inventing inventory. Refuse instead and say exactly what's short.
async function findShortages(deltas: Map<string, number>): Promise<string[]> {
  const needs = [...deltas.entries()].filter(([, d]) => d < 0)
  if (needs.length === 0) return []
  const rows = await prisma.inventory.findMany({
    where: { OR: needs.map(([key]) => { const [productId, branchId] = key.split('|') as [string, string]; return { productId, branchId } }) },
    select: { productId: true, branchId: true, quantity: true },
  })
  const qtyByKey = new Map(rows.map(r => [`${r.productId}|${r.branchId}`, Number(r.quantity)]))
  const shortKeys = needs.filter(([key, d]) => (qtyByKey.get(key) ?? 0) + d < -0.00005)
  if (shortKeys.length === 0) return []

  const productIds = [...new Set(shortKeys.map(([key]) => key.split('|')[0]!))]
  const branchIds = [...new Set(shortKeys.map(([key]) => key.split('|')[1]!))]
  const [products, branches] = await Promise.all([
    prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } }),
    prisma.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true, name: true } }),
  ])
  const pName = new Map(products.map(p => [p.id, p.name]))
  const bName = new Map(branches.map(b => [b.id, b.name]))
  return shortKeys.map(([key, d]) => {
    const [productId, branchId] = key.split('|') as [string, string]
    return `"${pName.get(productId) ?? productId}" en ${bName.get(branchId) ?? branchId}: hay ${qtyByKey.get(key) ?? 0}, se necesitan ${-d}`
  })
}

async function applyDeltas(deltas: Map<string, number>, performedById: string, referenceId: string, reason: string): Promise<void> {
  for (const [key, delta] of deltas) {
    const [productId, branchId] = key.split('|') as [string, string]
    await updateStock(productId, branchId, delta, { type: 'TRANSFER', performedById, referenceId, reason })
  }
}

function itemValue(item: { quantity: unknown; conversionFactor: unknown; unitCost: unknown; unitPrice: unknown; product: { cost: unknown; basePrice: unknown }; variation?: { price: unknown } | null }) {
  const qty = Number(item.quantity)
  const factor = Number(item.conversionFactor ?? 1)
  const unitCost = item.unitCost != null ? Number(item.unitCost) : Number(item.product.cost) * factor
  const unitPrice = item.unitPrice != null
    ? Number(item.unitPrice)
    : item.variation ? Number(item.variation.price) : Number(item.product.basePrice)
  return { cost: qty * unitCost, price: qty * unitPrice }
}

export default async function transferRoutes(fastify: FastifyInstance) {
  fastify.get('/', { preHandler: [fastify.authenticate, requirePermission('transfers.view')] }, async (request, reply) => {
    const q = request.query as { fromBranchId?: string; toBranchId?: string; status?: string; page?: string; limit?: string }
    // Non-admins only see transfers touching one of THEIR branches (home +
    // any assigned via UserBranch) on either side.
    const own = request.user.role !== 'ADMIN' ? allowedBranchIds(request) : null
    const where = {
      ...(own ? { OR: [{ fromBranchId: { in: own } }, { toBranchId: { in: own } }] } : {}),
      ...(q.fromBranchId ? { fromBranchId: q.fromBranchId } : {}),
      ...(q.toBranchId ? { toBranchId: q.toBranchId } : {}),
      ...(q.status ? { status: q.status } : {}),
    }

    if (q.page) {
      const page = Math.max(1, parseInt(q.page, 10) || 1)
      const limit = Math.min(200, Math.max(1, parseInt(q.limit ?? '50', 10) || 50))
      const [data, total, statusCounts, valueRows] = await Promise.all([
        prisma.transfer.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
        prisma.transfer.count({ where }),
        prisma.transfer.groupBy({ by: ['status'], where, _count: { status: true } }),
        prisma.transfer.findMany({
          where: { ...where, status: { notIn: ['CANCELLED', 'REJECTED'] } },
          select: {
            items: {
              select: {
                quantity: true, conversionFactor: true, unitCost: true, unitPrice: true,
                product: { select: { cost: true, basePrice: true } },
                variation: { select: { price: true } },
              },
            },
          },
        }),
      ])

      const countByStatus = new Map(statusCounts.map(s => [s.status, s._count.status]))
      let totalValue = 0
      let totalPriceValue = 0
      for (const t of valueRows) {
        for (const item of t.items) {
          const v = itemValue(item)
          totalValue += v.cost
          totalPriceValue += v.price
        }
      }

      return reply.send({
        data,
        total,
        page,
        limit,
        stats: {
          total,
          pending: countByStatus.get('PENDING') ?? 0,
          inTransit: (countByStatus.get('IN_TRANSIT') ?? 0) + (countByStatus.get('APPROVED') ?? 0),
          completed: countByStatus.get('RECEIVED') ?? 0,
          totalValue,
          totalPriceValue,
        },
      })
    }

    return reply.send(await prisma.transfer.findMany({ where, include, orderBy: { createdAt: 'desc' } }))
  })

  fastify.get('/:id', { preHandler: [fastify.authenticate, requirePermission('transfers.view')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const t = await prisma.transfer.findUnique({ where: { id }, include })
    if (!t) return reply.status(404).send({ error: 'Transferencia no encontrada' })
    if (!canAccessBranch(request, t.fromBranchId) && !canAccessBranch(request, t.toBranchId)) {
      return reply.status(403).send({ error: 'Acceso denegado' })
    }
    return reply.send(t)
  })

  fastify.post('/', { preHandler: [fastify.authenticate, requirePermission('transfers.create')] }, async (request, reply) => {
    const body = z.object({
      fromBranchId: z.string(),
      toBranchId: z.string(),
      items: z.array(itemSchema).min(1),
      notes: z.string().optional(),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    if (body.data.fromBranchId === body.data.toBranchId) {
      return reply.status(400).send({ error: 'Las sucursales de origen y destino deben ser diferentes' })
    }
    if (!canAccessBranch(request, body.data.fromBranchId) && !canAccessBranch(request, body.data.toBranchId)) {
      return reply.status(403).send({ error: 'Acceso denegado' })
    }

    const built = await buildItemRows(body.data.items)
    if ('error' in built) return reply.status(400).send({ error: built.error })

    const t = await prisma.transfer.create({
      data: {
        fromBranchId: body.data.fromBranchId,
        toBranchId: body.data.toBranchId,
        notes: body.data.notes ?? null,
        requestedById: request.user.id,
        items: { create: built.rows },
      },
      include,
    })
    await log({ userId: request.user.id, action: 'CREATE', entity: 'Transfer', entityId: t.id })
    return reply.status(201).send(t)
  })

  // Approve → deduct from source.
  //
  // Every status transition below first CLAIMS the transfer with a
  // conditional updateMany (WHERE status = <expected>) and only then moves
  // stock. Two near-simultaneous requests (a double click on a slow
  // connection) both used to read the old status, both pass the check, and
  // both move inventory — the claim makes the second one see count 0 and stop.
  fastify.put('/:id/approve', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!hasPermission(request, 'transfers.approve')) return reply.status(403).send({ error: 'Acceso denegado' })
    const { id } = request.params as { id: string }
    const t = await prisma.transfer.findUnique({ where: { id }, include: { items: true } })
    if (!t || t.status !== 'PENDING') return reply.status(409).send({ error: 'Esta transferencia ya no está pendiente' })
    if (!canAccessBranch(request, t.fromBranchId)) return reply.status(403).send({ error: 'Acceso denegado' })

    const claimed = await prisma.transfer.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'IN_TRANSIT', approvedById: request.user.id, approvedAt: new Date() },
    })
    if (claimed.count === 0) return reply.status(409).send({ error: 'Esta transferencia ya fue procesada' })

    await applyDeltas(stockEffects('IN_TRANSIT', t.fromBranchId, t.toBranchId, t.items), request.user.id, id, 'Transferencia aprobada (salida de origen)')

    const updated = await prisma.transfer.findUnique({ where: { id }, include })
    await log({ userId: request.user.id, action: 'APPROVE', entity: 'Transfer', entityId: id })
    return reply.send(updated)
  })

  // Receive → add to destination
  fastify.put('/:id/receive', { preHandler: [fastify.authenticate, requirePermission('transfers.receive')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const t = await prisma.transfer.findUnique({ where: { id }, include: { items: true } })
    if (!t || (t.status !== 'IN_TRANSIT' && t.status !== 'APPROVED')) {
      return reply.status(409).send({ error: 'Esta transferencia no está en tránsito (puede que ya se haya recibido)' })
    }
    if (!canAccessBranch(request, t.toBranchId)) return reply.status(403).send({ error: 'Acceso denegado' })

    const claimed = await prisma.transfer.updateMany({
      where: { id, status: t.status },
      data: { status: 'RECEIVED', receivedById: request.user.id, receivedAt: new Date() },
    })
    if (claimed.count === 0) return reply.status(409).send({ error: 'Esta transferencia ya fue recibida' })

    for (const item of t.items) {
      await updateStock(item.productId, t.toBranchId, Number(item.quantity) * Number(item.conversionFactor), {
        type: 'IN',
        performedById: request.user.id,
        referenceId: id,
        reason: 'Recepción de transferencia',
      })
    }

    const updated = await prisma.transfer.findUnique({ where: { id }, include })
    await log({ userId: request.user.id, action: 'RECEIVE', entity: 'Transfer', entityId: id })
    return reply.send(updated)
  })

  fastify.put('/:id/reject', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!hasPermission(request, 'transfers.reject')) return reply.status(403).send({ error: 'Acceso denegado' })
    const { id } = request.params as { id: string }
    const t = await prisma.transfer.findUnique({ where: { id }, include: { items: true } })
    if (!t || !['PENDING', 'APPROVED', 'IN_TRANSIT'].includes(t.status)) {
      return reply.status(409).send({ error: 'No se puede rechazar esta transferencia' })
    }
    if (!canAccessBranch(request, t.fromBranchId) && !canAccessBranch(request, t.toBranchId)) {
      return reply.status(403).send({ error: 'Acceso denegado' })
    }

    const claimed = await prisma.transfer.updateMany({ where: { id, status: t.status }, data: { status: 'REJECTED' } })
    if (claimed.count === 0) return reply.status(409).send({ error: 'Esta transferencia ya fue procesada' })

    // If already shipped, put the stock back at the origin.
    const deltas = diffEffects(new Map(), stockEffects(t.status, t.fromBranchId, t.toBranchId, t.items))
    await applyDeltas(deltas, request.user.id, id, 'Reverso por rechazo de transferencia')

    const updated = await prisma.transfer.findUnique({ where: { id }, include })
    await log({ userId: request.user.id, action: 'REJECT', entity: 'Transfer', entityId: id })
    return reply.send(updated)
  })

  // Void (anular) — works in any live status, including RECEIVED: a
  // received transfer's units are taken back out of the destination and
  // returned to the origin. Refused if the destination no longer has them.
  fastify.put('/:id/void', { preHandler: [fastify.authenticate, requirePermission('transfers.void')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({ reason: z.string().max(500).optional() }).safeParse(request.body ?? {})
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const t = await prisma.transfer.findUnique({ where: { id }, include: { items: true } })
    if (!t) return reply.status(404).send({ error: 'Transferencia no encontrada' })
    if (t.status === 'CANCELLED' || t.status === 'REJECTED') {
      return reply.status(409).send({ error: 'Esta transferencia ya está anulada' })
    }
    if (!canAccessBranch(request, t.fromBranchId) && !canAccessBranch(request, t.toBranchId)) {
      return reply.status(403).send({ error: 'Acceso denegado' })
    }

    const deltas = diffEffects(new Map(), stockEffects(t.status, t.fromBranchId, t.toBranchId, t.items))
    const shortages = await findShortages(deltas)
    if (shortages.length) {
      return reply.status(409).send({
        error: `No se puede anular: la sucursal destino ya no tiene suficiente inventario para devolverlo. ${shortages.join('; ')}`,
      })
    }

    const claimed = await prisma.transfer.updateMany({
      where: { id, status: t.status },
      data: {
        status: 'CANCELLED',
        cancelledById: request.user.id,
        cancelledAt: new Date(),
        cancelReason: body.data.reason?.trim() || null,
      },
    })
    if (claimed.count === 0) return reply.status(409).send({ error: 'Esta transferencia ya fue modificada por otra persona — recarga la página' })

    await applyDeltas(deltas, request.user.id, id, `Anulación de traslado${body.data.reason ? `: ${body.data.reason.trim()}` : ''}`)

    const updated = await prisma.transfer.findUnique({ where: { id }, include })
    await log({ userId: request.user.id, action: 'VOID', entity: 'Transfer', entityId: id, oldValues: { status: t.status }, newValues: { reason: body.data.reason } })
    return reply.send(updated)
  })

  // Edit — branches, items and notes, in any live status. Stock already
  // moved by the current status is corrected by the difference between the
  // old and new item lists (and branches), so the transfer keeps its status
  // and inventory ends up exactly as if it had been made right the first time.
  fastify.put('/:id', { preHandler: [fastify.authenticate, requirePermission('transfers.edit')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      fromBranchId: z.string(),
      toBranchId: z.string(),
      items: z.array(itemSchema).min(1),
      notes: z.string().optional(),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    if (body.data.fromBranchId === body.data.toBranchId) {
      return reply.status(400).send({ error: 'Las sucursales de origen y destino deben ser diferentes' })
    }

    const t = await prisma.transfer.findUnique({ where: { id }, include: { items: true } })
    if (!t) return reply.status(404).send({ error: 'Transferencia no encontrada' })
    if (t.status === 'CANCELLED' || t.status === 'REJECTED') {
      return reply.status(409).send({ error: 'No se puede editar una transferencia anulada o rechazada' })
    }
    for (const branchId of [t.fromBranchId, t.toBranchId, body.data.fromBranchId, body.data.toBranchId]) {
      if (!canAccessBranch(request, branchId)) return reply.status(403).send({ error: 'Acceso denegado' })
    }

    const built = await buildItemRows(body.data.items)
    if ('error' in built) return reply.status(400).send({ error: built.error })

    const before = stockEffects(t.status, t.fromBranchId, t.toBranchId, t.items)
    const after = stockEffects(t.status, body.data.fromBranchId, body.data.toBranchId, built.rows)
    const deltas = diffEffects(after, before)

    // Only taking units back out of the branch that already received them
    // is checked; extra deductions at an origin follow the same no-check rule
    // as approving a new transfer.
    const mustCover = new Map([...deltas].filter(([key, d]) =>
      d < 0 && t.status === 'RECEIVED' && key.split('|')[1] === t.toBranchId))
    const shortages = await findShortages(mustCover)
    if (shortages.length) {
      return reply.status(409).send({
        error: `No se puede guardar el cambio: la sucursal destino ya no tiene suficiente inventario. ${shortages.join('; ')}`,
      })
    }

    // Optimistic lock: refuses if someone else approved/received/edited it
    // since we read it (same double-click protection as the transitions).
    const now = new Date()
    const claimed = await prisma.transfer.updateMany({
      where: { id, status: t.status, editedAt: t.editedAt },
      data: {
        fromBranchId: body.data.fromBranchId,
        toBranchId: body.data.toBranchId,
        notes: body.data.notes ?? null,
        editedAt: now,
      },
    })
    if (claimed.count === 0) return reply.status(409).send({ error: 'Esta transferencia cambió mientras la editabas — recarga e intenta de nuevo' })

    await prisma.$transaction([
      prisma.transferItem.deleteMany({ where: { transferId: id } }),
      prisma.transferItem.createMany({ data: built.rows.map(r => ({ ...r, transferId: id })) }),
    ])
    await applyDeltas(deltas, request.user.id, id, 'Corrección por edición de traslado')

    const updated = await prisma.transfer.findUnique({ where: { id }, include })
    await log({
      userId: request.user.id, action: 'UPDATE', entity: 'Transfer', entityId: id,
      oldValues: { fromBranchId: t.fromBranchId, toBranchId: t.toBranchId, items: t.items.map(i => ({ productId: i.productId, variationId: i.variationId, quantity: Number(i.quantity) })) },
      newValues: { fromBranchId: body.data.fromBranchId, toBranchId: body.data.toBranchId, items: body.data.items },
    })
    return reply.send(updated)
  })
}
