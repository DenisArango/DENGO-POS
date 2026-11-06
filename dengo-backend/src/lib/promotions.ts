// Offers (Promotion) and their single-use coupons (PromotionCoupon).
//
// The discount is ALWAYS computed here, on the server: the POS asks
// /api/website/coupons/validate for the per-line amounts, shows them, and
// sends them back with the sale; POST /api/sales recomputes and rejects a
// mismatch. Nothing the browser sends can invent a discount.
//
// Types:
//   PERCENT        `percent`% off the eligible lines (cap: maxDiscount)
//   FIXED          `amount` off the eligible lines (never more than they cost)
//   BUY_X_GET_Y    buy `buyQty`, pay `payQty` — the cheapest units go free
//   SPECIAL_PRICE  eligible products at `specialPrice` per unit
// Scope: ALL (whole sale) | CATEGORY (categoryIds) | PRODUCT (productIds).
// minPurchase is checked against the eligible lines' amount.

import { randomInt } from 'node:crypto'
import type { Promotion, PromotionCoupon } from '@prisma/client'
import { prisma } from './prisma.js'

export const PROMO_TYPES = ['PERCENT', 'FIXED', 'BUY_X_GET_Y', 'SPECIAL_PRICE'] as const
export const PROMO_SCOPES = ['ALL', 'CATEGORY', 'PRODUCT'] as const
export type PromoType = (typeof PROMO_TYPES)[number]

export const round2 = (n: number) => Math.round(n * 100) / 100

export function parseIds(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.map(String).filter(Boolean) : []
  } catch { return [] }
}

// ── Codes ────────────────────────────────────────────────────────────────────
// 8 characters without look-alikes (0/O, 1/I/L), shown as XXXX-XXXX. The QR
// and barcode carry "CUP-XXXXXXXX" so the POS knows a scan is a coupon, not
// a product barcode.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export function newCouponCode() {
  let s = ''
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)]
  return s
}
export const formatCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`

/** Accepts CUP-XXXXXXXX, XXXX-XXXX, XXXXXXXX or any URL ending in /cupon/<code>. */
export function normalizeCouponInput(raw: string): string | null {
  const t = raw.trim().toUpperCase()
  const fromUrl = t.match(/\/CUPON\/([A-Z0-9-]+)\/?(?:[?#].*)?$/)
  const body = (fromUrl ? fromUrl[1]! : t).replace(/^CUP-?/, '').replace(/[^A-Z0-9]/g, '')
  return /^[A-Z0-9]{8}$/.test(body) ? body : null
}

export function normalizePhone(raw: string) {
  const digits = raw.replace(/\D/g, '')
  // Guatemala: keep the 8-digit local number; drop a leading 502.
  return digits.length === 11 && digits.startsWith('502') ? digits.slice(3) : digits
}

// ── Validity ─────────────────────────────────────────────────────────────────
export function promotionLive(p: Pick<Promotion, 'isActive' | 'startsAt' | 'endsAt'>, at = new Date()) {
  if (!p.isActive) return false
  if (p.startsAt && at < p.startsAt) return false
  if (p.endsAt && at > p.endsAt) return false
  return true
}

export function promoBranchAllowed(p: Pick<Promotion, 'branchIds'>, branchId: string) {
  const ids = parseIds(p.branchIds)
  return ids.length === 0 || ids.includes(branchId)
}

export function couponExpiry(p: Pick<Promotion, 'endsAt' | 'couponValidDays'>, issuedAt = new Date()) {
  const byDays = p.couponValidDays ? new Date(issuedAt.getTime() + p.couponValidDays * 86_400_000) : null
  if (byDays && p.endsAt) return byDays < p.endsAt ? byDays : p.endsAt
  return byDays ?? p.endsAt ?? null
}

/** Plain-language summary, e.g. "15% de descuento" — for the site and the POS. */
export function describePromotion(p: Pick<Promotion, 'type' | 'percent' | 'amount' | 'specialPrice' | 'buyQty' | 'payQty' | 'minPurchase'>) {
  const q = (n: unknown) => `Q${Number(n).toFixed(2).replace(/\.00$/, '')}`
  let s = ''
  switch (p.type) {
    case 'PERCENT': s = `${Number(p.percent ?? 0).toString()}% de descuento`; break
    case 'FIXED': s = `${q(p.amount ?? 0)} de descuento`; break
    case 'BUY_X_GET_Y': s = `Lleva ${p.buyQty}, paga ${p.payQty}`; break
    case 'SPECIAL_PRICE': s = `Precio especial ${q(p.specialPrice ?? 0)}`; break
  }
  if (p.minPurchase && Number(p.minPurchase) > 0) s += ` en compras desde ${q(p.minPurchase)}`
  return s
}

// ── Discount engine ──────────────────────────────────────────────────────────
export type CartLine = {
  productId: string
  variationId?: string | null | undefined
  quantity: number
  unitPrice: number
  /** Manual discount as a fraction 0..1 (same as SaleItem.discount). */
  discount: number
}

export type PromoResult =
  | { ok: true; lines: number[]; total: number; eligible: boolean[] }
  | { ok: false; error: string }

/** Per-line promotion amount (same order as `lines`), all rounded to cents. */
export async function computePromotion(p: Promotion, lines: CartLine[]): Promise<PromoResult> {
  const productIds = [...new Set(lines.map(l => l.productId))]
  const products = await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, categoryId: true } })
  const categoryOf = new Map(products.map(x => [x.id, x.categoryId]))
  return computePromotionSync(p, lines, categoryOf)
}

export function computePromotionSync(p: Promotion, lines: CartLine[], categoryOf: Map<string, string | null>): PromoResult {
  const targetProducts = new Set(parseIds(p.productIds))
  const targetCategories = new Set(parseIds(p.categoryIds))
  const eligible = lines.map(l => {
    if (p.scope === 'PRODUCT') return targetProducts.has(l.productId)
    if (p.scope === 'CATEGORY') return targetCategories.has(categoryOf.get(l.productId) ?? '')
    return true
  })
  const net = lines.map(l => round2(l.unitPrice * l.quantity * (1 - (l.discount || 0))))
  const eligibleNet = round2(net.reduce((s, n, i) => s + (eligible[i] ? n : 0), 0))

  if (!eligible.some(Boolean)) {
    return { ok: false, error: p.scope === 'ALL' ? 'La venta no tiene productos' : 'Ningún producto de esta venta participa en la oferta' }
  }
  const min = Number(p.minPurchase ?? 0)
  if (min > 0 && eligibleNet + 0.001 < min) {
    return { ok: false, error: `La oferta pide una compra mínima de Q${min.toFixed(2)} en los productos que participan (llevas Q${eligibleNet.toFixed(2)})` }
  }

  const out = lines.map(() => 0)

  // Spreads `amount` over the eligible lines in proportion to their net,
  // the last one absorbing the rounding so the sum is exact.
  const spread = (amount: number) => {
    const idx = eligible.map((e, i) => (e && net[i]! > 0 ? i : -1)).filter(i => i >= 0)
    let left = round2(Math.min(amount, eligibleNet))
    idx.forEach((i, k) => {
      const share = k === idx.length - 1 ? left : round2((amount * net[i]!) / eligibleNet)
      const v = Math.min(share, net[i]!, left)
      out[i] = round2(v)
      left = round2(left - v)
    })
  }

  switch (p.type) {
    case 'PERCENT': {
      const pct = Math.min(100, Math.max(0, Number(p.percent ?? 0)))
      let amount = round2((eligibleNet * pct) / 100)
      if (p.maxDiscount && Number(p.maxDiscount) > 0) amount = Math.min(amount, Number(p.maxDiscount))
      spread(amount)
      break
    }
    case 'FIXED': {
      spread(Math.max(0, Number(p.amount ?? 0)))
      break
    }
    case 'SPECIAL_PRICE': {
      const special = Math.max(0, Number(p.specialPrice ?? 0))
      lines.forEach((l, i) => {
        if (!eligible[i]) return
        const perUnitNet = l.unitPrice * (1 - (l.discount || 0))
        if (perUnitNet > special) out[i] = round2((perUnitNet - special) * l.quantity)
      })
      break
    }
    case 'BUY_X_GET_Y': {
      const buy = Math.max(1, Number(p.buyQty ?? 0)), pay = Math.max(0, Number(p.payQty ?? 0))
      if (pay >= buy) return { ok: false, error: 'Oferta mal configurada: "paga" debe ser menor que "lleva"' }
      // Whole units only; the cheapest units of the eligible lines go free.
      const units: { i: number; price: number }[] = []
      lines.forEach((l, i) => {
        if (!eligible[i]) return
        const perUnit = l.unitPrice * (1 - (l.discount || 0))
        for (let u = 0; u < Math.floor(l.quantity); u++) units.push({ i, price: perUnit })
      })
      const free = Math.floor(units.length / buy) * (buy - pay)
      if (free === 0) return { ok: false, error: `Para esta oferta lleva al menos ${buy} unidades de los productos que participan` }
      units.sort((a, b) => a.price - b.price).slice(0, free).forEach(u => { out[u.i] = (out[u.i] ?? 0) + u.price })
      for (let i = 0; i < out.length; i++) out[i] = round2(out[i]!)
      if (p.maxDiscount && Number(p.maxDiscount) > 0) {
        const total = out.reduce((s, n) => s + n, 0)
        const cap = Number(p.maxDiscount)
        if (total > cap) { out.fill(0); spread(cap) }
      }
      break
    }
    default:
      return { ok: false, error: 'Tipo de oferta desconocido' }
  }

  const total = round2(out.reduce((s, n) => s + n, 0))
  if (total <= 0) return { ok: false, error: 'Con los precios de esta venta la oferta no da descuento' }
  return { ok: true, lines: out, total, eligible }
}

// ── Coupon lookup for the POS ────────────────────────────────────────────────
export type CouponCheck =
  | { ok: true; coupon: PromotionCoupon & { promotion: Promotion } }
  | { ok: false; error: string; code: 'NOT_FOUND' | 'USED' | 'VOID' | 'EXPIRED' | 'INACTIVE' | 'BRANCH' }

export async function checkCoupon(rawCode: string, branchId: string, at = new Date()): Promise<CouponCheck> {
  const code = normalizeCouponInput(rawCode)
  if (!code) return { ok: false, error: 'Código de cupón inválido', code: 'NOT_FOUND' }
  const coupon = await prisma.promotionCoupon.findUnique({ where: { code }, include: { promotion: true } })
  if (!coupon) return { ok: false, error: 'Ese cupón no existe', code: 'NOT_FOUND' }
  if (coupon.status === 'REDEEMED') return { ok: false, error: `Este cupón ya se usó el ${coupon.redeemedAt?.toLocaleDateString('es-GT', { timeZone: 'America/Guatemala' }) ?? ''}`, code: 'USED' }
  if (coupon.status === 'VOID') return { ok: false, error: 'Este cupón fue anulado', code: 'VOID' }
  if (coupon.expiresAt && at > coupon.expiresAt) return { ok: false, error: 'Este cupón ya venció', code: 'EXPIRED' }
  if (!promotionLive(coupon.promotion, at)) return { ok: false, error: 'La oferta de este cupón ya no está vigente', code: 'INACTIVE' }
  if (!promoBranchAllowed(coupon.promotion, branchId)) return { ok: false, error: 'Esta oferta no aplica en esta sucursal', code: 'BRANCH' }
  return { ok: true, coupon }
}
