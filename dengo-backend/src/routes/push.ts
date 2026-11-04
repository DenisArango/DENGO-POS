// Web Push for POS staff: each user turns notifications on per device from
// the bell menu. What gets sent is decided in lib/staffAlerts.ts.
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { getVapidKeys, notifyUsers } from '../lib/webPush.js'

export default async function pushRoutes(fastify: FastifyInstance) {
  const auth = { preHandler: [fastify.authenticate] }

  fastify.get('/public-key', auth, async (_request, reply) => {
    const { publicKey } = await getVapidKeys()
    return reply.send({ publicKey })
  })

  fastify.post('/subscribe', auth, async (request, reply) => {
    const body = z.object({
      endpoint: z.string().url().max(1000),
      keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'Suscripción inválida' })
    const userAgent = String(request.headers['user-agent'] ?? '').slice(0, 300) || null
    const data = { userId: request.user.id, p256dh: body.data.keys.p256dh, auth: body.data.keys.auth, userAgent }
    // The endpoint identifies the device: if another user logged in on this
    // browser before, the device now belongs to whoever subscribed last.
    await prisma.userPushSubscription.upsert({
      where: { endpoint: body.data.endpoint },
      create: { endpoint: body.data.endpoint, ...data },
      update: data,
    })
    return reply.status(201).send({ ok: true })
  })

  fastify.post('/unsubscribe', auth, async (request, reply) => {
    const body = z.object({ endpoint: z.string().max(1000) }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'Datos inválidos' })
    await prisma.userPushSubscription.deleteMany({ where: { endpoint: body.data.endpoint, userId: request.user.id } })
    return reply.send({ ok: true })
  })

  fastify.get('/status', auth, async (request, reply) => {
    const devices = await prisma.userPushSubscription.count({ where: { userId: request.user.id } })
    return reply.send({ devices })
  })

  fastify.post('/test', { ...auth, config: { rateLimit: { max: 5, timeWindow: 60_000 } } }, async (request, reply) => {
    const sent = await notifyUsers([request.user.id], {
      title: 'Notificaciones activadas',
      body: 'Así te llegarán los avisos del sistema en este dispositivo.',
      url: '/dashboard',
      tag: 'push-test',
    })
    return reply.send({ sent })
  })
}
