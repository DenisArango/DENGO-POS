import { readFileSync } from 'fs'
import { resolve } from 'path'

// Load .env manually for ESM compatibility
function loadEnv() {
  try {
    const envPath = resolve(process.cwd(), '.env')
    const content = readFileSync(envPath, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) process.env[key] = val
    }
  } catch {
    // .env not found – rely on environment variables
  }
}

loadEnv()

function required(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing required environment variable: ${key}`)
  return val
}

export const config = {
  port: Number(process.env['PORT'] ?? 3001),
  host: process.env['HOST'] ?? '0.0.0.0',
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  isDev: (process.env['NODE_ENV'] ?? 'development') !== 'production',

  jwt: {
    secret: required('JWT_SECRET'),
    // One login covers a full calendar day, not just an 8h shift — a
    // register closed at day's end and synced offline needs its token to
    // still be valid whenever the cashier reopens the browser next (often
    // the next morning, well past 8h). offlineSync.ts also no longer loses
    // a queued sale/close to an expired token (retries once re-authenticated
    // instead of marking it failed), so this is a complementary reduction
    // in how often that path is even needed, not the only fix for it.
    expiresIn: process.env['JWT_EXPIRES_IN'] ?? '24h',
  },

  cors: {
    origins: (process.env['CORS_ORIGIN'] ?? 'http://localhost:5173').split(',').map(s => s.trim()),
  },

  rateLimit: {
    max: Number(process.env['RATE_LIMIT_MAX'] ?? 200),
    windowMs: Number(process.env['RATE_LIMIT_WINDOW_MS'] ?? 60_000),
  },
} as const
