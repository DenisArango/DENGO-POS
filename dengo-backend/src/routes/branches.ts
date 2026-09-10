import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { log } from '../services/audit.service.js'
import { requirePermission } from '../lib/permissions.js'

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
  // coerce: Prisma serializes Decimal columns as strings in JSON responses,
  // and the frontend round-trips a fetched branch straight back into this
  // same payload on save — a plain z.number() rejects that string on every
  // update.
  taxRate: z.coerce.number().default(0.12),
  printerEnabled: z.boolean().default(true),
  receiptWidthMm: z.number().int().min(30).max(120).default(55),
  invoiceSeries: z.string().min(1).max(10).optional(),
  salesReconciliationEnabled: z.boolean().default(false),
  // Company branding — capped well above what a reasonable logo needs (client
  // already caps the source file at 2MB; base64 adds ~37% overhead) so a
  // request can't stuff an arbitrarily large string into an unbounded column.
  // nullish (not optional): these columns are nullable, so a fetched branch
  // with none set comes back as `null` — the frontend round-trips that
  // straight into the save payload, and .optional() alone rejects `null`.
  logo: z.string().max(3_000_000).nullish(),
  companyName: z.string().nullish(),
  companyTaxId: z.string().nullish(),
  companyTagline: z.string().nullish(),
  companyWebsite: z.string().nullish(),
  socialMediaName: z.string().nullish(),
  defaultCustomerId: z.string().nullish(), // auto-selected in POS so a sale never starts with no customer chosen
})

function requireManageBranches(fastify: FastifyInstance) {
  return [fastify.authenticate, requirePermission('settings.stores')]
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

  fastify.post('/', { preHandler: requireManageBranches(fastify) }, async (request, reply) => {
    const body = branchSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const branch = await prisma.branch.create({ data: Object.fromEntries(Object.entries(body.data).filter(([, v]) => v !== undefined)) as any })
    await log({ userId: request.user.id, action: 'CREATE', entity: 'Branch', entityId: branch.id })
    return reply.status(201).send(branch)
  })

  fastify.put('/:id', { preHandler: requireManageBranches(fastify) }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = branchSchema.partial().safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    try {
      const branch = await prisma.branch.update({ where: { id }, data: Object.fromEntries(Object.entries(body.data).filter(([, v]) => v !== undefined)) as any })
      await log({ userId: request.user.id, action: 'UPDATE', entity: 'Branch', entityId: id })
      return reply.send(branch)
    } catch {
      return reply.status(404).send({ error: 'Sucursal no encontrada' })
    }
  })

  fastify.delete('/:id', { preHandler: requireManageBranches(fastify) }, async (request, reply) => {
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
