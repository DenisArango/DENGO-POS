import type { FastifyReply, FastifyRequest } from 'fastify'
import { prisma } from './prisma.js'
import { getLicense } from '../routes/license.js'

// AI is a paid add-on: the vendor switches it on per client (LICENSE_CONFIG
// aiEnabled) with a monthly allowance (aiMonthlyLimit, null = unlimited).
// Every AI call that reaches the model is logged in AI_USAGE; only the
// successful ones count against the allowance.

export type AiKind = 'ANALYST' | 'RECOMMENDATION' | 'QUERY'

// Business time is Guatemala (UTC-6, no DST), so "this month" starts at
// 06:00 UTC on the 1st — not at UTC midnight.
const OFFSET_MS = 6 * 60 * 60 * 1000

export function aiPeriod(now = new Date()) {
  const local = new Date(now.getTime() - OFFSET_MS)
  const y = local.getUTCFullYear()
  const m = local.getUTCMonth()
  return {
    start: new Date(Date.UTC(y, m, 1) + OFFSET_MS),
    end: new Date(Date.UTC(y, m + 1, 1) + OFFSET_MS),
    // First day of next month, as the business sees it
    resetsOn: new Date(Date.UTC(y, m + 1, 1)).toISOString().slice(0, 10),
  }
}

export interface AiStatus {
  enabled: boolean
  limit: number | null
  used: number
  remaining: number | null
  resetsOn: string
}

export async function getAiStatus(): Promise<AiStatus> {
  const license = await getLicense()
  const enabled = license.aiEnabled ?? true
  const limit = license.aiMonthlyLimit === undefined ? 100 : license.aiMonthlyLimit
  const { start, end, resetsOn } = aiPeriod()
  const used = await prisma.aiUsage.count({ where: { success: true, createdAt: { gte: start, lt: end } } })
  return { enabled, limit, used, remaining: limit === null ? null : Math.max(0, limit - used), resetsOn }
}

/**
 * Gate for every AI route. Sends the 403/429 itself and returns null when the
 * call must not go ahead; returns the status otherwise.
 */
export async function requireAiQuota(reply: FastifyReply): Promise<AiStatus | null> {
  const status = await getAiStatus()
  if (!status.enabled) {
    await reply.status(403).send({ error: 'La IA no está activada en tu plan. Contacta a tu proveedor para activarla.', aiDisabled: true })
    return null
  }
  if (status.remaining !== null && status.remaining <= 0) {
    const [y, m, d] = status.resetsOn.split('-')
    await reply.status(429).send({
      error: `Llegaste al límite de ${status.limit} consultas de IA de este mes. Se renueva el ${d}/${m}/${y}; si necesitas más, contacta a tu proveedor.`,
      quotaExceeded: true,
    })
    return null
  }
  return status
}

export async function recordAiUsage(request: FastifyRequest, data: {
  kind: AiKind
  question: string
  success: boolean
  model: string
  branchId?: string | null
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  durationMs: number
}) {
  try {
    const user = await prisma.user.findUnique({ where: { id: request.user.id }, select: { name: true } })
    await prisma.aiUsage.create({
      data: {
        kind: data.kind,
        userId: request.user.id,
        userName: (user?.name ?? 'usuario').slice(0, 150),
        branchId: data.branchId ?? request.user.branchId ?? null,
        question: data.question.slice(0, 1000),
        success: data.success,
        model: data.model.slice(0, 60),
        inputTokens: data.inputTokens ?? 0,
        outputTokens: data.outputTokens ?? 0,
        cacheReadTokens: data.cacheReadTokens ?? 0,
        cacheWriteTokens: data.cacheWriteTokens ?? 0,
        durationMs: data.durationMs,
      },
    })
  } catch (err) {
    // Logging must never turn a delivered answer into an error
    request.log.error(err, 'Failed to record AI usage')
  }
}
