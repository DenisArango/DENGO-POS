// FEL settings come from the deployment's .env, one deployment per client
// (each client is its own SAT emisor with its own certifier contract).
//
//   FEL_PROVIDER        none | mock | felplex        (default none: invoices stay PENDING, nothing is sent)
//   FELPLEX_ENV         stage | production            (default stage)
//   FELPLEX_BASE_URL    optional override of the environment URL
//   FELPLEX_ENTITY_ID   FELplex "empresa" id for branches without their own (Branch.felEntityId)
//   FELPLEX_API_KEY     API key for that entity
//   FELPLEX_API_KEYS    optional JSON {"<entityId>":"<apiKey>"} when establishments have different keys
//   FEL_DOC_TYPE        FACT (contribuyente general, default) | FPEQ / FAPE (pequeño contribuyente)
//   FEL_IVA_RATE        0.12
//   FEL_ALLOW_CF        true to invoice "Consumidor Final" without NIT (SAT limit below)
//   FEL_CF_MAX_TOTAL    2500 — SAT requires NIT or CUI from this amount up
//   FEL_SEND_EMAIL      true to let the certifier email the DTE to the customer's address
//   FEL_TIMEOUT_MS      30000
//   FEL_RETRY_MINUTES   5 — background retry of invoices that never reached the certifier (0 = off)
//   FEL_MAX_ATTEMPTS    5

import type { DteType, FelEnvironment } from './types.js'

export type FelProviderName = 'none' | 'mock' | 'felplex'

export interface FelConfig {
  provider: FelProviderName
  environment: FelEnvironment
  baseUrl: string
  defaultEntityId: string | null
  apiKeys: Record<string, string>
  defaultApiKey: string | null
  docType: DteType
  ivaRate: number
  allowCf: boolean
  cfMaxTotal: number
  sendEmail: boolean
  timeoutMs: number
  retryMinutes: number
  maxAttempts: number
}

const FELPLEX_URLS: Record<'stage' | 'production', string> = {
  stage: 'https://felplex.stage.plex.lat',
  production: 'https://app.felplex.com',
}

const bool = (v: string | undefined, def: boolean) => (v == null || v === '' ? def : /^(1|true|yes|si|sí)$/i.test(v.trim()))
const num = (v: string | undefined, def: number) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : def)

export function felConfig(env: NodeJS.ProcessEnv = process.env): FelConfig {
  const provider = (['none', 'mock', 'felplex'].includes(env.FEL_PROVIDER ?? '') ? env.FEL_PROVIDER : 'none') as FelProviderName
  const felplexEnv = env.FELPLEX_ENV === 'production' ? 'production' : 'stage'
  let apiKeys: Record<string, string> = {}
  if (env.FELPLEX_API_KEYS) {
    try { apiKeys = JSON.parse(env.FELPLEX_API_KEYS) } catch { apiKeys = {} }
  }
  return {
    provider,
    environment: provider === 'felplex' ? felplexEnv : 'mock',
    baseUrl: (env.FELPLEX_BASE_URL || FELPLEX_URLS[felplexEnv]).replace(/\/+$/, ''),
    defaultEntityId: env.FELPLEX_ENTITY_ID?.trim() || null,
    apiKeys,
    defaultApiKey: env.FELPLEX_API_KEY?.trim() || null,
    docType: (env.FEL_DOC_TYPE?.trim().toUpperCase() || 'FACT') as DteType,
    ivaRate: num(env.FEL_IVA_RATE, 0.12),
    allowCf: bool(env.FEL_ALLOW_CF, false),
    cfMaxTotal: num(env.FEL_CF_MAX_TOTAL, 2500),
    sendEmail: bool(env.FEL_SEND_EMAIL, false),
    timeoutMs: num(env.FEL_TIMEOUT_MS, 30000),
    retryMinutes: num(env.FEL_RETRY_MINUTES, 5),
    maxAttempts: num(env.FEL_MAX_ATTEMPTS, 5),
  }
}

export function apiKeyFor(cfg: FelConfig, entityId: string): string | null {
  return cfg.apiKeys[entityId] ?? cfg.defaultApiKey
}

/** Small tax-free-of-IVA-breakdown regimes: the DTE carries no IVA amount. */
export function isSmallTaxpayerType(t: DteType): boolean {
  return t === 'FPEQ' || t === 'FCAP' || t === 'FAPE' || t === 'FCPE'
}

/** What the settings screen may show — never the keys themselves. */
export function felConfigSummary(cfg: FelConfig = felConfig()) {
  return {
    provider: cfg.provider,
    environment: cfg.environment,
    baseUrl: cfg.provider === 'felplex' ? cfg.baseUrl : null,
    defaultEntityId: cfg.defaultEntityId,
    hasDefaultApiKey: !!cfg.defaultApiKey,
    entitiesWithOwnKey: Object.keys(cfg.apiKeys),
    docType: cfg.docType,
    ivaRate: cfg.ivaRate,
    allowCf: cfg.allowCf,
    cfMaxTotal: cfg.cfMaxTotal,
    sendEmail: cfg.sendEmail,
    retryMinutes: cfg.retryMinutes,
    maxAttempts: cfg.maxAttempts,
  }
}
