import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'

const DEFAULT_LICENSE = { pageEnabled: true, maestrosEnabled: true, posEnabled: true, felEnabled: false, aiEnabled: true, aiMonthlyLimit: 100 as number | null, suspended: false, suspendedMessage: null as string | null }

/**
 * Feature gate for the DENGO POS vendor, not this client's own ADMIN. There
 * is deliberately no user permission that can reach PUT /api/license — only
 * a shared secret (LICENSE_ADMIN_SECRET, set on the server, never shipped to
 * any frontend) can flip these flags. See Implementación y Negocio docs for
 * how this fits the "un proceso por cliente" hosting model: one secret per
 * client process, known only to the vendor.
 */
export async function getLicense() {
  const row = await prisma.licenseConfig.findFirst()
  return row ?? DEFAULT_LICENSE
}

// The suspension gate runs on every request, so it reads a copy at most 15 s old.
// dengo-admin writes LICENSE_CONFIG straight into the database: a suspension or a
// reactivation reaches this process within that window, without a restart.
let cached: { at: number; suspended: boolean } | null = null
export async function isSuspended(): Promise<boolean> {
  if (cached && Date.now() - cached.at < 15_000) return cached.suspended
  try {
    const row = await prisma.licenseConfig.findFirst({ select: { suspended: true } })
    cached = { at: Date.now(), suspended: !!row?.suspended }
  } catch {
    cached = { at: Date.now(), suspended: false } // a database hiccup never locks a store out
  }
  return cached.suspended
}

export default async function licenseRoutes(fastify: FastifyInstance) {
  // GET /api/license — public (no auth): the portal's own login page needs this
  // before a user is authenticated, to decide whether to show its branded landing.
  // Not rate-limited: every POS and portal page load asks for it (unauthenticated, so keyed by
  // the store's shared IP), and older POS builds also use it as their connectivity ping.
  fastify.get('/', { config: { rateLimit: false } }, async (_request, reply) => {
    return reply.send(await getLicense())
  })

  fastify.put('/', async (request, reply) => {
    const secret = process.env.LICENSE_ADMIN_SECRET
    if (!secret || request.headers['x-license-secret'] !== secret) {
      return reply.status(404).send({ error: 'Not found' }) // 404, not 403 — don't reveal this route exists
    }

    const body = z.object({
      pageEnabled: z.boolean().optional(),
      maestrosEnabled: z.boolean().optional(),
      posEnabled: z.boolean().optional(),
      felEnabled: z.boolean().optional(),
      aiEnabled: z.boolean().optional(),
      // null = unlimited
      aiMonthlyLimit: z.number().int().min(0).max(100_000).nullable().optional(),
      suspended: z.boolean().optional(),
      suspendedMessage: z.string().max(300).nullable().optional(),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const existing = await prisma.licenseConfig.findFirst()
    const data: any = Object.fromEntries(Object.entries(body.data).filter(([, v]) => v !== undefined))
    const license = existing
      ? await prisma.licenseConfig.update({ where: { id: existing.id }, data })
      : await prisma.licenseConfig.create({ data: { ...DEFAULT_LICENSE, ...data } })

    cached = null
    return reply.send(license)
  })
}
