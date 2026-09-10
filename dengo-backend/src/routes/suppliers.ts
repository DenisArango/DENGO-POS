import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { log } from '../services/audit.service.js'
import { requirePermission } from '../lib/permissions.js'

const schema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  contactName: z.string().default(''),
  // nullish + coerce/union-with-'': the edit form round-trips a fetched
  // supplier straight back into this payload — nullable DB columns come back
  // as `null`, and Decimal columns come back as strings, both of which a
  // plain .optional()/z.number() rejects.
  email: z.union([z.string().email(), z.literal('')]).nullish(),
  phone: z.string().nullish(),
  address: z.string().nullish(),
  city: z.string().nullish(),
  taxId: z.string().nullish(),
  paymentTerms: z.string().default('Contado'),
  creditLimit: z.coerce.number().nullish(),
  notes: z.string().nullish(),
  rating: z.number().int().min(1).max(5).nullish(),
})

export default async function supplierRoutes(fastify: FastifyInstance) {
  fastify.get('/', { preHandler: [fastify.authenticate, requirePermission('suppliers.view')] }, async (request, reply) => {
    const q = request.query as { isActive?: string }
    // Default (param absent) stays active-only, so every existing caller that
    // never sent this param (e.g. the supplier picker in Purchases.tsx) keeps
    // seeing only active suppliers — 'all' is the one new explicit opt-in.
    return reply.send(await prisma.supplier.findMany({
      where: q.isActive === 'all' ? {} : { isActive: q.isActive === 'false' ? false : true },
      orderBy: { name: 'asc' },
    }))
  })

  fastify.get('/:id', { preHandler: [fastify.authenticate, requirePermission('suppliers.view')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const s = await prisma.supplier.findUnique({ where: { id } })
    if (!s) return reply.status(404).send({ error: 'Proveedor no encontrado' })
    return reply.send(s)
  })

  fastify.post('/', { preHandler: [fastify.authenticate, requirePermission('suppliers.create')] }, async (request, reply) => {
    const body = schema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    try {
      const data = Object.fromEntries(Object.entries(body.data).filter(([, v]) => v !== undefined)) as any
      const s = await prisma.supplier.create({ data })
      await log({ userId: request.user.id, action: 'CREATE', entity: 'Supplier', entityId: s.id })
      return reply.status(201).send(s)
    } catch (err: any) {
      if (err.code === 'P2002') return reply.status(409).send({ error: 'El código ya está en uso' })
      throw err
    }
  })

  fastify.put('/:id', { preHandler: [fastify.authenticate, requirePermission('suppliers.edit')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = schema.partial().safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    try {
      const data = Object.fromEntries(Object.entries(body.data).filter(([, v]) => v !== undefined)) as any
      const s = await prisma.supplier.update({ where: { id }, data })
      await log({ userId: request.user.id, action: 'UPDATE', entity: 'Supplier', entityId: id })
      return reply.send(s)
    } catch {
      return reply.status(404).send({ error: 'Proveedor no encontrado' })
    }
  })

  fastify.delete('/:id', { preHandler: [fastify.authenticate, requirePermission('suppliers.delete')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      await prisma.supplier.update({ where: { id }, data: { isActive: false } })
      await log({ userId: request.user.id, action: 'DELETE', entity: 'Supplier', entityId: id })
      return reply.send({ message: 'Proveedor desactivado' })
    } catch {
      return reply.status(404).send({ error: 'Proveedor no encontrado' })
    }
  })
}
