import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import jwt from '@fastify/jwt'
import { config } from '../config.js'
import { prisma } from '../lib/prisma.js'

// A token stays valid for up to 24h, so without this a user who was
// deactivated (or whose role changed) kept full access until it expired.
// Looked up per request, cached briefly so the polling screens don't turn
// every request into an extra query.
const USER_CACHE_MS = 30_000
const userCache = new Map<string, { at: number; isActive: boolean; role: string }>()

/** Call after deactivating a user or changing their role: effective at once. */
export function forgetUserSession(id: string) {
  userCache.delete(id)
}

async function currentUser(id: string) {
  const hit = userCache.get(id)
  if (hit && Date.now() - hit.at < USER_CACHE_MS) return hit
  const u = await prisma.user.findUnique({ where: { id }, select: { isActive: true, role: true } })
  const entry = { at: Date.now(), isActive: !!u?.isActive, role: u?.role ?? '' }
  userCache.set(id, entry)
  if (userCache.size > 5000) userCache.clear()
  return entry
}

async function authPlugin(fastify: FastifyInstance) {
  await fastify.register(jwt, {
    secret: config.jwt.secret,
    sign: { expiresIn: config.jwt.expiresIn },
  })

  fastify.decorate('authenticate', async function (request, reply) {
    try {
      await request.jwtVerify()
    } catch {
      return reply.status(401).send({ error: 'Token inválido o expirado' })
    }

    const { id, role } = request.user as { id: string; role: string }
    const u = await currentUser(id)
    if (!u.isActive || u.role !== role) {
      return reply.status(401).send({ error: 'Tu sesión ya no es válida. Inicia sesión de nuevo.' })
    }

    // Teacher tokens are signed with the same secret as staff tokens; they
    // must only ever reach the teacher portal API, never the POS one
    // (reports, sales, customers…).
    if (role === 'TEACHER' && !request.url.startsWith('/api/portal/')) {
      return reply.status(403).send({ error: 'Acceso denegado' })
    }
  })
}

// fp() removes Fastify's encapsulation so the `authenticate` decorator
// is visible to all sibling route plugins registered after this one.
export default fp(authPlugin, { name: 'auth', fastify: '5.x' })
