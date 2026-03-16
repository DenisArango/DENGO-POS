import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { log } from '../services/audit.service.js'

const variationSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  barcode: z.string().optional(),
  conversionFactor: z.number().default(1),
  price: z.number().min(0),
  isDefault: z.boolean().default(false),
})

const productSchema = z.object({
  barcode: z.string().optional(),
  sku: z.string().optional(),
  name: z.string().min(1),
  brand: z.string().optional(),
  description: z.string().optional(),
  basePrice: z.number().min(0),
  cost: z.number().min(0),
  imageUrl: z.string().optional(),
  categoryId: z.string(),
  baseUnitId: z.string(),
  minStock: z.number().int().default(0),
  variations: z.array(variationSchema).default([]),
})

const include = {
  category: true,
  baseUnit: true,
  variations: { orderBy: { isDefault: 'desc' as const } },
}

export default async function productRoutes(fastify: FastifyInstance) {
  // GET /api/products
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const q = request.query as { search?: string; categoryId?: string; isActive?: string }
    const products = await prisma.product.findMany({
      where: {
        isActive: q.isActive === 'false' ? false : true,
        ...(q.categoryId ? { categoryId: q.categoryId } : {}),
        ...(q.search ? {
          OR: [
            { name: { contains: q.search } },
            { barcode: { contains: q.search } },
            { sku: { contains: q.search } },
          ],
        } : {}),
      },
      include,
      orderBy: { name: 'asc' },
    })
    return reply.send(products)
  })

  // GET /api/products/barcode/:code
  fastify.get('/barcode/:code', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { code } = request.params as { code: string }
    // Try product barcode first
    let product = await prisma.product.findFirst({
      where: { barcode: code, isActive: true },
      include,
    })
    if (product) return reply.send({ product, variation: product.variations.find(v => v.isDefault) ?? product.variations[0] })

    // Try variation barcode
    const variation = await prisma.productVariation.findFirst({
      where: { barcode: code },
      include: { product: { include } },
    })
    if (variation) return reply.send({ product: variation.product, variation })

    return reply.status(404).send({ error: 'Producto no encontrado' })
  })

  // GET /api/products/:id
  fastify.get('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const product = await prisma.product.findUnique({ where: { id }, include })
    if (!product) return reply.status(404).send({ error: 'Producto no encontrado' })
    return reply.send(product)
  })

  // POST /api/products
  fastify.post('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = productSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const { variations, ...productData } = body.data
    try {
      const product = await prisma.product.create({
        data: {
          ...productData,
          variations: { create: variations },
        },
        include,
      })
      await log({ userId: request.user.id, action: 'CREATE', entity: 'Product', entityId: product.id, newValues: productData })
      return reply.status(201).send(product)
    } catch (err: any) {
      if (err.code === 'P2002') return reply.status(409).send({ error: 'El código de barras ya está registrado' })
      throw err
    }
  })

  // PUT /api/products/:id
  fastify.put('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = productSchema.partial().safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const { variations, ...productData } = body.data
    try {
      const old = await prisma.product.findUnique({ where: { id }, select: { basePrice: true, cost: true } })

      const product = await prisma.product.update({
        where: { id },
        data: {
          ...productData,
          ...(variations ? {
            variations: {
              deleteMany: {},
              create: variations,
            },
          } : {}),
        },
        include,
      })

      // Log price changes if any
      if (old && productData.basePrice !== undefined && old.basePrice !== productData.basePrice) {
        await prisma.priceHistory.create({
          data: { productId: id, field: 'BasePrice', oldValue: old.basePrice, newValue: productData.basePrice, changedById: request.user.id },
        })
      }
      if (old && productData.cost !== undefined && old.cost !== productData.cost) {
        await prisma.priceHistory.create({
          data: { productId: id, field: 'Cost', oldValue: old.cost, newValue: productData.cost, changedById: request.user.id },
        })
      }

      await log({ userId: request.user.id, action: 'UPDATE', entity: 'Product', entityId: id })
      return reply.send(product)
    } catch (err: any) {
      if (err.code === 'P2025') return reply.status(404).send({ error: 'Producto no encontrado' })
      throw err
    }
  })

  // DELETE /api/products/:id
  fastify.delete('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    if (request.user.role !== 'ADMIN') return reply.status(403).send({ error: 'Acceso denegado' })
    try {
      await prisma.product.update({ where: { id }, data: { isActive: false } })
      await log({ userId: request.user.id, action: 'DELETE', entity: 'Product', entityId: id })
      return reply.send({ message: 'Producto desactivado' })
    } catch {
      return reply.status(404).send({ error: 'Producto no encontrado' })
    }
  })
}
