import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { validateUser, logLogin } from '../services/auth.service.js'
import { log } from '../services/audit.service.js'
import { prisma } from '../lib/prisma.js'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export default async function authRoutes(fastify: FastifyInstance) {
  // POST /api/auth/login
  fastify.post('/login', async (request, reply) => {
    const body = loginSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'Email y contraseña requeridos' })

    const { email, password } = body.data
    const ip = request.ip
    const ua = request.headers['user-agent']

    try {
      const user = await validateUser(email, password)
      await logLogin({ email, userId: user.id, success: true, ipAddress: ip, ...(ua && { userAgent: ua }) })
      await log({ userId: user.id, action: 'LOGIN', entity: 'User', entityId: user.id, ipAddress: ip })

      const token = fastify.jwt.sign(
        { id: user.id, role: user.role, branchId: user.branchId, email: user.email },
        { expiresIn: '8h' }
      )

      const branch = await prisma.branch.findUnique({ where: { id: user.branchId } })

      return reply.send({
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          branchId: user.branchId,
          isActive: user.isActive,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          branch: branch ? {
            id: branch.id,
            name: branch.name,
            code: branch.code,
            type: branch.type,
            address: branch.address,
            city: branch.city,
            phone: branch.phone,
            email: branch.email,
            manager: branch.manager,
            status: branch.status,
            openTime: branch.openTime,
            closeTime: branch.closeTime,
            currency: branch.currency,
            timezone: branch.timezone,
            taxRate: branch.taxRate,
            printerEnabled: branch.printerEnabled,
            createdAt: branch.createdAt,
            updatedAt: branch.updatedAt,
          } : null,
        },
      })
    } catch (err: any) {
      await logLogin({ email, success: false, ipAddress: ip, ...(ua && { userAgent: ua }), ...(err.message && { failReason: err.message }) })
      return reply.status(401).send({ error: 'Credenciales incorrectas' })
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
