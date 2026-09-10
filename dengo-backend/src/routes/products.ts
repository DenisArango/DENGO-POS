import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { log } from '../services/audit.service.js'
import { hasPermission, requirePermission } from '../lib/permissions.js'
import { resolveBranchScope } from '../lib/branch-scope.js'

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
  imageUrl: z.string().max(3_000_000).optional(), // cap a base64 product photo well above what a reasonable image needs
  categoryId: z.string(),
  baseUnitId: z.string(),
  minStock: z.number().int().default(0),
  variations: z.array(variationSchema).default([]),
})

const include = {
  category: true,
  baseUnit: true,
  variations: { orderBy: { isDefault: 'desc' as const } },
  altBarcodes: true,
}

export default async function productRoutes(fastify: FastifyInstance) {
  // GET /api/products
  fastify.get('/', { preHandler: [fastify.authenticate, requirePermission('inventory.view')] }, async (request, reply) => {
    const q = request.query as { search?: string; categoryId?: string; isActive?: string }
    const products = await prisma.product.findMany({
      where: {
        isActive: q.isActive === 'false' ? false : true,
        ...(q.categoryId ? { categoryId: q.categoryId } : {}),
        ...(q.search ? {
          OR: [
            { name: { contains: q.search, mode: 'insensitive' } },
            { barcode: { contains: q.search, mode: 'insensitive' } },
            { sku: { contains: q.search, mode: 'insensitive' } },
            { altBarcodes: { some: { barcode: { contains: q.search, mode: 'insensitive' } } } },
          ],
        } : {}),
      },
      include,
      orderBy: { name: 'asc' },
    })

    // Product is a global catalog entity with no branchId of its own — real
    // stock lives on Inventory, scoped per branch. Without this join every
    // product listed here showed "stock: 0" (the Products page's own tallies
    // — Valor Inventario, Stock Bajo, Sin Stock — were silently wrong too).
    const branchId = resolveBranchScope(request)
    const stockRows = await prisma.inventory.groupBy({
      by: ['productId'],
      where: branchId ? { branchId } : {},
      _sum: { quantity: true },
    })
    const stockByProduct = new Map(stockRows.map(r => [r.productId, Number(r._sum.quantity ?? 0)]))

    return reply.send(products.map(p => ({ ...p, stock: stockByProduct.get(p.id) ?? 0 })))
  })

  // GET /api/products/barcode/:code
  fastify.get('/barcode/:code', { preHandler: [fastify.authenticate, requirePermission('inventory.view')] }, async (request, reply) => {
    const { code } = request.params as { code: string }

    // Try product main barcode
    const product = await prisma.product.findFirst({
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

    // Try alternate barcodes
    const altBarcode = await prisma.productBarcode.findFirst({
      where: { barcode: code },
      include: { product: { include } },
    })
    if (altBarcode) {
      const p = altBarcode.product
      return reply.send({ product: p, variation: p.variations.find(v => v.isDefault) ?? p.variations[0] })
    }

    return reply.status(404).send({ error: 'Producto no encontrado' })
  })

  // GET /api/products/:id
  fastify.get('/:id', { preHandler: [fastify.authenticate, requirePermission('inventory.view')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const product = await prisma.product.findUnique({ where: { id }, include })
    if (!product) return reply.status(404).send({ error: 'Producto no encontrado' })
    return reply.send(product)
  })

  // POST /api/products
  fastify.post('/', { preHandler: [fastify.authenticate, requirePermission('inventory.create')] }, async (request, reply) => {
    const body = productSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    if (!hasPermission(request, 'inventory.editPrice')) {
      // A creator without price rights still creates the product — just at Q0, an admin fills in pricing after.
      body.data.basePrice = 0
      body.data.cost = 0
    }

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
  fastify.put('/:id', { preHandler: [fastify.authenticate, requirePermission('inventory.edit')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = productSchema.partial().safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    if (!hasPermission(request, 'inventory.editPrice')) {
      delete body.data.basePrice
      delete body.data.cost
    }

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

      if (old && productData.basePrice !== undefined && Number(old.basePrice) !== productData.basePrice) {
        await prisma.priceHistory.create({
          data: { productId: id, field: 'BasePrice', oldValue: old.basePrice, newValue: productData.basePrice, changedById: request.user.id },
        })
      }
      if (old && productData.cost !== undefined && Number(old.cost) !== productData.cost) {
        await prisma.priceHistory.create({
          data: { productId: id, field: 'Cost', oldValue: old.cost, newValue: productData.cost, changedById: request.user.id },
        })
      }

      await log({ userId: request.user.id, action: 'UPDATE', entity: 'Product', entityId: id })
      return reply.send(product)
    } catch (err: any) {
      if (err.code === 'P2025') return reply.status(404).send({ error: 'Producto no encontrado' })
      // Replacing `variations` deletes every existing row and recreates them
      // (see the `deleteMany`/`create` above) — if one of the deleted rows is
      // still referenced by a past SaleItem/QuotationItem, Postgres rejects
      // the delete with a foreign-key violation instead of the 500 this used
      // to surface as.
      if (err.code === 'P2003') {
        return reply.status(409).send({ error: 'No se pueden modificar las variantes de este producto porque ya tienen ventas o cotizaciones asociadas' })
      }
      throw err
    }
  })

  // DELETE /api/products/:id
  fastify.delete('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    if (!hasPermission(request, 'inventory.delete')) return reply.status(403).send({ error: 'Acceso denegado' })
    try {
      await prisma.product.update({ where: { id }, data: { isActive: false } })
      await log({ userId: request.user.id, action: 'DELETE', entity: 'Product', entityId: id })
      return reply.send({ message: 'Producto desactivado' })
    } catch {
      return reply.status(404).send({ error: 'Producto no encontrado' })
    }
  })

  // ── Alternate barcodes ────────────────────────────────────────────────────

  // GET /api/products/:id/barcodes
  fastify.get('/:id/barcodes', { preHandler: [fastify.authenticate, requirePermission('inventory.view')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const barcodes = await prisma.productBarcode.findMany({ where: { productId: id }, orderBy: { barcode: 'asc' } })
    return reply.send(barcodes)
  })

  // POST /api/products/:id/barcodes
  fastify.post('/:id/barcodes', { preHandler: [fastify.authenticate, requirePermission('inventory.edit')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({ barcode: z.string().min(1), description: z.string().optional() }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    try {
      const rec = await prisma.productBarcode.create({ data: { productId: id, ...body.data } })
      return reply.status(201).send(rec)
    } catch (err: any) {
      if (err.code === 'P2002') return reply.status(409).send({ error: 'Ese código de barras ya está registrado' })
      throw err
    }
  })

  // DELETE /api/products/:id/barcodes/:barcodeId
  fastify.delete('/:id/barcodes/:barcodeId', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { barcodeId } = request.params as { id: string; barcodeId: string }
    if (!hasPermission(request, 'inventory.delete')) return reply.status(403).send({ error: 'Acceso denegado' })
    try {
      await prisma.productBarcode.delete({ where: { id: barcodeId } })
      return reply.send({ message: 'Código eliminado' })
    } catch {
      return reply.status(404).send({ error: 'Código no encontrado' })
    }
  })
}
