import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { updateStock } from '../services/inventory.service.js'
import { log } from '../services/audit.service.js'

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
  customerId: z.string().optional(),
  cashRegisterId: z.string().optional(),
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
  transferAmount: z.number().min(0).optional(),
  transferDocumentNumber: z.string().optional(),
})

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
  const saleProfit = items.reduce((s: number, i: any) => s + i.profit, 0)

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

export default async function salesRoutes(fastify: FastifyInstance) {
  // GET /api/sales
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
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
            { invoiceNumber: { contains: q.search } },
            { customer: { name: { contains: q.search } } },
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
      const saleProfit = items.reduce((s: number, i: any) => s + i.profit, 0)
      return { ...sale, items, saleProfit }
    })
    return reply.send(enriched)
  })

  // GET /api/sales/:id
  fastify.get('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const sale = await prisma.sale.findUnique({ where: { id }, include: saleInclude })
    if (!sale) return reply.status(404).send({ error: 'Venta no encontrada' })
    return reply.send(await enrichSale(sale))
  })

  // POST /api/sales  (complete a sale)
  fastify.post('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = createSaleSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const data = body.data
    const invoiceNumber = `FAC-${Date.now()}`

    const sale = await prisma.$transaction(async (tx) => {
      const created = await tx.sale.create({
        data: {
          invoiceNumber,
          branchId: data.branchId,
          cashierId: request.user.id,
          customerId: data.customerId,
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
          transferAmount: data.transferAmount,
          transferDocumentNumber: data.transferDocumentNumber,
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

      if (data.saleType === 'CREDIT' && data.customerId) {
        await tx.customer.update({
          where: { id: data.customerId },
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
    return reply.status(201).send(sale)
  })

  // PUT /api/sales/:id  (full edit — admin only: items, discounts, payment, notes)
  fastify.put('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'ADMIN') return reply.status(403).send({ error: 'Acceso denegado' })
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

  // DELETE /api/sales/:id  (void sale — admin only)
  fastify.delete('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'ADMIN') return reply.status(403).send({ error: 'Acceso denegado' })
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
  fastify.get('/:id/payments', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const payments = await prisma.creditPayment.findMany({
      where: { saleId: id },
      include: { paidBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    })
    return reply.send(payments)
  })

  // POST /api/sales/:id/payments  (register an abono)
  fastify.post('/:id/payments', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      amount: z.number().min(0.01),
      paymentMethod: z.enum(['CASH', 'TRANSFER']),
      transferDocumentNumber: z.string().optional(),
      transferBank: z.string().optional(),
      notes: z.string().optional(),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const sale = await prisma.sale.findUnique({
      where: { id },
      include: { creditPayments: true },
    })
    if (!sale) return reply.status(404).send({ error: 'Venta no encontrada' })
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
