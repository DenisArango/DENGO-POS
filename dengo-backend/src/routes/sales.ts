import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { updateStock } from '../services/inventory.service.js'
import { log } from '../services/audit.service.js'
import { canAccessBranch } from '../lib/branch-scope.js'
import { hasPermission, requirePermission } from '../lib/permissions.js'
import { certifyInvoice } from '../lib/fel.js'
import { looksLikeRealNit } from '../lib/nit.js'

const saleItemSchema = z.object({
  productId: z.string(),
  variationId: z.string().optional(),
  quantity: z.number().min(0.001),
  unitPrice: z.number().min(0),
  discount: z.number().min(0).max(1).default(0),
  total: z.number().min(0),
})

const createSaleSchema = z.object({
  branchId: z.string(),
  customerId: z.string({ required_error: 'Selecciona un cliente antes de cobrar' }),
  cashRegisterId: z.string({ required_error: 'Selecciona una caja antes de cobrar' }),
  items: z.array(saleItemSchema).min(1),
  subtotal: z.number().min(0),
  tax: z.number().min(0).default(0),
  discount: z.number().min(0).default(0),
  total: z.number().min(0),
  paymentMethod: z.enum(['CASH', 'CARD', 'TRANSFER', 'MIXED', 'CREDIT']),
  saleType: z.enum(['CASH', 'CREDIT']).default('CASH'),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
  // Payment breakdown
  cashAmount: z.number().min(0).optional(),
  cardAmount: z.number().min(0).optional(),
  cardReference: z.string().optional(),
  transferAmount: z.number().min(0).optional(),
  transferDocumentNumber: z.string().optional(),
  // Factura (Guatemala FEL) — discretionary, off by default. When true the
  // buyer's NIT/name are required (they default to the selected customer's
  // but can be overridden here, since who's billed isn't always who's buying).
  requiresInvoice: z.boolean().default(false),
  buyerNit: z.string().optional(),
  buyerName: z.string().optional(),
  // Set only by the offline queue (see dengo-frontend/src/lib/offlineDb.ts) —
  // lets a retried sync POST be replayed safely instead of double-creating.
  clientRequestId: z.string().optional(),
}).refine(
  data => {
    if (data.paymentMethod !== 'MIXED') return true
    const parts = (data.cashAmount ?? 0) + (data.cardAmount ?? 0) + (data.transferAmount ?? 0)
    return Math.abs(parts - data.total) < 0.01
  },
  { message: 'La suma de cashAmount + cardAmount + transferAmount debe ser igual al total en una venta mixta', path: ['paymentMethod'] },
)

// Base include — uses only columns guaranteed to exist (pre-migration).
// Fields added in migration_v2 (cashRegister.name/registerNumber, creditPayments)
// are fetched separately to avoid crashing when Prisma client hasn't been regenerated yet.
const saleInclude = {
  branch: true,
  cashier: { select: { id: true, name: true, role: true } },
  customer: true,
  cashRegister: { select: { id: true } },          // only id — safe on old Prisma client
  items: {
    include: {
      product: { select: { id: true, name: true, barcode: true, cost: true } },
      variation: { select: { id: true, name: true, conversionFactor: true, price: true, isDefault: true } },
    },
  },
}

// Try to enrich a sale with the new-column data; silently skips if columns/tables are missing
async function enrichSale(sale: any): Promise<any> {
  // Calculate per-item profit and total saleProfit
  const items = (sale.items ?? []).map((item: any) => {
    const cost = Number(item.product?.cost ?? 0)
    const convFactor = Number(item.variation?.conversionFactor ?? 1)
    const qty = Number(item.quantity)
    const revenue = Number(item.total)
    const totalCost = cost * convFactor * qty
    return { ...item, cost, convFactor, totalCost, profit: revenue - totalCost }
  })
  // Item totals sum to the pre-header-discount subtotal, so Sale.discount must be
  // subtracted once here — see reports.ts sales-history for the same fix and why.
  const saleProfit = items.reduce((s: number, i: any) => s + i.profit, 0) - Number(sale.discount ?? 0)

  let cashRegisterInfo = sale.cashRegister ? { id: sale.cashRegister.id } : null
  let creditPayments: any[] = []

  // Try fetching extended cashRegister info (name/registerNumber added in migration_v2)
  try {
    if (sale.cashRegister?.id) {
      const cr = await prisma.cashRegister.findUnique({
        where: { id: sale.cashRegister.id },
        select: { id: true, name: true, registerNumber: true },
      })
      cashRegisterInfo = cr
    }
  } catch { /* migration_v2 columns not yet available */ }

  // Try fetching credit payments (table added in migration_v2)
  try {
    creditPayments = await (prisma as any).creditPayment.findMany({
      where: { saleId: sale.id },
      include: { paidBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    })
  } catch { /* CREDIT_PAYMENTS table not yet available */ }

  return { ...sale, items, saleProfit, cashRegister: cashRegisterInfo, creditPayments }
}

// Turns an already-created sale into an invoiced one — distinct from
// createSaleSchema's requiresInvoice path (invoice requested at checkout
// time). Used both by the single-sale action (SaleDetail.tsx "Generar
// factura") and the bulk action (SalesHistoryReport.tsx multi-select).
// Sales converted from a Portal Escolar quotation are never invoiced at
// creation time, so this is their only path to a factura.
async function generateInvoiceForSale(
  saleId: string,
  userId: string,
  overrides?: { buyerNit?: string | undefined; buyerName?: string | undefined },
): Promise<{ ok: true; sale: any } | { ok: false; error: string }> {
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: { customer: true, quotation: { select: { id: true } } },
  })
  if (!sale) return { ok: false, error: 'Venta no encontrada' }
  if (sale.isVoided) return { ok: false, error: 'No se puede facturar una venta anulada' }
  if (sale.requiresInvoice) return { ok: false, error: 'Esta venta ya tiene factura' }

  const buyerNit = overrides?.buyerNit?.trim() || sale.customer?.nit
  const buyerName = overrides?.buyerName?.trim() || sale.customer?.name
  if (!looksLikeRealNit(buyerNit)) {
    return { ok: false, error: `Se necesita un NIT válido — ${sale.customer?.name ?? 'el cliente'} no tiene uno registrado` }
  }

  const reserved = await prisma.$transaction(async (tx) => {
    const branch = await tx.branch.update({
      where: { id: sale.branchId },
      data: { invoiceNextNumber: { increment: 1 } },
      select: { invoiceSeries: true, invoiceNextNumber: true },
    })
    const invoiceSeries = branch.invoiceSeries
    const invoiceSeqNumber = branch.invoiceNextNumber - 1 // the number reserved for *this* sale
    await tx.sale.update({
      where: { id: saleId },
      data: Object.fromEntries(Object.entries({
        requiresInvoice: true, invoiceSeries, invoiceSeqNumber, buyerNit, buyerName, felStatus: 'PENDING',
      }).filter(([, v]) => v !== undefined)) as any,
    })
    return { invoiceSeries, invoiceSeqNumber }
  })

  // Certification is external I/O — deliberately outside the DB transaction
  // above (never hold row locks on a network call), same as at sale creation.
  const items = await prisma.saleItem.findMany({ where: { saleId } })
  let felResult: { status: string; uuid?: string; authNumber?: string; certifiedAt?: Date; error?: string }
  try {
    felResult = await certifyInvoice({
      saleId,
      series: reserved.invoiceSeries,
      seqNumber: reserved.invoiceSeqNumber,
      buyerNit: buyerNit!,
      buyerName: buyerName!,
      total: Number(sale.total),
      items: items.map(i => ({ description: i.productId, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice), total: Number(i.total) })),
    })
  } catch (err: any) {
    felResult = { status: 'FAILED', error: err?.message ?? 'Error al certificar' }
  }
  const felData: any = Object.fromEntries(Object.entries({
    felStatus: felResult.status,
    felUuid: felResult.uuid,
    felAuthNumber: felResult.authNumber,
    felCertifiedAt: felResult.certifiedAt,
    felError: felResult.error,
  }).filter(([, v]) => v !== undefined))
  const final = await prisma.sale.update({ where: { id: saleId }, data: felData, include: saleInclude })

  // If this sale came from a Portal Escolar quotation, that order's status
  // was stuck at QUOTED forever with no signal that it ever got billed —
  // updateMany (not update) because a sale not tied to any portal order
  // simply matches zero rows here, which is the normal case.
  if (sale.quotation) {
    await prisma.portalOrder.updateMany({ where: { quotationId: sale.quotation.id }, data: { status: 'INVOICED' } })
  }

  await log({
    userId, action: 'GENERATE_INVOICE', entity: 'Sale', entityId: saleId,
    newValues: { invoiceSeries: reserved.invoiceSeries, invoiceSeqNumber: reserved.invoiceSeqNumber, buyerNit },
  })
  return { ok: true, sale: await enrichSale(final) }
}

export default async function salesRoutes(fastify: FastifyInstance) {
  // GET /api/sales
  fastify.get('/', { preHandler: [fastify.authenticate, requirePermission('sales.view')] }, async (request, reply) => {
    const q = request.query as {
      branchId?: string; from?: string; to?: string; cashRegisterId?: string
      paymentMethod?: string; saleType?: string; search?: string; customerId?: string
      includeVoided?: string
    }

    // Non-admins are restricted to their own branch
    const branchId = request.user.role !== 'ADMIN' ? request.user.branchId : (q.branchId ?? undefined)

    const sales = await prisma.sale.findMany({
      where: {
        isVoided: q.includeVoided === 'true' ? undefined : false,
        ...(branchId ? { branchId } : {}),
        ...(q.cashRegisterId ? { cashRegisterId: q.cashRegisterId } : {}),
        ...(q.customerId ? { customerId: q.customerId } : {}),
        ...(q.paymentMethod ? { paymentMethod: q.paymentMethod as any } : {}),
        ...(q.saleType ? { saleType: q.saleType as any } : {}),
        ...(q.from || q.to ? {
          createdAt: {
            ...(q.from ? { gte: new Date(q.from) } : {}),
            ...(q.to ? { lte: new Date(q.to) } : {}),
          },
        } : {}),
        ...(q.search ? {
          OR: [
            { invoiceNumber: { contains: q.search, mode: 'insensitive' } },
            { customer: { name: { contains: q.search, mode: 'insensitive' } } },
            // Lets staff paste the "Ref." printed on an offline-generated
            // receipt (see ThermalReceipt.tsx) straight into search to find
            // the real sale/correlativo it became once synced.
            { clientRequestId: { contains: q.search, mode: 'insensitive' } },
          ],
        } : {}),
      },
      include: saleInclude,
      orderBy: { createdAt: 'desc' },
      take: 500,
    })
    // Enrich first sale to get cashRegister name — skip bulk enrich for perf (name/registerNumber
    // come from cashRegisterId join below per-record only when migration is done)
    const enriched = sales.map((sale: any) => {
      const items = (sale.items ?? []).map((item: any) => {
        const cost = Number(item.product?.cost ?? 0)
        const convFactor = Number(item.variation?.conversionFactor ?? 1)
        const totalCost = cost * convFactor * Number(item.quantity)
        return { ...item, totalCost, profit: Number(item.total) - totalCost }
      })
      const saleProfit = items.reduce((s: number, i: any) => s + i.profit, 0) - Number(sale.discount ?? 0)
      return { ...sale, items, saleProfit }
    })
    return reply.send(enriched)
  })

  // GET /api/sales/:id
  fastify.get('/:id', { preHandler: [fastify.authenticate, requirePermission('sales.view')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const sale = await prisma.sale.findUnique({ where: { id }, include: saleInclude })
    if (!sale) return reply.status(404).send({ error: 'Venta no encontrada' })
    if (!canAccessBranch(request, sale.branchId)) return reply.status(403).send({ error: 'Acceso denegado' })
    return reply.send(await enrichSale(sale))
  })

  // POST /api/sales  (complete a sale)
  fastify.post('/', { preHandler: [fastify.authenticate, requirePermission('sales.create')] }, async (request, reply) => {
    const body = createSaleSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    if (!canAccessBranch(request, body.data.branchId)) return reply.status(403).send({ error: 'Acceso denegado' })

    const data = body.data

    // Idempotent replay: a synced offline sale may legitimately be POSTed
    // twice (the first response was lost to the same outage that queued it).
    // Returning the existing sale — not an error, not a second sale — is
    // what makes retrying safe.
    if (data.clientRequestId) {
      const existing = await prisma.sale.findUnique({ where: { clientRequestId: data.clientRequestId }, include: saleInclude })
      if (existing) return reply.status(200).send(existing)
    }

    // Every check below follows the same rule: a sale replayed from the
    // offline queue (clientRequestId set) already physically happened — the
    // cashier handed over the product and took the cash/card/credit looking
    // at the customer in front of them, not at this endpoint. Rejecting it
    // here doesn't undo that; it just orphans a real transaction in the
    // local queue forever with no way to ever record it. So none of these
    // ever hard-reject an offline replay — each one is saved as-is and the
    // anomaly is logged to Auditoría (DESCUADRE_OFFLINE) for a human to
    // review, informational rather than corrective. A *direct* API call
    // (no clientRequestId) still gets the hard rejection — that path has no
    // "already happened" excuse.
    const isOfflineReplay = !!data.clientRequestId
    const offlineDiscrepancies: string[] = []

    // Stock — the POS UI already blocks adding an out-of-stock item to the
    // cart, but stock can change between "add to cart" and "checkout"
    // (another register selling the last unit).
    const inventoryRows = await prisma.inventory.findMany({
      where: { branchId: data.branchId, productId: { in: data.items.map(i => i.productId) } },
      include: { product: { select: { name: true } } },
    })
    const stockByProduct = new Map(inventoryRows.map(inv => [inv.productId, { qty: Number(inv.quantity), name: inv.product.name }]))
    for (const item of data.items) {
      const stock = stockByProduct.get(item.productId)
      const available = stock?.qty ?? 0
      if (available < item.quantity) {
        if (!isOfflineReplay) {
          return reply.status(400).send({
            error: `Stock insuficiente de "${stock?.name ?? item.productId}": disponible ${available}, solicitado ${item.quantity}`,
          })
        }
        offlineDiscrepancies.push(`Stock de "${stock?.name ?? item.productId}" quedó en descubierto (disponible ${available}, vendido ${item.quantity})`)
      }
    }

    // Customer — normally required, but a sale can be deleted... a *customer*
    // can be deleted between the offline sale and this sync. effectiveCustomerId
    // (not data.customerId) is what actually gets saved from here on.
    const customer = data.customerId ? await prisma.customer.findUnique({ where: { id: data.customerId } }) : null
    let effectiveCustomerId: string | undefined = data.customerId
    if (data.customerId && !customer) {
      if (!isOfflineReplay) return reply.status(404).send({ error: 'Cliente no encontrado' })
      offlineDiscrepancies.push(`Cliente original (ID ${data.customerId}) ya no existe — venta guardada sin cliente asociado`)
      effectiveCustomerId = undefined
    }

    // Credit sales require the customer to actually be allowed credit — the
    // POS UI already hides the "Crédito" option otherwise, but re-check here
    // since nothing previously stopped a direct API call from bypassing it.
    // creditUsed still gets incremented below even when over the limit or
    // disabled — the limit/toggle governs whether a *new* credit sale should
    // be allowed to start, not whether one that already happened counts.
    if (data.saleType === 'CREDIT') {
      if (!customer) {
        if (!isOfflineReplay) return reply.status(400).send({ error: 'Se necesita un cliente para venta a crédito' })
        offlineDiscrepancies.push('Venta a crédito sin cliente válido — no se pudo aplicar a ningún saldo, requiere revisión manual')
      } else {
        if (!customer.creditEnabled) {
          if (!isOfflineReplay) return reply.status(400).send({ error: `${customer.name} no tiene crédito habilitado` })
          offlineDiscrepancies.push(`${customer.name} no tiene crédito habilitado (se desactivó después de esta venta, o no debió haberse permitido) — venta a crédito guardada de todas formas`)
        }
        if (customer.creditLimitEnabled) {
          const available = Number(customer.creditLimit) - Number(customer.creditUsed)
          if (data.total > available) {
            if (!isOfflineReplay) return reply.status(400).send({ error: `Crédito insuficiente: disponible Q${available.toFixed(2)}, venta Q${data.total.toFixed(2)}` })
            offlineDiscrepancies.push(`Crédito de ${customer.name} quedó sobregirado: disponible Q${available.toFixed(2)}, venta Q${data.total.toFixed(2)}`)
          }
        }
      }
    }

    // Factura is discretionary and off by default — see lib/fel.ts. When
    // requested, a real buyer NIT is required (the customer's own, or an
    // override for whoever the invoice is actually billed to). Missing one
    // doesn't invalidate the SALE, only whether a factura can be generated
    // for it right now — an offline replay just saves it as a plain recibo
    // instead; the factura can still be generated manually later (see
    // generateInvoiceForSale) once the NIT is fixed.
    let buyerNit: string | undefined
    let buyerName: string | undefined
    let requiresInvoice = data.requiresInvoice
    if (requiresInvoice) {
      buyerNit = data.buyerNit?.trim() || customer?.nit
      buyerName = data.buyerName?.trim() || customer?.name
      if (!looksLikeRealNit(buyerNit)) {
        if (!isOfflineReplay) return reply.status(400).send({ error: 'Se necesita un NIT válido para generar factura — el cliente no tiene uno registrado' })
        offlineDiscrepancies.push('Se pidió factura pero no había NIT válido — se guardó como recibo; genera la factura manualmente después de corregir el NIT')
        requiresInvoice = false
        buyerNit = undefined
        buyerName = undefined
      }
    }

    const invoiceNumber = `FAC-${Date.now()}`

    const sale = await prisma.$transaction(async (tx) => {
      let invoiceSeries: string | undefined
      let invoiceSeqNumber: number | undefined
      if (requiresInvoice) {
        const branch = await tx.branch.update({
          where: { id: data.branchId },
          data: { invoiceNextNumber: { increment: 1 } },
          select: { invoiceSeries: true, invoiceNextNumber: true },
        })
        invoiceSeries = branch.invoiceSeries
        invoiceSeqNumber = branch.invoiceNextNumber - 1 // the number reserved for *this* sale
      }

      const created = await tx.sale.create({
        data: {
          invoiceNumber,
          clientRequestId: data.clientRequestId,
          branchId: data.branchId,
          cashierId: request.user.id,
          customerId: effectiveCustomerId,
          cashRegisterId: data.cashRegisterId,
          subtotal: data.subtotal,
          tax: data.tax,
          discount: data.discount,
          total: data.total,
          paymentMethod: data.paymentMethod,
          saleType: data.saleType,
          dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
          isPaid: data.saleType === 'CASH',
          notes: data.notes,
          cashAmount: data.cashAmount,
          cardAmount: data.cardAmount,
          cardReference: data.cardReference,
          transferAmount: data.transferAmount,
          transferDocumentNumber: data.transferDocumentNumber,
          requiresInvoice,
          invoiceSeries,
          invoiceSeqNumber,
          buyerNit,
          buyerName,
          felStatus: requiresInvoice ? 'PENDING' : 'NONE',
          items: {
            create: data.items.map(item => ({
              productId: item.productId,
              variationId: item.variationId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discount: item.discount,
              total: item.total,
            })),
          },
        },
        include: saleInclude,
      })

      if (data.saleType === 'CREDIT' && effectiveCustomerId) {
        await tx.customer.update({
          where: { id: effectiveCustomerId },
          data: { creditUsed: { increment: data.total } },
        })
      }

      return created
    })

    for (const item of data.items) {
      await updateStock(item.productId, data.branchId, -item.quantity, {
        type: 'SALE',
        performedById: request.user.id,
        referenceId: sale.id,
      })
    }

    await log({ userId: request.user.id, action: 'CREATE', entity: 'Sale', entityId: sale.id, newValues: { total: data.total, invoiceNumber } })
    if (offlineDiscrepancies.length > 0) {
      await log({
        userId: request.user.id, action: 'DESCUADRE_OFFLINE', entity: 'Sale', entityId: sale.id,
        newValues: { message: 'Venta sincronizada desde cola offline con anomalías — revisar', items: offlineDiscrepancies },
      })
    }

    // Certification is external I/O — deliberately outside the DB transaction
    // above (never hold row locks on a network call), and never blocks the
    // sale: a FEL failure here doesn't undo a sale that already happened.
    let felResult: { status: string; uuid?: string; authNumber?: string; certifiedAt?: Date; error?: string } | undefined
    if (requiresInvoice) {
      try {
        felResult = await certifyInvoice({
          saleId: sale.id,
          series: sale.invoiceSeries!,
          seqNumber: sale.invoiceSeqNumber!,
          buyerNit: buyerNit!,
          buyerName: buyerName!,
          total: data.total,
          items: data.items.map(i => ({ description: i.productId, quantity: i.quantity, unitPrice: i.unitPrice, total: i.total })),
        })
      } catch (err: any) {
        felResult = { status: 'FAILED', error: err?.message ?? 'Error al certificar' }
      }
      const felData: any = Object.fromEntries(Object.entries({
        felStatus: felResult.status,
        felUuid: felResult.uuid,
        felAuthNumber: felResult.authNumber,
        felCertifiedAt: felResult.certifiedAt,
        felError: felResult.error,
      }).filter(([, v]) => v !== undefined))
      await prisma.sale.update({ where: { id: sale.id }, data: felData })
    }

    return reply.status(201).send({ ...sale, felStatus: felResult?.status ?? sale.felStatus })
  })

  // PUT /api/sales/:id  (full edit — admin only: items, discounts, payment, notes)
  fastify.put('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!hasPermission(request, 'sales.edit')) return reply.status(403).send({ error: 'Acceso denegado' })
    const { id } = request.params as { id: string }

    const body = z.object({
      // Simple field updates
      isPaid: z.boolean().optional(),
      paidAmount: z.number().optional(),
      notes: z.string().optional(),
      // Full item edit
      items: z.array(saleItemSchema).optional(),
      subtotal: z.number().optional(),
      tax: z.number().optional(),
      discount: z.number().optional(),
      total: z.number().optional(),
      paymentMethod: z.enum(['CASH', 'CARD', 'TRANSFER', 'MIXED', 'CREDIT']).optional(),
      cashAmount: z.number().optional(),
      cardAmount: z.number().optional(),
      cardReference: z.string().optional(),
      transferAmount: z.number().optional(),
      transferDocumentNumber: z.string().optional(),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const existing = await prisma.sale.findUnique({ where: { id }, include: { items: true } })
    if (!existing) return reply.status(404).send({ error: 'Venta no encontrada' })
    if (existing.isVoided) return reply.status(400).send({ error: 'No se puede editar una venta anulada' })

    const { items: newItems, ...simpleFields } = body.data

    // updateStock opens its own prisma.$transaction internally — calling it inside another
    // transaction causes nested transactions on SQL Server → deadlock. Run inventory updates
    // before and after the DB transaction instead.
    if (newItems) {
      for (const oldItem of existing.items) {
        await updateStock(oldItem.productId, existing.branchId, Number(oldItem.quantity), {
          type: 'RETURN',
          performedById: request.user.id,
          referenceId: id,
          reason: 'Ajuste por edición de venta',
        })
      }
    }

    await prisma.$transaction(async (tx) => {
      if (newItems) {
        await tx.saleItem.deleteMany({ where: { saleId: id } })
        await tx.saleItem.createMany({
          data: newItems.map(item => ({
            saleId: id,
            productId: item.productId,
            variationId: item.variationId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount,
            total: item.total,
          })),
        })
      }
      await tx.sale.update({ where: { id }, data: simpleFields })
    })

    if (newItems) {
      for (const item of newItems) {
        await updateStock(item.productId, existing.branchId, -item.quantity, {
          type: 'SALE',
          performedById: request.user.id,
          referenceId: id,
          reason: 'Ajuste por edición de venta',
        })
      }
    }

    const updated = await prisma.sale.findUnique({ where: { id }, include: saleInclude })
    await log({ userId: request.user.id, action: 'UPDATE', entity: 'Sale', entityId: id, newValues: { total: body.data.total } })
    return reply.send(await enrichSale(updated))
  })

  // POST /api/sales/:id/generate-invoice — add a factura to an already-created
  // sale (checkout defaulted to recibo-only, or the sale came from a Portal
  // Escolar quotation, which is never invoiced at creation time).
  fastify.post('/:id/generate-invoice', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!hasPermission(request, 'sales.edit')) return reply.status(403).send({ error: 'Acceso denegado' })
    const { id } = request.params as { id: string }
    const body = z.object({ buyerNit: z.string().optional(), buyerName: z.string().optional() }).safeParse(request.body ?? {})
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const existing = await prisma.sale.findUnique({ where: { id }, select: { branchId: true } })
    if (!existing) return reply.status(404).send({ error: 'Venta no encontrada' })
    if (!canAccessBranch(request, existing.branchId)) return reply.status(403).send({ error: 'Acceso denegado' })

    const result = await generateInvoiceForSale(id, request.user.id, body.data)
    if (!result.ok) return reply.status(400).send({ error: result.error })
    return reply.send(result.sale)
  })

  // POST /api/sales/bulk-generate-invoices — same action across many sales at
  // once (SalesHistoryReport.tsx multi-select). Always uses each sale's own
  // customer NIT — no override, since a batch spans different customers.
  // Never fails the whole batch for one bad sale: each is attempted
  // independently and the response lists which succeeded and which didn't.
  fastify.post('/bulk-generate-invoices', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!hasPermission(request, 'sales.edit')) return reply.status(403).send({ error: 'Acceso denegado' })
    const body = z.object({ saleIds: z.array(z.string()).min(1).max(200) }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const succeeded: string[] = []
    const failed: { saleId: string; error: string }[] = []
    for (const saleId of body.data.saleIds) {
      const sale = await prisma.sale.findUnique({ where: { id: saleId }, select: { branchId: true } })
      if (!sale) { failed.push({ saleId, error: 'Venta no encontrada' }); continue }
      if (!canAccessBranch(request, sale.branchId)) { failed.push({ saleId, error: 'Acceso denegado' }); continue }
      const result = await generateInvoiceForSale(saleId, request.user.id)
      if (result.ok) succeeded.push(saleId)
      else failed.push({ saleId, error: result.error })
    }
    return reply.send({ succeeded, failed })
  })

  // DELETE /api/sales/:id  (void sale — admin only)
  fastify.delete('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!hasPermission(request, 'sales.cancel')) return reply.status(403).send({ error: 'Acceso denegado' })
    const { id } = request.params as { id: string }
    const body = z.object({ reason: z.string().optional() }).safeParse(request.body ?? {})
    const reason = body.success ? body.data.reason : undefined

    const sale = await prisma.sale.findUnique({ where: { id }, include: { items: true } })
    if (!sale) return reply.status(404).send({ error: 'Venta no encontrada' })
    if (sale.isVoided) return reply.status(400).send({ error: 'La venta ya fue anulada' })

    await prisma.sale.update({
      where: { id },
      data: {
        isVoided: true,
        voidedById: request.user.id,
        voidedAt: new Date(),
        voidReason: reason,
      },
    })

    for (const item of sale.items) {
      await updateStock(item.productId, sale.branchId, Number(item.quantity), {
        type: 'RETURN',
        performedById: request.user.id,
        referenceId: id,
        reason: reason ?? 'Anulación de venta',
      })
    }

    // Reverse credit if applicable
    if (sale.saleType === 'CREDIT' && sale.customerId) {
      await prisma.customer.update({
        where: { id: sale.customerId },
        data: { creditUsed: { decrement: Number(sale.total) } },
      })
    }

    await log({ userId: request.user.id, action: 'VOID', entity: 'Sale', entityId: id, newValues: { reason } })
    return reply.send({ message: 'Venta anulada' })
  })

  // ── Credit payments (abonos) ──────────────────────────────────────────────

  // GET /api/sales/:id/payments
  fastify.get('/:id/payments', { preHandler: [fastify.authenticate, requirePermission('sales.view')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const sale = await prisma.sale.findUnique({ where: { id }, select: { branchId: true } })
    if (!sale) return reply.status(404).send({ error: 'Venta no encontrada' })
    if (!canAccessBranch(request, sale.branchId)) return reply.status(403).send({ error: 'Acceso denegado' })
    const payments = await prisma.creditPayment.findMany({
      where: { saleId: id },
      include: { paidBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    })
    return reply.send(payments)
  })

  // POST /api/sales/:id/payments  (register an abono)
  fastify.post('/:id/payments', { preHandler: [fastify.authenticate, requirePermission('customers.registerPayment')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      amount: z.number().min(0.01),
      paymentMethod: z.enum(['CASH', 'CARD', 'TRANSFER']),
      transferDocumentNumber: z.string().optional(),
      transferBank: z.string().optional(),
      notes: z.string().optional(),
      // The register open when this abono was collected in cash — lets the cash
      // close include it in "expected cash" (see cash-registers.ts computeSales).
      cashRegisterId: z.string().optional(),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const sale = await prisma.sale.findUnique({
      where: { id },
      include: { creditPayments: true },
    })
    if (!sale) return reply.status(404).send({ error: 'Venta no encontrada' })
    if (!canAccessBranch(request, sale.branchId)) return reply.status(403).send({ error: 'Acceso denegado' })
    if (sale.isVoided) return reply.status(400).send({ error: 'Venta anulada' })
    if (sale.saleType !== 'CREDIT') return reply.status(400).send({ error: 'Solo ventas a crédito' })

    // Calculate remaining balance
    const totalPaid = sale.creditPayments.reduce((s, p) => s + Number(p.amount), 0)
    const remaining = Number(sale.total) - totalPaid
    if (body.data.amount > remaining + 0.001) {
      return reply.status(400).send({ error: `El abono excede el saldo pendiente (Q${remaining.toFixed(2)})` })
    }

    const payment = await prisma.$transaction(async (tx) => {
      const p = await tx.creditPayment.create({
        data: { saleId: id, paidById: request.user.id, ...body.data },
        include: { paidBy: { select: { id: true, name: true } } },
      })

      const newTotalPaid = totalPaid + body.data.amount
      const isPaid = newTotalPaid >= Number(sale.total) - 0.001

      await tx.sale.update({
        where: { id },
        data: { isPaid, paidAmount: newTotalPaid },
      })

      // Update customer credit
      if (sale.customerId) {
        await tx.customer.update({
          where: { id: sale.customerId },
          data: { creditUsed: { decrement: body.data.amount } },
        })
      }

      return p
    })

    await log({ userId: request.user.id, action: 'CREATE', entity: 'CreditPayment', entityId: payment.id, newValues: { amount: body.data.amount, saleId: id } })
    return reply.status(201).send(payment)
  })
}
