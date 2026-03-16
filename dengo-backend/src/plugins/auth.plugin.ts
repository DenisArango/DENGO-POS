import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import jwt from '@fastify/jwt'
import { config } from '../config.js'

async function authPlugin(fastify: FastifyInstance) {
  await fastify.register(jwt, {
    secret: config.jwt.secret,
    sign: { expiresIn: config.jwt.expiresIn },
  })

  fastify.decorate('authenticate', async function (request, reply) {
    try {
      await request.jwtVerify()
    } catch {
      reply.status(401).send({ error: 'Token inválido o expirado' })
    }
  })
}

// fp() removes Fastify's encapsulation so the `authenticate` decorator
// is visible to all sibling route plugins registered after this one.
export default fp(authPlugin, { name: 'auth', fastify: '5.x' })
