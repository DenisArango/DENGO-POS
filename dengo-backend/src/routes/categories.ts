import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requirePermission } from '../lib/permissions.js'
import { log } from '../services/audit.service.js'

const schema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  color: z.string().optional(),
})

export default async function categoryRoutes(fastify: FastifyInstance) {
  // ?withCounts=true adds each category's active product count — only the
  // management screen needs it, so the plain list (used by every dropdown
  // that just needs names) skips the extra join by default.
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const q = request.query as { withCounts?: string }
    if (q.withCounts !== 'true') {
      return reply.send(await prisma.category.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }))
    }
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: { where: { isActive: true } } } } },
    })
    return reply.send(categories.map(c => ({ ...c, productCount: c._count.products, _count: undefined })))
  })

  // Admin-only, not just inventory.create: categories are structural (every
  // product hangs off one), so unlike editing/deleting them — still gated
  // by the regular granular permissions below — creating a new one is kept
  // out of reach of a custom role regardless of what it's been granted.
  fastify.post('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'ADMIN') return reply.status(403).send({ error: 'Solo un administrador puede crear categorías' })
    const body = schema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    return reply.status(201).send(await prisma.category.create({ data: body.data }))
  })

  fastify.put('/:id', { preHandler: [fastify.authenticate, requirePermission('inventory.edit')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = schema.partial().safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    try {
      return reply.send(await prisma.category.update({ where: { id }, data: body.data }))
    } catch {
      return reply.status(404).send({ error: 'Categoría no encontrada' })
    }
  })

  // Product.categoryId is required (not nullable) — soft-deleting a category
  // that still has products would leave them pointing at a category that no
  // longer shows up anywhere, with no way to ever reassign them out of it
  // again (same orphaning risk flagged earlier about unassigning categories
  // directly). Blocked here; /: id/merge is the way to empty a category first.
  fastify.delete('/:id', { preHandler: [fastify.authenticate, requirePermission('inventory.delete')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const productCount = await prisma.product.count({ where: { categoryId: id, isActive: true } })
    if (productCount > 0) {
      return reply.status(409).send({ error: `Esta categoría todavía tiene ${productCount} producto(s). Fusiónala con otra categoría primero.`, productCount })
    }
    try {
      await prisma.category.update({ where: { id }, data: { isActive: false } })
      return reply.send({ message: 'Categoría eliminada' })
    } catch {
      return reply.status(404).send({ error: 'Categoría no encontrada' })
    }
  })

  // POST /api/categories/:id/merge — moves every product out of :id and into
  // targetCategoryId, then deactivates :id. The one operation behind both
  // "fusionar dos categorías duplicadas" and "eliminar una categoría que
  // todavía tiene productos" (the UI just picks a destination first for the
  // latter) — reassignment and deactivation always happen together so a
  // category is never left both gone-from-dropdowns and still pointed-to.
  fastify.post('/:id/merge', { preHandler: [fastify.authenticate, requirePermission('inventory.delete')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({ targetCategoryId: z.string().min(1) }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const { targetCategoryId } = body.data
    if (targetCategoryId === id) return reply.status(400).send({ error: 'Elige una categoría distinta como destino' })

    const [source, target] = await Promise.all([
      prisma.category.findUnique({ where: { id } }),
      prisma.category.findUnique({ where: { id: targetCategoryId } }),
    ])
    if (!source || !target) return reply.status(404).send({ error: 'Categoría no encontrada' })

    const [{ count: movedCount }] = await prisma.$transaction([
      prisma.product.updateMany({ where: { categoryId: id }, data: { categoryId: targetCategoryId } }),
      prisma.category.update({ where: { id }, data: { isActive: false } }),
    ])

    await log({ userId: request.user.id, action: 'UPDATE', entity: 'Category', entityId: id, newValues: { mergedInto: targetCategoryId, movedCount } })
    return reply.send({ message: `${movedCount} producto(s) movido(s) a "${target.name}" — "${source.name}" fue eliminada`, movedCount })
  })
}
