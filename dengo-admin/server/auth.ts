import type { FastifyInstance, FastifyRequest } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import type { Config } from './config.js'

export const SESSION_COOKIE = 'dadm'
const SESSION_MS = 12 * 60 * 60 * 1000

/** A valid, unexpired session cookie (signed by @fastify/cookie with SESSION_SECRET). */
export function hasSession(req: FastifyRequest): boolean {
  const raw = req.cookies[SESSION_COOKIE]
  if (!raw) return false
  const r = req.unsignCookie(raw)
  if (!r.valid || !r.value) return false
  const exp = Number(r.value)
  return Number.isFinite(exp) && exp > Date.now()
}

export async function authRoutes(app: FastifyInstance, opts: { config: Config }) {
  const { config } = opts

  app.post('/api/login', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req, reply) => {
    const body = z.object({ password: z.string().min(1).max(200) }).safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Escribe la contraseña' })
    const ok = await bcrypt.compare(body.data.password, config.passwordHash)
    if (!ok) return reply.status(401).send({ error: 'Contraseña incorrecta' })
    reply.setCookie(SESSION_COOKIE, String(Date.now() + SESSION_MS), {
      path: '/', httpOnly: true, sameSite: 'strict', signed: true, maxAge: SESSION_MS / 1000,
    })
    return { ok: true }
  })

  app.post('/api/logout', async (_req, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: '/' })
    return { ok: true }
  })

  app.get('/api/me', async (req, reply) => {
    if (!hasSession(req)) return reply.status(401).send({ error: 'Inicia sesión' })
    return { ok: true, mode: config.mode }
  })

  // Everything else under /api needs the session.
  app.addHook('onRequest', async (req, reply) => {
    const url = req.url.split('?')[0]
    if (!url.startsWith('/api/') || url === '/api/login' || url === '/api/logout' || url === '/api/me') return
    if (!hasSession(req)) return reply.status(401).send({ error: 'Inicia sesión' })
  })
}
