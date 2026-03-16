import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'

const schema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  color: z.string().optional(),
})

export default async function categoryRoutes(fastify: FastifyInstance) {
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (_req, reply) => {
    return reply.send(await prisma.category.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }))
  })

  fastify.post('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = schema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    return reply.status(201).send(await prisma.category.create({ data: body.data }))
  })

  fastify.put('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = schema.partial().safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    try {
      return reply.send(await prisma.category.update({ where: { id }, data: body.data }))
    } catch {
      return reply.status(404).send({ error: 'Categoría no encontrada' })
    }
  })

  fastify.delete('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      await prisma.category.update({ where: { id }, data: { isActive: false } })
      return reply.send({ message: 'Categoría eliminada' })
    } catch {
      return reply.status(404).send({ error: 'Categoría no encontrada' })
    }
  })
}
