import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Calendar, ArrowUpDown, TrendingUp, TrendingDown } from 'lucide-react'
import { format, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store'
import { useStore } from '../../contexts/StoreContext'
import AIRecommendations from '../../components/reports/AIRecommendations'
import ReportFilters, { type ReportFilterState } from '../../components/reports/ReportFilters'

export default function InventoryAdjustmentsReport() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { currentStore } = useStore()
  const [from, setFrom] = useState(format(subDays(new Date(), 29), 'yyyy-MM-dd'))
  const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [loading, setLoading] = useState(false)
  const [movements, setMovements] = useState<any[]>([])
  const [filters, setFilters] = useState<ReportFilterState>({ branchId: currentStore?.id ?? user?.branchId ?? '', cashRegisterId: '' })

  useEffect(() => { fetchData() }, [from, to, filters])

  async function fetchData() {
    setLoading(true)
    try {
      const branchQ = filters.branchId ? `&branchId=${filters.branchId}` : ''
      const data = await api.get<any[]>(`/api/reports/stock-movements?type=ADJUSTMENT&from=${from}T00:00:00&to=${to}T23:59:59${branchQ}`)
      setMovements(data ?? [])
    } catch { setMovements([]) } finally { setLoading(false) }
  }

  const positives = movements.filter(m => Number(m.quantityAfter) > Number(m.quantityBefore))
  const negatives = movements.filter(m => Number(m.quantityAfter) <= Number(m.quantityBefore))
  const totalAdj = movements.length

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/reports')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Ajustes de Inventario</h1>
          <p className="text-gray-600 text-sm mt-0.5">Movimientos manuales de stock registrados</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4 flex flex-wrap items-center gap-3">
        <Calendar size={16} className="text-gray-400" />
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input" />
        <span className="text-gray-400">–</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input" />
        <ReportFilters value={filters} onChange={setFilters} showRegister={false} />
        {loading && <span className="text-sm text-gray-400">Cargando...</span>}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total ajustes', value: String(totalAdj), icon: ArrowUpDown, color: 'text-blue-600 bg-blue-100' },
          { label: 'Ajustes positivos', value: String(positives.length), icon: TrendingUp, color: 'text-green-600 bg-green-100' },
          { label: 'Ajustes negativos', value: String(negatives.length), icon: TrendingDown, color: 'text-red-600 bg-red-100' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-3">
            <div className={`p-2.5 rounded-lg ${s.color}`}><s.icon size={20} /></div>
            <div><p className="text-xs text-gray-400">{s.label}</p><p className="text-xl font-bold text-gray-800">{s.value}</p></div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Fecha y hora</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Producto</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Sucursal</th>
                <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium">Antes</th>
                <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium">Después</th>
                <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium">Diferencia</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Usuario</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Motivo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {movements.length === 0
                ? <tr><td colSpan={8} className="text-center py-12 text-gray-400">Sin ajustes en el período seleccionado</td></tr>
                : movements.map(m => {
                    const before = Number(m.quantityBefore ?? 0)
                    const after = Number(m.quantityAfter ?? 0)
                    const diff = after - before
                    return (
                      <tr key={m.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-gray-600 text-xs whitespace-nowrap">{format(new Date(m.createdAt), "dd/MM/yyyy HH:mm", { locale: es })}</td>
                        <td className="px-4 py-2.5 font-medium text-gray-800">{m.product?.name ?? '–'}</td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs">{m.branch?.name ?? '–'}</td>
                        <td className="px-4 py-2.5 text-right text-gray-500">{before.toFixed(0)}</td>
                        <td className="px-4 py-2.5 text-right text-gray-700 font-medium">{after.toFixed(0)}</td>
                        <td className={`px-4 py-2.5 text-right font-semibold ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                          {diff > 0 ? '+' : ''}{diff.toFixed(0)}
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs">{m.performedBy?.name ?? '–'}</td>
                        <td className="px-4 py-2.5 text-gray-400 text-xs max-w-40 truncate">{m.reason ?? '–'}</td>
                      </tr>
                    )
                  })
              }
            </tbody>
          </table>
        </div>
      </div>

      <AIRecommendations
        reportData={{ type: 'inventory_adjustments', data: { total: totalAdj, positives: positives.length, negatives: negatives.length, adjustments: movements } }}
      />
    </div>
  )
}
