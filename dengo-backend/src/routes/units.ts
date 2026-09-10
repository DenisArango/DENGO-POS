import type { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma.js'

export default async function unitRoutes(fastify: FastifyInstance) {
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (_req, reply) => {
    return reply.send(await prisma.productUnit.findMany({ orderBy: { name: 'asc' } }))
  })
}
