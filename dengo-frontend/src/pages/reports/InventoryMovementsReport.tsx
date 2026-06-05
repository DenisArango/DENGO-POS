import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Calendar, Package, ArrowUpRight, ArrowDownRight, ArrowUpDown } from 'lucide-react'
import { format, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store'
import AIRecommendations from '../../components/reports/AIRecommendations'

const TYPE_CONFIG: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  IN:         { label: 'Entrada',    icon: ArrowUpRight,  color: 'text-green-600',  bg: 'bg-green-100 text-green-700' },
  OUT:        { label: 'Salida',     icon: ArrowDownRight, color: 'text-red-600',   bg: 'bg-red-100 text-red-700' },
  SALE:       { label: 'Venta',      icon: ArrowDownRight, color: 'text-blue-600',  bg: 'bg-blue-100 text-blue-700' },
  TRANSFER:   { label: 'Traslado',   icon: ArrowUpDown,   color: 'text-purple-600', bg: 'bg-purple-100 text-purple-700' },
  ADJUSTMENT: { label: 'Ajuste',     icon: Package,       color: 'text-orange-600', bg: 'bg-orange-100 text-orange-700' },
  RETURN:     { label: 'Devolución', icon: ArrowUpRight,  color: 'text-teal-600',   bg: 'bg-teal-100 text-teal-700' },
}

export default function InventoryMovementsReport() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [from, setFrom] = useState(format(subDays(new Date(), 6), 'yyyy-MM-dd'))
  const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [typeFilter, setTypeFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [movements, setMovements] = useState<any[]>([])

  useEffect(() => { fetchData() }, [from, to, typeFilter])

  async function fetchData() {
    setLoading(true)
    try {
      const branchQ = user?.branchId ? `&branchId=${user.branchId}` : ''
      const typeQ = typeFilter ? `&type=${typeFilter}` : ''
      const data = await api.get<any[]>(`/api/reports/stock-movements?from=${from}T00:00:00&to=${to}T23:59:59${branchQ}${typeQ}`)
      setMovements(data ?? [])
    } catch { setMovements([]) } finally { setLoading(false) }
  }

  const summary = Object.keys(TYPE_CONFIG).reduce((acc, k) => {
    const ms = movements.filter(m => m.type === k)
    acc[k] = { count: ms.length, units: ms.reduce((s, m) => s + Number(m.quantity), 0) }
    return acc
  }, {} as Record<string, { count: number; units: number }>)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/reports')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Movimientos de Inventario</h1>
          <p className="text-gray-600 text-sm mt-0.5">Todas las entradas, salidas y ajustes de stock</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4 flex flex-wrap items-center gap-3">
        <Calendar size={16} className="text-gray-400" />
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input" />
        <span className="text-gray-400">–</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input" />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="input">
          <option value="">Todos los tipos</option>
          {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        {loading && <span className="text-sm text-gray-400">Cargando...</span>}
      </div>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {Object.entries(TYPE_CONFIG).map(([k, v]) => (
          <div key={k} className="bg-white rounded-lg shadow-sm p-3 text-center">
            <p className="text-xs text-gray-400">{v.label}</p>
            <p className="text-xl font-bold text-gray-800">{summary[k]?.count ?? 0}</p>
            <p className="text-xs text-gray-500">{(summary[k]?.units ?? 0).toFixed(0)} u.</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Fecha</th>
                <th className="text-center px-4 py-3 text-xs text-gray-500 font-medium">Tipo</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Producto</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Sucursal</th>
                <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium">Cantidad</th>
                <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium">Antes</th>
                <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium">Después</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Usuario</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Motivo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {movements.length === 0
                ? <tr><td colSpan={9} className="text-center py-12 text-gray-400">Sin movimientos en el período seleccionado</td></tr>
                : movements.map(m => {
                    const cfg = TYPE_CONFIG[m.type] ?? { label: m.type, bg: 'bg-gray-100 text-gray-700' }
                    const isIn = ['IN', 'RETURN'].includes(m.type)
                    return (
                      <tr key={m.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap text-xs">{format(new Date(m.createdAt), "dd/MM/yy HH:mm", { locale: es })}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg}`}>{cfg.label}</span>
                        </td>
                        <td className="px-4 py-2.5 font-medium text-gray-800">{m.product?.name ?? '–'}</td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs">{m.branch?.name ?? '–'}</td>
                        <td className={`px-4 py-2.5 text-right font-semibold ${isIn ? 'text-green-600' : 'text-red-500'}`}>
                          {isIn ? '+' : '-'}{Number(m.quantity).toFixed(Number(m.quantity) % 1 === 0 ? 0 : 2)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-400">{Number(m.quantityBefore ?? 0).toFixed(0)}</td>
                        <td className="px-4 py-2.5 text-right text-gray-700">{Number(m.quantityAfter ?? 0).toFixed(0)}</td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs">{m.performedBy?.name ?? '–'}</td>
                        <td className="px-4 py-2.5 text-gray-400 text-xs max-w-32 truncate">{m.reason ?? '–'}</td>
                      </tr>
                    )
                  })
              }
            </tbody>
          </table>
        </div>
      </div>

      <AIRecommendations
        reportData={{ type: 'inventory_movements', data: { total: movements.length, summary } }}
        autoGenerate={movements.length > 0}
      />
    </div>
  )
}
