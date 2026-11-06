// Public website API (no login): what dengo-web renders, and taking a
// coupon. Only data meant to be public leaves through here.

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { getLicense } from './license.js'
import { getSiteConfig, parseSections, publicBranches } from '../lib/site.js'
import { describePromotion, formatCode, normalizeCouponInput, promotionLive } from '../lib/promotions.js'
import { issueCoupon } from './website.js'
import { validateUser, logLogin } from '../services/auth.service.js'
import { checkLoginSchedule } from '../lib/permissions.js'
import { issueHandoff } from '../lib/handoff.js'

/** Which doors "Ingresar" on the site opens: the POS for staff, the portal for teachers. */
function siteAccess(license: { posEnabled: boolean; maestrosEnabled: boolean }, cfg: { posUrl: string | null; portalUrl: string | null }) {
  return {
    pos: license.posEnabled && cfg.posUrl ? cfg.posUrl : null,
    portal: license.maestrosEnabled && cfg.portalUrl ? cfg.portalUrl : null,
  }
}

function publicPromotion(p: { id: string; slug: string; name: string; description: string | null; terms: string | null; image: string | null; type: string; scope: string; percent: unknown; amount: unknown; specialPrice: unknown; buyQty: number | null; payQty: number | null; minPurchase: unknown; startsAt: Date | null; endsAt: Date | null; featured: boolean; maxCoupons: number | null }, couponsLeft?: number | null) {
  return {
    slug: p.slug,
    name: p.name,
    description: p.description,
    terms: p.terms,
    image: p.image,
    type: p.type,
    summary: describePromotion(p as never),
    percent: p.percent != null ? Number(p.percent) : null,
    amount: p.amount != null ? Number(p.amount) : null,
    specialPrice: p.specialPrice != null ? Number(p.specialPrice) : null,
    buyQty: p.buyQty, payQty: p.payQty,
    minPurchase: p.minPurchase != null ? Number(p.minPurchase) : null,
    startsAt: p.startsAt, endsAt: p.endsAt,
    featured: p.featured,
    couponsLeft: couponsLeft ?? null,
  }
}

async function livePromotions() {
  const now = new Date()
  const rows = await prisma.promotion.findMany({
    where: { isActive: true, showOnWebsite: true, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] },
    orderBy: [{ featured: 'desc' }, { endsAt: 'asc' }, { createdAt: 'desc' }],
  })
  const limited = rows.filter(r => r.maxCoupons)
  const used = limited.length
    ? await prisma.promotionCoupon.groupBy({ by: ['promotionId'], where: { promotionId: { in: limited.map(r => r.id) }, status: { not: 'VOID' } }, _count: { _all: true } })
    : []
  const usedBy = new Map(used.map(u => [u.promotionId, u._count._all]))
  return rows
    .map(r => publicPromotion(r, r.maxCoupons ? Math.max(0, r.maxCoupons - (usedBy.get(r.id) ?? 0)) : null))
    .filter(p => p.couponsLeft === null || p.couponsLeft > 0)
}

export default async function siteRoutes(fastify: FastifyInstance) {
  // Everything the site needs in one request (rendered on the server by
  // Astro; cached briefly by the browser/CDN).
  // GET /api/site/entry — where the POS should send people to sign in. When
  // the site is published with «Ingresar» pointing at the POS, the site's own
  // /ingresar is the front door (it signs them into the POS through a
  // one-time handoff), so the POS's /login forwards there. null = keep the
  // POS's own login (no site, not published, or no POS door).
  fastify.get('/entry', async (_request, reply) => {
    const license = await getLicense()
    if (!license.pageEnabled) return reply.send({ url: null })
    const cfg = await getSiteConfig()
    const url = cfg.published && cfg.publicUrl && cfg.posUrl ? `${cfg.publicUrl.replace(/\/+$/, '')}/ingresar` : null
    return reply.send({ url })
  })

  fastify.get('/content', async (_request, reply) => {
    const license = await getLicense()
    if (!license.pageEnabled) return reply.status(404).send({ error: 'Sitio no disponible' })
    const cfg = await getSiteConfig()
    const company = await prisma.companyProfile.findFirst({ select: { name: true, logo: true } }).catch(() => null)
    const [branches, promotions, categories] = await Promise.all([
      publicBranches(cfg.branchIds),
      livePromotions(),
      prisma.category.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 40 }),
    ])
    return reply.header('Cache-Control', 'public, max-age=60').send({
      site: cfg.site,
      theme: cfg.theme,
      published: cfg.published,
      publicUrl: cfg.publicUrl,
      businessName: cfg.businessName || company?.name || 'Nuestra tienda',
      tagline: cfg.tagline,
      about: cfg.about,
      heroTitle: cfg.heroTitle,
      heroSubtitle: cfg.heroSubtitle,
      heroImage: cfg.heroImage,
      logo: cfg.logo || (company?.logo?.startsWith('data:image/') && !company.logo.startsWith('data:image/x-icon') ? company.logo : null),
      primaryColor: cfg.primaryColor,
      accentColor: cfg.accentColor,
      sections: parseSections(cfg.sections).filter(s => s.enabled),
      contact: { whatsapp: cfg.whatsapp, phone: cfg.phone, email: cfg.email, facebook: cfg.facebook, instagram: cfg.instagram, tiktok: cfg.tiktok },
      seo: { title: cfg.seoTitle, description: cfg.seoDescription },
      branches,
      promotions,
      categories,
      access: (({ pos, portal }) => ({ staff: !!pos, teachers: !!portal }))(siteAccess(license, cfg)),
      updatedAt: cfg.updatedAt,
    })
  })

  // "Ingresar" on the website: one form for staff and teachers. The role
  // decides where the person goes; they arrive there with a one-time code
  // (lib/handoff.ts), never with the session token in the address.
  fastify.post('/login', { config: { rateLimit: { max: 10, timeWindow: 60_000 } } }, async (request, reply) => {
    const body = z.object({ email: z.string().trim().email('Escribe tu correo'), password: z.string().min(1, 'Escribe tu contraseña') }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message ?? 'Correo y contraseña requeridos' })
    const license = await getLicense()
    const cfg = await getSiteConfig()
    const doors = siteAccess(license, cfg)
    if (!license.pageEnabled || (!doors.pos && !doors.portal)) return reply.status(404).send({ error: 'El acceso no está disponible en esta página.' })

    const { email, password } = body.data
    const ip = request.ip
    const ua = request.headers['user-agent']
    try {
      const user = await validateUser(email, password)
      const app = user.role === 'TEACHER' ? 'portal' : 'pos'
      const base = doors[app]
      if (!base) {
        await logLogin({ email, userId: user.id, success: false, ipAddress: ip, ...(ua && { userAgent: ua }), failReason: `Sitio web: ${app} no disponible` })
        return reply.status(403).send({ error: app === 'portal' ? 'El portal de maestros no está disponible por ahora.' : 'Tu cuenta no puede entrar desde aquí. Pide la dirección del sistema a tu encargado.' })
      }
      if (app === 'pos') await checkLoginSchedule(user)
      await logLogin({ email, userId: user.id, success: true, ipAddress: ip, ...(ua && { userAgent: ua }) })
      return reply.header('Cache-Control', 'no-store').send({
        app,
        name: user.name.split(/\s+/)[0],
        redirect: `${base}/entrar#c=${issueHandoff(user.id, app)}`,
      })
    } catch (err: any) {
      await logLogin({ email, success: false, ipAddress: ip, ...(ua && { userAgent: ua }), ...(err.message && { failReason: err.message }) })
      const message = typeof err.message === 'string' ? err.message : ''
      const isActionable = message.startsWith('Cuenta bloqueada') || message.startsWith('Fuera de horario')
      return reply.status(401).send({ error: isActionable ? message : 'Correo o contraseña incorrectos' })
    }
  })

  fastify.get('/promotions/:slug', async (request, reply) => {
    const p = await prisma.promotion.findUnique({ where: { slug: (request.params as { slug: string }).slug } })
    if (!p || !p.showOnWebsite) return reply.status(404).send({ error: 'Oferta no encontrada' })
    const used = p.maxCoupons ? await prisma.promotionCoupon.count({ where: { promotionId: p.id, status: { not: 'VOID' } } }) : 0
    return reply.send({ ...publicPromotion(p, p.maxCoupons ? Math.max(0, p.maxCoupons - used) : null), live: promotionLive(p) })
  })

  // Take a coupon. Strict per-IP limit on top of the per-phone limit.
  fastify.post('/promotions/:slug/coupons', { config: { rateLimit: { max: 6, timeWindow: 10 * 60_000 } } }, async (request, reply) => {
    const body = z.object({
      name: z.string().trim().min(2, 'Escribe tu nombre').max(120),
      phone: z.string().trim().min(8, 'Escribe tu teléfono').max(20),
      email: z.string().trim().email('Correo inválido').max(150).nullish().or(z.literal('')),
      // Honeypot: bots fill every field.
      website: z.string().max(0).optional(),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message ?? 'Datos inválidos' })
    const p = await prisma.promotion.findUnique({ where: { slug: (request.params as { slug: string }).slug }, select: { id: true, showOnWebsite: true } })
    if (!p || !p.showOnWebsite) return reply.status(404).send({ error: 'Oferta no encontrada' })
    const r = await issueCoupon(p.id, { name: body.data.name, phone: body.data.phone, email: body.data.email || null }, 'WEB', String(request.headers['user-agent'] ?? ''))
    return reply.status(r.reused ? 200 : 201).send({ code: r.coupon.code, display: formatCode(r.coupon.code), reused: r.reused })
  })

  // The coupon page (/cupon/<code>): the code itself is the secret.
  fastify.get('/coupons/:code', async (request, reply) => {
    const code = normalizeCouponInput((request.params as { code: string }).code)
    if (!code) return reply.status(404).send({ error: 'Cupón no encontrado' })
    const c = await prisma.promotionCoupon.findUnique({ where: { code }, include: { promotion: true } })
    if (!c) return reply.status(404).send({ error: 'Cupón no encontrado' })
    const expired = c.status === 'ISSUED' && !!c.expiresAt && c.expiresAt < new Date()
    return reply.header('Cache-Control', 'no-store').send({
      code: c.code,
      display: formatCode(c.code),
      payload: `CUP-${c.code}`,
      status: expired ? 'EXPIRED' : c.status,
      firstName: c.name.split(/\s+/)[0],
      issuedAt: c.issuedAt,
      expiresAt: c.expiresAt,
      redeemedAt: c.redeemedAt,
      promotion: publicPromotion(c.promotion),
    })
  })
}
