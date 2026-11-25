export class ApiError extends Error {
  constructor(message: string, public status: number, public data?: any) { super(message) }
}

export async function api<T = any>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...rest,
    headers: { ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })
  if (res.status === 401 && !path.startsWith('/api/login') && !path.startsWith('/api/me')) {
    window.dispatchEvent(new CustomEvent('dadm:logout'))
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(data?.error ?? `Error ${res.status}`, res.status, data)
  return data as T
}

// ── Shapes the server returns ──
export interface License {
  posEnabled: boolean; maestrosEnabled: boolean; pageEnabled: boolean; felEnabled: boolean; aiEnabled: boolean
  aiMonthlyLimit: number | null; suspended: boolean; suspendedMessage: string | null
}
export interface Metrics {
  license: License | null
  salesToday: number; totalToday: number
  salesByDay: { day: string; total: number; count: number }[]
  lastSaleAt: string | null; products: number; users: number
  branches: { name: string; code: string }[]
  aiUsedThisMonth: number; dbSizeBytes: number
}
export interface Proc { name: string; status: string; memory: number; cpu: number; restarts: number; uptimeMs: number }
export type ClientStatus = 'online' | 'down' | 'suspended' | 'archived' | 'stopped'
export interface Client {
  name: string; displayName: string; domain: string | null; apiPort: number; web: boolean; webPort: number | null
  contact: { name?: string; phone?: string; email?: string }; notes: string; createdAt: string; archived: boolean
  caddy: 'managed' | 'manual'; caddyPending: boolean; dbName: string | null; inferred: boolean
  status: ClientStatus; proc: Proc | null; webProc: Proc | null
  health: { ok: boolean; uptime?: number; ms?: number }
  metrics: Metrics | null; metricsError: string | null
}
export interface ClientDetail extends Client {
  env: Record<string, string>
  fel: { provider: string; nit: string; frases: string; docType: 'FACT' | 'FPEQ'; establishment: string; env: 'test' | 'production'; sellerName: string; allowCf: boolean; sendEmail: boolean }
  dns: { host: string; ok: boolean; addresses: string[] }[]
}
export type StepStatus = 'pending' | 'running' | 'ok' | 'failed' | 'skipped' | 'undone' | 'warning'
export interface JobStep { id: string; title: string; status: StepStatus; note?: string; ms?: number }
export interface Job {
  id: string; kind: string; title: string; client: string | null
  status: 'running' | 'ok' | 'failed' | 'rolled_back'
  startedAt: string; endedAt: string | null; steps: JobStep[]
  lines?: { t: number; text: string }[]; error: string | null; result?: Record<string, any>
}
export interface ServerInfo {
  mode: 'real' | 'simulate'; hostname: string; memTotal: number; memFree: number; load: number[]; cpus: number
  diskTotal: number; diskFree: number; uptimeSec: number; node: string; root: string; serverIp: string
  setup: { id: string; label: string; ok: boolean; hint: string }[]
  procs: Proc[]
}
export interface Backup { file: string; client: string; size: number; at: string }

/** Starts a job and returns its id (server answers 202 { jobId }). */
export const startJob = (path: string, json?: unknown, method = 'POST') => api<{ jobId: string }>(path, { method, json: json ?? {} })
