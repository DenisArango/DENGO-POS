import { readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'

export type Mode = 'real' | 'simulate'

export interface Globals {
  anthropicKey: string
  anthropicModel: string
  anthropicAnalystModel: string
  digifactUser: string
  digifactPassword: string
}

export interface Config {
  mode: Mode
  port: number
  host: string
  passwordHash: string
  sessionSecret: string
  root: string
  appDir: string
  clientsDir: string
  backupsDir: string
  caddyDir: string
  adminDir: string
  frontendDist: string
  serverIp: string
  pgAdminUrl: string
  db: { host: string; port: number }
  globals: Globals
}

/** The panel's `.env` (in the working directory) as an object. It never goes into process.env,
 * so nothing in it can leak to the client processes the panel starts. */
export function readDotEnv(dir = process.cwd()): Record<string, string> {
  const out: Record<string, string> = {}
  try {
    const text = readFileSync(resolve(dir, '.env'), 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const i = t.indexOf('=')
      if (i < 0) continue
      out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    }
  } catch { /* no .env */ }
  return out
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const mode: Mode = env.ADMIN_MODE === 'simulate' ? 'simulate' : 'real'
  const root = resolve(env.DENGO_ROOT || (mode === 'simulate' ? './sandbox' : join(env.HOME || '/root', 'dengo')))
  const need = (k: string) => {
    const v = env[k]
    if (!v) throw new Error(`Falta ${k} en el .env de dengo-admin`)
    return v
  }
  return {
    mode,
    port: Number(env.PORT || 4900),
    host: env.HOST || '127.0.0.1',
    passwordHash: need('ADMIN_PASSWORD_HASH'),
    sessionSecret: need('SESSION_SECRET'),
    root,
    appDir: env.APP_DIR ? resolve(env.APP_DIR) : join(root, 'app'),
    clientsDir: join(root, 'clients'),
    backupsDir: join(root, 'backups'),
    caddyDir: join(root, 'caddy'),
    adminDir: join(root, 'admin'),
    frontendDist: env.FRONTEND_DIST || join(env.APP_DIR ? resolve(env.APP_DIR) : join(root, 'app'), 'dengo-frontend', 'dist'),
    serverIp: env.SERVER_IP || '',
    pgAdminUrl: env.PG_ADMIN_URL || '',
    db: {
      host: env.DB_HOST || 'localhost',
      port: Number(env.DB_PORT || 5432),
    },
    globals: {
      anthropicKey: env.ANTHROPIC_API_KEY || '',
      anthropicModel: env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
      anthropicAnalystModel: env.ANTHROPIC_ANALYST_MODEL || 'claude-sonnet-5-5',
      digifactUser: env.DIGIFACT_USER || '',
      digifactPassword: env.DIGIFACT_PASSWORD || '',
    },
  }
}
