import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { hasPermission, requirePermission } from '../lib/permissions.js'
import { log } from '../services/audit.service.js'
import { multiWordSearch } from '../lib/search.js'

const schema = z.object({
  nit: z.string().min(1),
  name: z.string().min(1),
  // union with '': the edit form round-trips a fetched customer straight
  // back into this payload, and a customer with no email sends '' (e.g. the
  // default "Consumidor Final" walk-in) — plain .email() rejects that.
  email: z.union([z.string().email(), z.literal('')]).optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  avatarUrl: z.string().max(3_000_000).optional(), // cap a base64 avatar well above what a reasonable photo needs
  // Restricted fields — see the editCredit permission check below.
  // creditEnabled: can this customer buy on credit at all.
  // creditLimitEnabled: only meaningful when creditEnabled — true caps them
  // at creditLimit, false means credit with no ceiling.
  creditEnabled: z.boolean().default(false),
  creditLimitEnabled: z.boolean().default(true),
  creditLimit: z.number().min(0).default(0),
  comments: z.string().max(2000).optional(),
})

type RestrictedFields = {
  creditEnabled?: boolean | undefined
  creditLimitEnabled?: boolean | undefined
  creditLimit?: number | undefined
  comments?: string | undefined
}

// Removes credit/comments fields from a payload when the caller lacks
// customers.editCredit, instead of rejecting the whole request — lets a form
// that shows every field still save whatever the user IS allowed to change.
function stripRestrictedFields<T extends RestrictedFields>(data: T, canEditCredit: boolean): T {
  if (canEditCredit) return data
  const { creditEnabled: _ce, creditLimitEnabled: _cle, creditLimit: _cl, comments: _c, ...rest } = data
  return rest as T
}

// Single source of truth for the 3 credit states a customer can be in:
// no credit, credit with a cap, or credit with no ceiling.
function withCreditFields<T extends { creditEnabled: boolean; creditLimitEnabled: boolean; creditLimit: unknown; creditUsed: unknown }>(c: T) {
  const creditLimit = Number(c.creditLimit)
  const creditUsed = Number(c.creditUsed)
  const capped = c.creditEnabled && c.creditLimitEnabled
  const unlimited = c.creditEnabled && !c.creditLimitEnabled
  return {
    ...c,
    creditLimit,
    creditUsed,
    creditAvailable: unlimited ? null : capped ? creditLimit - creditUsed : 0,
    creditUsedPercent: capped && creditLimit > 0 ? (creditUsed / creditLimit) * 100 : 0,
  }
}

export default async function customerRoutes(fastify: FastifyInstance) {
  fastify.get('/', { preHandler: [fastify.authenticate, requirePermission('customers.view')] }, async (request, reply) => {
    const q = request.query as { search?: string; isActive?: string; hasCredit?: string; page?: string; limit?: string }
    // Default (param absent) stays active-only, same opt-in pattern as
    // suppliers — 'all'/'false' are explicit choices, not the old hardcoded
    // isActive:true that made the page's own "Inactivos"/"Todos" filters a no-op.
    const where = {
      ...(q.isActive === 'all' ? {} : { isActive: q.isActive === 'false' ? false : true }),
      ...(q.hasCredit === 'true' ? { creditLimit: { gt: 0 } } : {}),
      ...(q.search ? multiWordSearch(q.search, word => [
        { name: { contains: word, mode: 'insensitive' as const } },
        { nit: { contains: word, mode: 'insensitive' as const } },
        { email: { contains: word, mode: 'insensitive' as const } },
        { phone: { contains: word, mode: 'insensitive' as const } },
      ]) : {}),
    }

    // Paginated path — opt-in via `page`, used by the Customers management
    // page. Stats reflect the status filter but not the search text, same
    // scope the page's stat cards always showed before pagination existed.
    if (q.page) {
      const page = Math.max(1, parseInt(q.page, 10) || 1)
      const limit = Math.min(200, Math.max(1, parseInt(q.limit ?? '50', 10) || 50))
      const statusWhere = q.isActive === 'all' ? {} : { isActive: q.isActive === 'false' ? false : true }
      const [customers, total, statusTotal, active, withCredit, creditAgg] = await Promise.all([
        prisma.customer.findMany({ where, orderBy: { name: 'asc' }, skip: (page - 1) * limit, take: limit }),
        prisma.customer.count({ where }),
        prisma.customer.count({ where: statusWhere }),
        prisma.customer.count({ where: { ...statusWhere, isActive: true } }),
        prisma.customer.count({ where: { ...statusWhere, creditLimit: { gt: 0 } } }),
        prisma.customer.aggregate({ where: statusWhere, _sum: { creditUsed: true } }),
      ])
      return reply.send({
        data: customers.map(withCreditFields),
        total,
        page,
        limit,
        stats: { total: statusTotal, active, withCredit, totalCreditUsed: Number(creditAgg._sum.creditUsed ?? 0) },
      })
    }

    const customers = await prisma.customer.findMany({ where, orderBy: { name: 'asc' } })
    return reply.send(customers.map(withCreditFields))
  })

  fastify.get('/:id', { preHandler: [fastify.authenticate, requirePermission('customers.view')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const c = await prisma.customer.findUnique({ where: { id } })
    if (!c) return reply.status(404).send({ error: 'Cliente no encontrado' })
    return reply.send(withCreditFields(c))
  })

  fastify.post('/', { preHandler: [fastify.authenticate, requirePermission('customers.create')] }, async (request, reply) => {
    const body = schema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const data = stripRestrictedFields(body.data, hasPermission(request, 'customers.editCredit'))
    try {
      const c = await prisma.customer.create({ data: Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) as any })
      return reply.status(201).send(withCreditFields(c))
    } catch (err: any) {
      if (err.code === 'P2002') return reply.status(409).send({ error: 'El NIT ya está registrado' })
      throw err
    }
  })

  fastify.put('/:id', { preHandler: [fastify.authenticate, requirePermission('customers.edit')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = schema.partial().safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const data = stripRestrictedFields(body.data, hasPermission(request, 'customers.editCredit'))
    try {
      const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) as any
      return reply.send(withCreditFields(await prisma.customer.update({ where: { id }, data: clean })))
    } catch {
      return reply.status(404).send({ error: 'Cliente no encontrado' })
    }
  })

  fastify.delete('/:id', { preHandler: [fastify.authenticate, requirePermission('customers.delete')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      await prisma.customer.update({ where: { id }, data: { isActive: false } })
      return reply.send({ message: 'Cliente eliminado' })
    } catch {
      return reply.status(404).send({ error: 'Cliente no encontrado' })
    }
  })

  // POST /api/customers/:id/credit-payment — a single abono against the
  // customer's overall credit ACCOUNT balance (customer.creditUsed), not
  // against any one document. Validated and decremented against that balance
  // directly — never against the sum of outstanding Sale rows — because
  // imported customers can carry real creditUsed debt with zero matching
  // Sale rows (their credit history predates this system). When real
  // outstanding sales do exist, the abono is still applied oldest-first
  // (FIFO) across them for bookkeeping (sale.paidAmount/isPaid, and the
  // per-sale history at GET /api/sales/:id/payments); any amount left over
  // once those are exhausted — or the full amount, if there are none — is
  // recorded as a CreditPayment against the account with no saleId at all.
  fastify.post('/:id/credit-payment', { preHandler: [fastify.authenticate, requirePermission('customers.registerPayment')] }, async (request, reply) => {
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

    const customer = await prisma.customer.findUnique({ where: { id } })
    if (!customer) return reply.status(404).send({ error: 'Cliente no encontrado' })

    const accountBalance = Number(customer.creditUsed ?? 0)
    if (body.data.amount > accountBalance + 0.001) {
      return reply.status(400).send({ error: `El abono excede el saldo pendiente (Q${accountBalance.toFixed(2)})` })
    }

    // A customer isn't branch-scoped, but their individual credit sales are —
    // only allocate against sales in branches this user can actually see.
    const allowedBranchIds = request.user.role === 'ADMIN'
      ? null
      : (request.user.branchIds?.length ? request.user.branchIds : [request.user.branchId])

    const unpaidSales = await prisma.sale.findMany({
      where: {
        customerId: id,
        saleType: 'CREDIT',
        isVoided: false,
        isPaid: false,
        ...(allowedBranchIds ? { branchId: { in: allowedBranchIds } } : {}),
      },
      orderBy: { createdAt: 'asc' },
    })

    const { amount, ...paymentFields } = body.data
    const payments = await prisma.$transaction(async (tx) => {
      let remaining = amount
      const created = []
      for (const sale of unpaidSales) {
        if (remaining <= 0.001) break
        const saleRemaining = Number(sale.total) - Number(sale.paidAmount ?? 0)
        if (saleRemaining <= 0.001) continue
        const applyAmount = Math.min(saleRemaining, remaining)

        const payment = await tx.creditPayment.create({
          data: Object.fromEntries(Object.entries({
            saleId: sale.id, customerId: id, paidById: request.user.id, amount: applyAmount, ...paymentFields,
          }).filter(([, v]) => v !== undefined)) as any,
          include: { paidBy: { select: { id: true, name: true } } },
        })
        const newPaidAmount = Number(sale.paidAmount ?? 0) + applyAmount
        await tx.sale.update({
          where: { id: sale.id },
          data: { paidAmount: newPaidAmount, isPaid: newPaidAmount >= Number(sale.total) - 0.001 },
        })

        created.push(payment)
        remaining -= applyAmount
      }

      // Leftover beyond what real sales could absorb — a generic abono
      // against the account itself (saleId omitted), covering historical/
      // imported debt that has no matching Sale row in this system.
      if (remaining > 0.001) {
        const payment = await tx.creditPayment.create({
          data: Object.fromEntries(Object.entries({
            customerId: id, paidById: request.user.id, amount: remaining, ...paymentFields,
          }).filter(([, v]) => v !== undefined)) as any,
          include: { paidBy: { select: { id: true, name: true } } },
        })
        created.push(payment)
      }

      await tx.customer.update({ where: { id }, data: { creditUsed: { decrement: amount } } })
      return created
    })

    const salesAffected = payments.filter(p => p.saleId).length
    await log({
      userId: request.user.id, action: 'CREATE', entity: 'CreditPayment', entityId: id,
      newValues: { customerId: id, amount, salesAffected },
    })
    return reply.status(201).send({ payments, totalApplied: amount, salesAffected })
  })
}
