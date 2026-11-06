// Módulo "Página web" (POS admin): site content, offers, coupons, reports,
// and the POS-side coupon check. Public endpoints live in routes/site.ts.

import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { requirePermission, hasPermission } from '../lib/permissions.js'
import { canAccessBranch } from '../lib/branch-scope.js'
import {
  PROMO_TYPES, PROMO_SCOPES, computePromotion, checkCoupon, describePromotion, newCouponCode, formatCode,
  normalizePhone, couponExpiry, promotionLive, parseIds, round2,
} from '../lib/promotions.js'
import { BLOCK_TYPES, THEMES, getSiteConfig, parseSections } from '../lib/site.js'
import { compressDataUrl } from '../lib/siteImages.js'
import { log } from '../services/audit.service.js'

const BIG_BODY = { bodyLimit: 12 * 1024 * 1024 } // images travel as data URLs

const idList = z.array(z.string().min(1)).max(500)
const money = z.number().min(0).max(10_000_000)

const promotionSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().max(4000).nullish(),
  terms: z.string().max(4000).nullish(),
  image: z.string().nullish(),
  type: z.enum(PROMO_TYPES),
  scope: z.enum(PROMO_SCOPES).default('ALL'),
  productIds: idList.default([]),
  categoryIds: idList.default([]),
  branchIds: idList.default([]),
  percent: z.number().min(0.01).max(100).nullish(),
  amount: money.nullish(),
  specialPrice: money.nullish(),
  buyQty: z.number().int().min(2).max(100).nullish(),
  payQty: z.number().int().min(1).max(99).nullish(),
  minPurchase: money.nullish(),
  maxDiscount: money.nullish(),
  allowManualDiscount: z.boolean().default(false),
  startsAt: z.string().datetime({ offset: true }).nullish(),
  endsAt: z.string().datetime({ offset: true }).nullish(),
  isActive: z.boolean().default(true),
  showOnWebsite: z.boolean().default(true),
  featured: z.boolean().default(false),
  maxCoupons: z.number().int().min(1).max(1_000_000).nullish(),
  perPhoneLimit: z.number().int().min(1).max(100).default(1),
  couponValidDays: z.number().int().min(1).max(365).nullish(),
}).superRefine((p, ctx) => {
  const need = (field: keyof typeof p, msg: string) => { if (p[field] == null) ctx.addIssue({ code: 'custom', path: [field], message: msg }) }
  if (p.type === 'PERCENT') need('percent', 'Indica el porcentaje')
  if (p.type === 'FIXED') need('amount', 'Indica el monto del descuento')
  if (p.type === 'SPECIAL_PRICE') {
    need('specialPrice', 'Indica el precio especial')
    if (p.scope === 'ALL') ctx.addIssue({ code: 'custom', path: ['scope'], message: 'El precio especial debe aplicar a productos o categorías concretas' })
  }
  if (p.type === 'BUY_X_GET_Y') {
    need('buyQty', 'Indica cuántos lleva'); need('payQty', 'Indica cuántos paga')
    if (p.buyQty != null && p.payQty != null && p.payQty >= p.buyQty) ctx.addIssue({ code: 'custom', path: ['payQty'], message: '"Paga" debe ser menor que "lleva"' })
  }
  if (p.scope === 'PRODUCT' && p.productIds.length === 0) ctx.addIssue({ code: 'custom', path: ['productIds'], message: 'Elige al menos un producto' })
  if (p.scope === 'CATEGORY' && p.categoryIds.length === 0) ctx.addIssue({ code: 'custom', path: ['categoryIds'], message: 'Elige al menos una categoría' })
  if (p.startsAt && p.endsAt && new Date(p.endsAt) <= new Date(p.startsAt)) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'La fecha final debe ser posterior a la inicial' })
})

function slugify(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'oferta'
}

async function uniqueSlug(name: string, exceptId?: string) {
  const base = slugify(name)
  for (let n = 0; n < 50; n++) {
    const slug = n === 0 ? base : `${base}-${n + 1}`
    const hit = await prisma.promotion.findUnique({ where: { slug }, select: { id: true } })
    if (!hit || hit.id === exceptId) return slug
  }
  return `${base}-${Date.now().toString(36)}`
}

const firstError = (e: z.ZodError) => e.issues[0]?.message ?? 'Datos inválidos'

async function promotionData(d: z.infer<typeof promotionSchema>) {
  return {
    name: d.name,
    description: d.description ?? null,
    terms: d.terms ?? null,
    image: (await compressDataUrl(d.image ?? null, 1400)) ?? null,
    type: d.type,
    scope: d.scope,
    productIds: d.scope === 'PRODUCT' ? JSON.stringify(d.productIds) : null,
    categoryIds: d.scope === 'CATEGORY' ? JSON.stringify(d.categoryIds) : null,
    branchIds: d.branchIds.length ? JSON.stringify(d.branchIds) : null,
    percent: d.type === 'PERCENT' ? d.percent ?? null : null,
    amount: d.type === 'FIXED' ? d.amount ?? null : null,
    specialPrice: d.type === 'SPECIAL_PRICE' ? d.specialPrice ?? null : null,
    buyQty: d.type === 'BUY_X_GET_Y' ? d.buyQty ?? null : null,
    payQty: d.type === 'BUY_X_GET_Y' ? d.payQty ?? null : null,
    minPurchase: d.minPurchase ?? null,
    maxDiscount: d.maxDiscount ?? null,
    allowManualDiscount: d.allowManualDiscount,
    startsAt: d.startsAt ? new Date(d.startsAt) : null,
    endsAt: d.endsAt ? new Date(d.endsAt) : null,
    isActive: d.isActive,
    showOnWebsite: d.showOnWebsite,
    featured: d.featured,
    maxCoupons: d.maxCoupons ?? null,
    perPhoneLimit: d.perPhoneLimit,
    couponValidDays: d.couponValidDays ?? null,
  }
}

function serializePromotion(p: Prisma.PromotionGetPayload<object>, stats?: { issued: number; redeemed: number }) {
  return {
    ...p,
    productIds: parseIds(p.productIds),
    categoryIds: parseIds(p.categoryIds),
    branchIds: parseIds(p.branchIds),
    summary: describePromotion(p),
    live: promotionLive(p),
    ...(stats ?? {}),
  }
}

/** Issues one coupon, enforcing the per-phone and total limits. */
export async function issueCoupon(promotionId: string, input: { name: string; phone: string; email?: string | null | undefined }, source: 'WEB' | 'POS', userAgent?: string | null) {
  const promotion = await prisma.promotion.findUnique({ where: { id: promotionId } })
  if (!promotion || !promotionLive(promotion)) throw Object.assign(new Error('Esta oferta ya no está disponible'), { statusCode: 410 })
  const phone = normalizePhone(input.phone)
  if (phone.length < 8) throw Object.assign(new Error('Escribe un número de teléfono válido (8 dígitos)'), { statusCode: 400 })
  const [byPhone, total] = await Promise.all([
    prisma.promotionCoupon.count({ where: { promotionId, phone, status: { not: 'VOID' } } }),
    promotion.maxCoupons ? prisma.promotionCoupon.count({ where: { promotionId, status: { not: 'VOID' } } }) : Promise.resolve(0),
  ])
  if (byPhone >= promotion.perPhoneLimit) {
    // Give back the coupon they already have instead of a dead end.
    const existing = await prisma.promotionCoupon.findFirst({ where: { promotionId, phone, status: 'ISSUED' }, orderBy: { issuedAt: 'desc' } })
    if (existing) return { coupon: existing, promotion, reused: true }
    throw Object.assign(new Error('Este número ya usó esta oferta'), { statusCode: 409 })
  }
  if (promotion.maxCoupons && total >= promotion.maxCoupons) throw Object.assign(new Error('Se agotaron los cupones de esta oferta'), { statusCode: 410 })
  const customer = await prisma.customer.findFirst({ where: { phone: { contains: phone } }, select: { id: true } }).catch(() => null)
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const coupon = await prisma.promotionCoupon.create({
        data: {
          code: newCouponCode(),
          promotionId,
          name: input.name.trim().slice(0, 120),
          phone,
          email: input.email?.trim() || null,
          source,
          expiresAt: couponExpiry(promotion),
          customerId: customer?.id ?? null,
          userAgent: userAgent?.slice(0, 300) ?? null,
        },
      })
      return { coupon, promotion, reused: false }
    } catch (err: any) {
      if (err?.code !== 'P2002') throw err // code collision: try another
    }
  }
  throw new Error('No se pudo generar el cupón')
}

// Business-day bounds in Guatemala (UTC-6).
function rangeFrom(q: { from?: string; to?: string }) {
  const toDay = (s: string, end: boolean) => new Date(`${s}T${end ? '23:59:59.999' : '00:00:00'}-06:00`)
  const now = new Date()
  const from = q.from && /^\d{4}-\d{2}-\d{2}$/.test(q.from) ? toDay(q.from, false) : new Date(now.getTime() - 30 * 86_400_000)
  const to = q.to && /^\d{4}-\d{2}-\d{2}$/.test(q.to) ? toDay(q.to, true) : now
  return { from, to }
}

const canManagePromotions = (r: FastifyRequest) => hasPermission(r, 'promotions.manage')

export default async function websiteRoutes(fastify: FastifyInstance) {
  const auth = fastify.authenticate
  const site = { preHandler: [auth, requirePermission('website.manage')] }
  const promos = { preHandler: [auth, requirePermission('promotions.manage')] }
  const reports = { preHandler: [auth, requirePermission('promotions.reports')] }

  // ── Site content ───────────────────────────────────────────────────────────
  fastify.get('/config', site, async (_request, reply) => {
    const cfg = await getSiteConfig()
    return reply.send({ ...cfg, sections: parseSections(cfg.sections), branchIds: parseIds(cfg.branchIds), themes: THEMES, blockTypes: BLOCK_TYPES })
  })

  fastify.put('/config', { ...site, ...BIG_BODY }, async (request, reply) => {
    const url = z.string().trim().max(200).nullish()
    const color = z.string().regex(/^#[0-9a-fA-F]{6}$/).nullish()
    // Address of the POS / teachers' portal: an http(s) origin, no trailing slash; '' clears it.
    const appUrl = (what: string) => z.union([z.literal(''), z.string().trim().url(`Dirección del ${what} inválida`).max(200).refine(v => /^https?:\/\//.test(v), `Dirección del ${what} inválida`)])
      .nullish().transform(v => (v === '' ? null : v?.replace(/\/+$/, '')))
    const body = z.object({
      site: z.string().trim().regex(/^[a-z0-9-]{2,60}$/).optional(),
      theme: z.enum(THEMES).optional(),
      published: z.boolean().optional(),
      publicUrl: url,
      posUrl: appUrl('POS'),
      portalUrl: appUrl('portal'),
      businessName: z.string().trim().max(150).nullish(),
      tagline: z.string().trim().max(200).nullish(),
      about: z.string().max(8000).nullish(),
      heroTitle: z.string().trim().max(200).nullish(),
      heroSubtitle: z.string().trim().max(400).nullish(),
      heroImage: z.string().nullish(),
      logo: z.string().nullish(),
      primaryColor: color,
      accentColor: color,
      sections: z.array(z.object({
        id: z.string().min(1).max(40),
        type: z.enum(BLOCK_TYPES),
        enabled: z.boolean(),
        props: z.record(z.unknown()).default({}),
      })).max(40).optional(),
      whatsapp: z.string().trim().max(30).nullish(),
      phone: z.string().trim().max(30).nullish(),
      email: z.string().trim().max(150).nullish(),
      facebook: url, instagram: url, tiktok: url,
      seoTitle: z.string().trim().max(120).nullish(),
      seoDescription: z.string().trim().max(300).nullish(),
      branchIds: idList.optional(),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: firstError(body.error) })
    const cfg = await getSiteConfig()
    const { sections, branchIds, heroImage, logo, ...rest } = body.data
    // Gallery images inside the blocks are compressed too.
    const cleanSections = sections ? await Promise.all(sections.map(async b => {
      if (b.type !== 'gallery' || !Array.isArray(b.props.images)) return b
      const images = await Promise.all((b.props.images as unknown[]).slice(0, 24).map(async img => {
        const o = (img && typeof img === 'object' ? img : { src: img }) as { src?: string; caption?: string }
        return { src: await compressDataUrl(o.src ?? null, 1600), caption: String(o.caption ?? '').slice(0, 140) }
      }))
      return { ...b, props: { ...b.props, images: images.filter(i => i.src) } }
    })) : undefined
    const data: Prisma.SiteConfigUpdateInput = Object.fromEntries(Object.entries({
      ...rest,
      ...(heroImage !== undefined ? { heroImage: await compressDataUrl(heroImage, 2000) } : {}),
      ...(logo !== undefined ? { logo: await compressDataUrl(logo, 800) } : {}),
      ...(cleanSections ? { sections: JSON.stringify(cleanSections) } : {}),
      ...(branchIds ? { branchIds: branchIds.length ? JSON.stringify(branchIds) : null } : {}),
    }).filter(([, v]) => v !== undefined))
    const updated = await prisma.siteConfig.update({ where: { id: cfg.id }, data })
    await log({ userId: request.user.id, action: 'UPDATE', entity: 'SiteConfig', entityId: cfg.id })
    return reply.send({ ...updated, sections: parseSections(updated.sections), branchIds: parseIds(updated.branchIds) })
  })

  // ── Offers ─────────────────────────────────────────────────────────────────
  fastify.get('/promotions', { preHandler: [auth] }, async (request, reply) => {
    if (!canManagePromotions(request) && !hasPermission(request, 'promotions.reports')) return reply.status(403).send({ error: 'Acceso denegado' })
    const rows = await prisma.promotion.findMany({ orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }] })
    const counts = await prisma.promotionCoupon.groupBy({ by: ['promotionId', 'status'], _count: { _all: true } })
    const stat = (id: string, st?: string) => counts.filter(c => c.promotionId === id && (!st || c.status === st)).reduce((s, c) => s + c._count._all, 0)
    return reply.send(rows.map(p => serializePromotion(p, { issued: stat(p.id) - stat(p.id, 'VOID'), redeemed: stat(p.id, 'REDEEMED') })))
  })

  fastify.get('/promotions/:id', promos, async (request, reply) => {
    const p = await prisma.promotion.findUnique({ where: { id: (request.params as { id: string }).id } })
    if (!p) return reply.status(404).send({ error: 'Oferta no encontrada' })
    return reply.send(serializePromotion(p))
  })

  fastify.post('/promotions', { ...promos, ...BIG_BODY }, async (request, reply) => {
    const body = promotionSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: firstError(body.error) })
    const p = await prisma.promotion.create({ data: { ...(await promotionData(body.data)), slug: await uniqueSlug(body.data.name), createdById: request.user.id } })
    await log({ userId: request.user.id, action: 'CREATE', entity: 'Promotion', entityId: p.id })
    return reply.status(201).send(serializePromotion(p))
  })

  fastify.put('/promotions/:id', { ...promos, ...BIG_BODY }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = promotionSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: firstError(body.error) })
    const existing = await prisma.promotion.findUnique({ where: { id } })
    if (!existing) return reply.status(404).send({ error: 'Oferta no encontrada' })
    const slug = existing.name === body.data.name ? existing.slug : await uniqueSlug(body.data.name, id)
    const p = await prisma.promotion.update({ where: { id }, data: { ...(await promotionData(body.data)), slug } })
    await log({ userId: request.user.id, action: 'UPDATE', entity: 'Promotion', entityId: id })
    return reply.send(serializePromotion(p))
  })

  // Deleting an offer that already has coupons would erase its history (and
  // the sales' trail), so those are only deactivated.
  fastify.delete('/promotions/:id', promos, async (request, reply) => {
    const { id } = request.params as { id: string }
    const used = await prisma.promotionCoupon.count({ where: { promotionId: id } })
    if (used > 0) {
      await prisma.promotion.update({ where: { id }, data: { isActive: false, showOnWebsite: false } })
      await log({ userId: request.user.id, action: 'UPDATE', entity: 'Promotion', entityId: id })
      return reply.send({ deactivated: true, message: 'La oferta ya tiene cupones: se desactivó para conservar su historial' })
    }
    await prisma.promotion.delete({ where: { id } }).catch(() => null)
    await log({ userId: request.user.id, action: 'DELETE', entity: 'Promotion', entityId: id })
    return reply.send({ deleted: true })
  })

  // ── Coupons ────────────────────────────────────────────────────────────────
  fastify.get('/coupons', { preHandler: [auth] }, async (request, reply) => {
    if (!canManagePromotions(request) && !hasPermission(request, 'promotions.reports')) return reply.status(403).send({ error: 'Acceso denegado' })
    const q = request.query as { promotionId?: string; status?: string; search?: string; page?: string; limit?: string }
    const limit = Math.min(200, Math.max(1, Number(q.limit) || 50))
    const page = Math.max(1, Number(q.page) || 1)
    const search = q.search?.trim()
    const where: Prisma.PromotionCouponWhereInput = {
      ...(q.promotionId ? { promotionId: q.promotionId } : {}),
      ...(q.status === 'EXPIRED' ? { status: 'ISSUED', expiresAt: { lt: new Date() } }
        : q.status === 'ISSUED' ? { status: 'ISSUED', OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }] }
        : q.status ? { status: q.status } : {}),
      ...(search ? { AND: [{ OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search.replace(/\D/g, '') || search } },
        { code: { contains: search.toUpperCase().replace(/[^A-Z0-9]/g, '') || search } },
      ] }] } : {}),
    }
    const [total, rows] = await Promise.all([
      prisma.promotionCoupon.count({ where }),
      prisma.promotionCoupon.findMany({
        where, orderBy: { issuedAt: 'desc' }, skip: (page - 1) * limit, take: limit,
        include: {
          promotion: { select: { id: true, name: true } },
          sale: { select: { id: true, invoiceNumber: true, total: true, branch: { select: { name: true } } } },
        },
      }),
    ])
    const now = new Date()
    return reply.send({
      total, page, limit,
      data: rows.map(c => ({
        ...c,
        display: formatCode(c.code),
        effectiveStatus: c.status === 'ISSUED' && c.expiresAt && c.expiresAt < now ? 'EXPIRED' : c.status,
      })),
    })
  })

  // A cashier/admin issues a coupon in person (e.g. over the phone).
  fastify.post('/coupons', promos, async (request, reply) => {
    const body = z.object({
      promotionId: z.string().min(1),
      name: z.string().trim().min(2).max(120),
      phone: z.string().trim().min(8).max(20),
      email: z.string().trim().email().max(150).nullish(),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: firstError(body.error) })
    const r = await issueCoupon(body.data.promotionId, body.data, 'POS', null)
    return reply.status(r.reused ? 200 : 201).send({ ...r.coupon, display: formatCode(r.coupon.code), reused: r.reused })
  })

  fastify.post('/coupons/:id/void', promos, async (request, reply) => {
    const { id } = request.params as { id: string }
    const r = await prisma.promotionCoupon.updateMany({ where: { id, status: 'ISSUED' }, data: { status: 'VOID' } })
    if (r.count === 0) return reply.status(409).send({ error: 'Solo se puede anular un cupón que no se ha usado' })
    await log({ userId: request.user.id, action: 'UPDATE', entity: 'PromotionCoupon', entityId: id })
    return reply.send({ ok: true })
  })

  // POS: check a scanned/typed coupon against the current cart.
  fastify.post('/coupons/validate', { preHandler: [auth, requirePermission('sales.create')] }, async (request, reply) => {
    const body = z.object({
      code: z.string().min(4).max(300),
      branchId: z.string().min(1),
      items: z.array(z.object({
        productId: z.string().min(1),
        variationId: z.string().nullish(),
        quantity: z.number().min(0.001),
        unitPrice: z.number().min(0),
        discount: z.number().min(0).max(1).default(0),
      })).max(500).default([]),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: firstError(body.error) })
    if (!canAccessBranch(request, body.data.branchId)) return reply.status(403).send({ error: 'Acceso denegado' })
    const check = await checkCoupon(body.data.code, body.data.branchId)
    if (!check.ok) return reply.status(422).send({ error: check.error, code: check.code })
    const { coupon } = check
    const p = coupon.promotion
    const base = {
      coupon: { id: coupon.id, code: coupon.code, display: formatCode(coupon.code), name: coupon.name, phone: coupon.phone, expiresAt: coupon.expiresAt, customerId: coupon.customerId },
      promotion: { id: p.id, name: p.name, type: p.type, scope: p.scope, summary: describePromotion(p), allowManualDiscount: p.allowManualDiscount, terms: p.terms },
    }
    if (body.data.items.length === 0) return reply.send({ ...base, applies: false, message: 'Agrega los productos de la venta para calcular el descuento' })
    const r = await computePromotion(p, body.data.items)
    if (!r.ok) return reply.send({ ...base, applies: false, message: r.error })
    return reply.send({ ...base, applies: true, lines: r.lines, eligible: r.eligible, total: r.total })
  })

  // ── Reports ────────────────────────────────────────────────────────────────
  fastify.get('/reports/summary', reports, async (request, reply) => {
    const q = request.query as { from?: string; to?: string; promotionId?: string }
    const { from, to } = rangeFrom(q)
    const promoFilter = q.promotionId ? { promotionId: q.promotionId } : {}
    const [issuedRows, redeemedRows, promotions] = await Promise.all([
      prisma.promotionCoupon.findMany({
        where: { ...promoFilter, issuedAt: { gte: from, lte: to }, status: { not: 'VOID' } },
        select: { id: true, promotionId: true, phone: true, source: true, issuedAt: true, status: true },
      }),
      prisma.promotionCoupon.findMany({
        where: { ...promoFilter, status: 'REDEEMED', redeemedAt: { gte: from, lte: to } },
        select: {
          id: true, promotionId: true, phone: true, issuedAt: true, redeemedAt: true, branchId: true, discountAmount: true,
          sale: { select: { total: true, isVoided: true, items: { select: { productId: true, quantity: true, total: true, promoDiscount: true, product: { select: { name: true } } } } } },
        },
      }),
      prisma.promotion.findMany({ select: { id: true, name: true, type: true, isActive: true, startsAt: true, endsAt: true, percent: true, amount: true, specialPrice: true, buyQty: true, payQty: true, minPurchase: true } }),
    ])
    const redeemed = redeemedRows.filter(r => r.sale && !r.sale.isVoided)
    const revenue = round2(redeemed.reduce((s, r) => s + Number(r.sale!.total), 0))
    const discount = round2(redeemed.reduce((s, r) => s + Number(r.discountAmount ?? 0), 0))
    const hours = redeemed.filter(r => r.redeemedAt).map(r => (r.redeemedAt!.getTime() - r.issuedAt.getTime()) / 3_600_000)

    // Average ticket of all non-voided sales in the period, to compare.
    const overall = await prisma.sale.aggregate({ where: { isVoided: false, createdAt: { gte: from, lte: to } }, _avg: { total: true }, _count: { _all: true } })

    const byPromotion = promotions.map(p => {
      const iss = issuedRows.filter(r => r.promotionId === p.id)
      const red = redeemed.filter(r => r.promotionId === p.id)
      const rev = red.reduce((s, r) => s + Number(r.sale!.total), 0)
      const dis = red.reduce((s, r) => s + Number(r.discountAmount ?? 0), 0)
      return {
        id: p.id, name: p.name, summary: describePromotion(p), live: promotionLive({ isActive: p.isActive, startsAt: p.startsAt, endsAt: p.endsAt }),
        issued: iss.length, redeemed: red.length,
        conversion: iss.length ? round2((red.length / iss.length) * 100) : 0,
        revenue: round2(rev), discount: round2(dis),
        avgTicket: red.length ? round2(rev / red.length) : 0,
        returnPerQ: dis > 0 ? round2(rev / dis) : 0,
      }
    }).filter(p => p.issued > 0 || p.redeemed > 0 || p.live).sort((a, b) => b.revenue - a.revenue)

    const dayKey = (d: Date) => new Date(d.getTime() - 6 * 3_600_000).toISOString().slice(0, 10)
    const days = new Map<string, { date: string; issued: number; redeemed: number; revenue: number }>()
    for (let t = from.getTime(); t <= to.getTime(); t += 86_400_000) { const k = dayKey(new Date(t)); days.set(k, { date: k, issued: 0, redeemed: 0, revenue: 0 }) }
    for (const r of issuedRows) { const d = days.get(dayKey(r.issuedAt)); if (d) d.issued++ }
    for (const r of redeemed) { const d = days.get(dayKey(r.redeemedAt!)); if (d) { d.redeemed++; d.revenue = round2(d.revenue + Number(r.sale!.total)) } }

    const branches = await prisma.branch.findMany({ select: { id: true, name: true } })
    const byBranch = branches.map(b => {
      const red = redeemed.filter(r => r.branchId === b.id)
      return { id: b.id, name: b.name, redeemed: red.length, revenue: round2(red.reduce((s, r) => s + Number(r.sale!.total), 0)), discount: round2(red.reduce((s, r) => s + Number(r.discountAmount ?? 0), 0)) }
    }).filter(b => b.redeemed > 0).sort((a, b) => b.revenue - a.revenue)

    const productMap = new Map<string, { name: string; quantity: number; revenue: number; discount: number }>()
    for (const r of redeemed) for (const it of r.sale!.items) {
      if (!it.productId || !(Number(it.promoDiscount ?? 0) > 0)) continue
      const e = productMap.get(it.productId) ?? { name: it.product?.name ?? 'Producto', quantity: 0, revenue: 0, discount: 0 }
      e.quantity += Number(it.quantity); e.revenue = round2(e.revenue + Number(it.total)); e.discount = round2(e.discount + Number(it.promoDiscount ?? 0))
      productMap.set(it.productId, e)
    }

    // Repeat customers: phones that redeemed more than once in the period.
    const perPhone = new Map<string, number>()
    for (const r of redeemed) perPhone.set(r.phone, (perPhone.get(r.phone) ?? 0) + 1)

    return reply.send({
      from, to,
      kpis: {
        issued: issuedRows.length,
        redeemed: redeemed.length,
        conversion: issuedRows.length ? round2((redeemed.length / issuedRows.length) * 100) : 0,
        revenue, discount,
        avgTicketCoupon: redeemed.length ? round2(revenue / redeemed.length) : 0,
        avgTicketAll: round2(Number(overall._avg.total ?? 0)),
        returnPerQ: discount > 0 ? round2(revenue / discount) : 0,
        uniquePeople: new Set(issuedRows.map(r => r.phone)).size,
        repeatPeople: [...perPhone.values()].filter(n => n > 1).length,
        avgHoursToRedeem: hours.length ? round2(hours.reduce((s, h) => s + h, 0) / hours.length) : 0,
        pending: issuedRows.filter(r => r.status === 'ISSUED').length,
        fromWeb: issuedRows.filter(r => r.source === 'WEB').length,
      },
      byPromotion,
      byDay: [...days.values()],
      byBranch,
      topProducts: [...productMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    })
  })

  // People who took a coupon (for follow-up by WhatsApp). CSV.
  fastify.get('/reports/leads.csv', reports, async (request, reply) => {
    const q = request.query as { promotionId?: string; status?: string; from?: string; to?: string }
    const { from, to } = rangeFrom(q)
    const rows = await prisma.promotionCoupon.findMany({
      where: { ...(q.promotionId ? { promotionId: q.promotionId } : {}), ...(q.status ? { status: q.status } : {}), issuedAt: { gte: from, lte: to } },
      orderBy: { issuedAt: 'desc' },
      include: { promotion: { select: { name: true } }, sale: { select: { invoiceNumber: true, total: true } } },
      take: 20_000,
    })
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const fmt = (d: Date | null) => d ? new Date(d.getTime() - 6 * 3_600_000).toISOString().replace('T', ' ').slice(0, 16) : ''
    const lines = [
      ['Nombre', 'Teléfono', 'Correo', 'Oferta', 'Código', 'Estado', 'Origen', 'Emitido', 'Canjeado', 'Venta', 'Total venta', 'Descuento'].map(esc).join(','),
      ...rows.map(r => [r.name, r.phone, r.email, r.promotion.name, formatCode(r.code), r.status, r.source, fmt(r.issuedAt), fmt(r.redeemedAt), r.sale?.invoiceNumber, r.sale ? Number(r.sale.total).toFixed(2) : '', r.discountAmount ? Number(r.discountAmount).toFixed(2) : ''].map(esc).join(',')),
    ]
    return reply
      .type('text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="cupones.csv"')
      .send('﻿' + lines.join('\r\n'))
  })
}
