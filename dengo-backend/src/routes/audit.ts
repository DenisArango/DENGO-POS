import type { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma.js'

function requireAuditor(fastify: FastifyInstance) {
  return [
    fastify.authenticate,
    async (req: any, reply: any) => {
      if (!['ADMIN', 'AUDITOR'].includes(req.user.role)) {
        return reply.status(403).send({ error: 'Acceso denegado' })
      }
    },
  ]
}

export default async function auditRoutes(fastify: FastifyInstance) {
  fastify.get('/logs', { preHandler: requireAuditor(fastify) }, async (request, reply) => {
    const q = request.query as { userId?: string; action?: string; entity?: string; from?: string; to?: string }
    return reply.send(await prisma.auditLog.findMany({
      where: {
        ...(q.userId ? { userId: q.userId } : {}),
        ...(q.action ? { action: q.action } : {}),
        ...(q.entity ? { entity: q.entity } : {}),
        ...(q.from || q.to ? {
          createdAt: {
            ...(q.from ? { gte: new Date(q.from) } : {}),
            ...(q.to ? { lte: new Date(q.to) } : {}),
          },
        } : {}),
      },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }))
  })

  fastify.get('/login-history', { preHandler: requireAuditor(fastify) }, async (request, reply) => {
    const q = request.query as { from?: string; to?: string }
    return reply.send(await prisma.loginHistory.findMany({
      where: {
        ...(q.from || q.to ? {
          createdAt: {
            ...(q.from ? { gte: new Date(q.from) } : {}),
            ...(q.to ? { lte: new Date(q.to) } : {}),
          },
        } : {}),
      },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }))
  })
}
