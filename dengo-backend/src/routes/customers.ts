import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { resolveOpenRegisterId } from './cash-registers.js'
import { hasPermission, requirePermission } from '../lib/permissions.js'
import { log } from '../services/audit.service.js'
import { multiWordSearch } from '../lib/search.js'

// Only the name is required: in a busy sale the cashier creates the customer
// with just a name and completes the rest later. An empty NIT (or "CF") is
// stored as null — consumidor final — so many customers can lack one.
const nitField = z.string().trim().max(30).optional().nullable()
  .transform(v => (v === undefined ? undefined : !v || /^c\/?f$/i.test(v) ? null : v.toUpperCase()))

// What counts as "datos incompletos" in Clientes: no NIT or no phone.
// The generic walk-in customer (default of a branch / "Consumidor Final")
// is never "incomplete": it has no NIT or phone by design.
const INCOMPLETE_WHERE = {
  OR: [{ nit: null }, { nit: '' }, { phone: null }, { phone: '' }],
  defaultForBranches: { none: {} },
  NOT: { name: { equals: 'Consumidor Final', mode: 'insensitive' as const } },
}

// "Con crédito": credit turned on, a limit set, or a balance owed. The last
// one matters for customers brought over from the previous system, who can
// owe money with credit never switched on here.
const WITH_CREDIT_WHERE = {
  OR: [{ creditEnabled: true }, { creditLimit: { gt: 0 } }, { creditUsed: { gt: 0 } }],
}

const schema = z.object({
  nit: nitField,
  name: z.string().trim().min(1, 'El nombre es requerido'),
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

// Real purchase history per customer (total spent, # of sales, most recent
// sale) — one grouped aggregate query for the whole batch, not N+1. These
// fields used to be in every customer response's TypeScript shape on the
// frontend with nothing ever actually computing them (always undefined, so
// every report/column reading them silently showed "—"/blank).
async function attachPurchaseStats<T extends { id: string }>(customers: T[]) {
  if (customers.length === 0) return customers as (T & { totalPurchases: number; purchasesCount: number; lastPurchase: Date | null })[]
  const agg = await prisma.sale.groupBy({
    by: ['customerId'],
    where: { customerId: { in: customers.map(c => c.id) }, isVoided: false },
    _sum: { total: true },
    _count: { _all: true },
    _max: { createdAt: true },
  })
  const statsMap = new Map(agg.filter(a => a.customerId).map(a => [a.customerId as string, {
    totalPurchases: Number(a._sum.total ?? 0),
    purchasesCount: a._count._all,
    lastPurchase: a._max.createdAt,
  }]))
  return customers.map(c => ({
    ...c,
    totalPurchases: statsMap.get(c.id)?.totalPurchases ?? 0,
    purchasesCount: statsMap.get(c.id)?.purchasesCount ?? 0,
    lastPurchase: statsMap.get(c.id)?.lastPurchase ?? null,
  }))
}

const CUSTOMER_SORT_FIELDS = ['name', 'totalPurchases', 'purchasesCount', 'lastPurchase'] as const
type CustomerSortField = typeof CUSTOMER_SORT_FIELDS[number]
function sortCustomers<T extends { name: string; totalPurchases: number; purchasesCount: number; lastPurchase: Date | null }>(customers: T[], sortBy?: string) {
  if (!sortBy || !CUSTOMER_SORT_FIELDS.includes(sortBy as CustomerSortField)) return customers
  const field = sortBy as CustomerSortField
  if (field === 'name') return customers // already alphabetical from the query
  return [...customers].sort((a, b) => {
    const av = field === 'lastPurchase' ? (a.lastPurchase?.getTime() ?? 0) : a[field]
    const bv = field === 'lastPurchase' ? (b.lastPurchase?.getTime() ?? 0) : b[field]
    return bv - av // descending — "most frequent/highest spending/most recent" is always what's wanted, never ascending
  })
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
    const q = request.query as { search?: string; isActive?: string; hasCredit?: string; incomplete?: string; page?: string; limit?: string; sortBy?: string }
    // Default (param absent) stays active-only, same opt-in pattern as
    // suppliers — 'all'/'false' are explicit choices, not the old hardcoded
    // isActive:true that made the page's own "Inactivos"/"Todos" filters a no-op.
    // Every filter goes into one AND list: the search and "incomplete" are
    // both AND clauses, and spreading them side by side let one overwrite the other.
    const search = q.search ? multiWordSearch(q.search, word => [
      { name: { contains: word, mode: 'insensitive' as const } },
      { nit: { contains: word, mode: 'insensitive' as const } },
      { email: { contains: word, mode: 'insensitive' as const } },
      { phone: { contains: word, mode: 'insensitive' as const } },
    ]) : {}
    const and: object[] = [
      ...(q.hasCredit === 'true' ? [WITH_CREDIT_WHERE] : []),
      ...(q.incomplete === 'true' ? [INCOMPLETE_WHERE] : []),
      ...('AND' in search ? search.AND : []),
    ]
    const where = {
      ...(q.isActive === 'all' ? {} : { isActive: q.isActive === 'false' ? false : true }),
      ...(and.length ? { AND: and } : {}),
    }

    // Paginated path — opt-in via `page`, used by the Customers management
    // page. Stats reflect the status filter but not the search text, same
    // scope the page's stat cards always showed before pagination existed.
    if (q.page) {
      const page = Math.max(1, parseInt(q.page, 10) || 1)
      const limit = Math.min(200, Math.max(1, parseInt(q.limit ?? '50', 10) || 50))
      const statusWhere = q.isActive === 'all' ? {} : { isActive: q.isActive === 'false' ? false : true }
      const [customers, total, statusTotal, active, withCredit, creditAgg, incomplete] = await Promise.all([
        prisma.customer.findMany({ where, orderBy: { name: 'asc' }, skip: (page - 1) * limit, take: limit }),
        prisma.customer.count({ where }),
        prisma.customer.count({ where: statusWhere }),
        prisma.customer.count({ where: { ...statusWhere, isActive: true } }),
        prisma.customer.count({ where: { ...statusWhere, ...WITH_CREDIT_WHERE } }),
        prisma.customer.aggregate({ where: statusWhere, _sum: { creditUsed: true } }),
        prisma.customer.count({ where: { ...statusWhere, ...INCOMPLETE_WHERE } }),
      ])
      return reply.send({
        data: sortCustomers(await attachPurchaseStats(customers.map(withCreditFields)), q.sortBy),
        total,
        page,
        limit,
        stats: { total: statusTotal, active, withCredit, incomplete, totalCreditUsed: Number(creditAgg._sum.creditUsed ?? 0) },
      })
    }

    const customers = await prisma.customer.findMany({ where, orderBy: { name: 'asc' } })
    const withStats = await attachPurchaseStats(customers.map(withCreditFields))
    return reply.send(sortCustomers(withStats, q.sortBy))
  })

  fastify.get('/:id', { preHandler: [fastify.authenticate, requirePermission('customers.view')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const c = await prisma.customer.findUnique({ where: { id } })
    if (!c) return reply.status(404).send({ error: 'Cliente no encontrado' })
    const [withStats] = await attachPurchaseStats([withCreditFields(c)])
    return reply.send(withStats)
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

  // POST /api/customers/bulk-delete — same soft delete as DELETE /:id for a
  // selection. Customers still owing credit are skipped (and reported back):
  // hiding them would hide a real receivable from Créditos / abonos.
  fastify.post('/bulk-delete', { preHandler: [fastify.authenticate, requirePermission('customers.delete')] }, async (request, reply) => {
    const body = z.object({ customerIds: z.array(z.string()).min(1).max(500) }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const rows = await prisma.customer.findMany({
      where: { id: { in: body.data.customerIds } },
      select: { id: true, name: true, creditUsed: true },
    })
    const owing = rows.filter(c => Number(c.creditUsed ?? 0) > 0.009)
    const deletable = rows.filter(c => !owing.includes(c)).map(c => c.id)
    const result = deletable.length
      ? await prisma.customer.updateMany({ where: { id: { in: deletable } }, data: { isActive: false } })
      : { count: 0 }
    return reply.send({ count: result.count, skipped: owing.map(c => ({ id: c.id, name: c.name, creditUsed: Number(c.creditUsed) })) })
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

    // Same stale-session guard as sale creation — a cash abono saved
    // against an already-closed session is counted by no close.
    if (body.data.cashRegisterId) {
      const resolved = await resolveOpenRegisterId(body.data.cashRegisterId)
      if (!resolved) return reply.status(409).send({ error: 'La caja seleccionada ya fue cerrada — selecciona una caja abierta', code: 'REGISTER_CLOSED' })
      body.data.cashRegisterId = resolved.id
    }

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

  // ── Cargos sin venta ─────────────────────────────────────────────────────
  // POST /api/customers/:id/credit-charge — raises the customer's balance
  // with no sale behind it: debt carried over from the previous system (the
  // import didn't bring balances) or a correction. Recorded as a CreditCharge
  // so it shows in the statement and the audit log, and paid off by ordinary
  // abonos. The credit limit doesn't block it — the debt already exists — but
  // the response says when the new balance passes it.
  fastify.post('/:id/credit-charge', { preHandler: [fastify.authenticate, requirePermission('customers.addCharge')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
    const body = z.object({
      amount: z.number().min(0.01, 'El monto debe ser mayor a 0').max(10_000_000),
      concept: z.string().trim().min(3, 'Escribe el concepto del cargo').max(200),
      reference: z.string().trim().max(100).optional(),
      chargeDate: day.optional(),
      dueDate: day.optional(),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message ?? 'Datos inválidos' })

    const customer = await prisma.customer.findUnique({ where: { id } })
    if (!customer || !customer.isActive) return reply.status(404).send({ error: 'Cliente no encontrado' })

    // A day is stored at noon Guatemala time (18:00 UTC), so it never slips to
    // the previous or next day when shown in the business's time zone.
    const atNoon = (d: string) => new Date(`${d}T18:00:00.000Z`)
    const chargeDate = body.data.chargeDate ? atNoon(body.data.chargeDate) : new Date()
    if (chargeDate.getTime() > Date.now() + 36 * 3_600_000) return reply.status(400).send({ error: 'La fecha del cargo no puede ser futura' })
    const dueDate = body.data.dueDate ? atNoon(body.data.dueDate) : null
    if (dueDate && dueDate < chargeDate) return reply.status(400).send({ error: 'El vencimiento no puede ser antes de la fecha del cargo' })

    const amount = Math.round(body.data.amount * 100) / 100
    const [charge, updated] = await prisma.$transaction([
      prisma.creditCharge.create({
        data: { customerId: id, amount, concept: body.data.concept, reference: body.data.reference || null, chargeDate, dueDate, createdById: request.user.id },
        include: { createdBy: { select: { id: true, name: true } } },
      }),
      prisma.customer.update({ where: { id }, data: { creditUsed: { increment: amount } } }),
    ])
    await log({
      userId: request.user.id, action: 'CREATE', entity: 'CreditCharge', entityId: charge.id,
      oldValues: { creditUsed: Number(customer.creditUsed) },
      newValues: { customerId: id, amount, concept: charge.concept, reference: charge.reference, creditUsed: Number(updated.creditUsed) },
    })
    const c = withCreditFields(updated)
    const overLimit = c.creditEnabled && c.creditLimitEnabled && c.creditUsed > c.creditLimit + 0.001
    return reply.status(201).send({ charge: { ...charge, amount: Number(charge.amount) }, customer: c, overLimit })
  })

  // POST /api/customers/:id/credit-charge/:chargeId/void — undoes a charge
  // entered by mistake: the record stays (voided, with the reason) and its
  // amount comes back off the balance. Refused once the balance is below the
  // charge, i.e. abonos have already paid into it — voiding then would leave
  // the account negative; the fix there is a new, correct charge.
  fastify.post('/:id/credit-charge/:chargeId/void', { preHandler: [fastify.authenticate, requirePermission('customers.addCharge')] }, async (request, reply) => {
    const { id, chargeId } = request.params as { id: string; chargeId: string }
    const body = z.object({ reason: z.string().trim().min(3, 'Escribe el motivo de la anulación').max(500) }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message ?? 'Datos inválidos' })

    const charge = await prisma.creditCharge.findFirst({ where: { id: chargeId, customerId: id }, include: { customer: true } })
    if (!charge) return reply.status(404).send({ error: 'Cargo no encontrado' })
    if (charge.isVoided) return reply.status(409).send({ error: 'Este cargo ya fue anulado' })
    const amount = Number(charge.amount)
    const balance = Number(charge.customer.creditUsed)
    if (balance + 0.001 < amount) {
      return reply.status(409).send({ error: `No se puede anular: el saldo del cliente (Q${balance.toFixed(2)}) es menor que el cargo (Q${amount.toFixed(2)}) porque ya se abonó. Si el monto estaba mal, regístralo con un cargo nuevo por la diferencia.` })
    }

    // Guarded update: only one of two simultaneous voids can flip it.
    const result = await prisma.$transaction(async tx => {
      const flipped = await tx.creditCharge.updateMany({
        where: { id: chargeId, isVoided: false },
        data: { isVoided: true, voidedById: request.user.id, voidedAt: new Date(), voidReason: body.data.reason },
      })
      if (flipped.count === 0) return null
      return tx.customer.update({ where: { id }, data: { creditUsed: { decrement: amount } } })
    })
    if (!result) return reply.status(409).send({ error: 'Este cargo ya fue anulado' })
    await log({
      userId: request.user.id, action: 'UPDATE', entity: 'CreditCharge', entityId: chargeId,
      oldValues: { isVoided: false, creditUsed: balance },
      newValues: { isVoided: true, reason: body.data.reason, creditUsed: Number(result.creditUsed) },
    })
    return reply.send({ customer: withCreditFields(result) })
  })

  // GET /api/customers/:id/account — the statement of the credit account:
  // credit sales and charges (debits), abonos (credits), oldest first, with
  // the running balance. A balance can predate every movement here (imported
  // with a balance and no detail); that difference opens the statement as
  // "Saldo anterior sin detalle", so the last running balance always equals
  // customer.creditUsed.
  fastify.get('/:id/account', { preHandler: [fastify.authenticate, requirePermission('customers.view')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const customer = await prisma.customer.findUnique({ where: { id } })
    if (!customer) return reply.status(404).send({ error: 'Cliente no encontrado' })

    const [sales, charges, payments] = await Promise.all([
      prisma.sale.findMany({
        where: { customerId: id, saleType: 'CREDIT', isVoided: false },
        select: { id: true, invoiceNumber: true, total: true, createdAt: true, dueDate: true, branch: { select: { name: true } } },
        orderBy: { createdAt: 'asc' }, take: 2000,
      }),
      prisma.creditCharge.findMany({
        where: { customerId: id },
        include: { createdBy: { select: { name: true } }, voidedBy: { select: { name: true } } },
        orderBy: { chargeDate: 'asc' }, take: 2000,
      }),
      prisma.creditPayment.findMany({
        where: { OR: [{ customerId: id }, { customerId: null, sale: { customerId: id } }] },
        select: { id: true, amount: true, paymentMethod: true, createdAt: true, paidBy: { select: { name: true } }, sale: { select: { invoiceNumber: true } } },
        orderBy: { createdAt: 'asc' }, take: 4000,
      }),
    ])

    const METHOD: Record<string, string> = { CASH: 'efectivo', CARD: 'tarjeta', TRANSFER: 'transferencia' }
    type Move = {
      type: 'SALE' | 'CHARGE' | 'PAYMENT' | 'OPENING'; id: string; date: Date; description: string; reference: string | null
      debit: number; credit: number; by?: string | null; method?: string; voided?: boolean; voidReason?: string | null; voidedBy?: string | null; dueDate?: Date | null
    }
    const moves: Move[] = []
    for (const s of sales) moves.push({ type: 'SALE', id: s.id, date: s.createdAt, description: `Venta al crédito${s.branch?.name ? ` · ${s.branch.name}` : ''}`, reference: s.invoiceNumber, debit: Number(s.total), credit: 0, dueDate: s.dueDate })
    for (const c of charges) moves.push({ type: 'CHARGE', id: c.id, date: c.chargeDate, description: c.concept, reference: c.reference, debit: Number(c.amount), credit: 0, by: c.createdBy?.name, voided: c.isVoided, voidReason: c.voidReason, voidedBy: c.voidedBy?.name ?? null, dueDate: c.dueDate })
    // One abono can be split over several invoices (several rows, same
    // person and method, written within the same transaction): one line.
    const paid: Move[] = []
    for (const p of payments) {
      const last = paid[paid.length - 1]
      if (last && last.by === (p.paidBy?.name ?? null) && last.method === p.paymentMethod && Math.abs(last.date.getTime() - p.createdAt.getTime()) < 3000) {
        last.credit += Number(p.amount)
        if (p.sale?.invoiceNumber) last.reference = [last.reference, p.sale.invoiceNumber].filter(Boolean).join(', ')
        continue
      }
      paid.push({ type: 'PAYMENT', id: p.id, date: p.createdAt, description: `Abono en ${METHOD[p.paymentMethod] ?? 'otro medio'}`, reference: p.sale?.invoiceNumber ?? null, debit: 0, credit: Number(p.amount), by: p.paidBy?.name ?? null, method: p.paymentMethod })
    }
    moves.push(...paid)
    moves.sort((a, b) => a.date.getTime() - b.date.getTime())

    const balance = Number(customer.creditUsed)
    const net = moves.reduce((s, m) => s + (m.voided ? 0 : m.debit - m.credit), 0)
    const opening = Math.round((balance - net) * 100) / 100
    if (Math.abs(opening) > 0.009) {
      moves.unshift({ type: 'OPENING', id: 'opening', date: moves[0]?.date ?? customer.createdAt, description: 'Saldo anterior sin detalle', reference: null, debit: Math.max(0, opening), credit: Math.max(0, -opening) })
    }
    let run = 0
    const movements = moves.map(m => {
      if (!m.voided) run = Math.round((run + m.debit - m.credit) * 100) / 100
      const { method: _method, ...rest } = m
      return { ...rest, debit: Math.round(m.debit * 100) / 100, credit: Math.round(m.credit * 100) / 100, balance: run }
    })
    return reply.send({ customerId: id, balance, movements })
  })
}
