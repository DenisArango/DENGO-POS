import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { updateStock } from '../services/inventory.service.js'
import { log } from '../services/audit.service.js'

const saleItemSchema = z.object({
  productId: z.string(),
  variationId: z.string().optional(),
  quantity: z.number().min(0.001),
  unitPrice: z.number().min(0),
  discount: z.number().min(0).max(1).default(0),
  total: z.number().min(0),
})

const createSaleSchema = z.object({
  branchId: z.string(),
  customerId: z.string().optional(),
  cashRegisterId: z.string().optional(),
  items: z.array(saleItemSchema).min(1),
  subtotal: z.number().min(0),
  tax: z.number().min(0).default(0),
  discount: z.number().min(0).default(0),
  total: z.number().min(0),
  paymentMethod: z.enum(['CASH', 'CARD', 'TRANSFER', 'MIXED', 'CREDIT']),
  saleType: z.enum(['CASH', 'CREDIT']).default('CASH'),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
})

const saleInclude = {
  branch: true,
  cashier: { select: { id: true, name: true, role: true } },
  customer: true,
  items: {
    include: {
      product: { select: { id: true, name: true, barcode: true } },
      variation: true,
    },
  },
}

export default async function salesRoutes(fastify: FastifyInstance) {
  // GET /api/sales
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const q = request.query as {
      branchId?: string; from?: string; to?: string;
      paymentMethod?: string; saleType?: string; search?: string
    }
    const sales = await prisma.sale.findMany({
      where: {
        isVoided: false,
        ...(q.branchId ? { branchId: q.branchId } : {}),
        ...(q.paymentMethod ? { paymentMethod: q.paymentMethod as any } : {}),
        ...(q.saleType ? { saleType: q.saleType as any } : {}),
        ...(q.from || q.to ? {
          createdAt: {
            ...(q.from ? { gte: new Date(q.from) } : {}),
            ...(q.to ? { lte: new Date(q.to) } : {}),
          },
        } : {}),
        ...(q.search ? {
          OR: [
            { invoiceNumber: { contains: q.search } },
            { customer: { name: { contains: q.search } } },
          ],
        } : {}),
      },
      include: saleInclude,
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return reply.send(sales)
  })

  // GET /api/sales/:id
  fastify.get('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const sale = await prisma.sale.findUnique({ where: { id }, include: saleInclude })
    if (!sale) return reply.status(404).send({ error: 'Venta no encontrada' })
    return reply.send(sale)
  })

  // POST /api/sales  (complete a sale)
  fastify.post('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = createSaleSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const data = body.data
    const invoiceNumber = `FAC-${Date.now()}`

    const sale = await prisma.$transaction(async (tx) => {
      const created = await tx.sale.create({
        data: {
          invoiceNumber,
          branchId: data.branchId,
          cashierId: request.user.id,
          customerId: data.customerId,
          cashRegisterId: data.cashRegisterId,
          subtotal: data.subtotal,
          tax: data.tax,
          discount: data.discount,
          total: data.total,
          paymentMethod: data.paymentMethod,
          saleType: data.saleType,
          dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
          isPaid: data.saleType === 'CASH',
          notes: data.notes,
          items: {
            create: data.items.map(item => ({
              productId: item.productId,
              variationId: item.variationId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discount: item.discount,
              total: item.total,
            })),
          },
        },
        include: saleInclude,
      })

      // Update customer credit for CREDIT sales
      if (data.saleType === 'CREDIT' && data.customerId) {
        await tx.customer.update({
          where: { id: data.customerId },
          data: { creditUsed: { increment: data.total } },
        })
      }

      return created
    })

    // Deduct inventory (outside transaction to avoid long locks)
    for (const item of data.items) {
      const units = item.quantity * 1 // already in base units from frontend
      await updateStock(item.productId, data.branchId, -units, {
        type: 'SALE',
        performedById: request.user.id,
        referenceId: sale.id,
      })
    }

    await log({ userId: request.user.id, action: 'CREATE', entity: 'Sale', entityId: sale.id, newValues: { total: data.total, invoiceNumber } })
    return reply.status(201).send(sale)
  })

  // PUT /api/sales/:id  (mark credit as paid, admin only)
  fastify.put('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'ADMIN') return reply.status(403).send({ error: 'Acceso denegado' })
    const { id } = request.params as { id: string }
    const body = z.object({
      isPaid: z.boolean().optional(),
      paidAmount: z.number().optional(),
      notes: z.string().optional(),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    try {
      const sale = await prisma.sale.update({ where: { id }, data: body.data, include: saleInclude })
      await log({ userId: request.user.id, action: 'UPDATE', entity: 'Sale', entityId: id })
      return reply.send(sale)
    } catch {
      return reply.status(404).send({ error: 'Venta no encontrada' })
    }
  })

  // DELETE /api/sales/:id  (void sale)
  fastify.delete('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'ADMIN') return reply.status(403).send({ error: 'Acceso denegado' })
    const { id } = request.params as { id: string }
    const sale = await prisma.sale.findUnique({ where: { id }, include: { items: true } })
    if (!sale) return reply.status(404).send({ error: 'Venta no encontrada' })
    if (sale.isVoided) return reply.status(400).send({ error: 'La venta ya fue anulada' })

    await prisma.sale.update({
      where: { id },
      data: { isVoided: true, voidedById: request.user.id, voidedAt: new Date() },
    })

    // Reverse inventory
    for (const item of sale.items) {
      await updateStock(item.productId, sale.branchId, Number(item.quantity), {
        type: 'RETURN',
        performedById: request.user.id,
        referenceId: id,
        reason: 'Anulación de venta',
      })
    }

    await log({ userId: request.user.id, action: 'VOID', entity: 'Sale', entityId: id })
    return reply.send({ message: 'Venta anulada' })
  })
}
