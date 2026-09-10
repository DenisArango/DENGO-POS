import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { log } from '../services/audit.service.js'
import { canAccessBranch, resolveBranchScope } from '../lib/branch-scope.js'
import { hasPermission, requirePermission } from '../lib/permissions.js'

const include = {
  branch: true,
  openedBy: { select: { id: true, name: true } },
  closedBy: { select: { id: true, name: true } },
  movements: {
    include: { performedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
}

// Aggregates real sales — plus cash credit-payments (abonos) collected during
// this register's session — for a specific register or branch time window.
export async function computeSales(branchId: string, openedAt: Date, closedAt?: Date | null, cashRegisterId?: string) {
  const sales = await prisma.sale.findMany({
    where: {
      branchId,
      isVoided: false,
      ...(cashRegisterId ? { cashRegisterId } : {}),
      createdAt: {
        gte: openedAt,
        ...(closedAt ? { lte: closedAt } : {}),
      },
    },
    select: { total: true, paymentMethod: true, cashAmount: true, cardAmount: true, transferAmount: true },
  })

  const result = { total: 0, count: sales.length, cash: 0, card: 0, transfer: 0, credit: 0, creditPaymentsCash: 0 }
  for (const s of sales) {
    const amt = Number(s.total ?? 0)
    result.total += amt
    const m = (s.paymentMethod ?? '').toUpperCase()
    if (m === 'CASH')          result.cash     += amt
    else if (m === 'CARD')     result.card     += amt
    else if (m === 'TRANSFER') result.transfer += amt
    else if (m === 'CREDIT')   result.credit   += amt
    else if (m === 'MIXED') {
      result.cash     += Number(s.cashAmount ?? 0)
      result.card     += Number(s.cardAmount ?? 0)
      result.transfer += Number(s.transferAmount ?? 0)
    }
  }

  // Cash abonos against OLDER credit sales physically add cash to this
  // register today even though they're not a "sale" in this window — without
  // this, a real cash abono shows up as a discrepancy at close time.
  if (cashRegisterId) {
    const cashPayments = await prisma.creditPayment.aggregate({
      where: { cashRegisterId, paymentMethod: 'CASH' },
      _sum: { amount: true },
    })
    result.creditPaymentsCash = Number(cashPayments._sum.amount ?? 0)
    result.cash += result.creditPaymentsCash
  }

  return result
}

async function withSales(reg: any) {
  if (!reg) return null
  const sales = await computeSales(reg.branchId, reg.openedAt, reg.closedAt, reg.id)
  return { ...reg, sales }
}

export default async function cashRegisterRoutes(fastify: FastifyInstance) {
  // ── Fixed register definitions (Configuración → Tiendas) ──────────────────
  // Replaces the old "distinct name+number ever used in history" trick — a
  // typo in a register's name used to silently create a permanent "new"
  // register. These rows are the source of truth for what a cashier can pick
  // from at open time.

  fastify.get('/register-definitions', { preHandler: [fastify.authenticate, requirePermission('cash.open')] }, async (request, reply) => {
    const q = request.query as { branchId?: string }
    const branchId = resolveBranchScope(request, q.branchId)
    return reply.send(await prisma.cashRegisterDefinition.findMany({
      where: { ...(branchId ? { branchId } : {}), isActive: true },
      orderBy: [{ branchId: 'asc' }, { registerNumber: 'asc' }],
    }))
  })

  fastify.post('/register-definitions', { preHandler: [fastify.authenticate, requirePermission('settings.cashRegisters')] }, async (request, reply) => {
    const body = z.object({
      branchId: z.string(),
      name: z.string().min(1),
      registerNumber: z.string().min(1),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    try {
      const def = await prisma.cashRegisterDefinition.create({ data: body.data })
      await log({ userId: request.user.id, action: 'CREATE', entity: 'CashRegisterDefinition', entityId: def.id })
      return reply.status(201).send(def)
    } catch (err: any) {
      if (err.code === 'P2002') return reply.status(409).send({ error: 'Ya existe una caja con ese número en esa sucursal' })
      throw err
    }
  })

  fastify.put('/register-definitions/:id', { preHandler: [fastify.authenticate, requirePermission('settings.cashRegisters')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({ name: z.string().min(1).optional(), isActive: z.boolean().optional() }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    try {
      const data: any = Object.fromEntries(Object.entries(body.data).filter(([, v]) => v !== undefined))
      const def = await prisma.cashRegisterDefinition.update({ where: { id }, data })
      await log({ userId: request.user.id, action: 'UPDATE', entity: 'CashRegisterDefinition', entityId: id })
      return reply.send(def)
    } catch {
      return reply.status(404).send({ error: 'Caja no encontrada' })
    }
  })

  fastify.delete('/register-definitions/:id', { preHandler: [fastify.authenticate, requirePermission('settings.cashRegisters')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      await prisma.cashRegisterDefinition.update({ where: { id }, data: { isActive: false } })
      await log({ userId: request.user.id, action: 'DELETE', entity: 'CashRegisterDefinition', entityId: id })
      return reply.send({ message: 'Caja eliminada' })
    } catch {
      return reply.status(404).send({ error: 'Caja no encontrada' })
    }
  })

  // GET /  — list registers for a branch
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const q = request.query as { branchId?: string; status?: string }
    const branchId = resolveBranchScope(request, q.branchId)

    const list = await prisma.cashRegister.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        ...(q.status ? { status: q.status as any } : {}),
      },
      include,
      orderBy: [{ status: 'asc' }, { openedAt: 'desc' }],
    })
    return reply.send(list)
  })

  // GET /current — open registers for the selected branch
  fastify.get('/current', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const q = request.query as { branchId?: string }
    const branchId = resolveBranchScope(request, q.branchId) ?? request.user.branchId

    const registers = await prisma.cashRegister.findMany({
      where: { branchId, status: 'OPEN' },
      include,
      orderBy: { registerNumber: 'asc' },
    })
    // Return all open registers enriched with sales
    const enriched = await Promise.all(registers.map(withSales))
    return reply.send(enriched)
  })

  // GET /:id
  fastify.get('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const reg = await prisma.cashRegister.findUnique({ where: { id }, include })
    if (!reg) return reply.status(404).send({ error: 'Caja no encontrada' })
    if (!canAccessBranch(request, reg.branchId)) return reply.status(403).send({ error: 'Acceso denegado' })
    return reply.send(await withSales(reg))
  })

  // POST /open
  fastify.post('/open', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = z.object({
      branchId: z.string(),
      registerDefinitionId: z.string(),
      initialAmount: z.number().min(0),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    if (!hasPermission(request, 'cash.open')) return reply.status(403).send({ error: 'Acceso denegado' })
    if (!canAccessBranch(request, body.data.branchId)) return reply.status(403).send({ error: 'Acceso denegado' })

    const definition = await prisma.cashRegisterDefinition.findUnique({ where: { id: body.data.registerDefinitionId } })
    if (!definition || !definition.isActive || definition.branchId !== body.data.branchId) {
      return reply.status(400).send({ error: 'Caja no configurada para esta sucursal — pide a un administrador que la agregue en Configuración → Tiendas' })
    }

    // Check if this register is already open in this branch
    const existing = await prisma.cashRegister.findFirst({
      where: {
        branchId: body.data.branchId,
        registerNumber: definition.registerNumber,
        status: 'OPEN',
      },
    })
    if (existing) {
      return reply.status(409).send({ error: `La caja ${definition.name} ya está abierta en esta sucursal` })
    }

    const reg = await prisma.cashRegister.create({
      data: {
        branchId: body.data.branchId,
        openedById: request.user.id,
        initialAmount: body.data.initialAmount,
        name: definition.name,
        registerNumber: definition.registerNumber,
      },
      include,
    })
    await log({ userId: request.user.id, action: 'OPEN', entity: 'CashRegister', entityId: reg.id, newValues: { name: definition.name, registerNumber: definition.registerNumber } })
    return reply.status(201).send(await withSales(reg))
  })

  // POST /:id/close
  fastify.post('/:id/close', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      finalAmount: z.number().min(0),
      externalSalesTotal: z.number().min(0).optional(),
      // Set when this close was queued offline (lib/offlineDb.ts) and is
      // only now syncing — lets a retried sync (e.g. the first attempt
      // succeeded but the client never saw the response) recognize the
      // close as already applied instead of erroring or double-closing.
      clientRequestId: z.string().optional(),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    if (body.data.clientRequestId) {
      const already = await prisma.cashRegister.findUnique({ where: { closeRequestId: body.data.clientRequestId }, include })
      if (already) return reply.send(await withSales(already))
    }

    const reg = await prisma.cashRegister.findUnique({ where: { id }, include: { movements: true } })
    if (!reg || reg.status !== 'OPEN') return reply.status(404).send({ error: 'Caja no encontrada o ya cerrada' })
    if (!canAccessBranch(request, reg.branchId)) return reply.status(403).send({ error: 'Acceso denegado' })
    if (!hasPermission(request, 'cash.close')) return reply.status(403).send({ error: 'Acceso denegado' })

    const movementsBalance = reg.movements.reduce(
      (acc, m) => acc + (m.type === 'INCOME' ? Number(m.amount) : -Number(m.amount)), 0
    )
    const sales = await computeSales(reg.branchId, reg.openedAt, null, id)
    // Deliberately excludes initialAmount: `finalAmount` here means "efectivo
    // entregado" (what actually leaves the drawer to the office), not "todo
    // lo que hay en la caja" — the opening float is meant to stay behind as
    // the next day's seed money (the register normally carries the same
    // float forward, closed and reopened with the same physical cash), so
    // it was never expected to be handed over in the first place. Comparing
    // it against the full initial+sales total used to make every close look
    // like it was short by exactly the float amount.
    const expectedAmount = sales.cash + movementsBalance

    const updated = await prisma.cashRegister.update({
      where: { id },
      data: {
        status: 'CLOSED',
        closedById: request.user.id,
        closedAt: new Date(),
        finalAmount: body.data.finalAmount,
        expectedAmount,
        difference: body.data.finalAmount - expectedAmount,
        ...(body.data.clientRequestId ? { closeRequestId: body.data.clientRequestId } : {}),
        ...(body.data.externalSalesTotal !== undefined ? {
          externalSalesTotal: body.data.externalSalesTotal,
          externalSalesDifference: sales.total - body.data.externalSalesTotal,
        } : {}),
      },
      include,
    })
    await log({ userId: request.user.id, action: 'CLOSE', entity: 'CashRegister', entityId: id })
    return reply.send(await withSales(updated))
  })

  // PATCH /:id/reconciliation — set/update the "Total Excel" figure after the
  // register is already closed, since the external report often isn't ready
  // until later in the day. Recomputes the gap against DENGO's own total for
  // that same register session.
  fastify.patch('/:id/reconciliation', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({ externalSalesTotal: z.number().min(0) }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const reg = await prisma.cashRegister.findUnique({ where: { id } })
    if (!reg || reg.status !== 'CLOSED') return reply.status(404).send({ error: 'Caja no encontrada o aún no está cerrada' })
    if (!canAccessBranch(request, reg.branchId)) return reply.status(403).send({ error: 'Acceso denegado' })
    if (!hasPermission(request, 'cash.close')) return reply.status(403).send({ error: 'Acceso denegado' })

    const sales = await computeSales(reg.branchId, reg.openedAt, reg.closedAt, id)
    const updated = await prisma.cashRegister.update({
      where: { id },
      data: {
        externalSalesTotal: body.data.externalSalesTotal,
        externalSalesDifference: sales.total - body.data.externalSalesTotal,
      },
      include,
    })
    return reply.send(await withSales(updated))
  })

  // POST /:id/movements
  fastify.post('/:id/movements', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      type: z.enum(['INCOME', 'EXPENSE']),
      amount: z.number().min(0.01),
      description: z.string().min(1),
      // Set when queued offline — same idempotency purpose as Sale.clientRequestId.
      clientRequestId: z.string().optional(),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    if (body.data.clientRequestId) {
      const already = await prisma.cashMovement.findUnique({
        where: { clientRequestId: body.data.clientRequestId },
        include: { performedBy: { select: { id: true, name: true } } },
      })
      if (already) return reply.status(201).send(already)
    }

    const reg = await prisma.cashRegister.findUnique({ where: { id } })
    if (!reg || reg.status !== 'OPEN') return reply.status(404).send({ error: 'Caja no encontrada o cerrada' })
    if (!canAccessBranch(request, reg.branchId)) return reply.status(403).send({ error: 'Acceso denegado' })
    if (!hasPermission(request, 'cash.movements')) return reply.status(403).send({ error: 'Acceso denegado' })

    const data = Object.fromEntries(Object.entries({ cashRegisterId: id, ...body.data, performedById: request.user.id }).filter(([, v]) => v !== undefined)) as any
    const movement = await prisma.cashMovement.create({
      data,
      include: { performedBy: { select: { id: true, name: true } } },
    })
    return reply.status(201).send(movement)
  })
}
