import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { log } from '../services/audit.service.js'

const include = {
  branch: true,
  openedBy: { select: { id: true, name: true } },
  closedBy: { select: { id: true, name: true } },
  movements: { include: { performedBy: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' as const } },
}

export default async function cashRegisterRoutes(fastify: FastifyInstance) {
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const q = request.query as { branchId?: string; status?: string }
    return reply.send(await prisma.cashRegister.findMany({
      where: {
        ...(q.branchId ? { branchId: q.branchId } : {}),
        ...(q.status ? { status: q.status as any } : {}),
      },
      include,
      orderBy: { openedAt: 'desc' },
    }))
  })

  fastify.get('/current', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const reg = await prisma.cashRegister.findFirst({
      where: { branchId: request.user.branchId, status: 'OPEN' },
      include,
    })
    return reply.send(reg ?? null)
  })

  fastify.get('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const reg = await prisma.cashRegister.findUnique({ where: { id }, include })
    if (!reg) return reply.status(404).send({ error: 'Caja no encontrada' })
    return reply.send(reg)
  })

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
    return reply.status(201).send(reg)
  })

  fastify.post('/:id/close', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({ finalAmount: z.number().min(0) }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const reg = await prisma.cashRegister.findUnique({ where: { id }, include: { movements: true } })
    if (!reg || reg.status !== 'OPEN') return reply.status(404).send({ error: 'Caja no encontrada o ya cerrada' })

    const movementsBalance = reg.movements.reduce((acc, m) =>
      acc + (m.type === 'INCOME' ? Number(m.amount) : -Number(m.amount)), 0)
    const expectedAmount = Number(reg.initialAmount) + Number(reg.totalSales) + movementsBalance

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
