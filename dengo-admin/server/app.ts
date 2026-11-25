import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { Config } from './config.js'
import { authRoutes } from './auth.js'

export type RouteModule = (app: import('fastify').FastifyInstance, opts: { config: Config }) => Promise<void>

export async function buildApp(config: Config, routes: RouteModule[] = []) {
  const app = Fastify({ logger: process.env.NODE_ENV === 'test' ? false : { level: 'warn' }, bodyLimit: 5 * 1024 * 1024 })
  // Actions are POSTs with nothing to send: an empty JSON body means {}.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const text = String(body ?? '').trim()
    if (!text) return done(null, {})
    try { done(null, JSON.parse(text)) } catch { done(Object.assign(new Error('JSON inválido'), { statusCode: 400 }), undefined) }
  })
  await app.register(cookie, { secret: config.sessionSecret })
  await app.register(rateLimit, { global: false })
  await app.register(multipart, { limits: { fileSize: 300 * 1024 * 1024, files: 4 } })
  await app.register(async (scope) => {
    await authRoutes(scope, { config })
    for (const r of routes) await r(scope, { config })
  })

  // The built UI (vite → dist/web). Deep links fall back to index.html.
  const here = dirname(fileURLToPath(import.meta.url))
  const webDist = [join(here, 'web'), join(here, '..', 'dist', 'web')].find(p => existsSync(join(p, 'index.html')))
  if (webDist) {
    await app.register(fastifyStatic, { root: webDist }) // wildcard: files are looked up per request, so a rebuild needs no restart
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.status(404).send({ error: 'No existe' })
      return reply.sendFile('index.html')
    })
  }
  return app
}
