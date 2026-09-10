// Local persistence for the offline-capable sales + cash-register flow.
// Stores:
//  - "pendingSales": sales created while the backend was unreachable, queued
//    here until they can be replayed. Never lost on reload — IndexedDB
//    persists across sessions, unlike an in-memory queue.
//  - "pendingRegisterOps": a register CLOSE or cash MOVEMENT attempted while
//    unreachable. Deliberately does not cover OPENING a register offline —
//    selling already hard-requires an open register selected first, so a
//    register opened online during the day is the realistic case this
//    exists for (see CashRegister.tsx / offlineSync.ts for why "open" was
//    scoped out: it would need remapping a local id to a real one once
//    synced before any dependent close/movement could sync after it).
//  - "cache": a snapshot of whatever POS.tsx needs to keep selling without a
//    live connection (catalog, customers, open registers, branch info) —
//    refreshed every time those actually load successfully online.
//
// Scoped deliberately narrow: this exists to answer "can the cashier keep
// working during an outage", not to make the whole app offline.

const DB_NAME = 'dengo-offline'
const DB_VERSION = 2
const STORE_PENDING = 'pendingSales'
const STORE_REGISTER_OPS = 'pendingRegisterOps'
const STORE_CACHE = 'cache'

export interface PendingSale {
  localId: string // = clientRequestId sent to the backend, the idempotency key
  payload: Record<string, unknown>
  createdAt: string
  status: 'pending' | 'syncing' | 'failed'
  attempts: number
  lastError?: string
}

export interface PendingRegisterOp {
  localId: string // = clientRequestId sent to the backend, the idempotency key
  kind: 'close' | 'movement'
  registerId: string // real server CashRegister id — see note above on why "open" isn't queued
  payload: Record<string, unknown>
  createdAt: string
  status: 'pending' | 'syncing' | 'failed'
  attempts: number
  lastError?: string
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_PENDING)) {
        db.createObjectStore(STORE_PENDING, { keyPath: 'localId' })
      }
      if (!db.objectStoreNames.contains(STORE_REGISTER_OPS)) {
        db.createObjectStore(STORE_REGISTER_OPS, { keyPath: 'localId' })
      }
      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        db.createObjectStore(STORE_CACHE, { keyPath: 'key' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

async function withStore<T>(storeName: string, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode)
    const store = tx.objectStore(storeName)
    const req = fn(store)
    req.onsuccess = () => resolve(req.result as T)
    req.onerror = () => reject(req.error)
  })
}

// ── Pending sales queue ─────────────────────────────────────────────────
export async function queuePendingSale(payload: Record<string, unknown>): Promise<PendingSale> {
  const localId = crypto.randomUUID()
  const record: PendingSale = { localId, payload: { ...payload, clientRequestId: localId }, createdAt: new Date().toISOString(), status: 'pending', attempts: 0 }
  await withStore(STORE_PENDING, 'readwrite', store => store.put(record))
  return record
}

export async function getPendingSales(): Promise<PendingSale[]> {
  const all = await withStore<PendingSale[]>(STORE_PENDING, 'readonly', store => store.getAll())
  return (all ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function updatePendingSale(localId: string, patch: Partial<PendingSale>): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_PENDING, 'readwrite')
    const store = tx.objectStore(STORE_PENDING)
    const getReq = store.get(localId)
    getReq.onsuccess = () => {
      const existing = getReq.result as PendingSale | undefined
      if (!existing) { resolve(); return }
      store.put({ ...existing, ...patch })
      resolve()
    }
    getReq.onerror = () => reject(getReq.error)
  })
}

export async function removePendingSale(localId: string): Promise<void> {
  await withStore(STORE_PENDING, 'readwrite', store => store.delete(localId))
}

export async function countPendingSales(): Promise<number> {
  return withStore<number>(STORE_PENDING, 'readonly', store => store.count())
}

// ── Pending register close/movement queue ───────────────────────────────
export async function queueRegisterOp(kind: PendingRegisterOp['kind'], registerId: string, payload: Record<string, unknown>): Promise<PendingRegisterOp> {
  const localId = crypto.randomUUID()
  const record: PendingRegisterOp = { localId, kind, registerId, payload: { ...payload, clientRequestId: localId }, createdAt: new Date().toISOString(), status: 'pending', attempts: 0 }
  await withStore(STORE_REGISTER_OPS, 'readwrite', store => store.put(record))
  return record
}

export async function getPendingRegisterOps(): Promise<PendingRegisterOp[]> {
  const all = await withStore<PendingRegisterOp[]>(STORE_REGISTER_OPS, 'readonly', store => store.getAll())
  return (all ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function updatePendingRegisterOp(localId: string, patch: Partial<PendingRegisterOp>): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_REGISTER_OPS, 'readwrite')
    const store = tx.objectStore(STORE_REGISTER_OPS)
    const getReq = store.get(localId)
    getReq.onsuccess = () => {
      const existing = getReq.result as PendingRegisterOp | undefined
      if (!existing) { resolve(); return }
      store.put({ ...existing, ...patch })
      resolve()
    }
    getReq.onerror = () => reject(getReq.error)
  })
}

export async function removePendingRegisterOp(localId: string): Promise<void> {
  await withStore(STORE_REGISTER_OPS, 'readwrite', store => store.delete(localId))
}

// ── Read-through cache (catalog, customers, registers, branch) ─────────
export async function setCache(key: string, value: unknown): Promise<void> {
  await withStore(STORE_CACHE, 'readwrite', store => store.put({ key, value, savedAt: new Date().toISOString() }))
}

export async function getCache<T>(key: string): Promise<T | null> {
  const row = await withStore<{ key: string; value: T } | undefined>(STORE_CACHE, 'readonly', store => store.get(key))
  return row ? row.value : null
}

// ── Running per-register sales tally ────────────────────────────────────
// CashRegister.tsx's `reg.sales` (server-computed) is only ever as fresh as
// the last time that page happened to fetch it — nothing re-fetches it as
// sales happen on POS.tsx, online or offline, so a cashier who opens the
// register and doesn't come back to Caja until closing time sees a number
// from whenever they last loaded that page, not what actually happened
// since. This tally is the fix: POS.tsx increments it the instant each sale
// completes (see addSaleToRegisterTally calls in POS.tsx), so it's always
// current regardless of which page anyone's on or whether the connection is
// up. Reset to zero when a register opens (a new register has no sales
// yet), it becomes the sole source of truth for "cash/card/transfer/credit
// taken in this register's session so far" — not added on top of
// `reg.sales`, which would double-count once both agree.
export interface RegisterSalesTally {
  total: number
  count: number
  cash: number
  card: number
  transfer: number
  credit: number
}

const EMPTY_TALLY: RegisterSalesTally = { total: 0, count: 0, cash: 0, card: 0, transfer: 0, credit: 0 }

function tallyKey(registerId: string): string {
  return `salesTally-${registerId}`
}

export async function addSaleToRegisterTally(registerId: string, contribution: Partial<RegisterSalesTally>): Promise<void> {
  const current = (await getCache<RegisterSalesTally>(tallyKey(registerId))) ?? EMPTY_TALLY
  const updated: RegisterSalesTally = {
    total: current.total + (contribution.total ?? 0),
    count: current.count + 1,
    cash: current.cash + (contribution.cash ?? 0),
    card: current.card + (contribution.card ?? 0),
    transfer: current.transfer + (contribution.transfer ?? 0),
    credit: current.credit + (contribution.credit ?? 0),
  }
  await setCache(tallyKey(registerId), updated)
}

export async function getRegisterTally(registerId: string): Promise<RegisterSalesTally> {
  return (await getCache<RegisterSalesTally>(tallyKey(registerId))) ?? { ...EMPTY_TALLY }
}

export async function resetRegisterTally(registerId: string): Promise<void> {
  await setCache(tallyKey(registerId), { ...EMPTY_TALLY })
}
