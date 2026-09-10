import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { log } from '../services/audit.service.js'
import { canAccessBranch, resolveBranchScope } from '../lib/branch-scope.js'
import { requirePermission } from '../lib/permissions.js'
import { getBusinessMonthBounds, getCurrentBusinessYearMonth } from '../lib/timezone.js'

export default async function goalsRoutes(fastify: FastifyInstance) {
  // GET /api/goals — this month's (or a chosen month's) target plus the real
  // sales total for that period. Open to any authenticated user with access
  // to the branch: the whole point is for cashiers to see it too, not just
  // whoever configured it.
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const q = request.query as { branchId?: string; year?: string; month?: string }
    const branchId = resolveBranchScope(request, q.branchId) ?? request.user.branchId
    if (!branchId) return reply.status(400).send({ error: 'Falta branchId' })

    const defaults = getCurrentBusinessYearMonth()
    const year = q.year ? parseInt(q.year, 10) : defaults.year
    const month = q.month ? parseInt(q.month, 10) : defaults.month

    const goal = await prisma.salesGoal.findUnique({
      where: { branchId_year_month: { branchId, year, month } },
    })
    const { start, end } = getBusinessMonthBounds(year, month)
    const sales = await prisma.sale.aggregate({
      where: { branchId, isVoided: false, createdAt: { gte: start, lte: end } },
      _sum: { total: true },
    })
    const currentAmount = Number(sales._sum.total ?? 0)
    const targetAmount = goal ? Number(goal.targetAmount) : null

    return reply.send({
      branchId,
      year,
      month,
      targetAmount,
      currentAmount,
      percent: targetAmount && targetAmount > 0 ? Math.min(100, (currentAmount / targetAmount) * 100) : null,
    })
  })

  // POST /api/goals — create or update the target for a given month (upsert).
  fastify.post('/', { preHandler: [fastify.authenticate, requirePermission('goals.manage')] }, async (request, reply) => {
    const body = z.object({
      branchId: z.string(),
      year: z.number().int().min(2020).max(2100),
      month: z.number().int().min(1).max(12),
      targetAmount: z.number().min(0),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    if (!canAccessBranch(request, body.data.branchId)) return reply.status(403).send({ error: 'Acceso denegado' })

    const { branchId, year, month, targetAmount } = body.data
    const goal = await prisma.salesGoal.upsert({
      where: { branchId_year_month: { branchId, year, month } },
      create: { branchId, year, month, targetAmount, createdById: request.user.id },
      update: { targetAmount, createdById: request.user.id },
    })
    await log({ userId: request.user.id, action: 'UPDATE', entity: 'SalesGoal', entityId: goal.id, newValues: { branchId, year, month, targetAmount } })
    return reply.status(201).send(goal)
  })
}
