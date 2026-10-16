import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Target, CheckCircle2, XCircle, MinusCircle } from 'lucide-react'
import { api } from '../../lib/api'
import ReportFilters, { type ReportFilterState } from '../../components/reports/ReportFilters'

interface GoalBreakdown {
  id: string
  label: string | null
  registerNumbers: string[]
  targetAmount: number
  currentAmount: number
  percent: number | null
}

interface MonthRow {
  branchId: string
  branchName: string
  year: number
  month: number
  targetAmount: number | null
  currentAmount: number | null
  percent: number | null
  goals: GoalBreakdown[]
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export default function GoalsComplianceReport() {
  const navigate = useNavigate()
  const [filters, setFilters] = useState<ReportFilterState>({ branchId: '', cashRegisterId: '' })
  const [months, setMonths] = useState(6)
  const [rows, setRows] = useState<MonthRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchData() }, [filters.branchId, months])

  async function fetchData() {
    setLoading(true)
    try {
      const branchQ = filters.branchId ? `&branchId=${filters.branchId}` : ''
      const data = await api.get<MonthRow[]>(`/api/goals/compliance-report?months=${months}${branchQ}`)
      setRows(data ?? [])
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  const branchIds = [...new Set(rows.map(r => r.branchId))]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/reports')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Target size={28} /> Cumplimiento de Metas
          </h1>
          <p className="text-gray-600 text-sm mt-0.5">Metas de ventas de cada sucursal y qué tanto se cumplieron, mes a mes</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4 flex flex-wrap items-center gap-3">
        <ReportFilters value={filters} onChange={setFilters} showRegister={false} />
        <select value={months} onChange={e => setMonths(Number(e.target.value))} className="input text-sm">
          <option value={3}>Últimos 3 meses</option>
          <option value={6}>Últimos 6 meses</option>
          <option value={12}>Últimos 12 meses</option>
        </select>
        {loading && <span className="text-sm text-gray-400">Cargando...</span>}
      </div>

      {!loading && rows.length === 0 && (
        <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-400 text-sm">
          No hay sucursales para mostrar.
        </div>
      )}

      {branchIds.map(branchId => {
        const branchRows = rows.filter(r => r.branchId === branchId)
        const branchName = branchRows[0]?.branchName ?? ''
        return (
          <div key={branchId} className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b"><h2 className="text-sm font-semibold text-gray-700">{branchName}</h2></div>
            <div className="divide-y">
              {branchRows.map(row => {
                const hasGoal = row.targetAmount != null
                const met = hasGoal && (row.percent ?? 0) >= 100
                return (
                  <div key={`${row.year}-${row.month}`} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2 w-40 flex-shrink-0">
                        {!hasGoal ? (
                          <MinusCircle className="text-gray-300" size={18} />
                        ) : met ? (
                          <CheckCircle2 className="text-green-500" size={18} />
                        ) : (
                          <XCircle className="text-red-400" size={18} />
                        )}
                        <span className="text-sm font-medium text-gray-700">{MONTH_NAMES[row.month - 1]} {row.year}</span>
                      </div>
                      {hasGoal ? (
                        <div className="flex-1 flex items-center gap-4">
                          <div className="flex-1">
                            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all ${met ? 'bg-green-500' : 'bg-primary-500'}`}
                                style={{ width: `${Math.min(100, row.percent ?? 0)}%` }}
                              />
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0 w-56">
                            <span className="text-sm text-gray-600">Q{(row.currentAmount ?? 0).toFixed(2)} / Q{(row.targetAmount ?? 0).toFixed(2)}</span>
                            <span className="text-sm font-semibold text-gray-800 ml-2">{(row.percent ?? 0).toFixed(0)}%</span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400 flex-1">Sin meta configurada</span>
                      )}
                    </div>
                    {row.goals.length > 1 && (
                      <div className="mt-2 ml-7 space-y-1">
                        {row.goals.map(g => (
                          <div key={g.id} className="flex items-center justify-between text-xs text-gray-500">
                            <span>{g.label ?? 'Meta'} {g.registerNumbers.length > 0 ? `(caja ${g.registerNumbers.join(', ')})` : ''}</span>
                            <span>Q{g.currentAmount.toFixed(2)} / Q{g.targetAmount.toFixed(2)} · {(g.percent ?? 0).toFixed(0)}%</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
