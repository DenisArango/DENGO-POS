import type { FastifyInstance, FastifyRequest } from 'fastify'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import type { Config } from './config.js'

export const SESSION_COOKIE = 'dadm'
const SESSION_MS = 12 * 60 * 60 * 1000

// Sessions live in memory (id → expiry): «Salir» really ends one, and restarting the panel
// ends them all. The cookie carries only the random id, signed with SESSION_SECRET.
const sessions = new Map<string, number>()

function sessionId(req: FastifyRequest): string | null {
  const raw = req.cookies[SESSION_COOKIE]
  if (!raw) return null
  const r = req.unsignCookie(raw)
  return r.valid && r.value ? r.value : null
}

/** A valid, unexpired session. */
export function hasSession(req: FastifyRequest): boolean {
  const id = sessionId(req)
  if (!id) return false
  const exp = sessions.get(id)
  if (!exp) return false
  if (exp <= Date.now()) { sessions.delete(id); return false }
  return true
}

export async function authRoutes(app: FastifyInstance, opts: { config: Config }) {
  const { config } = opts

  app.post('/api/login', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req, reply) => {
    const body = z.object({ password: z.string().min(1).max(200) }).safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Escribe la contraseña' })
    const ok = await bcrypt.compare(body.data.password, config.passwordHash)
    if (!ok) return reply.status(401).send({ error: 'Contraseña incorrecta' })
    for (const [id, exp] of sessions) if (exp <= Date.now()) sessions.delete(id)
    const id = randomBytes(24).toString('hex')
    sessions.set(id, Date.now() + SESSION_MS)
    reply.setCookie(SESSION_COOKIE, id, {
      path: '/', httpOnly: true, sameSite: 'strict', signed: true, maxAge: SESSION_MS / 1000,
    })
    return { ok: true }
  })

  app.post('/api/logout', async (req, reply) => {
    const id = sessionId(req)
    if (id) sessions.delete(id)
    reply.clearCookie(SESSION_COOKIE, { path: '/' })
    return { ok: true }
  })

  // For the server monitor (scripts/monitor-servidor.mjs pings /api/health of every pm2 process).
  app.get('/api/health', { config: { rateLimit: false } }, async () => ({ status: 'ok', uptime: Math.round(process.uptime()) }))

  app.get('/api/me', async (req, reply) => {
    if (!hasSession(req)) return reply.status(401).send({ error: 'Inicia sesión' })
    return { ok: true, mode: config.mode }
  })

  // Everything else under /api needs the session.
  // Judged on the route the router matched (already decoded), not on the raw URL: a raw check
  // let /%61pi/... reach /api/* routes without a session.
  const PUBLIC = new Set(['/api/login', '/api/logout', '/api/me', '/api/health'])
  app.addHook('onRequest', async (req, reply) => {
    const route = req.routeOptions.url ?? ''
    if (!route.startsWith('/api/') || PUBLIC.has(route)) return
    if (!hasSession(req)) return reply.status(401).send({ error: 'Inicia sesión' })
  })
}
