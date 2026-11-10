// Connection diagnostics: a small rolling log of everything that has to do
// with "Sin conexión con el servidor" — each failed request (with how it
// failed and after how long), each failed connectivity ping, every
// online/offline flip and its reason, the browser's own network events, and
// the tab coming back after being hidden (a laptop waking from sleep or a
// phone screen turning back on is a classic source of a burst of failed
// requests that has nothing to do with the server).
//
// Shown to the cashier behind the «Detalle técnico» arrow on the offline
// banner and the connectivity toast, so they can send a screenshot or copy
// it; and, once the connection is back, sent to the server
// (POST /api/diag/conn) so the same story lands in `pm2 logs` next to the
// server's own messages — each request carries an X-Request-Id that the
// backend uses as its log reqId, so both sides can be matched up.
//
// Kept in localStorage so it survives a reload (the first thing a cashier
// does when "it's not working").

const STORAGE_KEY = 'dengo-conn-log'
const MAX_EVENTS = 80

export type ConnEventKind = 'request' | 'ping' | 'state' | 'browser'

export interface ConnEvent {
  /** epoch ms */
  t: number
  kind: ConnEventKind
  /** true = something went wrong (shown in red) */
  bad: boolean
  /** one-line human summary, Spanish */
  msg: string
  method?: string
  path?: string
  status?: number
  ms?: number
  reqId?: string
  /** raw browser error text, e.g. «Failed to fetch» / «Load failed» */
  err?: string
  /** navigator.onLine at that moment */
  netUp?: boolean
  /** Network Information API snapshot, when the browser has it (Chrome/Android) */
  net?: string
  /** document.visibilityState at that moment */
  vis?: string
  /** already sent to the server */
  sent?: boolean
}

let events: ConnEvent[] = load()
const listeners = new Set<() => void>()

function load(): ConnEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.slice(-MAX_EVENTS) : []
  } catch {
    return []
  }
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(events)) } catch { /* full/blocked storage: keep it in memory only */ }
  for (const l of listeners) l()
}

export function netSnapshot(): string | undefined {
  const c = (navigator as Navigator & { connection?: { effectiveType?: string; rtt?: number; downlink?: number; saveData?: boolean } }).connection
  if (!c) return undefined
  const parts = [c.effectiveType, c.rtt != null ? `rtt ${c.rtt}ms` : null, c.downlink != null ? `${c.downlink}Mbps` : null, c.saveData ? 'ahorro datos' : null]
  return parts.filter(Boolean).join(' · ') || undefined
}

export function logConn(e: Omit<ConnEvent, 't' | 'netUp' | 'net' | 'vis'>): void {
  events.push({ t: Date.now(), netUp: navigator.onLine, net: netSnapshot(), vis: document.visibilityState, ...e })
  if (events.length > MAX_EVENTS) events = events.slice(-MAX_EVENTS)
  save()
}

export function getConnLog(): ConnEvent[] {
  return events
}

export function clearConnLog(): void {
  events = []
  save()
}

export function subscribeConnLog(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Short random id sent as X-Request-Id; the backend uses it as the log reqId. */
export function newRequestId(): string {
  const a = new Uint8Array(5)
  crypto.getRandomValues(a)
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('')
}

/** Explains, in plain Spanish, a fetch() that threw (no HTTP answer at all). */
export function explainNetworkFailure(ms: number, err: unknown, timedOutAfter?: number): string {
  if (!navigator.onLine) return 'el dispositivo no tiene red (wifi/datos apagados o sin señal)'
  if (timedOutAfter != null) return `el servidor no contestó en ${(timedOutAfter / 1000).toFixed(0)} s (servidor colgado/saturado o red muy lenta)`
  const name = err instanceof Error ? err.name : ''
  if (name === 'AbortError') return 'la solicitud se canceló (cambio de pantalla o recarga)'
  if (document.visibilityState === 'hidden') return 'falló con la pestaña/pantalla en segundo plano (el sistema suele cortar la red al suspender)'
  if (ms < 400) return `rechazada al instante (${ms} ms): no se pudo abrir la conexión — servidor apagado, DNS, certificado, firewall/antivirus, o la red recién despertando`
  return `conexión cortada a los ${(ms / 1000).toFixed(1)} s sin respuesta — red inestable, o el servidor/proxy cerró la conexión`
}

/** Explains an HTTP status that the app reports as «Sin conexión con el servidor». */
export function explainBadStatus(status: number, serverMsg?: string): string {
  if (status === 502) return 'HTTP 502: el proxy (Caddy) responde pero el backend no — proceso caído o reiniciando'
  if (status === 503) return `HTTP 503: servidor no disponible/sobrecargado${serverMsg ? ` — «${serverMsg}»` : ''}`
  if (status === 504) return 'HTTP 504: el backend tardó demasiado en contestar al proxy (colgado o consulta muy lenta)'
  if (status >= 500) return `HTTP ${status}: error interno del servidor — NO es la red, es un fallo en el backend${serverMsg ? ` («${serverMsg}»)` : ''}; buscar el id en los logs`
  return `HTTP ${status}${serverMsg ? `: ${serverMsg}` : ''}`
}

function hhmmss(t: number): string {
  const d = new Date(t)
  return d.toLocaleTimeString('es-GT', { hour12: false })
}

function line(e: ConnEvent): string {
  const extras = [
    e.reqId ? `id ${e.reqId}` : null,
    e.netUp === false ? 'navegador: sin red' : null,
    e.net ? `red ${e.net}` : null,
    e.vis === 'hidden' ? 'en 2º plano' : null,
    e.err ? `«${e.err}»` : null,
  ].filter(Boolean).join(' · ')
  const req = e.method && e.path ? `${e.method} ${e.path} — ` : ''
  return `${hhmmss(e.t)} ${e.bad ? '✗' : '✓'} ${req}${e.msg}${extras ? `  [${extras}]` : ''}`
}

export function formatConnEvent(e: ConnEvent): string {
  return line(e)
}

/** Header with device/app facts, for the copied text and the server report. */
export function deviceSummary(): Record<string, string> {
  let user = ''
  try { const u = JSON.parse(localStorage.getItem('auth-storage') ?? '{}')?.state?.user; user = u?.username ?? u?.email ?? u?.name ?? '' } catch { /* ignore */ }
  return {
    app: `DENGO POS v${__APP_VERSION__}`,
    sitio: location.host,
    usuario: user,
    hora: new Date().toLocaleString('es-GT', { hour12: false }),
    red: `${navigator.onLine ? 'con red' : 'SIN red'}${netSnapshot() ? ` (${netSnapshot()})` : ''}`,
    navegador: navigator.userAgent,
  }
}

export function formatConnLog(limit = MAX_EVENTS): string {
  const head = Object.entries(deviceSummary()).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n')
  const body = events.slice(-limit).map(line).join('\n')
  return `${head}\n\n${body || '(sin eventos registrados)'}`
}

// ── Browser-level signals ────────────────────────────────────────────────
let hiddenAt: number | null = null
let started = false

export function startConnLogListeners(): void {
  if (started) return
  started = true
  window.addEventListener('online', () => logConn({ kind: 'browser', bad: false, msg: 'el navegador avisa: volvió la red' }))
  window.addEventListener('offline', () => logConn({ kind: 'browser', bad: true, msg: 'el navegador avisa: se perdió la red del dispositivo' }))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return }
    if (hiddenAt != null) {
      const away = Date.now() - hiddenAt
      hiddenAt = null
      // Only worth noting when long enough for the OS to have suspended the
      // network — short tab switches would just flood the log.
      if (away > 60_000) logConn({ kind: 'browser', bad: false, msg: `la pantalla/pestaña volvió tras ${Math.round(away / 60_000)} min oculta (suspensión)` })
    }
  })
}

// ── Sending the log to the server once the connection is back ────────────
let reporting = false

/** POSTs the not-yet-sent problem events to the backend so they show up in
 * its logs. Called by offlineSync after a successful ping. Best effort. */
export async function reportConnLog(baseUrl: string): Promise<void> {
  if (reporting) return
  const pending = events.filter(e => e.bad && !e.sent)
  if (pending.length === 0) return
  reporting = true
  try {
    const token = (() => { try { return JSON.parse(localStorage.getItem('auth-storage') ?? '{}')?.state?.token as string | undefined } catch { return undefined } })()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    // Include the good events around them too (state flips, wakes) — they
    // are what explains the bad ones.
    const firstBad = pending[0].t
    const context = events.filter(e => !e.sent && e.t >= firstBad - 120_000).slice(-40)
    const res = await fetch(`${baseUrl}/api/diag/conn`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ device: deviceSummary(), events: context.map(e => ({ ...e, sent: undefined, at: new Date(e.t).toISOString() })) }),
    })
    if (res.ok) {
      const sentUpTo = context[context.length - 1].t
      events = events.map(e => (e.t <= sentUpTo ? { ...e, sent: true } : e))
      save()
    }
  } catch { /* still offline-ish: next successful ping tries again */ } finally {
    reporting = false
  }
}
