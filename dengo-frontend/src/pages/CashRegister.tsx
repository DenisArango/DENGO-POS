import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DollarSign, TrendingUp, TrendingDown, Wallet,
  Plus, Minus, X, Printer, CheckCircle, Calendar,
  Clock, AlertCircle, FileText, Eye, Lock, Unlock
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { api } from '../lib/api'
import { useAuthStore } from '../store'
import { useStore } from '../contexts/StoreContext'

interface CashSales {
  total: number; count: number; cash: number
  card: number; transfer: number; credit: number
}

interface CashRegisterRecord {
  id: string; name?: string; registerNumber?: string
  openedBy?: string; openedById?: string; openedAt: string
  closedBy?: string; closedById?: string; closedAt?: string
  initialAmount: number; finalAmount?: number
  expectedAmount?: number; difference?: number
  branchId?: string; status: 'OPEN' | 'CLOSED'
  sales?: CashSales; movements: CashMovement[]
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
    openedBy: reg.openedBy?.name ?? reg.openedBy ?? undefined,
    closedBy: reg.closedBy?.name ?? reg.closedBy ?? undefined,
    sales: reg.sales ? {
      total: Number(reg.sales.total ?? 0), count: Number(reg.sales.count ?? 0),
      cash: Number(reg.sales.cash ?? 0), card: Number(reg.sales.card ?? 0),
      transfer: Number(reg.sales.transfer ?? 0), credit: Number(reg.sales.credit ?? 0),
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
  const [registerName, setRegisterName] = useState('Caja')
  const [registerNumber, setRegisterNumber] = useState('1')
  const [registerDefinitions, setRegisterDefinitions] = useState<{ name: string; registerNumber: string }[]>([])
  const [finalCount, setFinalCount] = useState('')
  const [nextOpenAmount, setNextOpenAmount] = useState('')
  const [movementType, setMovementType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE')
  const [movementAmount, setMovementAmount] = useState('')
  const [movementDescription, setMovementDescription] = useState('')

  // For close modal preview
  const activeRegister = registerToClose ?? openRegisters[0] ?? null

  const fetchRegisters = () => {
    if (!BRANCH_ID) return
    setLoading(true)
    Promise.all([
      api.get<any[]>(`/api/cash-registers/current?branchId=${BRANCH_ID}`),
      api.get<any[]>(`/api/cash-registers?branchId=${BRANCH_ID}`),
    ])
      .then(([openList, list]) => {
        const opens = (Array.isArray(openList) ? openList : (openList ? [openList] : []))
          .filter(Boolean).map(normalizeRegister)
        setOpenRegisters(opens)
        setCashRegisters((list ?? []).map(normalizeRegister))
      })
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchRegisters()
    if (BRANCH_ID) {
      api.get<any[]>(`/api/cash-registers/definitions?branchId=${BRANCH_ID}`)
        .then(d => setRegisterDefinitions(d ?? []))
        .catch(() => {})
    }
  }, [BRANCH_ID])

  const handleOpenRegister = () => {
    if (!initialAmount || parseFloat(initialAmount) < 0) {
      toast.error('Ingresa un monto inicial válido'); return
    }
    setSaving(true)
    api.post<any>('/api/cash-registers/open', {
      branchId: BRANCH_ID,
      initialAmount: parseFloat(initialAmount),
      name: registerName || 'Caja',
      registerNumber: registerNumber || '1',
    })
      .then(raw => {
        const newReg = normalizeRegister(raw)
        setOpenRegisters(prev => [...prev, newReg])
        setCashRegisters(prev => [newReg, ...prev])
        setShowOpenModal(false)
        setInitialAmount('')
        setRegisterName('Caja')
        setRegisterNumber(String(openRegisters.length + 2))
        toast.success('Caja abierta exitosamente')
      })
      .catch(e => toast.error(e.message))
      .finally(() => setSaving(false))
  }

  const calcBalance = (reg: CashRegisterRecord) => {
    const incomes = (reg.movements ?? []).filter(m => m.type === 'INCOME').reduce((s, m) => s + m.amount, 0)
    const expenses = (reg.movements ?? []).filter(m => m.type === 'EXPENSE').reduce((s, m) => s + m.amount, 0)
    return reg.initialAmount + (reg.sales?.cash ?? 0) + incomes - expenses
  }

  const handleCloseRegister = () => {
    const reg = registerToClose
    if (!reg) return
    if (!finalCount || parseFloat(finalCount) < 0) {
      toast.error('Ingresa el monto final contado'); return
    }
    setSaving(true)
    api.post<any>(`/api/cash-registers/${reg.id}/close`, { finalAmount: parseFloat(finalCount) })
      .then(raw => {
        const closedReg = normalizeRegister(raw)
        setCashRegisters(prev => prev.map(r => r.id === closedReg.id ? closedReg : r))
        setOpenRegisters(prev => prev.filter(r => r.id !== closedReg.id))
        setSelectedRegister(closedReg)
        setRegisterToClose(null)
        setShowCloseModal(false)
        setFinalCount('')
        if (nextOpenAmount) setInitialAmount(nextOpenAmount)
        setNextOpenAmount('')
        setShowReportModal(true)
        const diff = closedReg.difference ?? 0
        if (diff !== 0) {
          toast.warning(diff > 0 ? `Sobrante de Q${Math.abs(diff).toFixed(2)}` : `Faltante de Q${Math.abs(diff).toFixed(2)}`)
        } else {
          toast.success('¡Caja cuadrada perfectamente!')
        }
      })
      .catch(e => toast.error(e.message))
      .finally(() => setSaving(false))
  }

  const handleAddMovement = () => {
    const reg = registerForMovement ?? openRegisters[0] ?? null
    if (!reg) return
    if (!movementAmount || parseFloat(movementAmount) <= 0) {
      toast.error('Ingresa un monto válido'); return
    }
    if (!movementDescription.trim()) {
      toast.error('Ingresa una descripción'); return
    }
    setSaving(true)
    api.post<any>(`/api/cash-registers/${reg.id}/movements`, {
      type: movementType, amount: parseFloat(movementAmount), description: movementDescription,
    })
      .then((raw: any) => {
        const newMovement: CashMovement = {
          ...raw, amount: Number(raw.amount ?? 0),
          performedBy: raw.performedBy?.name ?? raw.performedBy ?? undefined,
        }
        const update = (r: CashRegisterRecord) => r.id === reg.id
          ? { ...r, movements: [...(r.movements ?? []), newMovement] } : r
        setOpenRegisters(prev => prev.map(update))
        setCashRegisters(prev => prev.map(update))
        setShowMovementModal(false)
        setRegisterForMovement(null)
        setMovementAmount('')
        setMovementDescription('')
        toast.success(`${movementType === 'INCOME' ? 'Entrada' : 'Salida'} registrada exitosamente`)
      })
      .catch(e => toast.error(e.message))
      .finally(() => setSaving(false))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Wallet size={28} /> Control de Caja
          </h1>
          <p className="text-gray-600 text-sm mt-1">Apertura, cierre y movimientos de caja</p>
        </div>
        <button onClick={() => setShowOpenModal(true)} className="btn-primary btn-md flex items-center gap-2">
          <Unlock size={18} /> Abrir Caja
        </button>
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
                <button
                  onClick={() => { setRegisterForMovement(reg); setShowMovementModal(true) }}
                  className="px-3 py-1.5 text-xs font-medium bg-white bg-opacity-20 hover:bg-opacity-30 rounded-lg flex items-center gap-1">
                  <Plus size={13} /> Movimiento
                </button>
                <button
                  onClick={() => { setRegisterToClose(reg); setFinalCount(''); setShowCloseModal(true) }}
                  className="px-3 py-1.5 text-xs font-medium bg-white bg-opacity-20 hover:bg-opacity-30 rounded-lg flex items-center gap-1">
                  <Lock size={13} /> Cerrar
                </button>
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
              <p className="text-2xl font-bold">Q{(reg.sales?.total ?? 0).toFixed(2)}</p>
              <p className="text-xs opacity-75">{reg.sales?.count ?? 0} transacciones</p>
            </div>
            <div className="bg-white bg-opacity-10 rounded-lg p-4">
              <p className="text-sm opacity-90 mb-2">Por Método</p>
              <div className="space-y-0.5 text-xs">
                <div className="flex justify-between"><span className="opacity-75">Efectivo:</span><span className="font-semibold">Q{(reg.sales?.cash ?? 0).toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="opacity-75">Tarjeta:</span><span className="font-semibold">Q{(reg.sales?.card ?? 0).toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="opacity-75">Transfer.:</span><span className="font-semibold">Q{(reg.sales?.transfer ?? 0).toFixed(2)}</span></div>
                {(reg.sales?.credit ?? 0) > 0 && <div className="flex justify-between"><span className="opacity-75">Crédito:</span><span className="font-semibold">Q{reg.sales!.credit.toFixed(2)}</span></div>}
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
                          <button onClick={() => { setSelectedRegister(register); setShowReportModal(true) }} className="p-1 hover:bg-gray-100 rounded" title="Imprimir">
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
                {/* Previous registers quick select */}
                {registerDefinitions.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Caja (seleccionar existente)</label>
                    <div className="flex flex-wrap gap-2">
                      {registerDefinitions.map(d => {
                        const isOpen = openRegisters.some(r => r.registerNumber === d.registerNumber)
                        return (
                          <button
                            key={`${d.name}-${d.registerNumber}`}
                            type="button"
                            disabled={isOpen}
                            onClick={() => { setRegisterName(d.name); setRegisterNumber(d.registerNumber) }}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                              registerName === d.name && registerNumber === d.registerNumber
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
                      <button
                        type="button"
                        onClick={() => {
                          const nextNum = String(Math.max(...registerDefinitions.map(d => parseInt(d.registerNumber) || 0), 0) + 1)
                          setRegisterName('Caja')
                          setRegisterNumber(nextNum)
                        }}
                        className="px-3 py-1.5 rounded-lg text-sm font-medium border border-dashed border-gray-300 text-gray-500 hover:border-primary-400 hover:text-primary-600"
                      >
                        + Nueva caja
                      </button>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                    <input type="text" value={registerName} onChange={e => setRegisterName(e.target.value)} placeholder="Caja 1" className="input w-full" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Número</label>
                    <input type="text" value={registerNumber} onChange={e => setRegisterNumber(e.target.value)} placeholder="1" className="input w-full" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Monto Inicial *</label>
                  <input type="number" value={initialAmount} onChange={e => setInitialAmount(e.target.value)}
                    placeholder="0.00" className="input w-full text-lg" min="0" step="0.01" autoFocus />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowOpenModal(false)} className="flex-1 btn-outline btn-md" disabled={saving}>Cancelar</button>
                <button onClick={handleOpenRegister} disabled={!initialAmount || parseFloat(initialAmount) < 0 || saving}
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
                  <div><p className="text-gray-600">Ventas Efectivo:</p><p className="font-bold text-green-600">+Q{(registerToClose.sales?.cash ?? 0).toFixed(2)}</p></div>
                  <div>
                    <p className="text-gray-600">Entradas:</p>
                    <p className="font-bold text-green-600">+Q{(registerToClose.movements ?? []).filter(m => m.type === 'INCOME').reduce((s, m) => s + m.amount, 0).toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Salidas:</p>
                    <p className="font-bold text-red-600">-Q{(registerToClose.movements ?? []).filter(m => m.type === 'EXPENSE').reduce((s, m) => s + m.amount, 0).toFixed(2)}</p>
                  </div>
                </div>
                <div className="pt-3 border-t">
                  <p className="text-gray-600">Efectivo Esperado:</p>
                  <p className="text-2xl font-bold text-primary-600">Q{calcBalance(registerToClose).toFixed(2)}</p>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Efectivo Contado Físicamente *</label>
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
                    <div className="flex justify-between"><span className="text-gray-600">Ventas Efectivo:</span><span className="font-medium text-green-600">+Q{(selectedRegister.sales?.cash ?? 0).toFixed(2)}</span></div>
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
                        <div className="flex justify-between"><span className="font-medium text-gray-700">Efectivo Contado:</span><span className="font-bold">Q{selectedRegister.finalAmount?.toFixed(2) ?? '—'}</span></div>
                        <div className={`flex justify-between pt-2 border-t font-bold ${(selectedRegister.difference ?? 0) > 0 ? 'text-green-600' : (selectedRegister.difference ?? 0) < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                          <span>Diferencia:</span>
                          <span className="text-lg">{(selectedRegister.difference ?? 0) > 0 && '+'}Q{(selectedRegister.difference ?? 0).toFixed(2)}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {selectedRegister.sales && (
                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium text-gray-800 mb-3">Ventas por Método</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span>Efectivo:</span><span className="font-medium">Q{selectedRegister.sales.cash.toFixed(2)}</span></div>
                      <div className="flex justify-between"><span>Tarjeta:</span><span className="font-medium">Q{selectedRegister.sales.card.toFixed(2)}</span></div>
                      <div className="flex justify-between"><span>Transferencia:</span><span className="font-medium">Q{selectedRegister.sales.transfer.toFixed(2)}</span></div>
                      <div className="flex justify-between font-bold border-t pt-2"><span>Total:</span><span>Q{selectedRegister.sales.total.toFixed(2)}</span></div>
                    </div>
                  </div>
                )}

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
                  <button onClick={() => { setShowDetailsModal(false); setShowReportModal(true) }}
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
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
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
                      <div className="flex justify-between"><span>Tarjeta:</span><span className="font-medium">Q{selectedRegister.sales.card.toFixed(2)}</span></div>
                      <div className="flex justify-between"><span>Transferencia:</span><span className="font-medium">Q{selectedRegister.sales.transfer.toFixed(2)}</span></div>
                      <div className="flex justify-between font-bold border-t pt-2"><span>Total:</span><span>Q{selectedRegister.sales.total.toFixed(2)}</span></div>
                    </div>
                  </div>
                )}

                <div className="border rounded-lg p-4 mb-6">
                  <h3 className="font-semibold mb-3">Resumen de Caja</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span>Monto inicial:</span><span>Q{selectedRegister.initialAmount.toFixed(2)}</span></div>
                    <div className="flex justify-between font-bold border-t pt-2"><span>Efectivo esperado:</span><span>Q{(selectedRegister.expectedAmount ?? 0).toFixed(2)}</span></div>
                    <div className="flex justify-between"><span>Efectivo contado:</span><span>Q{(selectedRegister.finalAmount ?? 0).toFixed(2)}</span></div>
                    <div className={`flex justify-between font-bold ${(selectedRegister.difference ?? 0) > 0 ? 'text-green-600' : (selectedRegister.difference ?? 0) < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                      <span>Diferencia:</span>
                      <span>{(selectedRegister.difference ?? 0) > 0 && '+'}Q{(selectedRegister.difference ?? 0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {initialAmount && (
                <div className="border-2 border-primary-200 rounded-lg p-4 bg-primary-50 mb-4">
                  <p className="text-sm font-semibold text-primary-700 mb-1">Apertura siguiente caja</p>
                  <p className="text-2xl font-bold text-primary-800">Q{parseFloat(initialAmount).toFixed(2)}</p>
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t">
                <button onClick={() => setShowReportModal(false)} className="flex-1 btn-outline btn-md">Cerrar</button>
                <button onClick={() => window.print()} className="flex-1 btn-primary btn-md flex items-center justify-center gap-2">
                  <Printer size={18} />Imprimir
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
