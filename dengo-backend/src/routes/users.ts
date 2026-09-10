import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { hashPassword } from '../services/auth.service.js'
import { log } from '../services/audit.service.js'
import { requirePermission } from '../lib/permissions.js'

const userSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(6),
  role: z.enum(['ADMIN', 'AUDITOR', 'INVENTORY_CONTROL', 'OPERATOR']),
  customRoleId: z.string().nullable().optional(),
  branchId: z.string(),
  // Extra branches (beyond the home branchId) this user can switch into at
  // sale time — see StoreContext.tsx on the frontend.
  additionalBranchIds: z.array(z.string()).optional(),
  avatarUrl: z.string().max(3_000_000).optional(), // cap a base64 avatar well above what a reasonable photo needs
})

const userInclude = { branch: true, additionalBranches: { include: { branch: true } } }

function requireManageUsers(fastify: FastifyInstance) {
  return [fastify.authenticate, requirePermission('settings.users')]
}

function omitHash<T extends { passwordHash: string }>(u: T) {
  const { passwordHash: _, ...safe } = u
  return safe
}

// Replaces a user's UserBranch rows with `branchIds`, always excluding their
// home branchId (redundant — already implied) and de-duplicating input.
async function syncAdditionalBranches(userId: string, homeBranchId: string, branchIds: string[]) {
  const unique = Array.from(new Set(branchIds)).filter(id => id !== homeBranchId)
  await prisma.$transaction([
    prisma.userBranch.deleteMany({ where: { userId } }),
    ...(unique.length
      ? [prisma.userBranch.createMany({ data: unique.map(branchId => ({ userId, branchId })) })]
      : []),
  ])
}

export default async function userRoutes(fastify: FastifyInstance) {
  fastify.get('/', { preHandler: requireManageUsers(fastify) }, async (_req, reply) => {
    const users = await prisma.user.findMany({
      include: userInclude,
      orderBy: { name: 'asc' },
    })
    return reply.send(users.map(omitHash))
  })

  fastify.get('/:id', { preHandler: requireManageUsers(fastify) }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const user = await prisma.user.findUnique({ where: { id }, include: userInclude })
    if (!user) return reply.status(404).send({ error: 'Usuario no encontrado' })
    return reply.send(omitHash(user))
  })

  fastify.post('/', { preHandler: requireManageUsers(fastify) }, async (request, reply) => {
    const body = userSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const passwordHash = await hashPassword(body.data.password)
    const { additionalBranchIds, ...userData } = body.data
    try {
      const user = await prisma.user.create({
        data: { ...userData, passwordHash, password: undefined } as any,
        include: userInclude,
      })
      if (additionalBranchIds?.length) {
        await syncAdditionalBranches(user.id, user.branchId, additionalBranchIds)
      }
      await log({ userId: request.user.id, action: 'CREATE', entity: 'User', entityId: user.id })
      const withBranches = additionalBranchIds?.length
        ? await prisma.user.findUnique({ where: { id: user.id }, include: userInclude })
        : user
      return reply.status(201).send(omitHash(withBranches!))
    } catch (err: any) {
      if (err.code === 'P2002') return reply.status(409).send({ error: 'El email ya está registrado' })
      throw err
    }
  })

  fastify.put('/:id', { preHandler: requireManageUsers(fastify) }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const schema = userSchema.partial().omit({ password: true }).extend({
      password: z.string().min(6).optional(),
    })
    const body = schema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const { additionalBranchIds, ...rest } = body.data
    const data: any = { ...rest }
    if (data.password) {
      data.passwordHash = await hashPassword(data.password)
      delete data.password
    }
    try {
      const user = await prisma.user.update({ where: { id }, data, include: userInclude })
      if (additionalBranchIds !== undefined) {
        await syncAdditionalBranches(id, user.branchId, additionalBranchIds)
      }
      await log({ userId: request.user.id, action: 'UPDATE', entity: 'User', entityId: id })
      const withBranches = additionalBranchIds !== undefined
        ? await prisma.user.findUnique({ where: { id }, include: userInclude })
        : user
      return reply.send(omitHash(withBranches!))
    } catch {
      return reply.status(404).send({ error: 'Usuario no encontrado' })
    }
  })

  fastify.delete('/:id', { preHandler: requireManageUsers(fastify) }, async (request, reply) => {
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
