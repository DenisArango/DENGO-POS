import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requirePermission } from '../lib/permissions.js'

// Defaults returned the first time a value is read, before an admin has ever
// saved one — lets the frontend render something sensible without a manual
// seed step, and matches what the (previously disconnected) settings pages
// showed as their starting mock values.
const DEFAULT_PAYMENT_METHODS = [
  { method: 'CASH', enabled: true, commission: 0 },
  { method: 'CARD', enabled: true, commission: 2.5 },
  { method: 'TRANSFER', enabled: true, commission: 0 },
  // Paused per product decision — see POS.tsx and Documentación Técnica → Modelo de datos (Venta mixta).
  // Flip `enabled` to true here (or from Configuración → Métodos de Pago) to bring it back.
  { method: 'MIXED', enabled: false, commission: 0 },
]

const DEFAULT_NOTIFICATIONS = [
  { event: 'low_stock', email: true, push: true, sms: false },
  { event: 'out_of_stock', email: true, push: true, sms: true },
  { event: 'new_sale', email: false, push: false, sms: false },
  { event: 'new_user', email: true, push: false, sms: false },
]

const companySchema = z.object({
  name: z.string().min(1),
  // nullish: the settings page round-trips a fetched profile straight back
  // into this payload, and every one of these columns is nullable — once a
  // profile exists with any field unset, GET returns `null` for it and the
  // next save resends that `null`, which plain .optional() rejects.
  legalName: z.string().nullish(),
  taxId: z.string().nullish(),
  industry: z.string().nullish(),
  description: z.string().nullish(),
  address: z.string().nullish(),
  city: z.string().nullish(),
  country: z.string().nullish(),
  phone: z.string().nullish(),
  email: z.union([z.string().email(), z.literal('')]).nullish(),
  website: z.string().nullish(),
  logo: z.string().max(3_000_000).nullish(), // cap a base64 logo well above what a reasonable image needs
})

export default async function settingsRoutes(fastify: FastifyInstance) {
  // ── Company profile ─────────────────────────────────────────────────────
  fastify.get('/company', { preHandler: [fastify.authenticate] }, async (_request, reply) => {
    const profile = await prisma.companyProfile.findFirst()
    return reply.send(profile ?? { name: 'Mi Empresa' })
  })

  fastify.put('/company', { preHandler: [fastify.authenticate, requirePermission('settings.system')] }, async (request, reply) => {
    const body = companySchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    // Drop undefined keys — exactOptionalPropertyTypes rejects passing an
    // explicit `undefined` where Prisma expects the key to simply be absent.
    const data: any = Object.fromEntries(Object.entries(body.data).filter(([, v]) => v !== undefined))

    const existing = await prisma.companyProfile.findFirst()
    const profile = existing
      ? await prisma.companyProfile.update({ where: { id: existing.id }, data })
      : await prisma.companyProfile.create({ data })

    return reply.send(profile)
  })

  // ── Payment methods (enabled + informational commission %) ─────────────
  fastify.get('/payment-methods', { preHandler: [fastify.authenticate] }, async (_request, reply) => {
    const rows = await prisma.paymentMethodSetting.findMany()
    const byMethod = new Map(rows.map(r => [r.method, r]))
    return reply.send(DEFAULT_PAYMENT_METHODS.map(d => {
      const row = byMethod.get(d.method)
      return row ? { method: row.method, enabled: row.enabled, commission: Number(row.commission) } : d
    }))
  })

  fastify.put('/payment-methods', { preHandler: [fastify.authenticate, requirePermission('settings.system')] }, async (request, reply) => {
    const body = z.array(z.object({
      method: z.enum(['CASH', 'CARD', 'TRANSFER', 'MIXED']),
      enabled: z.boolean(),
      commission: z.number().min(0).max(100),
    })).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    await Promise.all(body.data.map(m => prisma.paymentMethodSetting.upsert({
      where: { method: m.method },
      create: m,
      update: { enabled: m.enabled, commission: m.commission },
    })))

    return reply.send({ message: 'Métodos de pago actualizados' })
  })

  // ── Notification preferences ────────────────────────────────────────────
  fastify.get('/notifications', { preHandler: [fastify.authenticate] }, async (_request, reply) => {
    const rows = await prisma.notificationPreference.findMany()
    const byEvent = new Map(rows.map(r => [r.event, r]))
    return reply.send(DEFAULT_NOTIFICATIONS.map(d => byEvent.get(d.event) ?? d))
  })

  fastify.put('/notifications', { preHandler: [fastify.authenticate, requirePermission('settings.system')] }, async (request, reply) => {
    const body = z.array(z.object({
      event: z.enum(['low_stock', 'out_of_stock', 'new_sale', 'new_user']),
      email: z.boolean(),
      push: z.boolean(),
      sms: z.boolean(),
    })).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    await Promise.all(body.data.map(n => prisma.notificationPreference.upsert({
      where: { event: n.event },
      create: n,
      update: { email: n.email, push: n.push, sms: n.sms },
    })))

    return reply.send({ message: 'Preferencias de notificación actualizadas' })
  })
}
