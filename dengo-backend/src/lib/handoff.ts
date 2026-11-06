// Logging in from the public website ("Ingresar"): the site checks the
// password, then hands the person to the POS or the teachers' portal, which
// live on other domains, with a one-time code instead of the session token.
// The code is random, lives 60 seconds, is used once and only redeems on the
// app it was issued for. It is kept in memory: each client runs one backend
// process, and a code lost to a restart just means logging in again.

import { randomBytes } from 'node:crypto'

export type HandoffApp = 'pos' | 'portal'

const TTL_MS = 60_000
const codes = new Map<string, { userId: string; app: HandoffApp; exp: number }>()

export function issueHandoff(userId: string, app: HandoffApp) {
  const now = Date.now()
  for (const [k, v] of codes) if (v.exp < now) codes.delete(k)
  const code = randomBytes(24).toString('base64url')
  codes.set(code, { userId, app, exp: now + TTL_MS })
  return code
}

/** The user id the code was issued to, or null. A code works once. */
export function redeemHandoff(code: unknown, app: HandoffApp) {
  if (typeof code !== 'string' || code.length < 20 || code.length > 64) return null
  const entry = codes.get(code)
  if (!entry) return null
  codes.delete(code)
  if (entry.app !== app || entry.exp < Date.now()) return null
  return entry.userId
}
