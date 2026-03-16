import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { updateStock } from '../services/inventory.service.js'
import { log } from '../services/audit.service.js'

const itemSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  quantity: z.number().min(0.001),
  unitCost: z.number().min(0),
  total: z.number().min(0),
})

const createSchema = z.object({
  supplierId: z.string(),
  branchId: z.string(),
  items: z.array(itemSchema).min(1),
  subtotal: z.number().min(0),
  tax: z.number().min(0).default(0),
  total: z.number().min(0),
  status: z.enum(['DRAFT', 'PENDING']).default('DRAFT'),
  expectedDate: z.string().optional(),
  notes: z.string().optional(),
})

const include = {
  supplier: true,
  branch: true,
  createdBy: { select: { id: true, name: true } },
  receivedBy: { select: { id: true, name: true } },
  items: { include: { product: { select: { id: true, name: true } } } },
}

export default async function purchaseRoutes(fastify: FastifyInstance) {
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const q = request.query as { status?: string; supplierId?: string }
    return reply.send(await prisma.purchaseOrder.findMany({
      where: {
        ...(q.status ? { status: q.status as any } : {}),
        ...(q.supplierId ? { supplierId: q.supplierId } : {}),
      },
      include,
      orderBy: { createdAt: 'desc' },
    }))
  })

  fastify.get('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const order = await prisma.purchaseOrder.findUnique({ where: { id }, include })
    if (!order) return reply.status(404).send({ error: 'Orden no encontrada' })
    return reply.send(order)
  })

  fastify.post('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = createSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const orderNumber = `OC-${Date.now().toString().slice(-8)}`
    const order = await prisma.purchaseOrder.create({
      data: {
        orderNumber,
        supplierId: body.data.supplierId,
        branchId: body.data.branchId,
        subtotal: body.data.subtotal,
        tax: body.data.tax,
        total: body.data.total,
        status: body.data.status,
        expectedDate: body.data.expectedDate ? new Date(body.data.expectedDate) : undefined,
        notes: body.data.notes,
        createdById: request.user.id,
        items: { create: body.data.items },
      },
      include,
    })
    await log({ userId: request.user.id, action: 'CREATE', entity: 'PurchaseOrder', entityId: order.id })
    return reply.status(201).send(order)
  })

  fastify.put('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = createSchema.partial().safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const existing = await prisma.purchaseOrder.findUnique({ where: { id } })
    if (!existing) return reply.status(404).send({ error: 'Orden no encontrada' })
    if (!['DRAFT', 'PENDING'].includes(existing.status)) {
      return reply.status(400).send({ error: 'Solo se pueden editar órdenes en borrador o pendiente' })
    }

    const { items, ...rest } = body.data
    const order = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        ...rest,
        ...(items ? { items: { deleteMany: {}, create: items } } : {}),
      },
      include,
    })
    return reply.send(order)
  })

  // POST /api/purchases/:id/receive
  fastify.post('/:id/receive', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      receivedItems: z.array(z.object({
        itemId: z.string(),
        receivedQuantity: z.number().min(0),
      })),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const order = await prisma.purchaseOrder.findUnique({ where: { id }, include: { items: true } })
    if (!order) return reply.status(404).send({ error: 'Orden no encontrada' })
    if (order.status === 'RECEIVED' || order.status === 'CANCELLED') {
      return reply.status(400).send({ error: 'No se puede recibir una orden ya procesada' })
    }

    const receivedMap = new Map(body.data.receivedItems.map(r => [r.itemId, r.receivedQuantity]))

    // Update received quantities
    for (const item of order.items) {
      const received = receivedMap.get(item.id) ?? 0
      if (received > 0) {
        await prisma.purchaseOrderItem.update({
          where: { id: item.id },
          data: { receivedQuantity: received },
        })
        await updateStock(item.productId, order.branchId, received, {
          type: 'IN',
          performedById: request.user.id,
          referenceId: id,
          reason: `Recepción orden ${order.orderNumber}`,
        })
      }
    }

    // Determine new status
    const allFull = order.items.every(item => {
      const rec = receivedMap.get(item.id) ?? 0
      return rec >= Number(item.quantity)
    })

    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: allFull ? 'RECEIVED' : 'PARTIAL',
        receivedDate: new Date(),
        receivedById: request.user.id,
      },
      include,
    })

    await log({ userId: request.user.id, action: 'RECEIVE', entity: 'PurchaseOrder', entityId: id })
    return reply.send(updated)
  })

  fastify.put('/:id/cancel', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'ADMIN') return reply.status(403).send({ error: 'Acceso denegado' })
    const { id } = request.params as { id: string }
    try {
      const order = await prisma.purchaseOrder.update({
        where: { id },
        data: { status: 'CANCELLED' },
        include,
      })
      await log({ userId: request.user.id, action: 'CANCEL', entity: 'PurchaseOrder', entityId: id })
      return reply.send(order)
    } catch {
      return reply.status(404).send({ error: 'Orden no encontrada' })
    }
  })

  fastify.delete('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'ADMIN') return reply.status(403).send({ error: 'Acceso denegado' })
    const { id } = request.params as { id: string }
    const order = await prisma.purchaseOrder.findUnique({ where: { id } })
    if (!order) return reply.status(404).send({ error: 'Orden no encontrada' })
    if (order.status !== 'DRAFT') return reply.status(400).send({ error: 'Solo se pueden eliminar borradores' })
    await prisma.purchaseOrder.delete({ where: { id } })
    return reply.send({ message: 'Orden eliminada' })
  })
}
