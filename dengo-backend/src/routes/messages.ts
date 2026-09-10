import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'

const sendSchema = z.object({ body: z.string().min(1).max(2000) })

const userSelect = { id: true, name: true, email: true, role: true }

export default async function messagesRoutes(fastify: FastifyInstance) {
  const auth = { preHandler: [fastify.authenticate] }

  // ── Unread count (for sidebar badge) ─────────────────────────────────────────
  fastify.get('/unread', auth, async (request, reply) => {
    const me = (request.user as any).id
    const count = await prisma.internalMessage.count({ where: { toUserId: me, isRead: false } })
    return reply.send({ count })
  })

  // ── List of conversation partners (one entry per unique thread) ──────────────
  fastify.get('/threads', auth, async (request, reply) => {
    const me = (request.user as any).id

    // Collect IDs of all users we've exchanged messages with
    const sent = await prisma.internalMessage.findMany({
      where: { fromUserId: me },
      select: { toUserId: true, createdAt: true },
    })
    const received = await prisma.internalMessage.findMany({
      where: { toUserId: me },
      select: { fromUserId: true, createdAt: true },
    })

    const partnerIds = new Set([
      ...sent.map(m => m.toUserId),
      ...received.map(m => m.fromUserId),
    ])

    // Also include all other active users (so staff can start new threads)
    const allUsers = await prisma.user.findMany({
      where: { isActive: true, id: { not: me } },
      select: userSelect,
      orderBy: { name: 'asc' },
    })

    // Per thread: last message + unread count
    const threads = await Promise.all(
      allUsers.map(async u => {
        const last = await prisma.internalMessage.findFirst({
          where: {
            OR: [
              { fromUserId: me, toUserId: u.id },
              { fromUserId: u.id, toUserId: me },
            ],
          },
          orderBy: { createdAt: 'desc' },
        })
        const unread = await prisma.internalMessage.count({
          where: { fromUserId: u.id, toUserId: me, isRead: false },
        })
        return { user: u, lastMessage: last, unread, hasHistory: partnerIds.has(u.id) }
      })
    )

    // Sort: threads with history first (by lastMessage date), then alphabetically
    threads.sort((a, b) => {
      if (a.hasHistory && !b.hasHistory) return -1
      if (!a.hasHistory && b.hasHistory) return 1
      if (a.lastMessage && b.lastMessage) {
        return new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime()
      }
      return a.user.name.localeCompare(b.user.name)
    })

    return reply.send({ data: threads })
  })

  // ── Thread messages with a specific user ─────────────────────────────────────
  fastify.get('/threads/:userId', auth, async (request, reply) => {
    const me = (request.user as any).id
    const { userId } = request.params as { userId: string }

    const other = await prisma.user.findUnique({ where: { id: userId }, select: userSelect })
    if (!other) return reply.status(404).send({ error: 'Usuario no encontrado' })

    const messages = await prisma.internalMessage.findMany({
      where: {
        OR: [
          { fromUserId: me, toUserId: userId },
          { fromUserId: userId, toUserId: me },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    })

    // Mark incoming messages as read
    await prisma.internalMessage.updateMany({
      where: { fromUserId: userId, toUserId: me, isRead: false },
      data: { isRead: true, readAt: new Date() },
    })

    return reply.send({ data: messages, user: other })
  })

  // ── Send a message ────────────────────────────────────────────────────────────
  fastify.post('/threads/:userId', auth, async (request, reply) => {
    const me = (request.user as any).id
    const { userId } = request.params as { userId: string }

    const other = await prisma.user.findUnique({ where: { id: userId, isActive: true } })
    if (!other) return reply.status(404).send({ error: 'Usuario no encontrado' })
    if (userId === me) return reply.status(400).send({ error: 'No puedes enviarte mensajes a ti mismo' })

    const parsed = sendSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'El mensaje no puede estar vacío' })

    const msg = await prisma.internalMessage.create({
      data: { fromUserId: me, toUserId: userId, body: parsed.data.body },
    })

    return reply.status(201).send(msg)
  })
}
