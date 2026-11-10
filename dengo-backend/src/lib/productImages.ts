import type { FastifyRequest } from 'fastify'
import { Prisma } from '@prisma/client'
import { prisma } from './prisma.js'

// Product photos live in PRODUCTS.IMAGE_URL as base64 data URLs (no file
// storage). Sending that column in lists is what took the server down in
// Nov 2026: the inventory list returned EVERY product's photo — hundreds of
// MB of JSON built in memory per request, several tills asking at once,
// node grew past the machine's RAM and Linux killed it (OOM) every ~30 s.
//
// So the column is never loaded by default (global `omit` in lib/prisma.ts),
// and API responses carry a short URL instead, served by
// GET /api/products/:id/image — each photo is fetched only when an <img>
// actually shows it, and cached by the browser (?v= changes on every edit).

const IMAGE_PATH_RE = /\/api\/products\/([^/?#]+)\/image(?:[?#]|$)/

function baseUrl(request?: FastifyRequest): string {
  if (!request) return ''
  const host = request.host
  // The website renders on this same machine and calls the API over
  // loopback: an absolute http://127.0.0.1 URL would be useless to visitors.
  if (!host || /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host)) return ''
  return `${request.protocol}://${host}`
}

export function productImageUrl(id: string, updatedAt: Date | string | number, request?: FastifyRequest): string {
  return `${baseUrl(request)}/api/products/${id}/image?v=${new Date(updatedAt).getTime()}`
}

/** Photo URL per product id, only for the ones that have a photo. One small
 * query for the whole list — never reads the photos themselves. */
export async function imageUrlsFor(ids: string[], request?: FastifyRequest): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))]
  const out = new Map<string, string>()
  for (let i = 0; i < unique.length; i += 5000) {
    const chunk = unique.slice(i, i + 5000)
    const rows = await prisma.$queryRaw<{ id: string; updated_at: Date }[]>(Prisma.sql`
      SELECT "ID" AS id, "UPDATED_AT" AS updated_at FROM "PRODUCTS"
      WHERE "ID" IN (${Prisma.join(chunk)}) AND "IMAGE_URL" IS NOT NULL AND "IMAGE_URL" <> ''
    `)
    for (const r of rows) out.set(r.id, productImageUrl(r.id, r.updated_at, request))
  }
  return out
}

/** Sets `imageUrl` to the photo's URL (or null) on each product, in place. */
export async function attachImageUrls<T extends { id: string }>(products: (T | null | undefined)[], request?: FastifyRequest): Promise<void> {
  const list = products.filter((p): p is T => !!p)
  if (list.length === 0) return
  const urls = await imageUrlsFor(list.map(p => p.id), request)
  for (const p of list) (p as T & { imageUrl?: string | null }).imageUrl = urls.get(p.id) ?? null
}

/** What a create/update body's `imageUrl` means now that clients receive
 * URLs: a new photo (data URL), «remove it» (null/''), «keep it as is» (our
 * own URL for the same product — the edit form sends back what it got), or
 * «copy that product's photo» (our URL for a different product). */
export async function resolveIncomingImage(value: string | null | undefined, productId?: string): Promise<{ set: boolean; value?: string | null }> {
  if (value === undefined) return { set: false }
  if (value === null || value === '') return { set: true, value: null }
  const m = IMAGE_PATH_RE.exec(value)
  if (!m) return { set: true, value }
  const refId = decodeURIComponent(m[1]!)
  if (refId === productId) return { set: false }
  const src = await prisma.product.findUnique({ where: { id: refId }, select: { imageUrl: true } })
  return src?.imageUrl ? { set: true, value: src.imageUrl } : { set: false }
}
