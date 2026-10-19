import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { log } from '../services/audit.service.js'
import { hasPermission, requirePermission } from '../lib/permissions.js'
import { resolveBranchScope } from '../lib/branch-scope.js'
import { multiWordSearch } from '../lib/search.js'
import { setStock } from '../services/inventory.service.js'

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
  imageUrl: z.string().max(3_000_000).nullish(), // cap a base64 product photo well above what a reasonable image needs; nullish so clearing the image (null) round-trips, not just omitting it
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

// On a barcode P2002, tells the caller WHY it collided — if the existing
// holder is inactive (deleted), the real fix is usually reactivating it
// instead of creating a lookalike duplicate that starts over with no history.
async function findBarcodeHolder(barcode: string | undefined | null, excludeId?: string) {
  if (!barcode) return null
  return prisma.product.findFirst({
    where: { barcode, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true, name: true, isActive: true },
  })
}
function barcodeConflictResponse(holder: { id: string; name: string; isActive: boolean } | null) {
  if (holder && !holder.isActive) {
    return {
      error: `El código de barras ya le pertenece a "${holder.name}", que está eliminado. Puedes reactivarlo en vez de crear uno nuevo.`,
      conflictingProduct: { id: holder.id, name: holder.name, isActive: false },
    }
  }
  return { error: 'El código de barras ya está registrado' }
}

export default async function productRoutes(fastify: FastifyInstance) {
  // GET /api/products
  fastify.get('/', { preHandler: [fastify.authenticate, requirePermission('inventory.view')] }, async (request, reply) => {
    const q = request.query as { search?: string; categoryId?: string; isActive?: string; page?: string; limit?: string }
    const where = {
      isActive: q.isActive === 'false' ? false : true,
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.search ? multiWordSearch(q.search, word => [
        { name: { contains: word, mode: 'insensitive' as const } },
        { barcode: { contains: word, mode: 'insensitive' as const } },
        { sku: { contains: word, mode: 'insensitive' as const } },
        { altBarcodes: { some: { barcode: { contains: word, mode: 'insensitive' as const } } } },
      ]) : {}),
    }

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

    // Paginated path — used by the Products management page. `page` is the
    // opt-in signal; every other caller (POS/Purchases/Transfers/Quotations/
    // SaleDetail product-search dropdowns) never sends it and keeps getting
    // the plain unbounded array below, unchanged.
    if (q.page) {
      const page = Math.max(1, parseInt(q.page, 10) || 1)
      const limit = Math.min(200, Math.max(1, parseInt(q.limit ?? '50', 10) || 50))
      const [products, total, statsRows] = await Promise.all([
        prisma.product.findMany({ where, include, orderBy: { name: 'asc' }, skip: (page - 1) * limit, take: limit }),
        prisma.product.count({ where }),
        // Stats reflect the whole active catalog regardless of search/category
        // filters (matches the page's prior behavior) — kept lean (no include)
        // since this can scan the full 10k+ row catalog.
        prisma.product.findMany({ where: { isActive: true }, select: { id: true, basePrice: true, minStock: true } }),
      ])

      let lowStock = 0, outOfStock = 0, totalValue = 0
      for (const p of statsRows) {
        const stock = stockByProduct.get(p.id) ?? 0
        if (stock === 0) outOfStock++
        else if (stock <= Number(p.minStock ?? 0)) lowStock++
        totalValue += stock * Number(p.basePrice ?? 0)
      }

      return reply.send({
        data: products.map(p => ({ ...p, stock: stockByProduct.get(p.id) ?? 0 })),
        total,
        page,
        limit,
        stats: { total: statsRows.length, lowStock, outOfStock, totalValue },
      })
    }

    // This path is only ever hit by the product-search typeaheads (POS/
    // Purchases/Transfers/Quotations/SaleDetail), always with `search` set —
    // capped so a broad query (e.g. a single common word) can't pull the
    // whole catalog over the wire. The dropdowns show a scrollable subset of
    // this, not a hard top-N cutoff.
    const products = await prisma.product.findMany({ where, include, orderBy: { name: 'asc' }, take: 50 })
    return reply.send(products.map(p => ({ ...p, stock: stockByProduct.get(p.id) ?? 0 })))
  })

  // GET /api/products/barcode/:code
  fastify.get('/barcode/:code', { preHandler: [fastify.authenticate, requirePermission('inventory.view')] }, async (request, reply) => {
    const { code } = request.params as { code: string }

    // Case-insensitive throughout — a scanner/keyboard-wedge or manual entry
    // can send different casing than what's stored, and "no encontrado" on a
    // real scan is confusing when the barcode is right there on the label.
    // Try product main barcode — this code is the BASE unit's own, so the
    // response always means "the base", never a guessed variation. This used
    // to fall back to `?? product.variations[0]` whenever nothing was marked
    // isDefault (which in practice is every product — nothing in the UI ever
    // sets isDefault true), so scanning a product's own barcode silently sold
    // whichever variation happened to be created first instead of the base,
    // with no way to scan back to the base at all once that started.
    const product = await prisma.product.findFirst({
      where: { barcode: { equals: code, mode: 'insensitive' }, isActive: true },
      include,
    })
    if (product) return reply.send({ product, variation: undefined })

    // Try variation barcode — here the scanned code unambiguously IS that
    // one variation's own, so (unlike above) resolving to it is correct.
    const variation = await prisma.productVariation.findFirst({
      where: { barcode: { equals: code, mode: 'insensitive' } },
      include: { product: { include } },
    })
    if (variation) return reply.send({ product: variation.product, variation })

    // Try alternate barcodes — same as the main barcode: these belong to the
    // product itself (ProductBarcode has no variationId), not to any one
    // variation, so this also always means "the base".
    const altBarcode = await prisma.productBarcode.findFirst({
      where: { barcode: { equals: code, mode: 'insensitive' } },
      include: { product: { include } },
    })
    if (altBarcode) return reply.send({ product: altBarcode.product, variation: undefined })

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

      // A product with literally no Inventory row anywhere (as opposed to
      // one sitting at quantity 0) used to be invisible on the Inventario
      // page — that page's list query is driven FROM the Inventory table
      // (a JOIN, for pagination/stats reasons), so with zero rows there was
      // nothing to join against. Seeding a 0-quantity row per active branch
      // up front means every product "exists" everywhere from the moment
      // it's created, same as it already behaves everywhere else in the app
      // (POS, reports, etc. all already fall back missing rows to 0).
      const branches = await prisma.branch.findMany({ where: { status: 'active' }, select: { id: true } })
      if (branches.length > 0) {
        await prisma.inventory.createMany({
          data: branches.map(b => ({ productId: product.id, branchId: b.id, quantity: 0 })),
          skipDuplicates: true,
        })
      }

      await log({ userId: request.user.id, action: 'CREATE', entity: 'Product', entityId: product.id, newValues: productData })
      return reply.status(201).send(product)
    } catch (err: any) {
      if (err.code === 'P2002') {
        const holder = await findBarcodeHolder(body.data.barcode)
        return reply.status(409).send(barcodeConflictResponse(holder))
      }
      throw err
    }
  })

  // PUT /api/products/bulk-category — reassigns many products to one
  // category in a single request, for the "select several, pick a new
  // category" flow in Products.tsx (ahead of /:id so this exact path wins
  // over the param route). A straight reassign, not an unassign-then-assign
  // — a product always keeps a categoryId (it's required on the model), so
  // there's no intermediate "uncategorized" state to pass through.
  fastify.put('/bulk-category', { preHandler: [fastify.authenticate, requirePermission('inventory.edit')] }, async (request, reply) => {
    const body = z.object({
      productIds: z.array(z.string()).min(1),
      categoryId: z.string(),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const category = await prisma.category.findUnique({ where: { id: body.data.categoryId } })
    if (!category) return reply.status(404).send({ error: 'Categoría no encontrada' })

    const result = await prisma.product.updateMany({
      where: { id: { in: body.data.productIds } },
      data: { categoryId: body.data.categoryId },
    })
    await log({ userId: request.user.id, action: 'BULK_UPDATE', entity: 'Product', entityId: body.data.categoryId, newValues: { categoryId: body.data.categoryId, productIds: body.data.productIds } })
    return reply.send({ message: `${result.count} producto(s) reasignado(s)`, count: result.count })
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

      // Diffed by id instead of delete-everything-and-recreate: the old
      // deleteMany({}) + create(variations) nuked every variation row on
      // every save and rebuilt them with fresh ids, which Postgres rejected
      // outright (FK violation) the moment any one of them had a real
      // SaleItem/QuotationItem against it — blocking ANY edit to the product
      // (even unrelated fields) forever after its first sale. Now only
      // variations actually removed by the user are deleted; edited ones
      // update in place (keeping their id, so sale history stays valid) and
      // new ones are created — editing/adding keeps working after sales
      // exist, and only deleting a variation that's truly been sold against
      // still correctly fails.
      if (variations) {
        const existing = await prisma.productVariation.findMany({ where: { productId: id }, select: { id: true } })
        const incomingIds = new Set(variations.filter(v => v.id).map(v => v.id as string))
        const idsToDelete = existing.map(v => v.id).filter(eid => !incomingIds.has(eid))
        const toUpdate = variations.filter(v => v.id)
        const toCreate = variations.filter(v => !v.id)

        await prisma.$transaction(async (tx) => {
          if (idsToDelete.length > 0) {
            await tx.productVariation.deleteMany({ where: { id: { in: idsToDelete } } })
          }
          for (const v of toUpdate) {
            const { id: variationId, ...vData } = v
            await tx.productVariation.update({
              where: { id: variationId! },
              data: Object.fromEntries(Object.entries(vData).filter(([, val]) => val !== undefined)) as any,
            })
          }
          if (toCreate.length > 0) {
            await tx.productVariation.createMany({
              data: toCreate.map(v => Object.fromEntries(
                Object.entries({ ...v, productId: id }).filter(([, val]) => val !== undefined)
              )) as any,
            })
          }
        })
      }

      const product = await prisma.product.update({
        where: { id },
        data: Object.fromEntries(Object.entries(productData).filter(([, val]) => val !== undefined)) as any,
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
      if (err.code === 'P2003') {
        return reply.status(409).send({ error: 'No se puede eliminar esta variante porque ya tiene ventas o cotizaciones asociadas' })
      }
      if (err.code === 'P2002') {
        const holder = await findBarcodeHolder(productData.barcode, id)
        return reply.status(409).send(barcodeConflictResponse(holder))
      }
      throw err
    }
  })

  // DELETE /api/products/:id — always a soft delete (isActive: false), never
  // touches Inventory on its own: a deactivated product just stops being
  // orderable/sellable, but its stock history and quantities elsewhere stay
  // intact for audit purposes. ?clearInventory=true additionally zeroes the
  // product's stock in every branch that has any (asked explicitly — the
  // frontend confirms this with the user first, since it's a real,
  // branch-wide inventory change, not just hiding the product).
  fastify.delete('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { clearInventory } = request.query as { clearInventory?: string }
    if (!hasPermission(request, 'inventory.delete')) return reply.status(403).send({ error: 'Acceso denegado' })
    try {
      // Deliberately keeps the barcode — a deleted product can be reactivated
      // (see POST /:id/reactivate below) and should come back exactly as it
      // was, including its original code, not needing it re-typed. A barcode
      // collision against an inactive product is handled at create/edit time
      // instead (see the P2002 handler below), by pointing the user at
      // reactivating the existing one rather than silently freeing it here.
      await prisma.product.update({ where: { id }, data: { isActive: false } })

      if (clearInventory === 'true') {
        const rows = await prisma.inventory.findMany({ where: { productId: id, quantity: { gt: 0 } } })
        for (const row of rows) {
          await setStock(id, row.branchId, 0, {
            type: 'ADJUSTMENT',
            reason: 'Inventario puesto en 0 al eliminar el producto',
            performedById: request.user.id,
          })
        }
      }

      await log({ userId: request.user.id, action: 'DELETE', entity: 'Product', entityId: id })
      return reply.send({ message: 'Producto desactivado' })
    } catch {
      return reply.status(404).send({ error: 'Producto no encontrado' })
    }
  })

  // POST /api/products/:id/reactivate — undo a delete. Same permission as
  // delete itself (undoing it is the same tier of action). Inventory is
  // never touched here, even if the delete zeroed it with ?clearInventory —
  // that was an explicit, separate choice, not something reactivating should
  // silently reverse.
  fastify.post('/:id/reactivate', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    if (!hasPermission(request, 'inventory.delete')) return reply.status(403).send({ error: 'Acceso denegado' })

    const existing = await prisma.product.findUnique({ where: { id }, select: { isActive: true, barcode: true } })
    if (!existing) return reply.status(404).send({ error: 'Producto no encontrado' })
    if (existing.isActive) return reply.status(400).send({ error: 'Este producto ya está activo' })

    // The barcode could have been handed to a different, genuinely new
    // active product in the meantime — reactivating would just re-collide,
    // so this needs to be a clear, actionable error instead of a raw P2002.
    if (existing.barcode) {
      const activeHolder = await prisma.product.findFirst({
        where: { barcode: existing.barcode, id: { not: id }, isActive: true },
        select: { name: true },
      })
      if (activeHolder) {
        return reply.status(409).send({
          error: `No se puede reactivar: el código de barras "${existing.barcode}" ahora lo usa "${activeHolder.name}". Cambia el código de uno de los dos productos primero.`,
        })
      }
    }

    const product = await prisma.product.update({ where: { id }, data: { isActive: true }, include })
    await log({ userId: request.user.id, action: 'UPDATE', entity: 'Product', entityId: id, newValues: { isActive: true, note: 'Producto reactivado' } })
    return reply.send(product)
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
