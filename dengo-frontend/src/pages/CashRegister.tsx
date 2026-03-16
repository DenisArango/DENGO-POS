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

interface CashRegisterRecord {
  id: string
  openedBy?: string
  openedById?: string
  openedAt: string
  closedBy?: string
  closedById?: string
  closedAt?: string
  initialAmount: number
  finalAmount?: number
  expectedAmount?: number
  difference?: number
  branchId?: string
  status: 'OPEN' | 'CLOSED'
  sales?: {
    total: number
    count: number
    cash: number
    card: number
    transfer: number
  }
  movements: CashMovement[]
}

interface CashMovement {
  id: string
  type: 'INCOME' | 'EXPENSE'
  amount: number
  description: string
  performedBy?: string
  createdAt: string
}

const BRANCH_ID = 'branch-001'

export default function CashRegisterPage() {
  const { user } = useAuthStore()
  const [cashRegisters, setCashRegisters] = useState<CashRegisterRecord[]>([])
  const [currentRegister, setCurrentRegister] = useState<CashRegisterRecord | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [showOpenModal, setShowOpenModal] = useState(false)
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [showMovementModal, setShowMovementModal] = useState(false)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [selectedRegister, setSelectedRegister] = useState<CashRegisterRecord | null>(null)

  const [initialAmount, setInitialAmount] = useState('')
  const [finalCount, setFinalCount] = useState('')
  const [movementType, setMovementType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE')
  const [movementAmount, setMovementAmount] = useState('')
  const [movementDescription, setMovementDescription] = useState('')

  const fetchRegisters = () => {
    setLoading(true)
    api.get<{ current: CashRegisterRecord | null; history: CashRegisterRecord[] }>(
      `/api/cash-registers/current?branchId=${BRANCH_ID}`
    )
      .then(data => {
        setCurrentRegister(data.current ?? null)
        setCashRegisters(data.history ?? [])
      })
      .catch(() => {
        // Fallback: try fetching just history
        api.get<CashRegisterRecord[]>(`/api/cash-registers?branchId=${BRANCH_ID}`)
          .then(list => {
            const open = list.find(r => r.status === 'OPEN') ?? null
            setCurrentRegister(open)
            setCashRegisters(list)
          })
          .catch(e => toast.error(e.message))
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchRegisters()
  }, [])

  const handleOpenRegister = () => {
    if (!initialAmount || parseFloat(initialAmount) < 0) {
      toast.error('Ingresa un monto inicial válido')
      return
    }
    setSaving(true)
    api.post<CashRegisterRecord>('/api/cash-registers', {
      branchId: BRANCH_ID,
      initialAmount: parseFloat(initialAmount),
      openedById: user?.id,
    })
      .then(newReg => {
        setCurrentRegister(newReg)
        setCashRegisters(prev => [newReg, ...prev])
        setShowOpenModal(false)
        setInitialAmount('')
        toast.success('Caja abierta exitosamente')
      })
      .catch(e => toast.error(e.message))
      .finally(() => setSaving(false))
  }

  const handleCloseRegister = () => {
    if (!currentRegister) return
    if (!finalCount || parseFloat(finalCount) < 0) {
      toast.error('Ingresa el monto final contado')
      return
    }
    setSaving(true)
    api.patch<CashRegisterRecord>(`/api/cash-registers/${currentRegister.id}/close`, {
      finalAmount: parseFloat(finalCount),
      closedById: user?.id,
    })
      .then(closedReg => {
        setCashRegisters(prev => prev.map(r => r.id === closedReg.id ? closedReg : r))
        setSelectedRegister(closedReg)
        setCurrentRegister(null)
        setShowCloseModal(false)
        setFinalCount('')
        setShowReportModal(true)
        const diff = closedReg.difference ?? 0
        if (diff !== 0) {
          const message = diff > 0
            ? `Sobrante de $${Math.abs(diff).toFixed(2)}`
            : `Faltante de $${Math.abs(diff).toFixed(2)}`
          toast.warning(message)
        } else {
          toast.success('¡Caja cuadrada perfectamente!')
        }
      })
      .catch(e => toast.error(e.message))
      .finally(() => setSaving(false))
  }

  const handleAddMovement = () => {
    if (!currentRegister) return
    if (!movementAmount || parseFloat(movementAmount) <= 0) {
      toast.error('Ingresa un monto válido')
      return
    }
    if (!movementDescription.trim()) {
      toast.error('Ingresa una descripción')
      return
    }
    setSaving(true)
    api.post<CashMovement>(`/api/cash-registers/${currentRegister.id}/movements`, {
      type: movementType,
      amount: parseFloat(movementAmount),
      description: movementDescription,
    })
      .then(newMovement => {
        const updatedRegister = {
          ...currentRegister,
          movements: [...(currentRegister.movements ?? []), newMovement]
        }
        setCurrentRegister(updatedRegister)
        setCashRegisters(prev => prev.map(r => r.id === updatedRegister.id ? updatedRegister : r))
        setShowMovementModal(false)
        setMovementAmount('')
        setMovementDescription('')
        toast.success(`${movementType === 'INCOME' ? 'Entrada' : 'Salida'} registrada exitosamente`)
      })
      .catch(e => toast.error(e.message))
      .finally(() => setSaving(false))
  }

  const calculateCurrentBalance = () => {
    if (!currentRegister) return 0
    const cashSales = currentRegister.sales?.cash ?? 0
    const incomes = (currentRegister.movements ?? [])
      .filter(m => m.type === 'INCOME')
      .reduce((sum, m) => sum + m.amount, 0)
    const expenses = (currentRegister.movements ?? [])
      .filter(m => m.type === 'EXPENSE')
      .reduce((sum, m) => sum + m.amount, 0)
    return currentRegister.initialAmount + cashSales + incomes - expenses
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Wallet size={28} />
            Control de Caja
          </h1>
          <p className="text-gray-600 text-sm mt-1">
            Gestión de apertura, cierre y movimientos de caja
          </p>
        </div>

        <div className="flex gap-3">
          {currentRegister ? (
            <>
              <button
                onClick={() => setShowMovementModal(true)}
                className="btn-outline btn-md flex items-center gap-2"
              >
                <Plus size={18} />
                Movimiento
              </button>
              <button
                onClick={() => setShowCloseModal(true)}
                className="btn-secondary btn-md flex items-center gap-2"
              >
                <Lock size={18} />
                Cerrar Caja
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowOpenModal(true)}
              className="btn-primary btn-md flex items-center gap-2"
            >
              <Unlock size={18} />
              Abrir Caja
            </button>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
        </div>
      )}

      {/* Estado actual de caja */}
      {!loading && currentRegister && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-lg shadow-lg p-6 text-white"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-white bg-opacity-20 rounded-lg">
                <Unlock size={24} />
              </div>
              <div>
                <p className="text-sm opacity-90">Caja Abierta</p>
                <p className="text-xl font-bold">{currentRegister.openedBy ?? user?.name ?? '—'}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm opacity-90">Apertura</p>
              <p className="font-medium">
                {format(new Date(currentRegister.openedAt), "HH:mm", { locale: es })}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white bg-opacity-10 rounded-lg p-4">
              <p className="text-sm opacity-90 mb-1">Monto Inicial</p>
              <p className="text-2xl font-bold">
                ${currentRegister.initialAmount.toFixed(2)}
              </p>
            </div>

            <div className="bg-white bg-opacity-10 rounded-lg p-4">
              <p className="text-sm opacity-90 mb-1">Ventas en Efectivo</p>
              <p className="text-2xl font-bold">
                ${(currentRegister.sales?.cash ?? 0).toFixed(2)}
              </p>
              <p className="text-xs opacity-75">{currentRegister.sales?.count ?? 0} ventas</p>
            </div>

            <div className="bg-white bg-opacity-10 rounded-lg p-4">
              <p className="text-sm opacity-90 mb-1">Movimientos</p>
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-sm opacity-75">Entradas</p>
                  <p className="font-bold text-green-300">
                    +${(currentRegister.movements ?? [])
                      .filter(m => m.type === 'INCOME')
                      .reduce((sum, m) => sum + m.amount, 0)
                      .toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-sm opacity-75">Salidas</p>
                  <p className="font-bold text-red-300">
                    -${(currentRegister.movements ?? [])
                      .filter(m => m.type === 'EXPENSE')
                      .reduce((sum, m) => sum + m.amount, 0)
                      .toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white bg-opacity-10 rounded-lg p-4">
              <p className="text-sm opacity-90 mb-1">Efectivo Esperado</p>
              <p className="text-2xl font-bold">
                ${calculateCurrentBalance().toFixed(2)}
              </p>
            </div>
          </div>

          {(currentRegister.movements ?? []).length > 0 && (
            <div className="mt-4">
              <p className="text-sm opacity-90 mb-2">Movimientos Recientes</p>
              <div className="space-y-2">
                {(currentRegister.movements ?? []).slice(-3).reverse().map(movement => (
                  <div key={movement.id} className="flex items-center justify-between bg-white bg-opacity-10 rounded p-2 text-sm">
                    <div className="flex items-center gap-2">
                      {movement.type === 'INCOME' ? (
                        <TrendingUp size={16} className="text-green-300" />
                      ) : (
                        <TrendingDown size={16} className="text-red-300" />
                      )}
                      <span>{movement.description}</span>
                    </div>
                    <span className={movement.type === 'INCOME' ? 'text-green-300' : 'text-red-300'}>
                      {movement.type === 'INCOME' ? '+' : '-'}${movement.amount.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Historial de cajas */}
      {!loading && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">Historial de Cajas</h2>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Fecha</th>
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
                      <p className="text-sm font-medium">
                        {format(new Date(register.openedAt), "d MMM yyyy", { locale: es })}
                      </p>
                      <p className="text-xs text-gray-500">
                        {format(new Date(register.openedAt), "HH:mm", { locale: es })} -
                        {register.closedAt ? format(new Date(register.closedAt), " HH:mm", { locale: es }) : ' Abierta'}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-sm">{register.openedBy ?? '—'}</p>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-sm font-medium">
                        ${register.initialAmount.toFixed(2)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {register.finalAmount !== undefined ? (
                        <span className="text-sm font-medium">
                          ${register.finalAmount.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {register.difference !== undefined ? (
                        <span className={`text-sm font-bold ${
                          register.difference > 0
                            ? 'text-green-600'
                            : register.difference < 0
                            ? 'text-red-600'
                            : 'text-gray-600'
                        }`}>
                          {register.difference > 0 && '+'}
                          ${register.difference.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {register.status === 'OPEN' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-600">
                          <Unlock size={12} />
                          Abierta
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600">
                          <Lock size={12} />
                          Cerrada
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => { setSelectedRegister(register); setShowDetailsModal(true) }}
                          className="p-1 hover:bg-gray-100 rounded transition-colors"
                          title="Ver detalles"
                        >
                          <Eye size={18} className="text-gray-600" />
                        </button>
                        {register.status === 'CLOSED' && (
                          <button
                            onClick={() => { setSelectedRegister(register); setShowReportModal(true) }}
                            className="p-1 hover:bg-gray-100 rounded transition-colors"
                            title="Imprimir reporte"
                          >
                            <Printer size={18} className="text-gray-600" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {cashRegisters.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-500">
                      No hay registros de caja
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de apertura de caja */}
      <AnimatePresence>
        {showOpenModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={() => setShowOpenModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-lg p-6 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <Unlock size={24} className="text-primary-600" />
                  Abrir Caja
                </h3>
                <button onClick={() => setShowOpenModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={20} />
                </button>
              </div>

              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-4">
                  Ingresa el monto inicial con el que abrirás la caja. Este monto debe coincidir con el efectivo físico en caja.
                </p>
                <label className="block text-sm font-medium text-gray-700 mb-2">Monto Inicial *</label>
                <input
                  type="number" value={initialAmount}
                  onChange={(e) => setInitialAmount(e.target.value)}
                  placeholder="0.00" className="input w-full text-lg"
                  min="0" step="0.01" autoFocus
                />
              </div>

              <div className="flex gap-3">
                <button onClick={() => setShowOpenModal(false)} className="flex-1 btn-outline btn-md" disabled={saving}>
                  Cancelar
                </button>
                <button
                  onClick={handleOpenRegister}
                  disabled={!initialAmount || parseFloat(initialAmount) < 0 || saving}
                  className="flex-1 btn-primary btn-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {saving && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
                  Abrir Caja
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de cierre de caja */}
      <AnimatePresence>
        {showCloseModal && currentRegister && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={() => setShowCloseModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-lg p-6 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <Lock size={24} className="text-secondary-600" />
                  Cerrar Caja
                </h3>
                <button onClick={() => setShowCloseModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={20} />
                </button>
              </div>

              <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                  <div>
                    <p className="text-gray-600">Monto Inicial:</p>
                    <p className="font-bold">${currentRegister.initialAmount.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Ventas Efectivo:</p>
                    <p className="font-bold text-green-600">+${(currentRegister.sales?.cash ?? 0).toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Entradas:</p>
                    <p className="font-bold text-green-600">
                      +${(currentRegister.movements ?? [])
                        .filter(m => m.type === 'INCOME')
                        .reduce((sum, m) => sum + m.amount, 0)
                        .toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600">Salidas:</p>
                    <p className="font-bold text-red-600">
                      -${(currentRegister.movements ?? [])
                        .filter(m => m.type === 'EXPENSE')
                        .reduce((sum, m) => sum + m.amount, 0)
                        .toFixed(2)}
                    </p>
                  </div>
                </div>
                <div className="pt-3 border-t">
                  <p className="text-gray-600 text-sm">Efectivo Esperado:</p>
                  <p className="text-2xl font-bold text-primary-600">
                    ${calculateCurrentBalance().toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Efectivo Contado Físicamente *
                </label>
                <input
                  type="number" value={finalCount}
                  onChange={(e) => setFinalCount(e.target.value)}
                  placeholder="0.00" className="input w-full text-lg"
                  min="0" step="0.01" autoFocus
                />
                {finalCount && parseFloat(finalCount) !== calculateCurrentBalance() && (
                  <div className={`mt-2 p-2 rounded text-sm ${
                    parseFloat(finalCount) > calculateCurrentBalance()
                      ? 'bg-green-50 text-green-800'
                      : 'bg-red-50 text-red-800'
                  }`}>
                    <p className="font-medium">
                      {parseFloat(finalCount) > calculateCurrentBalance() ? 'Sobrante' : 'Faltante'}:
                      ${Math.abs(parseFloat(finalCount) - calculateCurrentBalance()).toFixed(2)}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button onClick={() => setShowCloseModal(false)} className="flex-1 btn-outline btn-md" disabled={saving}>
                  Cancelar
                </button>
                <button
                  onClick={handleCloseRegister}
                  disabled={!finalCount || parseFloat(finalCount) < 0 || saving}
                  className="flex-1 btn-secondary btn-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {saving && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
                  Cerrar Caja
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de movimiento de caja */}
      <AnimatePresence>
        {showMovementModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={() => setShowMovementModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-lg p-6 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-800">Registrar Movimiento</h3>
                <button onClick={() => setShowMovementModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Movimiento</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setMovementType('EXPENSE')}
                      className={`py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                        movementType === 'EXPENSE' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <TrendingDown size={16} className="inline mr-1" />
                      Salida
                    </button>
                    <button
                      onClick={() => setMovementType('INCOME')}
                      className={`py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                        movementType === 'INCOME' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <TrendingUp size={16} className="inline mr-1" />
                      Entrada
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Monto *</label>
                  <input
                    type="number" value={movementAmount}
                    onChange={(e) => setMovementAmount(e.target.value)}
                    placeholder="0.00" className="input w-full text-lg"
                    min="0" step="0.01"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Descripción *</label>
                  <textarea
                    value={movementDescription}
                    onChange={(e) => setMovementDescription(e.target.value)}
                    placeholder="Ej: Compra de insumos, pago a proveedor, etc."
                    className="input w-full" rows={3}
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowMovementModal(false)} className="flex-1 btn-outline btn-md" disabled={saving}>
                  Cancelar
                </button>
                <button
                  onClick={handleAddMovement}
                  disabled={!movementAmount || !movementDescription.trim() || saving}
                  className="flex-1 btn-primary btn-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {saving && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
                  Registrar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de detalles */}
      <AnimatePresence>
        {showDetailsModal && selectedRegister && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={() => setShowDetailsModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-800">Detalles de Caja</h3>
                <button onClick={() => setShowDetailsModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Fecha de Apertura</p>
                    <p className="font-medium">
                      {format(new Date(selectedRegister.openedAt), "d 'de' MMMM, HH:mm", { locale: es })}
                    </p>
                  </div>
                  {selectedRegister.closedAt && (
                    <div>
                      <p className="text-sm text-gray-600">Fecha de Cierre</p>
                      <p className="font-medium">
                        {format(new Date(selectedRegister.closedAt), "d 'de' MMMM, HH:mm", { locale: es })}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-gray-600">Abierta por</p>
                    <p className="font-medium">{selectedRegister.openedBy ?? '—'}</p>
                  </div>
                  {selectedRegister.closedBy && (
                    <div>
                      <p className="text-sm text-gray-600">Cerrada por</p>
                      <p className="font-medium">{selectedRegister.closedBy}</p>
                    </div>
                  )}
                </div>

                <div className="border rounded-lg p-4">
                  <h4 className="font-medium text-gray-800 mb-3">Resumen Financiero</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Monto Inicial:</span>
                      <span className="font-medium">${selectedRegister.initialAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Ventas en Efectivo:</span>
                      <span className="font-medium text-green-600">
                        +${(selectedRegister.sales?.cash ?? 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Entradas adicionales:</span>
                      <span className="font-medium text-green-600">
                        +${(selectedRegister.movements ?? [])
                          .filter(m => m.type === 'INCOME')
                          .reduce((sum, m) => sum + m.amount, 0)
                          .toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Salidas:</span>
                      <span className="font-medium text-red-600">
                        -${(selectedRegister.movements ?? [])
                          .filter(m => m.type === 'EXPENSE')
                          .reduce((sum, m) => sum + m.amount, 0)
                          .toFixed(2)}
                      </span>
                    </div>
                    {selectedRegister.expectedAmount !== undefined && (
                      <>
                        <div className="border-t pt-2 flex justify-between">
                          <span className="font-medium text-gray-700">Efectivo Esperado:</span>
                          <span className="font-bold">${selectedRegister.expectedAmount.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="font-medium text-gray-700">Efectivo Contado:</span>
                          <span className="font-bold">${selectedRegister.finalAmount?.toFixed(2) ?? '—'}</span>
                        </div>
                        <div className={`flex justify-between pt-2 border-t ${
                          (selectedRegister.difference ?? 0) > 0 ? 'text-green-600'
                            : (selectedRegister.difference ?? 0) < 0 ? 'text-red-600'
                            : 'text-gray-600'
                        }`}>
                          <span className="font-bold">Diferencia:</span>
                          <span className="font-bold text-lg">
                            {(selectedRegister.difference ?? 0) > 0 && '+'}
                            ${(selectedRegister.difference ?? 0).toFixed(2)}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {(selectedRegister.movements ?? []).length > 0 && (
                  <div>
                    <h4 className="font-medium text-gray-800 mb-3">Movimientos de Caja</h4>
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
                                {movement.type === 'INCOME' ? (
                                  <span className="inline-flex items-center gap-1 text-green-600">
                                    <TrendingUp size={14} /> Entrada
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-red-600">
                                    <TrendingDown size={14} /> Salida
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3">{movement.description}</td>
                              <td className={`py-2 px-3 text-right font-medium ${movement.type === 'INCOME' ? 'text-green-600' : 'text-red-600'}`}>
                                {movement.type === 'INCOME' ? '+' : '-'}${movement.amount.toFixed(2)}
                              </td>
                              <td className="py-2 px-3 text-right text-gray-500">
                                {format(new Date(movement.createdAt), "HH:mm", { locale: es })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-6 pt-4 border-t">
                <button onClick={() => setShowDetailsModal(false)} className="flex-1 btn-outline btn-md">
                  Cerrar
                </button>
                {selectedRegister.status === 'CLOSED' && (
                  <button
                    onClick={() => { setShowDetailsModal(false); setShowReportModal(true) }}
                    className="flex-1 btn-primary btn-md flex items-center justify-center gap-2"
                  >
                    <Printer size={18} />
                    Imprimir Reporte
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de reporte imprimible */}
      <AnimatePresence>
        {showReportModal && selectedRegister && selectedRegister.status === 'CLOSED' && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div id="receipt-content">
                <div className="text-center mb-6 pb-4 border-b-2 border-gray-300">
                  <h2 className="text-2xl font-bold text-gray-800">DENGO POS</h2>
                  <p className="text-lg font-medium text-gray-700">Reporte de Cierre de Caja</p>
                  <p className="text-sm text-gray-600 mt-2">
                    {format(new Date(selectedRegister.closedAt!), "d 'de' MMMM 'de' yyyy", { locale: es })}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                  <div>
                    <p className="text-gray-600">Apertura:</p>
                    <p className="font-medium">{format(new Date(selectedRegister.openedAt), "HH:mm", { locale: es })}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Cierre:</p>
                    <p className="font-medium">{format(new Date(selectedRegister.closedAt!), "HH:mm", { locale: es })}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Cajero:</p>
                    <p className="font-medium">{selectedRegister.openedBy ?? '—'}</p>
                  </div>
                  {selectedRegister.sales && (
                    <div>
                      <p className="text-gray-600">Total ventas:</p>
                      <p className="font-medium">{selectedRegister.sales.count} transacciones</p>
                    </div>
                  )}
                </div>

                {selectedRegister.sales && (
                  <div className="mb-6 border rounded-lg p-4">
                    <h3 className="font-semibold mb-3">Ventas por Método de Pago</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Efectivo:</span>
                        <span className="font-medium">${selectedRegister.sales.cash.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Tarjeta:</span>
                        <span className="font-medium">${selectedRegister.sales.card.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Transferencia:</span>
                        <span className="font-medium">${selectedRegister.sales.transfer.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-bold border-t pt-2">
                        <span>Total:</span>
                        <span>${selectedRegister.sales.total.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="border rounded-lg p-4 mb-6">
                  <h3 className="font-semibold mb-3">Resumen de Caja</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Monto inicial:</span>
                      <span>${selectedRegister.initialAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold border-t pt-2">
                      <span>Efectivo esperado:</span>
                      <span>${(selectedRegister.expectedAmount ?? 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Efectivo contado:</span>
                      <span>${(selectedRegister.finalAmount ?? 0).toFixed(2)}</span>
                    </div>
                    <div className={`flex justify-between font-bold ${
                      (selectedRegister.difference ?? 0) > 0 ? 'text-green-600'
                        : (selectedRegister.difference ?? 0) < 0 ? 'text-red-600'
                        : 'text-gray-800'
                    }`}>
                      <span>Diferencia:</span>
                      <span>
                        {(selectedRegister.difference ?? 0) > 0 && '+'}
                        ${(selectedRegister.difference ?? 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t">
                <button onClick={() => setShowReportModal(false)} className="flex-1 btn-outline btn-md">
                  Cerrar
                </button>
                <button onClick={() => window.print()} className="flex-1 btn-primary btn-md flex items-center justify-center gap-2">
                  <Printer size={18} />
                  Imprimir
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
