import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { updateStock, setStock } from '../services/inventory.service.js'
import { resolveBranchScope, canAccessBranch } from '../lib/branch-scope.js'
import { hasPermission, requirePermission } from '../lib/permissions.js'

export default async function inventoryRoutes(fastify: FastifyInstance) {
  // GET /api/inventory?branchId=
  fastify.get('/', { preHandler: [fastify.authenticate, requirePermission('inventory.view')] }, async (request, reply) => {
    const q = request.query as { branchId?: string }
    const branchId = resolveBranchScope(request, q.branchId)
    const inventory = await prisma.inventory.findMany({
      where: branchId ? { branchId } : {},
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
      })).min(1),
      notes: z.string().optional(),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    if (!canAccessBranch(request, body.data.branchId)) return reply.status(403).send({ error: 'Acceso denegado' })
    if (!hasPermission(request, 'purchases.receive')) return reply.status(403).send({ error: 'Acceso denegado' })

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
    }

    return reply.status(201).send({
      referenceId,
      itemCount: body.data.items.length,
      totalUnits: body.data.items.reduce((s, i) => s + i.quantity, 0),
    })
  })
}
