import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Target, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useStore } from '../../contexts/StoreContext'
import { usePermissions } from '../../hooks/usePermissions'

interface GoalProgress {
  branchId: string
  year: number
  month: number
  targetAmount: number | null
  currentAmount: number
  percent: number | null
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const now = new Date()

export default function SalesGoals() {
  const navigate = useNavigate()
  const { currentStore } = useStore()
  const { hasPermission } = usePermissions()
  const canManage = hasPermission('goals.manage')

  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [progress, setProgress] = useState<GoalProgress | null>(null)
  const [targetInput, setTargetInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!currentStore?.id) return
    setLoading(true)
    api.get<GoalProgress>(`/api/goals?branchId=${currentStore.id}&year=${year}&month=${month}`)
      .then(data => {
        setProgress(data)
        setTargetInput(data.targetAmount != null ? String(data.targetAmount) : '')
      })
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [currentStore?.id, year, month])

  const handleSave = () => {
    if (!currentStore?.id) return
    const amount = parseFloat(targetInput)
    if (!targetInput.trim() || isNaN(amount) || amount < 0) {
      toast.error('Ingresa una meta válida'); return
    }
    setSaving(true)
    api.post<GoalProgress>('/api/goals', { branchId: currentStore.id, year, month, targetAmount: amount })
      .then(() => {
        toast.success('Meta guardada')
        return api.get<GoalProgress>(`/api/goals?branchId=${currentStore.id}&year=${year}&month=${month}`)
      })
      .then(data => setProgress(data))
      .catch(e => toast.error(e.message))
      .finally(() => setSaving(false))
  }

  if (!canManage) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/settings')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Target size={28} /> Metas de Venta
          </h1>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-8 text-center">
          <Lock className="mx-auto text-gray-400 mb-3" size={32} />
          <p className="text-gray-600">No tienes permiso para configurar metas de venta.</p>
        </div>
      </div>
    )
  }

  const percent = progress?.percent ?? 0

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/settings')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Target size={28} /> Metas de Venta
          </h1>
          <p className="text-gray-600 text-sm mt-1">
            Meta mensual de ventas para {currentStore?.name ?? 'esta sucursal'} — visible para todo el equipo en el Dashboard y el Punto de Venta.
          </p>
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-lg shadow-sm p-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Mes</label>
            <select value={month} onChange={e => setMonth(Number(e.target.value))} className="input w-full">
              {MONTH_NAMES.map((name, i) => (
                <option key={i} value={i + 1}>{name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Año</label>
            <input type="number" value={year} onChange={e => setYear(Number(e.target.value))} className="input w-full" />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : (
          <>
            <div>
              <label className="label">Meta de ventas (Q)</label>
              <input
                type="number" min="0" step="0.01"
                value={targetInput}
                onChange={e => setTargetInput(e.target.value)}
                placeholder="0.00"
                className="input w-full text-lg"
              />
            </div>

            {progress && progress.targetAmount != null && (
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">Q{progress.currentAmount.toFixed(2)} vendido</span>
                  <span className="font-medium text-gray-800">{percent.toFixed(0)}%</span>
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-600 transition-all"
                    style={{ width: `${Math.min(100, percent)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">Meta actual: Q{progress.targetAmount.toFixed(2)}</p>
              </div>
            )}

            <button onClick={handleSave} disabled={saving} className="btn-primary btn-md w-full disabled:opacity-50">
              {saving ? 'Guardando...' : 'Guardar meta'}
            </button>
          </>
        )}
      </motion.div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Target className="text-blue-600 flex-shrink-0 mt-0.5" size={20} />
          <div>
            <h3 className="font-medium text-blue-900 mb-1">Cómo funciona</h3>
            <p className="text-sm text-blue-700">
              La meta es compartida por toda la sucursal — no es individual por cajero. Se mide contra el total de
              ventas real del mes (igual que en Reportes), incluyendo ventas a crédito aunque no estén cobradas todavía.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
