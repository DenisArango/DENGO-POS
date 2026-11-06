// Server-side calls to the client's DENGO backend. Each client runs its own
// backend + website pair, so DENGO_API points at that client's API
// (default: the backend on the same machine).

import type { CouponView, Promotion, SiteContent } from './types'

const API = (process.env.DENGO_API ?? 'http://127.0.0.1:3001').replace(/\/$/, '')

async function get<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API}${path}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

// The whole site's content changes rarely: keep it for 30 s per process so
// every page view doesn't hit the database.
let cache: { at: number; data: SiteContent | null } | null = null
export async function getContent(): Promise<SiteContent | null> {
  if (cache && Date.now() - cache.at < 30_000) return cache.data
  const data = await get<SiteContent>('/api/site/content')
  cache = { at: Date.now(), data }
  return data
}

export const getPromotion = (slug: string) => get<Promotion>(`/api/site/promotions/${encodeURIComponent(slug)}`)
export const getCoupon = (code: string) => get<CouponView>(`/api/site/coupons/${encodeURIComponent(code)}`)

/**
 * Which design renders this request. Order: WEB_SITE in the environment
 * (pins a deployment), ?diseno= when WEB_ALLOW_SWITCH=1 (demos, to show the
 * template and a custom design side by side; the middleware remembers it in
 * a cookie so the links inside the demo keep the design), else SiteConfig.
 */
export function siteKey(ctx: { locals: App.Locals }, content: SiteContent | null) {
  return process.env.WEB_SITE || ctx.locals.diseno || content?.site || 'plantilla'
}

/** Whether the site shows its "Ingresar" button. */
export const canLogin = (c: SiteContent) => !!(c.access?.staff || c.access?.teachers)

export const isPreview = (url: URL) => url.searchParams.has('preview')

export function waLink(phone: string | null | undefined, text?: string) {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (!digits) return null
  const full = digits.length === 8 ? `502${digits}` : digits
  return `https://wa.me/${full}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

export function mapsLink(b: { name: string; address: string; city: string }) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([b.name, b.address, b.city].filter(Boolean).join(', '))}`
}

export const money = (n: number | null | undefined) => `Q${Number(n ?? 0).toFixed(2).replace(/\.00$/, '')}`

export function fmtDay(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleDateString('es-GT', { timeZone: 'America/Guatemala', day: 'numeric', month: 'long' }) : null
}

/** Big headline text for an offer: "15%", "Q25", "3×2", "Q9.99". */
export function offerHeadline(p: Promotion) {
  switch (p.type) {
    case 'PERCENT': return `${p.percent}%`
    case 'FIXED': return money(p.amount)
    case 'BUY_X_GET_Y': return `${p.buyQty}×${p.payQty}`
    case 'SPECIAL_PRICE': return money(p.specialPrice)
  }
}
