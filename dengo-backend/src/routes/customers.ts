import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'

const schema = z.object({
  nit: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  creditLimit: z.number().min(0).default(0),
})

export default async function customerRoutes(fastify: FastifyInstance) {
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const q = request.query as { search?: string }
    return reply.send(await prisma.customer.findMany({
      where: {
        isActive: true,
        ...(q.search ? {
          OR: [
            { name: { contains: q.search } },
            { nit: { contains: q.search } },
          ],
        } : {}),
      },
      orderBy: { name: 'asc' },
    }))
  })

  fastify.get('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const c = await prisma.customer.findUnique({ where: { id } })
    if (!c) return reply.status(404).send({ error: 'Cliente no encontrado' })
    return reply.send({ ...c, creditAvailable: Number(c.creditLimit) - Number(c.creditUsed) })
  })

  fastify.post('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = schema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    try {
      const c = await prisma.customer.create({ data: body.data })
      return reply.status(201).send(c)
    } catch (err: any) {
      if (err.code === 'P2002') return reply.status(409).send({ error: 'El NIT ya está registrado' })
      throw err
    }
  })

  fastify.put('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = schema.partial().safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    try {
      return reply.send(await prisma.customer.update({ where: { id }, data: body.data }))
    } catch {
      return reply.status(404).send({ error: 'Cliente no encontrado' })
    }
  })

  fastify.delete('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    if (request.user.role !== 'ADMIN') return reply.status(403).send({ error: 'Acceso denegado' })
    try {
      await prisma.customer.update({ where: { id }, data: { isActive: false } })
      return reply.send({ message: 'Cliente eliminado' })
    } catch {
      return reply.status(404).send({ error: 'Cliente no encontrado' })
    }
  })
}
