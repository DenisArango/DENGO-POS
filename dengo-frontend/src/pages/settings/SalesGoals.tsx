import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Target, Lock, Plus, Trash2, Pencil, X } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useStore } from '../../contexts/StoreContext'
import { usePermissions } from '../../hooks/usePermissions'

interface GoalProgress {
  id: string
  label: string | null
  registerNumbers: string[]
  targetAmount: number
  currentAmount: number
  percent: number | null
}

interface RegisterDef {
  id: string
  name: string
  registerNumber: string
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
  const [yearStr, setYearStr] = useState(String(now.getFullYear()))
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [goals, setGoals] = useState<GoalProgress[]>([])
  const [registers, setRegisters] = useState<RegisterDef[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // null = form closed, 'new' = creating a goal, or the id of the goal being edited
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [formAmount, setFormAmount] = useState('')
  const [formLabel, setFormLabel] = useState('')
  const [formRegisters, setFormRegisters] = useState<string[]>([])

  useEffect(() => {
    if (!currentStore?.id) return
    api.get<RegisterDef[]>(`/api/cash-registers/register-definitions?branchId=${currentStore.id}`)
      .then(data => setRegisters(data ?? []))
      .catch(() => setRegisters([]))
  }, [currentStore?.id])

  useEffect(() => { fetchGoals() }, [currentStore?.id, year, month])

  function fetchGoals() {
    if (!currentStore?.id) return
    setLoading(true)
    api.get<GoalProgress[]>(`/api/goals/list?branchId=${currentStore.id}&year=${year}&month=${month}`)
      .then(setGoals)
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }

  const usedRegisters = new Set(goals.filter(g => g.id !== editingId).flatMap(g => g.registerNumbers))
  const availableRegisters = registers.filter(r => !usedRegisters.has(r.registerNumber))
  const canSplit = registers.length > 1

  function openNewForm() {
    setEditingId('new')
    setFormAmount('')
    setFormLabel('')
    setFormRegisters([])
  }

  function openEditForm(g: GoalProgress) {
    setEditingId(g.id)
    setFormAmount(String(g.targetAmount))
    setFormLabel(g.label ?? '')
    setFormRegisters(g.registerNumbers)
  }

  function closeForm() {
    setEditingId(null)
  }

  function toggleFormRegister(registerNumber: string) {
    setFormRegisters(prev => prev.includes(registerNumber) ? prev.filter(r => r !== registerNumber) : [...prev, registerNumber])
  }

  function handleSave() {
    if (!currentStore?.id) return
    const amount = parseFloat(formAmount)
    if (!formAmount.trim() || isNaN(amount) || amount < 0) {
      toast.error('Ingresa una meta válida'); return
    }
    setSaving(true)
    api.post('/api/goals', {
      ...(editingId !== 'new' ? { id: editingId } : {}),
      branchId: currentStore.id,
      year,
      month,
      targetAmount: amount,
      label: formLabel.trim() || undefined,
      registerNumbers: formRegisters,
    })
      .then(() => {
        toast.success('Meta guardada')
        closeForm()
        fetchGoals()
      })
      .catch(e => toast.error(e.message))
      .finally(() => setSaving(false))
  }

  function handleDelete(id: string) {
    if (!window.confirm('¿Eliminar esta meta?')) return
    api.delete(`/api/goals/${id}`)
      .then(() => { toast.success('Meta eliminada'); fetchGoals() })
      .catch(e => toast.error(e.message))
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
            <input
              type="text" inputMode="numeric"
              value={yearStr}
              onChange={e => setYearStr(e.target.value)}
              onBlur={() => {
                const n = parseInt(yearStr, 10)
                if (!isNaN(n) && n >= 2020 && n <= 2100) setYear(n)
                else setYearStr(String(year))
              }}
              className="input w-full"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : (
          <div className="space-y-3">
            {goals.length === 0 && editingId === null && (
              <p className="text-sm text-gray-500 py-2">Sin meta configurada para este mes.</p>
            )}

            {goals.map(g => (
              <div key={g.id} className="border border-gray-100 rounded-lg p-4">
                {editingId === g.id ? (
                  <GoalForm
                    amount={formAmount} setAmount={setFormAmount}
                    label={formLabel} setLabel={setFormLabel}
                    canSplit={canSplit}
                    registers={availableRegisters.concat(registers.filter(r => g.registerNumbers.includes(r.registerNumber)))}
                    selected={formRegisters} onToggleRegister={toggleFormRegister}
                    onSave={handleSave} onCancel={closeForm} saving={saving}
                  />
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="text-sm font-medium text-gray-800">{g.label ?? (g.registerNumbers.length > 0 ? 'Meta' : 'Meta General')}</span>
                        {g.registerNumbers.length > 0 && (
                          <span className="ml-2 text-xs text-gray-500">(caja {g.registerNumbers.join(', ')})</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEditForm(g)} className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-gray-50 rounded"><Pencil size={14} /></button>
                        <button onClick={() => handleDelete(g.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-gray-50 rounded"><Trash2 size={14} /></button>
                      </div>
                    </div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">Q{g.currentAmount.toFixed(2)} vendido</span>
                      <span className="font-medium text-gray-800">{(g.percent ?? 0).toFixed(0)}%</span>
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-primary-600 transition-all" style={{ width: `${Math.min(100, g.percent ?? 0)}%` }} />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Meta: Q{g.targetAmount.toFixed(2)}</p>
                  </div>
                )}
              </div>
            ))}

            {editingId === 'new' ? (
              <div className="border border-primary-200 rounded-lg p-4">
                <GoalForm
                  amount={formAmount} setAmount={setFormAmount}
                  label={formLabel} setLabel={setFormLabel}
                  canSplit={canSplit}
                  registers={availableRegisters}
                  selected={formRegisters} onToggleRegister={toggleFormRegister}
                  onSave={handleSave} onCancel={closeForm} saving={saving}
                />
              </div>
            ) : (
              (goals.length === 0 || canSplit) && (
                <button onClick={openNewForm} className="btn-outline btn-md w-full flex items-center justify-center gap-2">
                  <Plus size={16} /> {goals.length === 0 ? 'Agregar meta' : 'Agregar meta dividida por caja'}
                </button>
              )
            )}
          </div>
        )}
      </motion.div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Target className="text-blue-600 flex-shrink-0 mt-0.5" size={20} />
          <div>
            <h3 className="font-medium text-blue-900 mb-1">Cómo funciona</h3>
            <p className="text-sm text-blue-700">
              Por defecto la meta es compartida por toda la sucursal. Si la sucursal tiene más de una caja,
              opcionalmente puedes dividir la meta en varias, cada una medida solo contra las ventas de las cajas
              que le asignes (una caja no puede pertenecer a más de una meta a la vez). Se mide contra el total de
              ventas real del mes (igual que en Reportes), incluyendo ventas a crédito aunque no estén cobradas todavía.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function GoalForm({
  amount, setAmount, label, setLabel, canSplit, registers, selected, onToggleRegister, onSave, onCancel, saving,
}: {
  amount: string; setAmount: (v: string) => void
  label: string; setLabel: (v: string) => void
  canSplit: boolean
  registers: RegisterDef[]
  selected: string[]
  onToggleRegister: (registerNumber: string) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="label">Meta de ventas (Q)</label>
        <input
          type="text" inputMode="decimal"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="0.00"
          className="input w-full"
        />
      </div>
      {canSplit && (
        <>
          <div>
            <label className="label">Nombre (opcional, ej. "Mostrador")</label>
            <input type="text" value={label} onChange={e => setLabel(e.target.value)} className="input w-full" />
          </div>
          <div>
            <label className="label">Cajas asignadas (vacío = toda la sucursal)</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {registers.length === 0 && <span className="text-xs text-gray-400">No hay cajas disponibles para asignar</span>}
              {registers.map(r => (
                <label key={r.id} className={`flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded-lg border cursor-pointer ${selected.includes(r.registerNumber) ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600'}`}>
                  <input type="checkbox" checked={selected.includes(r.registerNumber)} onChange={() => onToggleRegister(r.registerNumber)} className="hidden" />
                  {r.name} #{r.registerNumber}
                </label>
              ))}
            </div>
          </div>
        </>
      )}
      <div className="flex gap-2">
        <button onClick={onSave} disabled={saving} className="btn-primary btn-md flex-1 disabled:opacity-50">
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
        <button onClick={onCancel} className="btn-outline btn-md"><X size={16} /></button>
      </div>
    </div>
  )
}
