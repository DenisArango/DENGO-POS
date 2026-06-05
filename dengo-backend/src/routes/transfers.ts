import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { updateStock } from '../services/inventory.service.js'
import { log } from '../services/audit.service.js'

const include = {
  fromBranch: true, toBranch: true,
  requestedBy: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
  receivedBy: { select: { id: true, name: true } },
  items: { include: { product: { select: { id: true, name: true, barcode: true, sku: true, cost: true } } } },
}

export default async function transferRoutes(fastify: FastifyInstance) {
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const q = request.query as { fromBranchId?: string; toBranchId?: string; status?: string }
    return reply.send(await prisma.transfer.findMany({
      where: {
        ...(q.fromBranchId ? { fromBranchId: q.fromBranchId } : {}),
        ...(q.toBranchId ? { toBranchId: q.toBranchId } : {}),
        ...(q.status ? { status: q.status as any } : {}),
      },
      include,
      orderBy: { createdAt: 'desc' },
    }))
  })

  fastify.get('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const t = await prisma.transfer.findUnique({ where: { id }, include })
    if (!t) return reply.status(404).send({ error: 'Transferencia no encontrada' })
    return reply.send(t)
  })

  fastify.post('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = z.object({
      fromBranchId: z.string(),
      toBranchId: z.string(),
      items: z.array(z.object({ productId: z.string(), quantity: z.number().min(0.001) })).min(1),
      notes: z.string().optional(),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    if (body.data.fromBranchId === body.data.toBranchId) {
      return reply.status(400).send({ error: 'Las sucursales de origen y destino deben ser diferentes' })
    }

    const t = await prisma.transfer.create({
      data: {
        fromBranchId: body.data.fromBranchId,
        toBranchId: body.data.toBranchId,
        notes: body.data.notes,
        requestedById: request.user.id,
        items: { create: body.data.items },
      },
      include,
    })
    await log({ userId: request.user.id, action: 'CREATE', entity: 'Transfer', entityId: t.id })
    return reply.status(201).send(t)
  })

  // Approve → deduct from source
  fastify.put('/:id/approve', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'ADMIN') return reply.status(403).send({ error: 'Acceso denegado' })
    const { id } = request.params as { id: string }
    const t = await prisma.transfer.findUnique({ where: { id }, include: { items: true } })
    if (!t || t.status !== 'PENDING') return reply.status(404).send({ error: 'Transferencia no válida' })

    for (const item of t.items) {
      await updateStock(item.productId, t.fromBranchId, -Number(item.quantity), {
        type: 'TRANSFER',
        performedById: request.user.id,
        referenceId: id,
        reason: `Transferencia aprobada a ${t.toBranchId}`,
      })
    }

    const updated = await prisma.transfer.update({
      where: { id },
      data: { status: 'IN_TRANSIT', approvedById: request.user.id, approvedAt: new Date() },
      include,
    })
    await log({ userId: request.user.id, action: 'APPROVE', entity: 'Transfer', entityId: id })
    return reply.send(updated)
  })

  // Receive → add to destination
  fastify.put('/:id/receive', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const t = await prisma.transfer.findUnique({ where: { id }, include: { items: true } })
    if (!t || t.status !== 'IN_TRANSIT') return reply.status(404).send({ error: 'Transferencia no válida o no está en tránsito' })

    for (const item of t.items) {
      await updateStock(item.productId, t.toBranchId, Number(item.quantity), {
        type: 'IN',
        performedById: request.user.id,
        referenceId: id,
        reason: `Recepción de transferencia desde ${t.fromBranchId}`,
      })
    }

    const updated = await prisma.transfer.update({
      where: { id },
      data: { status: 'RECEIVED', receivedById: request.user.id, receivedAt: new Date() },
      include,
    })
    await log({ userId: request.user.id, action: 'RECEIVE', entity: 'Transfer', entityId: id })
    return reply.send(updated)
  })

  fastify.put('/:id/reject', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'ADMIN') return reply.status(403).send({ error: 'Acceso denegado' })
    const { id } = request.params as { id: string }
    const t = await prisma.transfer.findUnique({ where: { id } })
    if (!t || t.status === 'RECEIVED' || t.status === 'REJECTED') return reply.status(404).send({ error: 'No se puede rechazar esta transferencia' })

    // If already approved (IN_TRANSIT), reverse the stock deduction
    if (t.status === 'IN_TRANSIT') {
      const items = await prisma.transferItem.findMany({ where: { transferId: id } })
      for (const item of items) {
        await updateStock(item.productId, t.fromBranchId, Number(item.quantity), {
          type: 'IN',
          performedById: request.user.id,
          referenceId: id,
          reason: 'Reverso por rechazo de transferencia',
        })
      }
    }

    const updated = await prisma.transfer.update({ where: { id }, data: { status: 'REJECTED' }, include })
    await log({ userId: request.user.id, action: 'REJECT', entity: 'Transfer', entityId: id })
    return reply.send(updated)
  })
}
