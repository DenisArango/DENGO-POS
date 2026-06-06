import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { log } from '../services/audit.service.js'

const branchSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  type: z.enum(['main', 'branch']).default('branch'),
  address: z.string().default(''),
  city: z.string().default(''),
  phone: z.string().default(''),
  email: z.string().default(''),
  manager: z.string().default(''),
  openTime: z.string().default('08:00'),
  closeTime: z.string().default('20:00'),
  currency: z.string().default('GTQ'),
  taxRate: z.number().default(0.12),
  printerEnabled: z.boolean().default(true),
  // Company branding
  logo: z.string().optional(),
  companyName: z.string().optional(),
  companyTaxId: z.string().optional(),
  companyTagline: z.string().optional(),
  companyWebsite: z.string().optional(),
})

function requireAdmin(fastify: FastifyInstance) {
  return [
    fastify.authenticate,
    async (req: any, reply: any) => {
      if (req.user.role !== 'ADMIN') return reply.status(403).send({ error: 'Acceso denegado' })
    },
  ]
}

export default async function branchRoutes(fastify: FastifyInstance) {
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (_req, reply) => {
    const branches = await prisma.branch.findMany({ orderBy: { name: 'asc' } })
    return reply.send(branches)
  })

  fastify.get('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const branch = await prisma.branch.findUnique({ where: { id } })
    if (!branch) return reply.status(404).send({ error: 'Sucursal no encontrada' })
    return reply.send(branch)
  })

  fastify.post('/', { preHandler: requireAdmin(fastify) }, async (request, reply) => {
    const body = branchSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const branch = await prisma.branch.create({ data: body.data })
    await log({ userId: request.user.id, action: 'CREATE', entity: 'Branch', entityId: branch.id })
    return reply.status(201).send(branch)
  })

  fastify.put('/:id', { preHandler: requireAdmin(fastify) }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = branchSchema.partial().safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    try {
      const branch = await prisma.branch.update({ where: { id }, data: body.data })
      await log({ userId: request.user.id, action: 'UPDATE', entity: 'Branch', entityId: id })
      return reply.send(branch)
    } catch {
      return reply.status(404).send({ error: 'Sucursal no encontrada' })
    }
  })

  fastify.delete('/:id', { preHandler: requireAdmin(fastify) }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      await prisma.branch.update({ where: { id }, data: { status: 'inactive' } })
      await log({ userId: request.user.id, action: 'DELETE', entity: 'Branch', entityId: id })
      return reply.send({ message: 'Sucursal desactivada' })
    } catch {
      return reply.status(404).send({ error: 'Sucursal no encontrada' })
    }
  })
}
