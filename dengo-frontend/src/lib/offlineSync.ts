// Connectivity tracking + replay engine for the offline sales and
// cash-register (close/movement) queues. Deliberately talks to the backend
// with raw `fetch` instead of `lib/api.ts` for the connectivity ping — it
// needs to tell "the network is down" (retry later, keep queued) apart from
// "the server rejected this" (a real error, don't retry forever), and the
// shared client collapses both into the same thrown Error (well, `ApiError`
// does now carry the status — see the classification helper below).

import {
  getPendingSales, removePendingSale, updatePendingSale, type PendingSale,
  getPendingRegisterOps, removePendingRegisterOp, updatePendingRegisterOp, type PendingRegisterOp,
} from './offlineDb'
import { api, ApiError } from './api'

const BASE_URL = import.meta.env.VITE_API_URL as string

type Listener = (state: SyncState) => void
export interface SyncState {
  isOnline: boolean
  pendingCount: number
  pendingRegisterCount: number
  // Genuinely rejected by the server (not a connectivity issue) — these will
  // never sync on their own; see FailedOfflineItemsModal.tsx. Kept separate
  // from pendingCount/pendingRegisterCount (which now only count
  // pending/syncing) so the banner doesn't call something "pending to sync"
  // when it actually never will without the cashier doing something about it.
  failedCount: number
  syncing: boolean
}

let state: SyncState = { isOnline: navigator.onLine, pendingCount: 0, pendingRegisterCount: 0, failedCount: 0, syncing: false }
const listeners = new Set<Listener>()

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch }
  for (const l of listeners) l(state)
}

export function subscribeSyncState(listener: Listener): () => void {
  listeners.add(listener)
  listener(state)
  return () => listeners.delete(listener)
}

export function getSyncState(): SyncState {
  return state
}

export async function refreshPendingCount(): Promise<void> {
  const [sales, registerOps] = await Promise.all([getPendingSales(), getPendingRegisterOps()])
  const notFailed = (x: { status: string }) => x.status !== 'failed'
  setState({
    pendingCount: sales.filter(notFailed).length,
    pendingRegisterCount: registerOps.filter(notFailed).length,
    failedCount: sales.filter(s => s.status === 'failed').length + registerOps.filter(o => o.status === 'failed').length,
  })
}

// Register ids with a queued-but-not-yet-synced CLOSE — POS.tsx/CashRegister.tsx
// subtract these from whatever "open registers" list the server last reported,
// so a register the cashier just closed offline doesn't keep looking sellable
// just because the server doesn't know about the close yet.
export async function getLocallyClosingRegisterIds(): Promise<Set<string>> {
  const ops = await getPendingRegisterOps()
  return new Set(ops.filter(o => o.kind === 'close').map(o => o.registerId))
}

// A cheap, unauthenticated GET — the real signal of "can we reach our
// backend", which `navigator.onLine` doesn't actually guarantee (it only
// means "has *a* network interface up").
async function pingBackend(): Promise<boolean> {
  try {
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), 4000)
    const res = await fetch(`${BASE_URL}/api/license`, { signal: ctrl.signal })
    clearTimeout(timeout)
    return res.ok || res.status === 404 // 404 is a valid response from this endpoint too (license off)
  } catch {
    return false
  }
}

type PostResult = { ok: true } | { ok: false; networkError: boolean; message: string }

/** Classifies a failed POST the same way everywhere it's used: a raw
 * fetch() failure (network down), a 5xx (server itself broke, not this
 * specific request), and a 401 (the session's token outlived its life —
 * see config.ts's JWT_EXPIRES_IN; very reachable overnight for a register
 * closed at day's end and synced the next time someone logs in) are all
 * retried later — none of them mean the DATA was rejected, so none should
 * ever get marked 'failed'. Only a genuine 4xx business rejection does. */
async function classifyPost(run: () => Promise<unknown>, networkErrorMessage: string, genericErrorMessage: string): Promise<PostResult> {
  try {
    await run()
    return { ok: true }
  } catch (err) {
    if (err instanceof TypeError) {
      return { ok: false, networkError: true, message: 'Sin conexión con el servidor' }
    }
    if (err instanceof ApiError && err.status === 401) {
      return { ok: false, networkError: true, message: 'Sesión expirada — se enviará automáticamente al iniciar sesión de nuevo' }
    }
    if (err instanceof ApiError && err.status >= 500) {
      return { ok: false, networkError: true, message: networkErrorMessage }
    }
    return { ok: false, networkError: false, message: err instanceof Error ? err.message : genericErrorMessage }
  }
}

const postSale = (payload: unknown) =>
  classifyPost(() => api.post('/api/sales', payload), 'El servidor no pudo procesar la venta — se reintentará', 'Error al sincronizar la venta')

const postRegisterOp = (op: PendingRegisterOp) => {
  const url = op.kind === 'close' ? `/api/cash-registers/${op.registerId}/close` : `/api/cash-registers/${op.registerId}/movements`
  return classifyPost(() => api.post(url, op.payload), 'El servidor no pudo procesar esto — se reintentará', 'Error al sincronizar')
}

let syncing = false

/** Replays both queues in creation order, stopping each one at the first
 * item that fails because the network is actually down (preserves order —
 * a later item shouldn't sync before an earlier one). An item the server
 * genuinely rejects (not a network issue) is marked failed and skipped, not
 * retried forever, so it doesn't block items queued after it. */
export async function trySync(): Promise<void> {
  if (syncing) return
  syncing = true
  setState({ syncing: true })
  try {
    const online = await pingBackend()
    setState({ isOnline: online })
    if (!online) return

    const pending = await getPendingSales()
    for (const sale of pending) {
      if (sale.status === 'syncing') continue
      await updatePendingSale(sale.localId, { status: 'syncing' })
      const result = await postSale(sale.payload)
      if (result.ok) {
        await removePendingSale(sale.localId)
        continue
      }
      if (result.networkError) {
        await updatePendingSale(sale.localId, { status: 'pending' })
        setState({ isOnline: false })
        break // stop here — still offline, preserve order for next attempt
      }
      // Server actively rejected it (e.g. stale stock check for a non-offline
      // path, bad data) — not something retrying fixes on its own.
      await updatePendingSale(sale.localId, { status: 'failed', lastError: result.message, attempts: (sale.attempts ?? 0) + 1 })
    }

    // Register ops: a close and a movement on the SAME register can both be
    // queued (e.g. one last cash-out right before closing) — replaying in
    // creation order keeps that sequence intact once synced.
    const registerOps = await getPendingRegisterOps()
    for (const op of registerOps) {
      if (op.status === 'syncing') continue
      await updatePendingRegisterOp(op.localId, { status: 'syncing' })
      const result = await postRegisterOp(op)
      if (result.ok) {
        await removePendingRegisterOp(op.localId)
        // CashRegister.tsx (if mounted) is still showing this device's local
        // estimate for whatever just confirmed — without this, a register
        // closed offline keeps showing "(estimado)" and the pre-sync numbers
        // forever once back online, instead of the server's real, final ones.
        window.dispatchEvent(new CustomEvent('dengo:register-synced', { detail: { registerId: op.registerId, kind: op.kind } }))
        continue
      }
      if (result.networkError) {
        await updatePendingRegisterOp(op.localId, { status: 'pending' })
        setState({ isOnline: false })
        break
      }
      await updatePendingRegisterOp(op.localId, { status: 'failed', lastError: result.message, attempts: (op.attempts ?? 0) + 1 })
    }

    await refreshPendingCount()
  } finally {
    syncing = false
    setState({ syncing: false })
  }
}

let started = false

/** Wires up automatic sync: on reconnect, on any failed request anywhere in
 * the app (lib/api.ts's CONNECTIVITY_CHECK_EVENT — catches a 500 or a dead
 * connection on a page that only reads data, which never queues anything
 * and so would otherwise sit on a stale "online" status), and a periodic
 * safety-net poll (the `online` event isn't 100% reliable either). The poll
 * always re-pings — not just while something's queued — otherwise a fresh
 * outage with nothing queued yet goes undetected until something actually
 * fails to write. trySync()'s own `syncing` guard makes calling it from
 * several triggers at once harmless. */
export function startOfflineSync(): void {
  if (started) return
  started = true

  refreshPendingCount()
  window.addEventListener('online', () => { trySync() })
  window.addEventListener('offline', () => setState({ isOnline: false }))
  window.addEventListener('dengo:connectivity-check', () => { trySync() })

  setInterval(() => { trySync() }, 30_000)

  // Try once on startup in case sales/register ops were queued in a previous session.
  trySync()
}

export type { PendingSale, PendingRegisterOp }
