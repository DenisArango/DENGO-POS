import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  TrendingUp, TrendingDown, Wallet,
  Plus, X, Printer, Eye, Lock, Unlock
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { api, ApiError } from '../lib/api'
import { useAuthStore } from '../store'
import { useStore } from '../contexts/StoreContext'
import { usePermissions } from '../hooks/usePermissions'
import { ThermalCashCloseReport, ThermalReconciliationSlip } from '../components/print/ThermalCashCloseReport'
import {
  queueRegisterOp, setCache, getCache, getRegisterTally, resetRegisterTally, type RegisterSalesTally,
  getPendingRegisterOps, updatePendingRegisterOp,
} from '../lib/offlineDb'
import { trySync, refreshPendingCount, getLocallyClosingRegisterIds } from '../lib/offlineSync'

interface CashSales {
  total: number; count: number; cash: number
  card: number; transfer: number; credit: number
  creditPaymentsCash: number
}

interface CashRegisterRecord {
  id: string; name?: string; registerNumber?: string
  openedBy?: string; openedById?: string; openedAt: string
  closedBy?: string; closedById?: string; closedAt?: string
  initialAmount: number; finalAmount?: number
  expectedAmount?: number; difference?: number
  externalSalesTotal?: number; externalSalesDifference?: number
  branchId?: string; status: 'OPEN' | 'CLOSED'
  sales?: CashSales; movements: CashMovement[]
  // Set only on the offline-queued close path — expectedAmount/difference
  // aren't known locally (the server computes them from sales at close
  // time), so they stay undefined until this actually syncs.
  pendingSync?: boolean
}

interface CashMovement {
  id: string; type: 'INCOME' | 'EXPENSE'
  amount: number; description: string
  performedBy?: string; createdAt: string
}

function normalizeRegister(reg: any): CashRegisterRecord {
  return {
    ...reg,
    initialAmount: Number(reg.initialAmount ?? 0),
    finalAmount: reg.finalAmount != null ? Number(reg.finalAmount) : undefined,
    expectedAmount: reg.expectedAmount != null ? Number(reg.expectedAmount) : undefined,
    difference: reg.difference != null ? Number(reg.difference) : undefined,
    externalSalesTotal: reg.externalSalesTotal != null ? Number(reg.externalSalesTotal) : undefined,
    externalSalesDifference: reg.externalSalesDifference != null ? Number(reg.externalSalesDifference) : undefined,
    openedBy: reg.openedBy?.name ?? reg.openedBy ?? undefined,
    closedBy: reg.closedBy?.name ?? reg.closedBy ?? undefined,
    sales: reg.sales ? {
      total: Number(reg.sales.total ?? 0), count: Number(reg.sales.count ?? 0),
      cash: Number(reg.sales.cash ?? 0), card: Number(reg.sales.card ?? 0),
      transfer: Number(reg.sales.transfer ?? 0), credit: Number(reg.sales.credit ?? 0),
      creditPaymentsCash: Number(reg.sales.creditPaymentsCash ?? 0),
    } : undefined,
    movements: (reg.movements ?? []).map((m: any) => ({
      ...m, amount: Number(m.amount ?? 0),
      performedBy: m.performedBy?.name ?? m.performedBy ?? undefined,
    })),
  }
}

export default function CashRegisterPage() {
  const { user } = useAuthStore()
  const { currentStore } = useStore()
  const BRANCH_ID = currentStore?.id ?? user?.branchId ?? ''
  const { hasPermission } = usePermissions()
  const canOpen = hasPermission('cash.open')
  const canClose = hasPermission('cash.close')
  const canMovements = hasPermission('cash.movements')

  const [cashRegisters, setCashRegisters] = useState<CashRegisterRecord[]>([])
  const [openRegisters, setOpenRegisters] = useState<CashRegisterRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [showOpenModal, setShowOpenModal] = useState(false)
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [showMovementModal, setShowMovementModal] = useState(false)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [selectedRegister, setSelectedRegister] = useState<CashRegisterRecord | null>(null)
  const [registerToClose, setRegisterToClose] = useState<CashRegisterRecord | null>(null)
  const [registerForMovement, setRegisterForMovement] = useState<CashRegisterRecord | null>(null)

  const [initialAmount, setInitialAmount] = useState('')
  const [selectedDefinitionId, setSelectedDefinitionId] = useState('')
  const [registerDefinitions, setRegisterDefinitions] = useState<{ id: string; name: string; registerNumber: string }[]>([])
  const [finalCount, setFinalCount] = useState('')
  const [nextOpenAmount, setNextOpenAmount] = useState('')
  // Drives the "abrir la caja de mañana ahora" prompt in the report modal —
  // set right after a close where the cashier entered a suggested amount,
  // cleared once they either open it or dismiss the prompt.
  const [reopenSuggestion, setReopenSuggestion] = useState<{ amount: string; registerNumber: string; name?: string } | null>(null)
  const [reopeningNextDay, setReopeningNextDay] = useState(false)
  const [externalSalesTotalInput, setExternalSalesTotalInput] = useState('')
  const [reconciliationInput, setReconciliationInput] = useState('')
  const [savingReconciliation, setSavingReconciliation] = useState(false)
  const [printMode, setPrintMode] = useState<'summary' | 'reconciliation' | null>(null)
  const [movementType, setMovementType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE')
  const [movementAmount, setMovementAmount] = useState('')
  const [movementDescription, setMovementDescription] = useState('')

  const fetchRegisters = async () => {
    if (!BRANCH_ID) return
    setLoading(true)
    const registerCacheKey = `registers-full-${BRANCH_ID}`
    try {
      const [openList, list] = await Promise.all([
        api.get<any[]>(`/api/cash-registers/current?branchId=${BRANCH_ID}`),
        api.get<any[]>(`/api/cash-registers?branchId=${BRANCH_ID}`),
      ])
      const rawOpens = (Array.isArray(openList) ? openList : (openList ? [openList] : [])).filter(Boolean)
      await setCache(registerCacheKey, rawOpens)
      // Also feed POS.tsx's own (simpler) cache — same reasoning in reverse:
      // a cashier could visit Caja first and go offline before POS ever got
      // a chance to fetch its own register list.
      await setCache(`registers-${BRANCH_ID}`, rawOpens.map((r: any) => ({ id: r.id, name: r.name ?? 'Caja', registerNumber: r.registerNumber ?? '?' })))
      // The server doesn't know about a close still sitting in the offline
      // queue — drop those from "open" locally so the register a cashier
      // just closed offline doesn't keep looking sellable-into.
      const closingIds = await getLocallyClosingRegisterIds()
      const opens = rawOpens.filter((r: any) => !closingIds.has(r.id)).map(normalizeRegister)
      setOpenRegisters(opens)
      setCashRegisters((list ?? []).map(normalizeRegister))
      await refreshRegisterTallies(opens.map(r => r.id))
    } catch (e) {
      // Same reasoning as POS.tsx's own register fetch and StoreContext's
      // branch cache: without this, entering Caja during an outage shows no
      // open registers at all — not "can't reach server," just an empty
      // list — so a cashier can't even see (much less close) the register
      // that was open when the connection dropped.
      console.error('Error al cargar cajas, usando caché local:', e)
      const cachedOpens = await getCache<any[]>(registerCacheKey)
      if (cachedOpens && cachedOpens.length > 0) {
        const closingIds = await getLocallyClosingRegisterIds()
        const opens = cachedOpens.filter((r: any) => !closingIds.has(r.id)).map(normalizeRegister)
        setOpenRegisters(opens)
        await refreshRegisterTallies(opens.map((r: CashRegisterRecord) => r.id))
      } else {
        toast.error(e instanceof Error ? e.message : 'Error al cargar cajas')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRegisters()
    if (BRANCH_ID) {
      api.get<any[]>(`/api/cash-registers/register-definitions?branchId=${BRANCH_ID}`)
        .then(d => setRegisterDefinitions(d ?? []))
        .catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [BRANCH_ID])

  // A close/movement queued offline finally confirming with the server
  // (see lib/offlineSync.ts's 'dengo:register-synced' dispatch) means this
  // page's local estimate is now stale in the other direction — refetch so
  // "(estimado)" and the pre-sync numbers get replaced by the server's real,
  // final ones instead of sitting there until someone happens to reload.
  useEffect(() => {
    const handler = () => fetchRegisters()
    window.addEventListener('dengo:register-synced', handler)
    return () => window.removeEventListener('dengo:register-synced', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [BRANCH_ID])

  const availableDefinitions = registerDefinitions.filter(
    d => !openRegisters.some(r => r.registerNumber === d.registerNumber)
  )

  const handleOpenRegister = () => {
    if (!selectedDefinitionId) {
      toast.error('Selecciona una caja'); return
    }
    if (!initialAmount || parseFloat(initialAmount) < 0) {
      toast.error('Ingresa un monto inicial válido'); return
    }
    setSaving(true)
    api.post<any>('/api/cash-registers/open', {
      branchId: BRANCH_ID,
      registerDefinitionId: selectedDefinitionId,
      initialAmount: parseFloat(initialAmount),
    })
      .then(async raw => {
        const newReg = normalizeRegister(raw)
        await resetRegisterTally(newReg.id) // a brand-new register has no sales yet either way, but this also clears out any stale leftover under a reused id
        setOpenRegisters(prev => [...prev, newReg])
        setCashRegisters(prev => [newReg, ...prev])
        setShowOpenModal(false)
        setInitialAmount('')
        setSelectedDefinitionId('')
        toast.success('Caja abierta exitosamente')
      })
      .catch(e => toast.error(e.message))
      .finally(() => setSaving(false))
  }

  // "¿Abrir la caja de mañana ahora?" — the cashier already told us the
  // amount they're leaving in the drawer overnight at close time; opening
  // right away with that same number saves them from having to remember to
  // do it manually the next morning. Matches the same registerNumber that
  // was just closed (that's what actually identifies "the same drawer",
  // not the closed register's own id, which is gone). Opening isn't
  // supported offline (see lib/offlineDb.ts's note on why), so this just
  // surfaces the normal connectivity error via the existing toast handling
  // if there's no connection yet — the prompt stays up to retry.
  const handleReopenNextDay = async () => {
    if (!reopenSuggestion) return
    const def = registerDefinitions.find(d => d.registerNumber === reopenSuggestion.registerNumber)
    if (!def) {
      toast.error('No se encontró la configuración de esa caja — ábrela manualmente con "Abrir Caja"')
      return
    }
    setReopeningNextDay(true)
    try {
      const raw = await api.post<any>('/api/cash-registers/open', {
        branchId: BRANCH_ID,
        registerDefinitionId: def.id,
        initialAmount: parseFloat(reopenSuggestion.amount),
      })
      const newReg = normalizeRegister(raw)
      await resetRegisterTally(newReg.id)
      setOpenRegisters(prev => [...prev, newReg])
      setCashRegisters(prev => [newReg, ...prev])
      setReopenSuggestion(null)
      toast.success(`Caja abierta para el siguiente día con Q${reopenSuggestion.amount}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al abrir la caja')
    } finally {
      setReopeningNextDay(false)
    }
  }

  // reg.sales (server-computed) is only ever as fresh as the last time this
  // page happened to fetch it — nothing re-fetches it as sales happen on
  // POS.tsx, online or offline, so a cashier who doesn't come back to Caja
  // between sales sees a number from whenever they last loaded this page,
  // not what actually happened since (this was the real bug: not an
  // online/offline mismatch, but this page's data going stale the moment
  // you leave it). registerTallies is POS.tsx's own live running count
  // (see lib/offlineDb.ts's addSaleToRegisterTally, incremented the instant
  // each sale completes) — the sole source of truth here, not added on top
  // of reg.sales, which would double-count once both agree.
  const [registerTallies, setRegisterTallies] = useState<Record<string, RegisterSalesTally>>({})

  const refreshRegisterTallies = async (registerIds: string[]) => {
    const entries = await Promise.all(registerIds.map(async id => [id, await getRegisterTally(id)] as const))
    setRegisterTallies(prev => ({ ...prev, ...Object.fromEntries(entries) }))
  }

  // What the cashier is expected to HAND OVER — not everything in the
  // drawer. initialAmount deliberately isn't in this formula: that float is
  // meant to stay behind as tomorrow's opening amount (the register carries
  // the same physical cash forward, closed and reopened with it), so it was
  // never expected to be delivered in the first place. Matches the backend's
  // same change in cash-registers.ts's /close.
  const calcBalance = (reg: CashRegisterRecord) => {
    const incomes = (reg.movements ?? []).filter(m => m.type === 'INCOME').reduce((s, m) => s + m.amount, 0)
    const expenses = (reg.movements ?? []).filter(m => m.type === 'EXPENSE').reduce((s, m) => s + m.amount, 0)
    const cash = registerTallies[reg.id]?.cash ?? 0
    return cash + incomes - expenses
  }

  // A register being viewed (Detalles de Caja) can be still-OPEN (reg.sales
  // is the same stale snapshot calcBalance stopped trusting) or a genuinely
  // CLOSED-and-synced one (reg.sales is the server's real, final number —
  // trust it, the tally isn't tracking a session that's already over).
  const getDisplaySales = (reg: CashRegisterRecord): CashSales => {
    if (reg.status === 'OPEN' || reg.pendingSync) {
      const t = registerTallies[reg.id]
      return {
        total: t?.total ?? 0, count: t?.count ?? 0, cash: t?.cash ?? 0,
        card: t?.card ?? 0, transfer: t?.transfer ?? 0, credit: t?.credit ?? 0,
        creditPaymentsCash: reg.sales?.creditPaymentsCash ?? 0,
      }
    }
    return reg.sales ?? { total: 0, count: 0, cash: 0, card: 0, transfer: 0, credit: 0, creditPaymentsCash: 0 }
  }

  const handleCloseRegister = async () => {
    const reg = registerToClose
    if (!reg) return
    if (!finalCount || parseFloat(finalCount) < 0) {
      toast.error('Ingresa el monto final contado'); return
    }
    setSaving(true)
    const payload: any = { finalAmount: parseFloat(finalCount) }
    if (currentStore?.salesReconciliationEnabled && externalSalesTotalInput.trim()) {
      payload.externalSalesTotal = parseFloat(externalSalesTotalInput)
    }

    const applyClosedLocally = (closedReg: CashRegisterRecord) => {
      setCashRegisters(prev => prev.map(r => r.id === closedReg.id ? closedReg : r))
      setOpenRegisters(prev => prev.filter(r => r.id !== closedReg.id))
      setSelectedRegister(closedReg)
      setRegisterToClose(null)
      setShowCloseModal(false)
      setFinalCount('')
      setExternalSalesTotalInput('')
      // Captured before clearing nextOpenAmount — drives the "abrir mañana
      // ahora" prompt in the report modal below instead of just quietly
      // prefilling a form nobody's asked to open yet.
      if (nextOpenAmount) {
        setReopenSuggestion({ amount: nextOpenAmount, registerNumber: closedReg.registerNumber ?? '', name: closedReg.name })
        setInitialAmount(nextOpenAmount)
      }
      setNextOpenAmount('')
      setPrintMode(null)
      setReconciliationInput(closedReg.externalSalesTotal != null ? String(closedReg.externalSalesTotal) : '')
      setShowReportModal(true)
    }

    try {
      const raw = await api.post<any>(`/api/cash-registers/${reg.id}/close`, payload)
      const closedReg = normalizeRegister(raw)
      applyClosedLocally(closedReg)
      const diff = closedReg.difference ?? 0
      if (diff !== 0) {
        toast.warning(diff > 0 ? `Sobrante de Q${Math.abs(diff).toFixed(2)}` : `Faltante de Q${Math.abs(diff).toFixed(2)}`)
      } else {
        toast.success('¡Caja cuadrada perfectamente!')
      }
    } catch (err) {
      // Same reasoning as POS.tsx's sale checkout: no network, or the server
      // itself broke (5xx), isn't the cashier's fault and isn't something
      // retrying-right-now fixes — queue it instead of leaving the cashier
      // stuck unable to close at all. The server will recompute the
      // authoritative expectedAmount/difference once this syncs (from every
      // sale it has on record for this register, including any from other
      // devices) — but a register is realistically one cashier's for the
      // day, so estimating it locally now (this device's known sales +
      // queued offline sales + movements, same as calcBalance's preview) is
      // far more useful than showing nothing, which is exactly when a
      // cashier most needs this number. Marked pendingSync so the report
      // makes clear it's an estimate, not the confirmed close.
      const isRetryable = err instanceof TypeError || (err instanceof ApiError && err.status >= 500)
      if (isRetryable) {
        await queueRegisterOp('close', reg.id, payload)
        await refreshPendingCount()
        const estimatedExpected = calcBalance(reg)
        const tally = registerTallies[reg.id]
        applyClosedLocally({
          ...reg, status: 'CLOSED', finalAmount: payload.finalAmount,
          expectedAmount: estimatedExpected, difference: payload.finalAmount - estimatedExpected,
          closedAt: new Date().toISOString(), pendingSync: true,
          // "Ventas por Método de Pago" reads reg.sales — reg.sales itself
          // is the same stale snapshot calcBalance stopped trusting above,
          // so swap it for the live tally here too instead of only fixing
          // the one number that happened to get noticed.
          ...(tally ? { sales: { ...tally, creditPaymentsCash: reg.sales?.creditPaymentsCash ?? 0 } } : {}),
        })
        const diff = payload.finalAmount - estimatedExpected
        if (Math.abs(diff) > 0.005) {
          toast.warning(`Estimado sin conexión: ${diff > 0 ? 'sobrante' : 'faltante'} de Q${Math.abs(diff).toFixed(2)} — se confirma al sincronizar`)
        } else {
          toast.success('Sin conexión — cierre guardado y cuadrado según lo que se sabe hasta ahora, se confirma al sincronizar')
        }
        trySync()
      } else {
        toast.error(err instanceof Error ? err.message : 'Error al cerrar la caja')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleSaveReconciliation = async () => {
    if (!selectedRegister || !reconciliationInput.trim() || parseFloat(reconciliationInput) < 0) {
      toast.error('Ingresa el total según Excel'); return
    }
    const externalSalesTotal = parseFloat(reconciliationInput)
    setSavingReconciliation(true)
    try {
      if (selectedRegister.pendingSync) {
        // The close itself is still queued — there's no CLOSED register on
        // the server yet for /reconciliation to patch (it 404s: "aún no
        // está cerrada"). Amend the still-queued close's own payload
        // instead, so the real total travels with it once it syncs, and
        // reflect it locally now so "Imprimir Conciliación" doesn't stay
        // stuck waiting on a connection that might not come back for a while.
        const ops = await getPendingRegisterOps()
        const closeOp = ops.find(o => o.kind === 'close' && o.registerId === selectedRegister.id)
        if (closeOp) {
          await updatePendingRegisterOp(closeOp.localId, { payload: { ...closeOp.payload, externalSalesTotal } })
        }
        const sales = getDisplaySales(selectedRegister)
        const updated: CashRegisterRecord = {
          ...selectedRegister, externalSalesTotal,
          externalSalesDifference: sales.total - externalSalesTotal,
        }
        setSelectedRegister(updated)
        setCashRegisters(prev => prev.map(r => r.id === updated.id ? updated : r))
        toast.success('Conciliación guardada — se confirma cuando el cierre sincronice')
      } else {
        const raw = await api.patch<any>(`/api/cash-registers/${selectedRegister.id}/reconciliation`, { externalSalesTotal })
        const updated = normalizeRegister(raw)
        setSelectedRegister(updated)
        setCashRegisters(prev => prev.map(r => r.id === updated.id ? updated : r))
        toast.success('Conciliación guardada')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar la conciliación')
    } finally {
      setSavingReconciliation(false)
    }
  }

  const handlePrint = (mode: 'summary' | 'reconciliation') => {
    setPrintMode(mode)
    // Let the print-only block render with the new mode before invoking print
    requestAnimationFrame(() => window.print())
  }

  const handleAddMovement = async () => {
    const reg = registerForMovement ?? openRegisters[0] ?? null
    if (!reg) return
    if (!movementAmount || parseFloat(movementAmount) <= 0) {
      toast.error('Ingresa un monto válido'); return
    }
    if (!movementDescription.trim()) {
      toast.error('Ingresa una descripción'); return
    }
    setSaving(true)
    const movementPayload = { type: movementType, amount: parseFloat(movementAmount), description: movementDescription }
    const applyMovementLocally = (newMovement: CashMovement) => {
      const update = (r: CashRegisterRecord) => r.id === reg.id
        ? { ...r, movements: [...(r.movements ?? []), newMovement] } : r
      setOpenRegisters(prev => prev.map(update))
      setCashRegisters(prev => prev.map(update))
      setShowMovementModal(false)
      setRegisterForMovement(null)
      setMovementAmount('')
      setMovementDescription('')
    }

    try {
      const raw = await api.post<any>(`/api/cash-registers/${reg.id}/movements`, movementPayload)
      applyMovementLocally({
        ...raw, amount: Number(raw.amount ?? 0),
        performedBy: raw.performedBy?.name ?? raw.performedBy ?? undefined,
      })
      toast.success(`${movementType === 'INCOME' ? 'Entrada' : 'Salida'} registrada exitosamente`)
    } catch (err) {
      const isRetryable = err instanceof TypeError || (err instanceof ApiError && err.status >= 500)
      if (isRetryable) {
        const queued = await queueRegisterOp('movement', reg.id, movementPayload)
        await refreshPendingCount()
        applyMovementLocally({
          id: queued.localId, type: movementType, amount: movementPayload.amount,
          description: movementDescription, performedBy: user?.name, createdAt: queued.createdAt,
        })
        toast.success('Sin conexión — movimiento guardado, se sincronizará automáticamente')
        trySync()
      } else {
        toast.error(err instanceof Error ? err.message : 'Error al registrar el movimiento')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
    <div className="space-y-6 print:hidden">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Wallet size={28} /> Control de Caja
          </h1>
          <p className="text-gray-600 text-sm mt-1">Apertura, cierre y movimientos de caja</p>
        </div>
        {canOpen && (
          <button onClick={() => setShowOpenModal(true)} className="btn-primary btn-md flex items-center gap-2">
            <Unlock size={18} /> Abrir Caja
          </button>
        )}
      </div>

      {loading && <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" /></div>}

      {/* Cajas abiertas */}
      {!loading && openRegisters.map(reg => (
        <motion.div key={reg.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-lg shadow-lg p-6 text-white">
          <div className="flex flex-wrap items-start justify-between mb-4 gap-y-3">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-white bg-opacity-20 rounded-lg"><Unlock size={24} /></div>
              <div>
                <p className="text-sm opacity-90">{reg.name ?? 'Caja'} #{reg.registerNumber ?? '–'} — Abierta</p>
                <p className="text-xl font-bold">{reg.openedBy ?? user?.name ?? '—'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-right text-sm">
                <p className="opacity-90">Apertura</p>
                <p className="font-medium">{format(new Date(reg.openedAt), "HH:mm", { locale: es })}</p>
              </div>
              <div className="flex gap-2">
                {canMovements && (
                  <button
                    onClick={() => { setRegisterForMovement(reg); setShowMovementModal(true) }}
                    className="px-3 py-1.5 text-xs font-medium bg-white bg-opacity-20 hover:bg-opacity-30 rounded-lg flex items-center gap-1">
                    <Plus size={13} /> Movimiento
                  </button>
                )}
                {canClose && (
                  <button
                    onClick={() => { setRegisterToClose(reg); setFinalCount(''); setExternalSalesTotalInput(''); setShowCloseModal(true); refreshRegisterTallies([reg.id]) }}
                    className="px-3 py-1.5 text-xs font-medium bg-white bg-opacity-20 hover:bg-opacity-30 rounded-lg flex items-center gap-1">
                    <Lock size={13} /> Cerrar
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white bg-opacity-10 rounded-lg p-4">
              <p className="text-sm opacity-90 mb-1">Monto Inicial</p>
              <p className="text-2xl font-bold">Q{reg.initialAmount.toFixed(2)}</p>
            </div>
            <div className="bg-white bg-opacity-10 rounded-lg p-4">
              <p className="text-sm opacity-90 mb-1">Ventas del Día</p>
              <p className="text-2xl font-bold">Q{(registerTallies[reg.id]?.total ?? 0).toFixed(2)}</p>
              <p className="text-xs opacity-75">{registerTallies[reg.id]?.count ?? 0} transacciones</p>
            </div>
            <div className="bg-white bg-opacity-10 rounded-lg p-4">
              <p className="text-sm opacity-90 mb-2">Por Método</p>
              <div className="space-y-0.5 text-xs">
                <div className="flex justify-between"><span className="opacity-75">Efectivo:</span><span className="font-semibold">Q{(registerTallies[reg.id]?.cash ?? 0).toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="opacity-75">Tarjeta:</span><span className="font-semibold">Q{(registerTallies[reg.id]?.card ?? 0).toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="opacity-75">Transfer.:</span><span className="font-semibold">Q{(registerTallies[reg.id]?.transfer ?? 0).toFixed(2)}</span></div>
                {(registerTallies[reg.id]?.credit ?? 0) > 0 && <div className="flex justify-between"><span className="opacity-75">Crédito:</span><span className="font-semibold">Q{registerTallies[reg.id]!.credit.toFixed(2)}</span></div>}
              </div>
            </div>
            <div className="bg-white bg-opacity-10 rounded-lg p-4">
              <p className="text-sm opacity-90 mb-1">Efectivo en Caja</p>
              <p className="text-2xl font-bold">Q{calcBalance(reg).toFixed(2)}</p>
              <div className="flex gap-2 mt-1 text-xs opacity-75">
                <span className="text-green-300">+Q{(reg.movements ?? []).filter(m => m.type === 'INCOME').reduce((s, m) => s + m.amount, 0).toFixed(2)} ent.</span>
                <span className="text-red-300">-Q{(reg.movements ?? []).filter(m => m.type === 'EXPENSE').reduce((s, m) => s + m.amount, 0).toFixed(2)} sal.</span>
              </div>
            </div>
          </div>

          {(reg.movements ?? []).length > 0 && (
            <div className="mt-4">
              <p className="text-sm opacity-90 mb-2">Movimientos Recientes</p>
              <div className="space-y-1.5">
                {(reg.movements ?? []).slice(-3).reverse().map(movement => (
                  <div key={movement.id} className="flex items-center justify-between bg-white bg-opacity-10 rounded p-2 text-sm">
                    <div className="flex items-center gap-2">
                      {movement.type === 'INCOME' ? <TrendingUp size={15} className="text-green-300" /> : <TrendingDown size={15} className="text-red-300" />}
                      <span>{movement.description}</span>
                    </div>
                    <span className={movement.type === 'INCOME' ? 'text-green-300' : 'text-red-300'}>
                      {movement.type === 'INCOME' ? '+' : '-'}Q{movement.amount.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      ))}

      {/* Historial de cajas */}
      {!loading && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">Historial de Cajas</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Caja / Fecha</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Responsable</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Inicial</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Final</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Diferencia</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Estado</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {cashRegisters.slice().reverse().map((register) => (
                  <tr key={register.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <p className="text-sm font-medium">{register.name ?? 'Caja'} #{register.registerNumber ?? '–'}</p>
                      <p className="text-xs text-gray-500">
                        {format(new Date(register.openedAt), "d MMM yyyy HH:mm", { locale: es })}
                        {register.closedAt && ` — ${format(new Date(register.closedAt), "HH:mm", { locale: es })}`}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-sm">{register.openedBy ?? '—'}</td>
                    <td className="py-3 px-4 text-right text-sm font-medium">Q{register.initialAmount.toFixed(2)}</td>
                    <td className="py-3 px-4 text-right text-sm font-medium">
                      {register.finalAmount !== undefined ? `Q${register.finalAmount.toFixed(2)}` : <span className="text-gray-400">–</span>}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {register.difference !== undefined ? (
                        <span className={`text-sm font-bold ${register.difference > 0 ? 'text-green-600' : register.difference < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                          {register.difference > 0 && '+'}Q{register.difference.toFixed(2)}
                        </span>
                      ) : <span className="text-gray-400 text-sm">–</span>}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {register.status === 'OPEN' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-600"><Unlock size={12} />Abierta</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600"><Lock size={12} />Cerrada</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => { setSelectedRegister(register); setShowDetailsModal(true) }} className="p-1 hover:bg-gray-100 rounded" title="Ver detalles">
                          <Eye size={17} className="text-gray-600" />
                        </button>
                        {register.status === 'CLOSED' && (
                          <button
                            onClick={() => {
                              setSelectedRegister(register)
                              setReconciliationInput(register.externalSalesTotal != null ? String(register.externalSalesTotal) : '')
                              setPrintMode(null)
                              setShowReportModal(true)
                            }}
                            className="p-1 hover:bg-gray-100 rounded" title="Imprimir">
                            <Printer size={17} className="text-gray-600" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {cashRegisters.length === 0 && (
                  <tr><td colSpan={7} className="py-12 text-center text-gray-500">No hay registros de caja</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal apertura */}
      <AnimatePresence>
        {showOpenModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={() => setShowOpenModal(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-lg p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2"><Unlock size={22} className="text-primary-600" />Abrir Caja</h3>
                <button onClick={() => setShowOpenModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
              </div>
              <div className="space-y-3 mb-4">
                {registerDefinitions.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    No hay cajas configuradas para esta sucursal. Pide a un administrador que las agregue en{' '}
                    <span className="font-medium">Configuración → Tiendas</span>.
                  </p>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Caja *</label>
                    <div className="flex flex-wrap gap-2">
                      {registerDefinitions.map(d => {
                        const isOpen = openRegisters.some(r => r.registerNumber === d.registerNumber)
                        return (
                          <button
                            key={d.id}
                            type="button"
                            disabled={isOpen}
                            onClick={() => setSelectedDefinitionId(d.id)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                              selectedDefinitionId === d.id
                                ? 'bg-primary-600 text-white border-primary-600'
                                : isOpen
                                ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                : 'bg-white text-gray-700 border-gray-300 hover:border-primary-400'
                            }`}
                          >
                            {d.name} #{d.registerNumber}
                            {isOpen && <span className="ml-1 text-xs">(abierta)</span>}
                          </button>
                        )
                      })}
                    </div>
                    {availableDefinitions.length === 0 && (
                      <p className="text-xs text-orange-500 mt-1">Todas las cajas configuradas ya están abiertas.</p>
                    )}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Monto Inicial *</label>
                  <input type="number" value={initialAmount} onChange={e => setInitialAmount(e.target.value)}
                    placeholder="0.00" className="input w-full text-lg" min="0" step="0.01" autoFocus />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowOpenModal(false)} className="flex-1 btn-outline btn-md" disabled={saving}>Cancelar</button>
                <button onClick={handleOpenRegister} disabled={!selectedDefinitionId || !initialAmount || parseFloat(initialAmount) < 0 || saving}
                  className="flex-1 btn-primary btn-md disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
                  Abrir Caja
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal cierre */}
      <AnimatePresence>
        {showCloseModal && registerToClose && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={() => setShowCloseModal(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-lg p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <Lock size={22} className="text-gray-600" />
                  Cerrar {registerToClose.name ?? 'Caja'} #{registerToClose.registerNumber}
                </h3>
                <button onClick={() => setShowCloseModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
              </div>

              <div className="mb-4 p-4 bg-gray-50 rounded-lg text-sm">
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div><p className="text-gray-600">Monto Inicial:</p><p className="font-bold">Q{registerToClose.initialAmount.toFixed(2)}</p></div>
                  <div><p className="text-gray-600">Ventas Efectivo:</p><p className="font-bold text-green-600">+Q{(registerTallies[registerToClose.id]?.cash ?? 0).toFixed(2)}</p></div>
                  <div>
                    <p className="text-gray-600">Entradas:</p>
                    <p className="font-bold text-green-600">+Q{(registerToClose.movements ?? []).filter(m => m.type === 'INCOME').reduce((s, m) => s + m.amount, 0).toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Salidas:</p>
                    <p className="font-bold text-red-600">-Q{(registerToClose.movements ?? []).filter(m => m.type === 'EXPENSE').reduce((s, m) => s + m.amount, 0).toFixed(2)}</p>
                  </div>
                  {(registerToClose.sales?.creditPaymentsCash ?? 0) > 0 && (
                    <div>
                      <p className="text-gray-600">Abonos en efectivo:</p>
                      <p className="font-bold text-green-600">+Q{registerToClose.sales!.creditPaymentsCash.toFixed(2)}</p>
                      <p className="text-[10px] text-gray-400">ya incluido en Ventas Efectivo</p>
                    </div>
                  )}
                  {(registerTallies[registerToClose.id]?.credit ?? 0) > 0 && (
                    <div>
                      <p className="text-gray-600">Ventas a Crédito:</p>
                      <p className="font-bold text-blue-600">Q{registerTallies[registerToClose.id]!.credit.toFixed(2)}</p>
                      <p className="text-[10px] text-gray-400">no suma al efectivo esperado</p>
                    </div>
                  )}
                </div>
                <div className="pt-3 border-t">
                  <p className="text-gray-600">Efectivo Esperado:</p>
                  <p className="text-2xl font-bold text-primary-600">Q{calcBalance(registerToClose).toFixed(2)}</p>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Efectivo Entregado *</label>
                <p className="text-xs text-gray-400 -mt-1 mb-2">Lo que vas a entregar — sin contar el fondo que dejas en caja para mañana.</p>
                <input type="number" value={finalCount} onChange={e => setFinalCount(e.target.value)}
                  placeholder="0.00" className="input w-full text-lg" min="0" step="0.01" autoFocus />
                {finalCount && parseFloat(finalCount) !== calcBalance(registerToClose) && (
                  <div className={`mt-2 p-2 rounded text-sm ${parseFloat(finalCount) > calcBalance(registerToClose) ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                    {parseFloat(finalCount) > calcBalance(registerToClose) ? 'Sobrante' : 'Faltante'}: Q{Math.abs(parseFloat(finalCount) - calcBalance(registerToClose)).toFixed(2)}
                  </div>
                )}
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Monto para siguiente caja (opcional)</label>
                <input type="number" value={nextOpenAmount} onChange={e => setNextOpenAmount(e.target.value)}
                  placeholder="0.00" className="input w-full" min="0" step="0.01" />
              </div>

              {currentStore?.salesReconciliationEnabled && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Total de ventas según Excel (opcional)</label>
                  <input type="number" value={externalSalesTotalInput} onChange={e => setExternalSalesTotalInput(e.target.value)}
                    placeholder="0.00" className="input w-full" min="0" step="0.01" />
                  <p className="text-xs text-gray-500 mt-1">Si aún no tienes el total, puedes agregarlo después desde el reporte de cierre.</p>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => setShowCloseModal(false)} className="flex-1 btn-outline btn-md" disabled={saving}>Cancelar</button>
                <button onClick={handleCloseRegister} disabled={!finalCount || parseFloat(finalCount) < 0 || saving}
                  className="flex-1 btn-secondary btn-md disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
                  Cerrar Caja
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal movimiento */}
      <AnimatePresence>
        {showMovementModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={() => { setShowMovementModal(false); setRegisterForMovement(null) }}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-lg p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-800">Registrar Movimiento</h3>
                  {registerForMovement && <p className="text-xs text-gray-400">{registerForMovement.name} #{registerForMovement.registerNumber}</p>}
                </div>
                <button onClick={() => { setShowMovementModal(false); setRegisterForMovement(null) }} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Tipo</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setMovementType('EXPENSE')} className={`py-2 px-3 rounded-lg text-sm font-medium ${movementType === 'EXPENSE' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                      <TrendingDown size={15} className="inline mr-1" />Salida
                    </button>
                    <button onClick={() => setMovementType('INCOME')} className={`py-2 px-3 rounded-lg text-sm font-medium ${movementType === 'INCOME' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                      <TrendingUp size={15} className="inline mr-1" />Entrada
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Monto *</label>
                  <input type="number" value={movementAmount} onChange={e => setMovementAmount(e.target.value)} placeholder="0.00" className="input w-full text-lg" min="0" step="0.01" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Descripción *</label>
                  <textarea value={movementDescription} onChange={e => setMovementDescription(e.target.value)}
                    placeholder="Ej: Compra de insumos, pago a proveedor..." className="input w-full" rows={3} />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => { setShowMovementModal(false); setRegisterForMovement(null) }} className="flex-1 btn-outline btn-md" disabled={saving}>Cancelar</button>
                <button onClick={handleAddMovement} disabled={!movementAmount || !movementDescription.trim() || saving}
                  className="flex-1 btn-primary btn-md disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
                  Registrar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal detalles */}
      <AnimatePresence>
        {showDetailsModal && selectedRegister && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={() => setShowDetailsModal(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-800">Detalles de Caja</h3>
                  <p className="text-sm text-gray-500">{selectedRegister.name} #{selectedRegister.registerNumber}</p>
                </div>
                <button onClick={() => setShowDetailsModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><p className="text-gray-600">Apertura</p><p className="font-medium">{format(new Date(selectedRegister.openedAt), "d 'de' MMMM, HH:mm", { locale: es })}</p></div>
                  {selectedRegister.closedAt && <div><p className="text-gray-600">Cierre</p><p className="font-medium">{format(new Date(selectedRegister.closedAt), "d 'de' MMMM, HH:mm", { locale: es })}</p></div>}
                  <div><p className="text-gray-600">Abierta por</p><p className="font-medium">{selectedRegister.openedBy ?? '—'}</p></div>
                  {selectedRegister.closedBy && <div><p className="text-gray-600">Cerrada por</p><p className="font-medium">{selectedRegister.closedBy}</p></div>}
                </div>

                <div className="border rounded-lg p-4">
                  <h4 className="font-medium text-gray-800 mb-3">Resumen Financiero</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-gray-600">Monto Inicial:</span><span className="font-medium">Q{selectedRegister.initialAmount.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-600">Ventas Efectivo:</span><span className="font-medium text-green-600">+Q{getDisplaySales(selectedRegister).cash.toFixed(2)}</span></div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Entradas:</span>
                      <span className="font-medium text-green-600">+Q{(selectedRegister.movements ?? []).filter(m => m.type === 'INCOME').reduce((s, m) => s + m.amount, 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Salidas:</span>
                      <span className="font-medium text-red-600">-Q{(selectedRegister.movements ?? []).filter(m => m.type === 'EXPENSE').reduce((s, m) => s + m.amount, 0).toFixed(2)}</span>
                    </div>
                    {selectedRegister.expectedAmount !== undefined && (
                      <>
                        <div className="border-t pt-2 flex justify-between"><span className="font-medium text-gray-700">Efectivo Esperado:</span><span className="font-bold">Q{selectedRegister.expectedAmount.toFixed(2)}</span></div>
                        <div className="flex justify-between"><span className="font-medium text-gray-700">Efectivo Entregado:</span><span className="font-bold">Q{selectedRegister.finalAmount?.toFixed(2) ?? '—'}</span></div>
                        <div className={`flex justify-between pt-2 border-t font-bold ${(selectedRegister.difference ?? 0) > 0 ? 'text-green-600' : (selectedRegister.difference ?? 0) < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                          <span>Diferencia:</span>
                          <span className="text-lg">{(selectedRegister.difference ?? 0) > 0 && '+'}Q{(selectedRegister.difference ?? 0).toFixed(2)}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {(() => {
                  const sales = getDisplaySales(selectedRegister)
                  return (
                    <div className="border rounded-lg p-4">
                      <h4 className="font-medium text-gray-800 mb-3">Ventas por Método</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between"><span>Efectivo:</span><span className="font-medium">Q{sales.cash.toFixed(2)}</span></div>
                        <div className="flex justify-between"><span>Tarjeta:</span><span className="font-medium">Q{sales.card.toFixed(2)}</span></div>
                        <div className="flex justify-between"><span>Transferencia:</span><span className="font-medium">Q{sales.transfer.toFixed(2)}</span></div>
                        {sales.credit > 0 && (
                          <div className="flex justify-between text-blue-700"><span>Crédito (no cobrado):</span><span className="font-medium">Q{sales.credit.toFixed(2)}</span></div>
                        )}
                        <div className="flex justify-between font-bold border-t pt-2"><span>Total:</span><span>Q{sales.total.toFixed(2)}</span></div>
                      </div>
                    </div>
                  )
                })()}

                {(selectedRegister.movements ?? []).length > 0 && (
                  <div>
                    <h4 className="font-medium text-gray-800 mb-3">Movimientos</h4>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left py-2 px-3 font-medium text-gray-700">Tipo</th>
                            <th className="text-left py-2 px-3 font-medium text-gray-700">Descripción</th>
                            <th className="text-right py-2 px-3 font-medium text-gray-700">Monto</th>
                            <th className="text-right py-2 px-3 font-medium text-gray-700">Hora</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(selectedRegister.movements ?? []).map(movement => (
                            <tr key={movement.id} className="border-b">
                              <td className="py-2 px-3">
                                {movement.type === 'INCOME'
                                  ? <span className="text-green-600 flex items-center gap-1"><TrendingUp size={13} />Entrada</span>
                                  : <span className="text-red-600 flex items-center gap-1"><TrendingDown size={13} />Salida</span>}
                              </td>
                              <td className="py-2 px-3">{movement.description}</td>
                              <td className={`py-2 px-3 text-right font-medium ${movement.type === 'INCOME' ? 'text-green-600' : 'text-red-600'}`}>
                                {movement.type === 'INCOME' ? '+' : '-'}Q{movement.amount.toFixed(2)}
                              </td>
                              <td className="py-2 px-3 text-right text-gray-500">{format(new Date(movement.createdAt), "HH:mm", { locale: es })}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-3 mt-6 pt-4 border-t">
                <button onClick={() => setShowDetailsModal(false)} className="flex-1 btn-outline btn-md">Cerrar</button>
                {selectedRegister.status === 'CLOSED' && (
                  <button
                    onClick={() => {
                      setReconciliationInput(selectedRegister.externalSalesTotal != null ? String(selectedRegister.externalSalesTotal) : '')
                      setPrintMode(null)
                      setShowDetailsModal(false)
                      setShowReportModal(true)
                    }}
                    className="flex-1 btn-primary btn-md flex items-center justify-center gap-2">
                    <Printer size={18} />Imprimir Reporte
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal reporte imprimible */}
      <AnimatePresence>
        {showReportModal && selectedRegister && selectedRegister.status === 'CLOSED' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 print:hidden">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div id="receipt-content">
                <div className="text-center mb-6 pb-4 border-b-2 border-gray-300">
                  <h2 className="text-2xl font-bold text-gray-800">DENGO POS</h2>
                  <p className="text-lg font-medium text-gray-700">Reporte de Cierre — {selectedRegister.name} #{selectedRegister.registerNumber}</p>
                  <p className="text-sm text-gray-600 mt-2">{format(new Date(selectedRegister.closedAt!), "d 'de' MMMM 'de' yyyy", { locale: es })}</p>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                  <div><p className="text-gray-600">Apertura:</p><p className="font-medium">{format(new Date(selectedRegister.openedAt), "HH:mm", { locale: es })}</p></div>
                  <div><p className="text-gray-600">Cierre:</p><p className="font-medium">{format(new Date(selectedRegister.closedAt!), "HH:mm", { locale: es })}</p></div>
                  <div><p className="text-gray-600">Cajero:</p><p className="font-medium">{selectedRegister.openedBy ?? '—'}</p></div>
                  {selectedRegister.sales && <div><p className="text-gray-600">Total ventas:</p><p className="font-medium">{selectedRegister.sales.count} transacciones</p></div>}
                </div>

                {selectedRegister.sales && (
                  <div className="mb-6 border rounded-lg p-4">
                    <h3 className="font-semibold mb-3">Ventas por Método de Pago</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span>Efectivo:</span><span className="font-medium">Q{selectedRegister.sales.cash.toFixed(2)}</span></div>
                      <div className="flex justify-between"><span>Transferencia:</span><span className="font-medium">Q{selectedRegister.sales.transfer.toFixed(2)}</span></div>
                      <div className="flex justify-between"><span>Tarjeta:</span><span className="font-medium">Q{selectedRegister.sales.card.toFixed(2)}</span></div>
                      {selectedRegister.sales.credit > 0 && (
                        <div className="flex justify-between text-blue-700"><span>Crédito (no cobrado):</span><span className="font-medium">Q{selectedRegister.sales.credit.toFixed(2)}</span></div>
                      )}
                      <div className="flex justify-between font-bold border-t pt-2"><span>Total ventas:</span><span>Q{selectedRegister.sales.total.toFixed(2)}</span></div>
                      {selectedRegister.sales.creditPaymentsCash > 0 && (
                        <div className="flex justify-between text-gray-500 text-xs pt-1"><span>Incl. abonos en efectivo:</span><span>Q{selectedRegister.sales.creditPaymentsCash.toFixed(2)}</span></div>
                      )}
                    </div>
                  </div>
                )}

                <div className="border rounded-lg p-4 mb-6">
                  <h3 className="font-semibold mb-3">Resumen de Caja</h3>
                  <div className="space-y-2 text-sm">
                    <div className="p-3 bg-gray-50 rounded-lg space-y-1">
                      {currentStore?.salesReconciliationEnabled && selectedRegister.externalSalesTotal != null && (
                        <div className="flex justify-between"><span>Total Excel:</span><span className="font-medium">Q{selectedRegister.externalSalesTotal.toFixed(2)}</span></div>
                      )}
                      <div className="flex justify-between"><span>Efectivo Entregado:</span><span className="font-medium">Q{(selectedRegister.finalAmount ?? 0).toFixed(2)}</span></div>
                    </div>
                    <div className={`flex justify-between font-bold pt-1 ${(selectedRegister.difference ?? 0) > 0 ? 'text-green-600' : (selectedRegister.difference ?? 0) < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                      <span>Diferencia Entre Programa y Entrega{selectedRegister.pendingSync ? ' (estimada)' : ''}:</span>
                      <span>{(selectedRegister.difference ?? 0) > 0 && '+'}Q{(selectedRegister.difference ?? 0).toFixed(2)}</span>
                    </div>
                    {selectedRegister.pendingSync && (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1.5 mt-1">
                        Este cierre se guardó sin conexión — este cálculo es con lo que este dispositivo sabía en ese momento. Se confirma (y se corrige si hace falta) al sincronizar con el servidor.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {currentStore?.salesReconciliationEnabled && (
                <div className="border rounded-lg p-4 mb-6 bg-blue-50 border-blue-100">
                  <h3 className="font-semibold mb-3">Conciliación de Ventas (Excel / reporte externo)</h3>
                  {selectedRegister.externalSalesTotal != null ? (
                    <div className="space-y-2 text-sm mb-3">
                      <div className="flex justify-between"><span>Total Programa:</span><span className="font-medium">Q{(selectedRegister.sales?.total ?? 0).toFixed(2)}</span></div>
                      <div className="flex justify-between"><span>Total Excel:</span><span className="font-medium">Q{selectedRegister.externalSalesTotal.toFixed(2)}</span></div>
                      <div className={`flex justify-between font-bold border-t pt-2 ${(selectedRegister.externalSalesDifference ?? 0) === 0 ? 'text-gray-800' : (selectedRegister.externalSalesDifference ?? 0) > 0 ? 'text-orange-600' : 'text-red-600'}`}>
                        <span>Diferencia:</span>
                        <span>{(selectedRegister.externalSalesDifference ?? 0) > 0 && '+'}Q{(selectedRegister.externalSalesDifference ?? 0).toFixed(2)}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 mb-3">Aún no se ha ingresado el total según Excel para esta caja.</p>
                  )}
                  <div className="flex gap-2">
                    <input type="number" value={reconciliationInput} onChange={e => setReconciliationInput(e.target.value)}
                      placeholder="Total según Excel" className="input flex-1 text-sm" min="0" step="0.01" />
                    <button onClick={handleSaveReconciliation} disabled={savingReconciliation || !reconciliationInput.trim()}
                      className="btn-outline btn-sm whitespace-nowrap disabled:opacity-50">
                      {selectedRegister.externalSalesTotal != null ? 'Actualizar' : 'Guardar'}
                    </button>
                  </div>
                </div>
              )}

              {reopenSuggestion && (
                <div className="border-2 border-primary-200 rounded-lg p-4 bg-primary-50 mb-4">
                  <p className="text-sm font-semibold text-primary-700 mb-1">¿Abrir la caja de mañana ahora?</p>
                  <p className="text-2xl font-bold text-primary-800 mb-3">Q{parseFloat(reopenSuggestion.amount).toFixed(2)}</p>
                  <div className="flex gap-2">
                    <button onClick={() => setReopenSuggestion(null)} disabled={reopeningNextDay} className="flex-1 btn-outline btn-sm">
                      Ahora no
                    </button>
                    <button onClick={handleReopenNextDay} disabled={reopeningNextDay} className="flex-1 btn-primary btn-sm flex items-center justify-center gap-2">
                      {reopeningNextDay && <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />}
                      Sí, abrir ahora
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-3 pt-4 border-t">
                <button onClick={() => setShowReportModal(false)} className="flex-1 btn-outline btn-md">Cerrar</button>
                <button onClick={() => handlePrint('summary')} className="flex-1 btn-primary btn-md flex items-center justify-center gap-2">
                  <Printer size={18} />Imprimir Resumen
                </button>
                {currentStore?.salesReconciliationEnabled && selectedRegister.externalSalesTotal != null && (
                  <button onClick={() => handlePrint('reconciliation')} className="flex-1 btn-secondary btn-md flex items-center justify-center gap-2">
                    <Printer size={18} />Imprimir Conciliación
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>

    {/* Print-only thermal blocks — one at a time, whichever handlePrint() last
        set. Kept as a true sibling of the page (not nested inside it) so
        `print:hidden` on the page above fully collapses it for print instead
        of leaving its height reserved — see ThermalReceipt.tsx / POS.tsx for
        the same fix and why it matters (a page taller than one printed sheet
        pushes out a second, near-blank page otherwise). */}
    {showReportModal && selectedRegister && selectedRegister.status === 'CLOSED' && printMode === 'summary' && (
        <ThermalCashCloseReport
          widthMm={currentStore?.receiptWidthMm ?? 55}
          data={{
            registerLabel: `${selectedRegister.name ?? 'Caja'} #${selectedRegister.registerNumber ?? '–'}`,
            branchName: currentStore?.name ?? 'Tienda',
            logo: currentStore?.logo,
            companyName: currentStore?.companyName,
            cashierName: selectedRegister.openedBy,
            closedByName: selectedRegister.closedBy,
            openedAt: selectedRegister.openedAt,
            closedAt: selectedRegister.closedAt!,
            salesCount: selectedRegister.sales?.count ?? 0,
            cash: selectedRegister.sales?.cash ?? 0,
            card: selectedRegister.sales?.card ?? 0,
            transfer: selectedRegister.sales?.transfer ?? 0,
            credit: selectedRegister.sales?.credit ?? 0,
            creditPaymentsCash: selectedRegister.sales?.creditPaymentsCash ?? 0,
            total: selectedRegister.sales?.total ?? 0,
            initialAmount: selectedRegister.initialAmount,
            expectedAmount: selectedRegister.expectedAmount ?? 0,
            finalAmount: selectedRegister.finalAmount ?? 0,
            difference: selectedRegister.difference ?? 0,
            pendingSync: selectedRegister.pendingSync,
            salesReconciliationEnabled: currentStore?.salesReconciliationEnabled,
            externalSalesTotal: selectedRegister.externalSalesTotal,
          }}
        />
      )}
      {showReportModal && selectedRegister && selectedRegister.status === 'CLOSED' && printMode === 'reconciliation' && selectedRegister.externalSalesTotal != null && (
        <ThermalReconciliationSlip
          widthMm={currentStore?.receiptWidthMm ?? 55}
          data={{
            registerLabel: `${selectedRegister.name ?? 'Caja'} #${selectedRegister.registerNumber ?? '–'}`,
            branchName: currentStore?.name ?? 'Tienda',
            logo: currentStore?.logo,
            companyName: currentStore?.companyName,
            closedAt: selectedRegister.closedAt!,
            programTotal: selectedRegister.sales?.total ?? 0,
            externalTotal: selectedRegister.externalSalesTotal,
            difference: selectedRegister.externalSalesDifference ?? 0,
          }}
        />
      )}
    </>
  )
}
