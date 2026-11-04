// The installable POS app (PWA) carries the CLIENT's brand, not DENGO's:
// the manifest name and every icon (home screen, app switcher, browser tab,
// push notifications) come from Configuración → Empresa.
//
// Public on purpose: the browser fetches the manifest and icons without the
// login token (and before login, on the login screen).

import type { FastifyInstance } from 'fastify'
import sharp from 'sharp'
import { prisma } from '../lib/prisma.js'

const SIZES = [32, 72, 96, 180, 192, 512] as const
const THEME = '#2563eb'
const cache = new Map<string, Buffer>()

/**
 * Every candidate logo, best first: the company's, then each branch's
 * (PNG before JPEG — PNGs usually keep a transparent background).
 * The first one sharp can actually read wins.
 */
async function brand() {
  const company = await prisma.companyProfile.findFirst({ select: { name: true, logo: true, updatedAt: true } })
  const branches = await prisma.branch.findMany({
    where: { logo: { startsWith: 'data:image/' } },
    select: { logo: true, updatedAt: true },
    orderBy: { createdAt: 'asc' },
  })
  const pngFirst = [...branches].sort((a, b) => Number(!a.logo!.startsWith('data:image/png')) - Number(!b.logo!.startsWith('data:image/png')))
  const logos = [company?.logo, ...pngFirst.map(b => b.logo)].filter((l): l is string => !!l?.startsWith('data:image/'))
  const version = Math.max(company?.updatedAt?.getTime() ?? 0, ...branches.map(b => b.updatedAt?.getTime() ?? 0))
  const name = company?.name?.trim() || 'Punto de venta'
  return { name, logos, version }
}

/**
 * A .ico can't be read by sharp, but modern ones carry PNG images inside:
 * take the largest embedded PNG. (Old BMP-only icons are skipped.)
 */
function pngFromIco(buf: Buffer): Buffer | null {
  if (buf.length < 6 || buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) return null
  const count = buf.readUInt16LE(4)
  let best: { size: number; data: Buffer } | null = null
  for (let k = 0; k < count; k++) {
    const e = 6 + k * 16
    if (e + 16 > buf.length) break
    const w = buf[e] || 256
    const len = buf.readUInt32LE(e + 8), off = buf.readUInt32LE(e + 12)
    const data = buf.subarray(off, off + len)
    if (data.length > 8 && data.readUInt32BE(0) === 0x89504e47 && (!best || w > best.size)) best = { size: w, data }
  }
  return best?.data ?? null
}

/**
 * The best candidate logo: the first one sharp can decode that is at least
 * 192px (a tiny .ico favicon blown up to 512px looks blurry), otherwise the
 * largest readable one.
 */
async function readableLogo(logos: string[]): Promise<Buffer | null> {
  let largest: { px: number; bytes: Buffer } | null = null
  for (const logo of logos) {
    const m = logo.match(/^data:image\/([a-z0-9.+-]+);base64,(.+)$/i)
    if (!m) continue
    let bytes: Buffer | null = Buffer.from(m[2]!, 'base64')
    if (/icon/i.test(m[1]!)) bytes = pngFromIco(bytes)
    if (!bytes) continue
    try {
      const { width = 0, height = 0 } = await sharp(bytes).metadata()
      const px = Math.min(width, height)
      if (px >= 192) return bytes
      if (!largest || px > largest.px) largest = { px, bytes }
    } catch { /* unreadable: try the next one */ }
  }
  return largest?.bytes ?? null
}

/** Logo centred on white with a safe margin (Android's round/squircle masks never cut it). */
async function appIcon(size: number): Promise<Buffer> {
  const b = await brand()
  const key = `icon:${size}:${b.version}`
  const hit = cache.get(key)
  if (hit) return hit
  let png: Buffer | null = null
  const bytes = await readableLogo(b.logos)
  if (bytes) {
    try {
      const inner = Math.round(size * 0.74)
      const art = await sharp(bytes).resize(inner, inner, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer()
      png = await sharp({ create: { width: size, height: size, channels: 4, background: '#ffffff' } })
        .composite([{ input: art, gravity: 'center' }]).png().toBuffer()
    } catch { png = null }
  }
  if (!png) {
    // No usable logo: the company's initial on the theme colour.
    const letter = (b.name[0] ?? 'P').toUpperCase().replace(/[<>&"']/g, '')
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="100%" height="100%" fill="${THEME}"/><text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${Math.round(size * 0.5)}" fill="#ffffff">${letter}</text></svg>`
    png = await sharp(Buffer.from(svg)).png().toBuffer()
  }
  cache.set(key, png)
  return png
}

/**
 * Android shows a small monochrome "badge" in the status bar: only the
 * alpha channel counts. Built as a white silhouette of the logo — its
 * transparent or near-white background is dropped.
 */
async function badge(): Promise<Buffer> {
  const b = await brand()
  const key = `badge:${b.version}`
  const hit = cache.get(key)
  if (hit) return hit
  const size = 96
  let png: Buffer | null = null
  const bytes = await readableLogo(b.logos)
  if (bytes) {
    try {
      const { data, info } = await sharp(bytes)
        .resize(size - 8, size - 8, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
        .ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      const out = Buffer.alloc(info.width * info.height * 4)
      for (let i = 0; i < info.width * info.height; i++) {
        const r = data[i * 4]!, g = data[i * 4 + 1]!, bl = data[i * 4 + 2]!, a = data[i * 4 + 3]!
        const light = 0.299 * r + 0.587 * g + 0.114 * bl
        const on = a > 40 && light < 235
        out[i * 4] = 255; out[i * 4 + 1] = 255; out[i * 4 + 2] = 255; out[i * 4 + 3] = on ? a : 0
      }
      const art = await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer()
      png = await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: art, gravity: 'center' }]).png().toBuffer()
    } catch { png = null }
  }
  if (!png) {
    const letter = (b.name[0] ?? 'P').toUpperCase().replace(/[<>&"']/g, '')
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${Math.round(size * 0.7)}" fill="#ffffff">${letter}</text></svg>`
    png = await sharp(Buffer.from(svg)).png().toBuffer()
  }
  cache.set(key, png)
  return png
}

export default async function appRoutes(fastify: FastifyInstance) {
  fastify.get('/manifest.webmanifest', async (_request, reply) => {
    const b = await brand()
    const v = b.version
    return reply
      .type('application/manifest+json')
      .header('Cache-Control', 'no-cache')
      .send({
        id: '/pos',
        name: b.name,
        short_name: b.name.length > 14 ? b.name.split(/\s+/)[0]! : b.name,
        description: `Punto de venta de ${b.name}`,
        lang: 'es',
        start_url: '/pos',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: THEME,
        // ?v= changes when the logo changes, so installed apps pick it up.
        icons: [
          { src: `/api/app/icon-192.png?v=${v}`, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: `/api/app/icon-512.png?v=${v}`, sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: `/api/app/icon-512.png?v=${v}`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      })
  })

  fastify.get('/icon-:size.png', async (request, reply) => {
    const size = Number((request.params as { size: string }).size)
    if (!(SIZES as readonly number[]).includes(size)) return reply.status(404).send({ error: 'Tamaño no disponible' })
    return reply.type('image/png').header('Cache-Control', 'public, max-age=3600').send(await appIcon(size))
  })

  fastify.get('/badge.png', async (_request, reply) => {
    return reply.type('image/png').header('Cache-Control', 'public, max-age=3600').send(await badge())
  })
}
