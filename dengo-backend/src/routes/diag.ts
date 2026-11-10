import type { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma.js'

// Connection diagnostics.
//
// POST /api/diag/conn — a POS device sends its connection log (see
// dengo-frontend/src/lib/connLog.ts) as soon as it can reach the server
// again after failures. Logged at WARN with the tag «conexion-cliente», so
// `pm2 logs <proceso> | grep conexion-cliente` shows, per device, when and
// HOW its requests failed — next to the server's own messages at that time.
// Public on purpose (a device may be on the login screen, or its token may
// have expired while offline) but small and rate-limited.
//
// GET /api/diag/db — how long a trivial database round trip takes right now.
// For curl from the server when something feels slow.

const MAX_EVENTS = 60
const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.slice(0, max) : typeof v === 'number' || typeof v === 'boolean' ? v : undefined)

export default async function diagRoutes(fastify: FastifyInstance) {
  fastify.post('/conn', {
    bodyLimit: 64 * 1024,
    config: { rateLimit: { max: 10, timeWindow: 60_000 } },
  }, async (request, reply) => {
    const body = (request.body ?? {}) as { device?: Record<string, unknown>; events?: unknown[] }
    let user: string | undefined
    try { const u = await request.jwtVerify<{ id?: string; email?: string }>(); user = u?.email ?? u?.id } catch { /* anonymous is fine */ }

    const device: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(body.device ?? {}).slice(0, 10)) device[k.slice(0, 20)] = str(v)

    const events = (Array.isArray(body.events) ? body.events : []).slice(-MAX_EVENTS).map(raw => {
      const e = (raw ?? {}) as Record<string, unknown>
      return {
        at: str(e.at, 40), kind: str(e.kind, 10), bad: e.bad === true, msg: str(e.msg),
        method: str(e.method, 10), path: str(e.path, 120), status: str(e.status), ms: str(e.ms),
        reqId: str(e.reqId, 40), err: str(e.err, 120), netUp: str(e.netUp), net: str(e.net, 80), vis: str(e.vis, 10),
      }
    })
    const bad = events.filter(e => e.bad).length

    request.log.warn({ tag: 'conexion-cliente', ip: request.ip, user, device, events }, `conexion-cliente: ${bad} fallo(s) reportado(s) por ${user ?? 'dispositivo sin sesión'} (${request.ip})`)
    // One readable line per event too: grep-friendly without a JSON viewer.
    for (const e of events) {
      request.log.warn(`conexion-cliente ${request.ip} ${user ?? '-'} ${e.at} ${e.bad ? 'FALLO' : 'ok'} ${e.method ?? ''} ${e.path ?? ''} ${e.status ?? ''} ${e.ms != null ? `${e.ms}ms` : ''} ${e.reqId ? `id=${e.reqId}` : ''} :: ${e.msg ?? ''}${e.err ? ` «${e.err}»` : ''}${e.netUp === false ? ' [sin red]' : ''}${e.vis === 'hidden' ? ' [2º plano]' : ''}`)
    }
    return reply.send({ ok: true })
  })

  fastify.get('/db', async (_request, reply) => {
    const started = performance.now()
    try {
      await prisma.$queryRawUnsafe('SELECT 1')
      return reply.send({ ok: true, ms: Math.round(performance.now() - started) })
    } catch (err) {
      return reply.status(503).send({ ok: false, ms: Math.round(performance.now() - started), error: err instanceof Error ? err.message.slice(0, 300) : String(err) })
    }
  })
}
