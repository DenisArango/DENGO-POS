import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { log } from '../services/audit.service.js'
import { requirePermission } from '../lib/permissions.js'

const reasonSchema = z.object({
  label: z.string().min(1).max(150),
  direction: z.enum(['UP', 'DOWN']),
  sortOrder: z.number().int().min(0).default(0),
})

export default async function inventoryReasonsRoutes(fastify: FastifyInstance) {
  // Anyone who can adjust inventory needs to read this list to actually do
  // one — management (create/edit/delete) is gated separately, below.
  fastify.get('/', { preHandler: [fastify.authenticate, requirePermission('inventory.adjust')] }, async (request, reply) => {
    const q = request.query as { direction?: string; includeInactive?: string }
    const reasons = await prisma.inventoryAdjustmentReason.findMany({
      where: {
        ...(q.direction === 'UP' || q.direction === 'DOWN' ? { direction: q.direction } : {}),
        ...(q.includeInactive === 'true' ? {} : { isActive: true }),
      },
      orderBy: [{ direction: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
    })
    return reply.send(reasons)
  })

  fastify.post('/', { preHandler: [fastify.authenticate, requirePermission('settings.system')] }, async (request, reply) => {
    const body = reasonSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const reason = await prisma.inventoryAdjustmentReason.create({ data: body.data })
    await log({ userId: request.user.id, action: 'CREATE', entity: 'InventoryAdjustmentReason', entityId: reason.id, newValues: body.data })
    return reply.status(201).send(reason)
  })

  fastify.put('/:id', { preHandler: [fastify.authenticate, requirePermission('settings.system')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = reasonSchema.partial().extend({ isActive: z.boolean().optional() }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    try {
      const data = Object.fromEntries(Object.entries(body.data).filter(([, v]) => v !== undefined)) as any
      const reason = await prisma.inventoryAdjustmentReason.update({ where: { id }, data })
      await log({ userId: request.user.id, action: 'UPDATE', entity: 'InventoryAdjustmentReason', entityId: id, newValues: body.data })
      return reply.send(reason)
    } catch {
      return reply.status(404).send({ error: 'Motivo no encontrado' })
    }
  })

  // Soft delete — a past StockMovement.reason referencing this label should
  // stay meaningful, matching the pattern used for categories/suppliers/etc.
  fastify.delete('/:id', { preHandler: [fastify.authenticate, requirePermission('settings.system')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      await prisma.inventoryAdjustmentReason.update({ where: { id }, data: { isActive: false } })
      await log({ userId: request.user.id, action: 'DELETE', entity: 'InventoryAdjustmentReason', entityId: id })
      return reply.send({ message: 'Motivo eliminado' })
    } catch {
      return reply.status(404).send({ error: 'Motivo no encontrado' })
    }
  })
}
