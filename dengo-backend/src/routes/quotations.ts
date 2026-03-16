import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { log } from '../services/audit.service.js'

const itemSchema = z.object({
  productId: z.string(),
  variationId: z.string().optional(),
  quantity: z.number().min(0.001),
  unitPrice: z.number().min(0),
  discount: z.number().min(0).max(1).default(0),
  total: z.number().min(0),
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
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const q = request.query as { status?: string; customerId?: string }
    return reply.send(await prisma.quotation.findMany({
      where: {
        ...(q.status ? { status: q.status as any } : {}),
        ...(q.customerId ? { customerId: q.customerId } : {}),
      },
      include,
      orderBy: { createdAt: 'desc' },
    }))
  })

  fastify.get('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const q = await prisma.quotation.findUnique({ where: { id }, include })
    if (!q) return reply.status(404).send({ error: 'Cotización no encontrada' })
    return reply.send(q)
  })

  fastify.post('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = createSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

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

  fastify.put('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const q = await prisma.quotation.findUnique({ where: { id } })
    if (!q || q.status !== 'DRAFT') return reply.status(400).send({ error: 'Solo se pueden editar cotizaciones en borrador' })

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

  fastify.put('/:id/send', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const q = await prisma.quotation.findUnique({ where: { id } })
    if (!q || q.status !== 'DRAFT') return reply.status(400).send({ error: 'Solo se pueden enviar cotizaciones en borrador' })
    return reply.send(await prisma.quotation.update({ where: { id }, data: { status: 'SENT' }, include }))
  })

  fastify.put('/:id/accept', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const q = await prisma.quotation.findUnique({ where: { id } })
    if (!q || q.status !== 'SENT') return reply.status(400).send({ error: 'Solo se pueden aceptar cotizaciones enviadas' })
    return reply.send(await prisma.quotation.update({ where: { id }, data: { status: 'ACCEPTED' }, include }))
  })

  fastify.put('/:id/reject', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const q = await prisma.quotation.findUnique({ where: { id } })
    if (!q || q.status !== 'SENT') return reply.status(400).send({ error: 'Solo se pueden rechazar cotizaciones enviadas' })
    return reply.send(await prisma.quotation.update({ where: { id }, data: { status: 'REJECTED' }, include }))
  })

  // Convert ACCEPTED quotation → Sale
  fastify.post('/:id/convert', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      cashRegisterId: z.string().optional(),
      paymentMethod: z.enum(['CASH', 'CARD', 'TRANSFER', 'MIXED', 'CREDIT']).default('CASH'),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const quot = await prisma.quotation.findUnique({ where: { id }, include: { items: true } })
    if (!quot || quot.status !== 'ACCEPTED') return reply.status(400).send({ error: 'Solo se pueden convertir cotizaciones aceptadas' })

    const invoiceNumber = `FAC-${Date.now()}`
    const sale = await prisma.sale.create({
      data: {
        invoiceNumber,
        branchId: quot.branchId,
        cashierId: request.user.id,
        customerId: quot.customerId,
        cashRegisterId: body.data.cashRegisterId,
        subtotal: quot.subtotal,
        tax: quot.tax,
        discount: quot.discount,
        total: quot.total,
        paymentMethod: body.data.paymentMethod,
        saleType: 'CASH',
        items: {
          create: quot.items.map(item => ({
            productId: item.productId,
            variationId: item.variationId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount,
            total: item.total,
          })),
        },
      },
    })

    await prisma.quotation.update({
      where: { id },
      data: { status: 'CONVERTED', convertedToSaleId: sale.id },
    })

    await log({ userId: request.user.id, action: 'CONVERT', entity: 'Quotation', entityId: id, newValues: { saleId: sale.id } })
    return reply.status(201).send({ sale, message: 'Cotización convertida a venta' })
  })

  fastify.delete('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const q = await prisma.quotation.findUnique({ where: { id } })
    if (!q || q.status !== 'DRAFT') return reply.status(400).send({ error: 'Solo se pueden eliminar cotizaciones en borrador' })
    await prisma.quotation.delete({ where: { id } })
    return reply.send({ message: 'Cotización eliminada' })
  })
}
