import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { log } from '../services/audit.service.js'
import { allowedBranchIds, canAccessBranch, resolveBranchScope } from '../lib/branch-scope.js'
import { requirePermission } from '../lib/permissions.js'
import { getBusinessMonthBounds, getCurrentBusinessYearMonth } from '../lib/timezone.js'

type GoalRow = { id: string; label: string | null; targetAmount: unknown; registerNumbers: string[] }

/** Real sales total for one goal's scope — the whole branch when registerNumbers is empty (the ordinary case), or only the sales rung up on those specific cajas when it's a split goal. */
async function computeCurrentAmount(branchId: string, year: number, month: number, registerNumbers: string[]): Promise<number> {
  const { start, end } = getBusinessMonthBounds(year, month)
  const sales = await prisma.sale.aggregate({
    where: {
      branchId,
      isVoided: false,
      createdAt: { gte: start, lte: end },
      ...(registerNumbers.length > 0 ? { cashRegister: { registerNumber: { in: registerNumbers } } } : {}),
    },
    _sum: { total: true },
  })
  return Number(sales._sum.total ?? 0)
}

function toGoalProgress(goal: GoalRow, currentAmount: number) {
  const targetAmount = Number(goal.targetAmount)
  return {
    id: goal.id,
    label: goal.label,
    registerNumbers: goal.registerNumbers,
    targetAmount,
    currentAmount,
    percent: targetAmount > 0 ? Math.min(100, (currentAmount / targetAmount) * 100) : null,
  }
}

export default async function goalsRoutes(fastify: FastifyInstance) {
  // GET /api/goals — this month's (or a chosen month's) target plus the real
  // sales total for that period. Open to any authenticated user with access
  // to the branch: the whole point is for cashiers to see it too, not just
  // whoever configured it. Collapses however many goal rows the branch has
  // (one general goal, or several split by caja) into the single shape the
  // Dashboard/POS widgets and the AI endpoint already expect.
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const q = request.query as { branchId?: string; year?: string; month?: string }
    const branchId = resolveBranchScope(request, q.branchId) ?? request.user.branchId
    if (!branchId) return reply.status(400).send({ error: 'Falta branchId' })

    const defaults = getCurrentBusinessYearMonth()
    const year = q.year ? parseInt(q.year, 10) : defaults.year
    const month = q.month ? parseInt(q.month, 10) : defaults.month

    const goals = await prisma.salesGoal.findMany({ where: { branchId, year, month } })

    if (goals.length === 0) {
      const currentAmount = await computeCurrentAmount(branchId, year, month, [])
      return reply.send({ branchId, year, month, targetAmount: null, currentAmount, percent: null })
    }

    const progresses = await Promise.all(
      goals.map(async g => toGoalProgress(g, await computeCurrentAmount(branchId, year, month, g.registerNumbers))),
    )
    const targetAmount = progresses.reduce((s, p) => s + p.targetAmount, 0)
    const currentAmount = progresses.reduce((s, p) => s + p.currentAmount, 0)

    return reply.send({
      branchId,
      year,
      month,
      targetAmount,
      currentAmount,
      percent: targetAmount > 0 ? Math.min(100, (currentAmount / targetAmount) * 100) : null,
      // Only present when the branch actually has more than one goal this
      // month — existing callers that don't know about splitting can ignore it.
      ...(goals.length > 1 ? { goals: progresses } : {}),
    })
  })

  // GET /api/goals/list — every goal row for a branch+month, each with its
  // own computed progress. Used by the Settings screen to manage goals when
  // a branch is split by caja (GET / above only ever returns one combined shape).
  fastify.get('/list', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const q = request.query as { branchId?: string; year?: string; month?: string }
    const branchId = resolveBranchScope(request, q.branchId) ?? request.user.branchId
    if (!branchId) return reply.status(400).send({ error: 'Falta branchId' })

    const defaults = getCurrentBusinessYearMonth()
    const year = q.year ? parseInt(q.year, 10) : defaults.year
    const month = q.month ? parseInt(q.month, 10) : defaults.month

    const goals = await prisma.salesGoal.findMany({ where: { branchId, year, month }, orderBy: { createdAt: 'asc' } })
    const progresses = await Promise.all(
      goals.map(async g => toGoalProgress(g, await computeCurrentAmount(branchId, year, month, g.registerNumbers))),
    )
    return reply.send(progresses)
  })

  // POST /api/goals — create or update a goal.
  // - With `id`: updates that specific goal (label/targetAmount/registerNumbers).
  // - Without `id` and registerNumbers empty: upserts the branch's one
  //   general goal for the month (the original, unsplit behavior).
  // - Without `id` and registerNumbers non-empty: creates a new split goal —
  //   never silently upserted, since a branch can have several of these for
  //   the same month and there's nothing else to key off of.
  fastify.post('/', { preHandler: [fastify.authenticate, requirePermission('goals.manage')] }, async (request, reply) => {
    const body = z.object({
      id: z.string().optional(),
      branchId: z.string(),
      year: z.number().int().min(2020).max(2100),
      month: z.number().int().min(1).max(12),
      targetAmount: z.number().min(0),
      label: z.string().max(60).optional(),
      registerNumbers: z.array(z.string()).optional(),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    if (!canAccessBranch(request, body.data.branchId)) return reply.status(403).send({ error: 'Acceso denegado' })

    const { branchId, year, month, targetAmount } = body.data
    const label = body.data.label?.trim() || null
    const registerNumbers = [...new Set(body.data.registerNumbers ?? [])]

    if (body.data.id) {
      const existing = await prisma.salesGoal.findUnique({ where: { id: body.data.id } })
      if (!existing || existing.branchId !== branchId) return reply.status(404).send({ error: 'Meta no encontrada' })

      const siblings = (await prisma.salesGoal.findMany({ where: { branchId, year, month } })).filter(g => g.id !== existing.id)
      if (registerNumbers.length === 0 && siblings.some(g => g.registerNumbers.length > 0)) {
        return reply.status(409).send({ error: 'Ya hay metas divididas por caja este mes. Elimínalas primero para usar una meta general.' })
      }
      if (registerNumbers.length > 0) {
        if (siblings.some(g => g.registerNumbers.length === 0)) {
          return reply.status(409).send({ error: 'Ya hay una meta general este mes. Elimínala primero para dividir por caja.' })
        }
        const alreadyUsed = new Set(siblings.flatMap(g => g.registerNumbers))
        const overlap = registerNumbers.filter(r => alreadyUsed.has(r))
        if (overlap.length > 0) return reply.status(409).send({ error: `La(s) caja(s) ${overlap.join(', ')} ya pertenecen a otra meta este mes` })
      }

      const goal = await prisma.salesGoal.update({ where: { id: existing.id }, data: { targetAmount, label, registerNumbers } })
      await log({ userId: request.user.id, action: 'UPDATE', entity: 'SalesGoal', entityId: goal.id, newValues: { branchId, year, month, targetAmount, label, registerNumbers } })
      return reply.status(201).send(goal)
    }

    const siblings = await prisma.salesGoal.findMany({ where: { branchId, year, month } })

    if (registerNumbers.length === 0) {
      const existingGeneral = siblings.find(g => g.registerNumbers.length === 0)
      if (!existingGeneral && siblings.some(g => g.registerNumbers.length > 0)) {
        return reply.status(409).send({ error: 'Ya hay metas divididas por caja este mes. Elimínalas primero para usar una meta general.' })
      }
      const goal = existingGeneral
        ? await prisma.salesGoal.update({ where: { id: existingGeneral.id }, data: { targetAmount, createdById: request.user.id } })
        : await prisma.salesGoal.create({ data: { branchId, year, month, targetAmount, createdById: request.user.id } })
      await log({ userId: request.user.id, action: 'UPDATE', entity: 'SalesGoal', entityId: goal.id, newValues: { branchId, year, month, targetAmount } })
      return reply.status(201).send(goal)
    }

    // Splitting by caja is mutually exclusive with the whole-branch general
    // goal (they'd double-count the registers' sales), and a register can
    // only feed one split goal at a time.
    if (siblings.some(g => g.registerNumbers.length === 0)) {
      return reply.status(409).send({ error: 'Ya hay una meta general este mes. Elimínala primero para dividir por caja.' })
    }
    const alreadyUsed = new Set(siblings.flatMap(g => g.registerNumbers))
    const overlap = registerNumbers.filter(r => alreadyUsed.has(r))
    if (overlap.length > 0) {
      return reply.status(409).send({ error: `La(s) caja(s) ${overlap.join(', ')} ya pertenecen a otra meta este mes` })
    }

    const goal = await prisma.salesGoal.create({ data: { branchId, year, month, targetAmount, label, registerNumbers, createdById: request.user.id } })
    await log({ userId: request.user.id, action: 'CREATE', entity: 'SalesGoal', entityId: goal.id, newValues: { branchId, year, month, targetAmount, label, registerNumbers } })
    return reply.status(201).send(goal)
  })

  // DELETE /api/goals/:id — removes one goal row. Only meaningful for split
  // goals in practice (deleting the lone general goal just means "no target
  // set this month," same as never having created one).
  fastify.delete('/:id', { preHandler: [fastify.authenticate, requirePermission('goals.manage')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const goal = await prisma.salesGoal.findUnique({ where: { id } })
    if (!goal) return reply.status(404).send({ error: 'Meta no encontrada' })
    if (!canAccessBranch(request, goal.branchId)) return reply.status(403).send({ error: 'Acceso denegado' })
    await prisma.salesGoal.delete({ where: { id } })
    await log({ userId: request.user.id, action: 'DELETE', entity: 'SalesGoal', entityId: id })
    return reply.send({ message: 'Meta eliminada' })
  })

  // GET /api/goals/compliance-report — every accessible branch's goal(s) over
  // the last N months, with how much of the target was actually hit each
  // month. Admins see every branch (or one, via branchId); non-admins see
  // only the branches assigned to them.
  fastify.get('/compliance-report', { preHandler: [fastify.authenticate, requirePermission('goals.manage')] }, async (request, reply) => {
    const q = request.query as { branchId?: string; months?: string }
    const monthsCount = Math.min(24, Math.max(1, parseInt(q.months ?? '6', 10) || 6))

    let branchIds: string[] | undefined
    if (request.user.role === 'ADMIN') {
      branchIds = q.branchId ? [q.branchId] : undefined
    } else {
      const allowed = allowedBranchIds(request)
      branchIds = q.branchId && allowed.includes(q.branchId) ? [q.branchId] : allowed
    }

    const branches = await prisma.branch.findMany({
      where: branchIds ? { id: { in: branchIds } } : {},
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })

    const { year: curYear, month: curMonth } = getCurrentBusinessYearMonth()
    const periods: { year: number; month: number }[] = []
    let y = curYear, m = curMonth
    for (let i = 0; i < monthsCount; i++) {
      periods.push({ year: y, month: m })
      m -= 1
      if (m === 0) { m = 12; y -= 1 }
    }

    const result = []
    for (const branch of branches) {
      for (const period of periods) {
        const goals = await prisma.salesGoal.findMany({ where: { branchId: branch.id, ...period } })
        if (goals.length === 0) {
          result.push({ branchId: branch.id, branchName: branch.name, year: period.year, month: period.month, targetAmount: null, currentAmount: null, percent: null, goals: [] })
          continue
        }
        const progresses = await Promise.all(
          goals.map(async g => toGoalProgress(g, await computeCurrentAmount(branch.id, period.year, period.month, g.registerNumbers))),
        )
        const targetAmount = progresses.reduce((s, p) => s + p.targetAmount, 0)
        const currentAmount = progresses.reduce((s, p) => s + p.currentAmount, 0)
        result.push({
          branchId: branch.id,
          branchName: branch.name,
          year: period.year,
          month: period.month,
          targetAmount,
          currentAmount,
          percent: targetAmount > 0 ? Math.min(100, (currentAmount / targetAmount) * 100) : null,
          goals: progresses,
        })
      }
    }

    return reply.send(result)
  })
}
