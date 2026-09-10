// Central API client — reads JWT from localStorage, handles 401 globally

const BASE_URL = import.meta.env.VITE_API_URL as string

// Carries the HTTP status alongside the message so callers can tell a
// server-side failure (5xx — not the user's fault, safe to retry/queue)
// apart from a rejected business rule (4xx — needs the user to fix
// something). Still a plain Error to every existing `instanceof Error`
// check across the app; `status` is purely additive.
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function getToken(): string | null {
  try {
    const raw = localStorage.getItem('auth-storage')
    if (!raw) return null
    return JSON.parse(raw)?.state?.token ?? null
  } catch {
    return null
  }
}

// Fired on any network failure or 5xx so lib/offlineSync.ts can re-check
// connectivity immediately instead of waiting for its periodic poll —
// without this, a page that only reads data (never queues anything, since
// GETs aren't queued) could sit on a stale "online" status for up to 30s
// after the backend actually went down, and MainLayout's offline redirect
// wouldn't fire until that catches up. A plain DOM event (not a direct
// import) avoids a circular dependency — offlineSync.ts already imports
// from this file.
const CONNECTIVITY_CHECK_EVENT = 'dengo:connectivity-check'

// The one user-facing string for "the network is down" or "the server
// itself broke (5xx)" — a cashier can't do anything useful with a raw
// "Error 500" or a browser's own "Failed to fetch", and showing one such
// toast per failed request (several can fail around the same moment) is
// noise on top of confusion. Every caller that does `toast.error(e.message)`
// gets this exact string for both cases, which is what lets App.tsx dedupe
// them into a single visible toast (see the sonner override there) instead
// of stacking one per request. A genuine 4xx keeps its real backend message
// — that one IS actionable (bad NIT, insufficient stock, etc.) and callers
// should keep showing it as-is.
export const CONNECTIVITY_ERROR_MESSAGE = 'Sin conexión con el servidor'

async function apiFetch<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (err) {
    window.dispatchEvent(new CustomEvent(CONNECTIVITY_CHECK_EVENT))
    console.error(`API network failure on ${method} ${path}:`, err)
    // A real TypeError (not just one with this message) — every existing
    // `err instanceof TypeError` check across the app (POS.tsx checkout,
    // CashRegister.tsx close/movements, offlineSync.ts) still works.
    throw new TypeError(CONNECTIVITY_ERROR_MESSAGE)
  }

  if (res.status === 401) {
    localStorage.removeItem('auth-storage')
    window.location.href = '/login'
    // ApiError with status 401 (not a plain Error) so offlineSync.ts's
    // classifyPost can tell "session expired" apart from a genuine business
    // rejection — a queued sale/register-op hitting this (e.g. the token
    // outlived its 24h life overnight, see config.ts) must stay 'pending'
    // and retry once the user logs back in, not get marked 'failed' forever
    // just because the specific error wasn't a TypeError or a 5xx.
    throw new ApiError('No autorizado — inicia sesión de nuevo', 401)
  }

  let data: unknown
  try { data = await res.json() } catch { data = {} }

  if (res.status >= 500) {
    window.dispatchEvent(new CustomEvent(CONNECTIVITY_CHECK_EVENT))
    // Log what actually broke for whoever's debugging — only the message
    // shown to the cashier gets normalized, not what lands in the console.
    console.error(`API ${res.status} on ${method} ${path}:`, (data as Record<string, string>)?.error ?? `Error ${res.status}`)
    throw new ApiError(CONNECTIVITY_ERROR_MESSAGE, res.status)
  }

  if (!res.ok) {
    const msg = (data as Record<string, string>)?.error ?? `Error ${res.status}`
    throw new ApiError(msg, res.status)
  }

  return data as T
}

export const api = {
  get:    <T = unknown>(path: string)                  => apiFetch<T>('GET',    path),
  post:   <T = unknown>(path: string, body: unknown)   => apiFetch<T>('POST',   path, body),
  put:    <T = unknown>(path: string, body: unknown)   => apiFetch<T>('PUT',    path, body),
  patch:  <T = unknown>(path: string, body: unknown)   => apiFetch<T>('PATCH',  path, body),
  delete: <T = unknown>(path: string, body?: unknown)   => apiFetch<T>('DELETE', path, body),
}
