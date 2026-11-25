// Some certifiers (Digifact) return the official PDF as a file instead of a
// public link. We hand out our own link instead: /api/fel/doc/<uuid>.pdf
// carrying an HMAC of the uuid, so it works in a plain <a href> (cashier,
// portal teacher) without a login, and nobody can guess other documents'.

import { createHmac, timingSafeEqual } from 'node:crypto'

function secret(): string {
  const s = process.env.JWT_SECRET
  if (!s) throw new Error('JWT_SECRET no está configurado')
  return s
}

function sign(uuid: string): string {
  return createHmac('sha256', secret()).update(`fel-doc:${uuid.toUpperCase()}`).digest('base64url').slice(0, 32)
}

export function felDocPdfPath(uuid: string): string {
  return `/api/fel/doc/${encodeURIComponent(uuid.toUpperCase())}.pdf?k=${sign(uuid)}`
}

export function verifyFelDocKey(uuid: string, key: string | undefined): boolean {
  if (!key) return false
  const a = Buffer.from(sign(uuid))
  const b = Buffer.from(key)
  return a.length === b.length && timingSafeEqual(a, b)
}
