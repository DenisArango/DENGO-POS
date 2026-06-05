import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { log } from '../services/audit.service.js'

const include = {
  branch: true,
  openedBy: { select: { id: true, name: true } },
  closedBy: { select: { id: true, name: true } },
  movements: {
    include: { performedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
}

// Aggregates real sales for a register's time window
// Uses findMany + JS aggregation to avoid Prisma groupBy() issues with SQL Server
async function computeSales(branchId: string, openedAt: Date, closedAt?: Date | null) {
  const sales = await prisma.sale.findMany({
    where: {
      branchId,
      createdAt: {
        gte: openedAt,
        ...(closedAt ? { lte: closedAt } : {}),
      },
    },
    select: { total: true, paymentMethod: true },
  })

  const result = { total: 0, count: sales.length, cash: 0, card: 0, transfer: 0, credit: 0 }
  for (const s of sales) {
    const amt = Number(s.total ?? 0)
    result.total += amt
    const m = (s.paymentMethod ?? '').toUpperCase()
    if (m === 'CASH')     result.cash     += amt
    else if (m === 'CARD')      result.card     += amt
    else if (m === 'TRANSFER')  result.transfer += amt
    else if (m === 'CREDIT')    result.credit   += amt
  }
  return result
}

async function withSales(reg: any) {
  if (!reg) return null
  const sales = await computeSales(reg.branchId, reg.openedAt, reg.closedAt)
  return { ...reg, sales }
}

export default async function cashRegisterRoutes(fastify: FastifyInstance) {
  // GET /  — list registers for a branch (no sales aggregation to avoid connection exhaustion)
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const q = request.query as { branchId?: string; status?: string }
    const branchId = q.branchId ?? request.user.branchId
    const list = await prisma.cashRegister.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        ...(q.status ? { status: q.status as any } : {}),
      },
      include,
      orderBy: { openedAt: 'desc' },
    })
    return reply.send(list)
  })

  // GET /current — open register for the selected branch
  fastify.get('/current', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const q = request.query as { branchId?: string }
    const branchId = q.branchId ?? request.user.branchId
    const reg = await prisma.cashRegister.findFirst({
      where: { branchId, status: 'OPEN' },
      include,
    })
    return reply.send(await withSales(reg))
  })

  // GET /:id
  fastify.get('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const reg = await prisma.cashRegister.findUnique({ where: { id }, include })
    if (!reg) return reply.status(404).send({ error: 'Caja no encontrada' })
    return reply.send(await withSales(reg))
  })

  // POST /open
  fastify.post('/open', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = z.object({
      branchId: z.string(),
      initialAmount: z.number().min(0),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const existing = await prisma.cashRegister.findFirst({
      where: { branchId: body.data.branchId, status: 'OPEN' },
    })
    if (existing) return reply.status(409).send({ error: 'Ya hay una caja abierta en esta sucursal' })

    const reg = await prisma.cashRegister.create({
      data: {
        branchId: body.data.branchId,
        openedById: request.user.id,
        initialAmount: body.data.initialAmount,
      },
      include,
    })
    await log({ userId: request.user.id, action: 'OPEN', entity: 'CashRegister', entityId: reg.id })
    return reply.status(201).send(await withSales(reg))
  })

  // POST /:id/close
  fastify.post('/:id/close', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({ finalAmount: z.number().min(0) }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const reg = await prisma.cashRegister.findUnique({ where: { id }, include: { movements: true } })
    if (!reg || reg.status !== 'OPEN') return reply.status(404).send({ error: 'Caja no encontrada o ya cerrada' })

    const movementsBalance = reg.movements.reduce(
      (acc, m) => acc + (m.type === 'INCOME' ? Number(m.amount) : -Number(m.amount)), 0
    )
    const sales = await computeSales(reg.branchId, reg.openedAt, null)
    const expectedAmount = Number(reg.initialAmount) + sales.cash + movementsBalance

    const updated = await prisma.cashRegister.update({
      where: { id },
      data: {
        status: 'CLOSED',
        closedById: request.user.id,
        closedAt: new Date(),
        finalAmount: body.data.finalAmount,
        expectedAmount,
        difference: body.data.finalAmount - expectedAmount,
      },
      include,
    })
    await log({ userId: request.user.id, action: 'CLOSE', entity: 'CashRegister', entityId: id })
    // Return without recomputing sales — they're already reflected in expectedAmount
    return reply.send(updated)
  })

  // POST /:id/movements
  fastify.post('/:id/movements', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      type: z.enum(['INCOME', 'EXPENSE']),
      amount: z.number().min(0.01),
      description: z.string().min(1),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const reg = await prisma.cashRegister.findUnique({ where: { id } })
    if (!reg || reg.status !== 'OPEN') return reply.status(404).send({ error: 'Caja no encontrada o cerrada' })

    const movement = await prisma.cashMovement.create({
      data: { cashRegisterId: id, ...body.data, performedById: request.user.id },
      include: { performedBy: { select: { id: true, name: true } } },
    })
    return reply.status(201).send(movement)
  })
}
