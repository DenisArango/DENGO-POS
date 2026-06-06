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

// Aggregates real sales for a specific register or branch time window
async function computeSales(branchId: string, openedAt: Date, closedAt?: Date | null, cashRegisterId?: string) {
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

  const result = { total: 0, count: sales.length, cash: 0, card: 0, transfer: 0, credit: 0 }
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
  return result
}

async function withSales(reg: any) {
  if (!reg) return null
  const sales = await computeSales(reg.branchId, reg.openedAt, reg.closedAt, reg.id)
  return { ...reg, sales }
}

export default async function cashRegisterRoutes(fastify: FastifyInstance) {
  // GET /definitions  — distinct register names/numbers for a branch (for persistent selector)
  fastify.get('/definitions', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const q = request.query as { branchId?: string }
    const branchId = request.user.role !== 'ADMIN'
      ? request.user.branchId
      : (q.branchId ?? request.user.branchId)

    // Get unique name+number combinations ever used in this branch
    const rows = await prisma.cashRegister.findMany({
      where: branchId ? { branchId } : {},
      select: { name: true, registerNumber: true, branchId: true },
      distinct: ['name', 'registerNumber', 'branchId'],
      orderBy: [{ registerNumber: 'asc' }],
    })
    return reply.send(rows)
  })

  // GET /  — list registers for a branch
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const q = request.query as { branchId?: string; status?: string }
    const branchId = request.user.role !== 'ADMIN'
      ? request.user.branchId
      : (q.branchId ?? request.user.branchId)

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
    const branchId = request.user.role !== 'ADMIN'
      ? request.user.branchId
      : (q.branchId ?? request.user.branchId)

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
    return reply.send(await withSales(reg))
  })

  // POST /open
  fastify.post('/open', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = z.object({
      branchId: z.string(),
      initialAmount: z.number().min(0),
      name: z.string().min(1).default('Caja'),
      registerNumber: z.string().min(1).default('1'),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    // Check if a register with the same number is already open in this branch
    const existing = await prisma.cashRegister.findFirst({
      where: {
        branchId: body.data.branchId,
        registerNumber: body.data.registerNumber,
        status: 'OPEN',
      },
    })
    if (existing) {
      return reply.status(409).send({ error: `La caja ${body.data.registerNumber} ya está abierta en esta sucursal` })
    }

    const reg = await prisma.cashRegister.create({
      data: {
        branchId: body.data.branchId,
        openedById: request.user.id,
        initialAmount: body.data.initialAmount,
        name: body.data.name,
        registerNumber: body.data.registerNumber,
      },
      include,
    })
    await log({ userId: request.user.id, action: 'OPEN', entity: 'CashRegister', entityId: reg.id, newValues: { name: body.data.name, registerNumber: body.data.registerNumber } })
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
    const sales = await computeSales(reg.branchId, reg.openedAt, null, id)
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
