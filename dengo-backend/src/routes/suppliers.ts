import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { log } from '../services/audit.service.js'

const schema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  contactName: z.string().default(''),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  taxId: z.string().optional(),
  paymentTerms: z.string().default('Contado'),
  creditLimit: z.number().optional(),
  notes: z.string().optional(),
  rating: z.number().int().min(1).max(5).optional(),
})

export default async function supplierRoutes(fastify: FastifyInstance) {
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const q = request.query as { isActive?: string }
    return reply.send(await prisma.supplier.findMany({
      where: { isActive: q.isActive === 'false' ? false : true },
      orderBy: { name: 'asc' },
    }))
  })

  fastify.get('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const s = await prisma.supplier.findUnique({ where: { id } })
    if (!s) return reply.status(404).send({ error: 'Proveedor no encontrado' })
    return reply.send(s)
  })

  fastify.post('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = schema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    try {
      const s = await prisma.supplier.create({ data: body.data })
      await log({ userId: request.user.id, action: 'CREATE', entity: 'Supplier', entityId: s.id })
      return reply.status(201).send(s)
    } catch (err: any) {
      if (err.code === 'P2002') return reply.status(409).send({ error: 'El código ya está en uso' })
      throw err
    }
  })

  fastify.put('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = schema.partial().safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    try {
      const s = await prisma.supplier.update({ where: { id }, data: body.data })
      await log({ userId: request.user.id, action: 'UPDATE', entity: 'Supplier', entityId: id })
      return reply.send(s)
    } catch {
      return reply.status(404).send({ error: 'Proveedor no encontrado' })
    }
  })

  fastify.delete('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    if (request.user.role !== 'ADMIN') return reply.status(403).send({ error: 'Acceso denegado' })
    try {
      await prisma.supplier.update({ where: { id }, data: { isActive: false } })
      await log({ userId: request.user.id, action: 'DELETE', entity: 'Supplier', entityId: id })
      return reply.send({ message: 'Proveedor desactivado' })
    } catch {
      return reply.status(404).send({ error: 'Proveedor no encontrado' })
    }
  })
}
