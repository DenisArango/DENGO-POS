import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { setStock } from '../services/inventory.service.js'
import { resolveBranchScope, canAccessBranch } from '../lib/branch-scope.js'
import { requirePermission } from '../lib/permissions.js'
import { log } from '../services/audit.service.js'
import { parseBusinessDateParam } from '../lib/timezone.js'

const include = {
  branch: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  items: {
    include: { product: { select: { id: true, name: true, sku: true, barcode: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
}

export default async function inventoryCountRoutes(fastify: FastifyInstance) {
  // GET /api/inventory-counts — list, for both the "ver conteos" screen and
  // the report. Paginated; from/to filter on createdAt (the count's start).
  fastify.get('/', { preHandler: [fastify.authenticate, requirePermission('inventory.view')] }, async (request, reply) => {
    const q = request.query as { branchId?: string; status?: string; createdById?: string; from?: string; to?: string; page?: string; limit?: string }
    const branchId = resolveBranchScope(request, q.branchId)
    const where = {
      ...(branchId ? { branchId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.createdById ? { createdById: q.createdById } : {}),
      ...(q.from || q.to ? {
        createdAt: {
          ...(q.from ? { gte: parseBusinessDateParam(q.from) } : {}),
          ...(q.to ? { lte: parseBusinessDateParam(q.to) } : {}),
        },
      } : {}),
    }

    const page = Math.max(1, parseInt(q.page ?? '1', 10) || 1)
    const limit = Math.min(200, Math.max(1, parseInt(q.limit ?? '50', 10) || 50))
    const [data, total] = await Promise.all([
      prisma.inventoryCount.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      prisma.inventoryCount.count({ where }),
    ])
    return reply.send({ data, total, page, limit })
  })

  fastify.get('/:id', { preHandler: [fastify.authenticate, requirePermission('inventory.view')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const count = await prisma.inventoryCount.findUnique({ where: { id }, include })
    if (!count) return reply.status(404).send({ error: 'Conteo no encontrado' })
    if (!canAccessBranch(request, count.branchId)) return reply.status(403).send({ error: 'Acceso denegado' })
    return reply.send(count)
  })

  // POST /api/inventory-counts — starts a new count task for a branch.
  fastify.post('/', { preHandler: [fastify.authenticate, requirePermission('inventory.adjust')] }, async (request, reply) => {
    const body = z.object({ branchId: z.string(), notes: z.string().optional() }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    if (!canAccessBranch(request, body.data.branchId)) return reply.status(403).send({ error: 'Acceso denegado' })

    const count = await prisma.inventoryCount.create({
      data: { branchId: body.data.branchId, ...(body.data.notes ? { notes: body.data.notes } : {}), createdById: request.user.id },
      include,
    })
    await log({ userId: request.user.id, action: 'CREATE', entity: 'InventoryCount', entityId: count.id })
    return reply.status(201).send(count)
  })

  // POST /api/inventory-counts/:id/items — add a SKU to the count, snapshotting
  // its current system quantity at this branch.
  fastify.post('/:id/items', { preHandler: [fastify.authenticate, requirePermission('inventory.adjust')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({ productId: z.string() }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const count = await prisma.inventoryCount.findUnique({ where: { id } })
    if (!count) return reply.status(404).send({ error: 'Conteo no encontrado' })
    if (count.status !== 'IN_PROGRESS') return reply.status(400).send({ error: 'Este conteo ya está completado' })
    if (!canAccessBranch(request, count.branchId)) return reply.status(403).send({ error: 'Acceso denegado' })

    const inv = await prisma.inventory.findUnique({
      where: { productId_branchId: { productId: body.data.productId, branchId: count.branchId } },
    })

    try {
      const item = await prisma.inventoryCountItem.create({
        data: { countId: id, productId: body.data.productId, systemQuantity: Number(inv?.quantity ?? 0) },
        include: { product: { select: { id: true, name: true, sku: true, barcode: true } } },
      })
      return reply.status(201).send(item)
    } catch (err: any) {
      if (err.code === 'P2002') return reply.status(409).send({ error: 'Ese producto ya está en este conteo' })
      throw err
    }
  })

  // PUT /api/inventory-counts/:id/items/:itemId — record what was actually counted.
  fastify.put('/:id/items/:itemId', { preHandler: [fastify.authenticate, requirePermission('inventory.adjust')] }, async (request, reply) => {
    const { id, itemId } = request.params as { id: string; itemId: string }
    const body = z.object({ countedQuantity: z.number().min(0).max(1_000_000, 'La cantidad no puede superar 1,000,000 — ¿se escaneó un código de barras en la cantidad?'), notes: z.string().optional() }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message ?? 'Datos inválidos' })

    const count = await prisma.inventoryCount.findUnique({ where: { id } })
    if (!count) return reply.status(404).send({ error: 'Conteo no encontrado' })
    if (count.status !== 'IN_PROGRESS') return reply.status(400).send({ error: 'Este conteo ya está completado' })
    if (!canAccessBranch(request, count.branchId)) return reply.status(403).send({ error: 'Acceso denegado' })

    const item = await prisma.inventoryCountItem.update({
      where: { id: itemId },
      data: { countedQuantity: body.data.countedQuantity, ...(body.data.notes ? { notes: body.data.notes } : {}), countedAt: new Date() },
      include: { product: { select: { id: true, name: true, sku: true, barcode: true } } },
    })
    return reply.send(item)
  })

  // DELETE /api/inventory-counts/:id/items/:itemId — remove a line before it's been adjusted.
  fastify.delete('/:id/items/:itemId', { preHandler: [fastify.authenticate, requirePermission('inventory.adjust')] }, async (request, reply) => {
    const { id, itemId } = request.params as { id: string; itemId: string }
    const count = await prisma.inventoryCount.findUnique({ where: { id } })
    if (!count) return reply.status(404).send({ error: 'Conteo no encontrado' })
    if (count.status !== 'IN_PROGRESS') return reply.status(400).send({ error: 'Este conteo ya está completado' })
    if (!canAccessBranch(request, count.branchId)) return reply.status(403).send({ error: 'Acceso denegado' })

    const item = await prisma.inventoryCountItem.findUnique({ where: { id: itemId } })
    if (!item || item.countId !== id) return reply.status(404).send({ error: 'Línea no encontrada' })
    if (item.adjusted) return reply.status(400).send({ error: 'Esta línea ya tiene un ajuste aplicado — no se puede quitar' })

    await prisma.inventoryCountItem.delete({ where: { id: itemId } })
    return reply.send({ message: 'Línea eliminada' })
  })

  // POST /api/inventory-counts/:id/items/:itemId/adjust — applies the real
  // stock adjustment for one discrepant line, the same way the existing
  // manual-adjustment screen does (setStock → ADJUSTMENT StockMovement),
  // just tagged with this count's id as referenceId so it's traceable back
  // here, and already showing up in the existing Ajustes de Inventario
  // report with no changes needed there.
  fastify.post('/:id/items/:itemId/adjust', { preHandler: [fastify.authenticate, requirePermission('inventory.adjust')] }, async (request, reply) => {
    const { id, itemId } = request.params as { id: string; itemId: string }
    const body = z.object({ reason: z.string().min(1) }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const count = await prisma.inventoryCount.findUnique({ where: { id } })
    if (!count) return reply.status(404).send({ error: 'Conteo no encontrado' })
    if (!canAccessBranch(request, count.branchId)) return reply.status(403).send({ error: 'Acceso denegado' })

    const item = await prisma.inventoryCountItem.findUnique({ where: { id: itemId } })
    if (!item || item.countId !== id) return reply.status(404).send({ error: 'Línea no encontrada' })
    if (item.adjusted) return reply.status(400).send({ error: 'Esta línea ya fue ajustada' })
    if (item.countedQuantity === null) return reply.status(400).send({ error: 'Primero ingresa la cantidad contada' })

    await setStock(item.productId, count.branchId, Number(item.countedQuantity), {
      type: 'ADJUSTMENT',
      reason: `Conteo físico: ${body.data.reason}`,
      performedById: request.user.id,
      referenceId: `CONTEO-${count.id}`,
    })

    const updated = await prisma.inventoryCountItem.update({
      where: { id: itemId },
      data: { adjusted: true, reason: body.data.reason },
      include: { product: { select: { id: true, name: true, sku: true, barcode: true } } },
    })
    return reply.send(updated)
  })

  // PUT /api/inventory-counts/:id/complete — closes the task. Doesn't force
  // every discrepant line to be resolved first — a count can legitimately
  // close with some differences left un-adjusted (ej. to investigate later)
  // without blocking the whole task from being marked done.
  fastify.put('/:id/complete', { preHandler: [fastify.authenticate, requirePermission('inventory.adjust')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const count = await prisma.inventoryCount.findUnique({ where: { id } })
    if (!count) return reply.status(404).send({ error: 'Conteo no encontrado' })
    if (!canAccessBranch(request, count.branchId)) return reply.status(403).send({ error: 'Acceso denegado' })
    if (count.status === 'COMPLETED') return reply.status(400).send({ error: 'Este conteo ya está completado' })

    const updated = await prisma.inventoryCount.update({
      where: { id },
      data: { status: 'COMPLETED', completedAt: new Date() },
      include,
    })
    await log({ userId: request.user.id, action: 'COMPLETE', entity: 'InventoryCount', entityId: id })
    return reply.send(updated)
  })
}
