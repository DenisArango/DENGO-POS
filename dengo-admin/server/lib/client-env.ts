import { randomBytes } from 'node:crypto'
import type { Config } from '../config.js'

export interface FelInput {
  nit: string
  frases: string
  docType: 'FACT' | 'FPEQ'
  establishment: string
  env: 'test' | 'production'
  sellerName?: string
  allowCf?: boolean
  sendEmail?: boolean
}

export const hex = (bytes: number) => randomBytes(bytes).toString('hex')
/** A Prisma-compatible id for rows the panel inserts with plain SQL. */
export const newId = () => `c${hex(12)}`

/** The client's DATABASE_URL: its own user (same name as its database) and password. */
export function databaseUrl(c: Config, db: string, user: string, password: string) {
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${c.db.host}:${c.db.port}/${db}?schema=public`
}

/** The Digifact/FEL part of a client's .env. Usuario y clave son los globales del panel. */
export function felEnv(c: Config, enabled: boolean, fel: FelInput | null): Record<string, string> {
  if (!enabled || !fel) return { FEL_PROVIDER: 'none' }
  return {
    FEL_PROVIDER: 'digifact',
    DIGIFACT_ENV: fel.env,
    DIGIFACT_NIT: fel.nit.replace(/[^0-9Kk]/g, '').toUpperCase(),
    DIGIFACT_USER: c.globals.digifactUser,
    DIGIFACT_PASSWORD: c.globals.digifactPassword,
    DIGIFACT_ESTABLISHMENT: fel.establishment || '1',
    DIGIFACT_FRASES: fel.frases || '1:1',
    DIGIFACT_SELLER_NAME: fel.sellerName ?? '',
    FEL_DOC_TYPE: fel.docType,
    FEL_ALLOW_CF: String(!!fel.allowCf),
    FEL_SEND_EMAIL: String(!!fel.sendEmail),
  }
}

export function aiEnv(c: Config): Record<string, string> {
  return {
    ANTHROPIC_API_KEY: c.globals.anthropicKey,
    ANTHROPIC_MODEL: c.globals.anthropicModel,
    ANTHROPIC_ANALYST_MODEL: c.globals.anthropicAnalystModel,
  }
}

export function corsFor(domain: string, web: boolean) {
  return [`https://pos.${domain}`, ...(web ? [`https://${domain}`, `https://www.${domain}`] : [])].join(',')
}
