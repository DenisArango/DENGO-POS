import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { hashPassword } from '../services/auth.service.js'
import { log } from '../services/audit.service.js'

const userSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(6),
  role: z.enum(['ADMIN', 'AUDITOR', 'INVENTORY_CONTROL', 'OPERATOR']),
  branchId: z.string(),
})

function requireAdmin(fastify: FastifyInstance) {
  return [
    fastify.authenticate,
    async (req: any, reply: any) => {
      if (req.user.role !== 'ADMIN') return reply.status(403).send({ error: 'Acceso denegado' })
    },
  ]
}

function omitHash<T extends { passwordHash: string }>(u: T) {
  const { passwordHash: _, ...safe } = u
  return safe
}

export default async function userRoutes(fastify: FastifyInstance) {
  fastify.get('/', { preHandler: requireAdmin(fastify) }, async (_req, reply) => {
    const users = await prisma.user.findMany({
      include: { branch: true },
      orderBy: { name: 'asc' },
    })
    return reply.send(users.map(omitHash))
  })

  fastify.get('/:id', { preHandler: requireAdmin(fastify) }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const user = await prisma.user.findUnique({ where: { id }, include: { branch: true } })
    if (!user) return reply.status(404).send({ error: 'Usuario no encontrado' })
    return reply.send(omitHash(user))
  })

  fastify.post('/', { preHandler: requireAdmin(fastify) }, async (request, reply) => {
    const body = userSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const passwordHash = await hashPassword(body.data.password)
    try {
      const user = await prisma.user.create({
        data: { ...body.data, passwordHash, password: undefined } as any,
        include: { branch: true },
      })
      await log({ userId: request.user.id, action: 'CREATE', entity: 'User', entityId: user.id })
      return reply.status(201).send(omitHash(user))
    } catch (err: any) {
      if (err.code === 'P2002') return reply.status(409).send({ error: 'El email ya está registrado' })
      throw err
    }
  })

  fastify.put('/:id', { preHandler: requireAdmin(fastify) }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const schema = userSchema.partial().omit({ password: true }).extend({
      password: z.string().min(6).optional(),
    })
    const body = schema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const data: any = { ...body.data }
    if (data.password) {
      data.passwordHash = await hashPassword(data.password)
      delete data.password
    }
    try {
      const user = await prisma.user.update({ where: { id }, data, include: { branch: true } })
      await log({ userId: request.user.id, action: 'UPDATE', entity: 'User', entityId: id })
      return reply.send(omitHash(user))
    } catch {
      return reply.status(404).send({ error: 'Usuario no encontrado' })
    }
  })

  fastify.delete('/:id', { preHandler: requireAdmin(fastify) }, async (request, reply) => {
    const { id } = request.params as { id: string }
    if (id === request.user.id) return reply.status(400).send({ error: 'No puedes desactivar tu propia cuenta' })
    try {
      await prisma.user.update({ where: { id }, data: { isActive: false } })
      await log({ userId: request.user.id, action: 'DELETE', entity: 'User', entityId: id })
      return reply.send({ message: 'Usuario desactivado' })
    } catch {
      return reply.status(404).send({ error: 'Usuario no encontrado' })
    }
  })
}
