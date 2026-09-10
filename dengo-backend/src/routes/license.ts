import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'

const DEFAULT_LICENSE = { pageEnabled: true, maestrosEnabled: true, posEnabled: true }

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

export default async function licenseRoutes(fastify: FastifyInstance) {
  // GET /api/license — public (no auth): the portal's own login page needs this
  // before a user is authenticated, to decide whether to show its branded landing.
  fastify.get('/', async (_request, reply) => {
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
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const existing = await prisma.licenseConfig.findFirst()
    const data: any = Object.fromEntries(Object.entries(body.data).filter(([, v]) => v !== undefined))
    const license = existing
      ? await prisma.licenseConfig.update({ where: { id: existing.id }, data })
      : await prisma.licenseConfig.create({ data: { ...DEFAULT_LICENSE, ...data } })

    return reply.send(license)
  })
}
