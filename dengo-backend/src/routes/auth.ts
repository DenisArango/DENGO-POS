import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { validateUser, logLogin } from '../services/auth.service.js'
import { log } from '../services/audit.service.js'
import { prisma } from '../lib/prisma.js'
import { resolveUserPermissions, checkLoginSchedule } from '../lib/permissions.js'
import { getLicense } from './license.js'
import { config } from '../config.js'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export default async function authRoutes(fastify: FastifyInstance) {
  // POST /api/auth/login — tighter limit than the general API rate limit to
  // slow down credential-stuffing/brute-force attempts against this endpoint specifically.
  fastify.post('/login', { config: { rateLimit: { max: 10, timeWindow: 60_000 } } }, async (request, reply) => {
    const body = loginSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'Email y contraseña requeridos' })

    const { email, password } = body.data
    const ip = request.ip
    const ua = request.headers['user-agent']

    const license = await getLicense()
    if (!license.posEnabled) {
      return reply.status(403).send({ error: 'Este sistema no está activo. Contacta a tu proveedor.' })
    }

    try {
      const user = await validateUser(email, password)
      await checkLoginSchedule(user)
      await logLogin({ email, userId: user.id, success: true, ipAddress: ip, ...(ua && { userAgent: ua }) })
      await log({ userId: user.id, action: 'LOGIN', entity: 'User', entityId: user.id, ipAddress: ip })

      const permissions = await resolveUserPermissions(user)
      const additionalBranches = await prisma.userBranch.findMany({ where: { userId: user.id }, select: { branchId: true } })
      const branchIds = [user.branchId, ...additionalBranches.map(b => b.branchId)]

      const token = fastify.jwt.sign(
        { id: user.id, role: user.role, branchId: user.branchId, branchIds, email: user.email, permissions },
        { expiresIn: config.jwt.expiresIn }
      )

      // ADMIN can switch to any branch; everyone else only sees their home + assigned branches.
      const accessibleBranches = await prisma.branch.findMany({
        where: user.role === 'ADMIN' ? {} : { id: { in: branchIds } },
        orderBy: { name: 'asc' },
      })
      const branch = accessibleBranches.find(b => b.id === user.branchId) ?? accessibleBranches[0] ?? null

      return reply.send({
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          branchId: user.branchId,
          branchIds,
          permissions,
          avatarUrl: user.avatarUrl,
          isActive: user.isActive,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          branch,
          branches: accessibleBranches,
        },
      })
    } catch (err: any) {
      await logLogin({ email, success: false, ipAddress: ip, ...(ua && { userAgent: ua }), ...(err.message && { failReason: err.message }) })
      // Surface the lockout/schedule messages specifically (so the user knows why and what to do,
      // instead of retyping their password); any other failure stays generic to avoid confirming
      // whether an email is registered.
      const message = typeof err.message === 'string' ? err.message : ''
      const isActionable = message.startsWith('Cuenta bloqueada') || message.startsWith('Fuera de horario')
      return reply.status(401).send({ error: isActionable ? message : 'Credenciales incorrectas' })
    }
  })

  // GET /api/auth/me
  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { prisma } = await import('../lib/prisma.js')
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      include: { branch: true },
    })
    if (!user) return reply.status(404).send({ error: 'Usuario no encontrado' })
    const { passwordHash: _, ...safe } = user
    return reply.send(safe)
  })

  // POST /api/auth/logout
  fastify.post('/logout', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    await log({
      userId: request.user.id,
      action: 'LOGOUT',
      entity: 'User',
      entityId: request.user.id,
      ipAddress: request.ip,
    })
    return reply.send({ message: 'Sesión cerrada' })
  })
}
