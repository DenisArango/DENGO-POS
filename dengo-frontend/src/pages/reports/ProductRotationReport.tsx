import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Package, TrendingUp, TrendingDown, AlertTriangle, Clock } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store'
import { useStore } from '../../contexts/StoreContext'
import AIRecommendations from '../../components/reports/AIRecommendations'
import ReportFilters, { type ReportFilterState } from '../../components/reports/ReportFilters'
import { SortableTh, sortRows, type SortState } from '../../components/common/SortableTh'

const STATUS_CONFIG = {
  high:     { label: 'Alta rotación',  bg: 'bg-green-100 text-green-700',  icon: TrendingUp },
  normal:   { label: 'Normal',         bg: 'bg-blue-100 text-blue-700',    icon: Package },
  low:      { label: 'Baja rotación',  bg: 'bg-yellow-100 text-yellow-700', icon: TrendingDown },
  critical: { label: 'Sin movimiento', bg: 'bg-red-100 text-red-700',      icon: AlertTriangle },
}

export default function ProductRotationReport() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { currentStore } = useStore()
  const [loading, setLoading] = useState(false)
  const [products, setProducts] = useState<any[]>([])
  const [filterStatus, setFilterStatus] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortState | null>(null)
  const [filters, setFilters] = useState<ReportFilterState>({ branchId: currentStore?.id ?? user?.branchId ?? '', cashRegisterId: '' })

  useEffect(() => { fetchData() }, [filters])

  async function fetchData() {
    setLoading(true)
    try {
      const branchQ = filters.branchId ? `?branchId=${filters.branchId}` : ''
      const data = await api.get<any[]>(`/api/reports/product-rotation${branchQ}`)
      setProducts(data ?? [])
    } catch { setProducts([]) } finally { setLoading(false) }
  }

  const filtered = products.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase())
    const matchStatus = !filterStatus || p.status === filterStatus
    return matchSearch && matchStatus
  })

  const sortedFiltered = useMemo(() => sortRows(filtered, sort, (p, key) => p[key]), [filtered, sort])

  const counts = Object.keys(STATUS_CONFIG).reduce((acc, k) => { acc[k] = products.filter(p => p.status === k).length; return acc }, {} as Record<string, number>)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/reports')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Rotación de Productos</h1>
          <p className="text-gray-600 text-sm mt-0.5">Velocidad de salida de productos (últimos 30 días)</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Object.entries(STATUS_CONFIG).map(([k, v]) => {
          const Icon = v.icon
          return (
            <div key={k} className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-3">
              <div className={`p-2.5 rounded-lg ${v.bg}`}><Icon size={18} /></div>
              <div><p className="text-xs text-gray-400">{v.label}</p><p className="text-xl font-bold text-gray-800">{counts[k] ?? 0}</p></div>
            </div>
          )
        })}
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4 flex flex-wrap gap-3">
        <input type="text" placeholder="Buscar producto..." value={search} onChange={e => setSearch(e.target.value)} className="input flex-1 min-w-48" />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input">
          <option value="">Todos</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <ReportFilters value={filters} onChange={setFilters} showRegister={false} />
        {loading && <span className="text-sm text-gray-400 self-center">Cargando...</span>}
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <SortableTh label="Producto" sortKey="name" sort={sort} onSort={setSort} className="!py-2 text-xs !text-gray-500" />
                <SortableTh label="Categoría" sortKey="category" sort={sort} onSort={setSort} className="!py-2 text-xs !text-gray-500" />
                <SortableTh label="Stock actual" sortKey="currentStock" sort={sort} onSort={setSort} align="right" firstDir="desc" className="!py-2 text-xs !text-gray-500" />
                <SortableTh label="Ventas 30d" sortKey="salesLast30Days" sort={sort} onSort={setSort} align="right" firstDir="desc" className="!py-2 text-xs !text-gray-500" />
                <SortableTh label="Prom. diario" sortKey="averageDailySales" sort={sort} onSort={setSort} align="right" firstDir="desc" className="!py-2 text-xs !text-gray-500" />
                <SortableTh label="Días inventario" sortKey="daysOfInventory" sort={sort} onSort={setSort} align="right" className="!py-2 text-xs !text-gray-500" />
                <SortableTh label="Índice rotación" sortKey="rotationIndex" sort={sort} onSort={setSort} align="right" firstDir="desc" className="!py-2 text-xs !text-gray-500" />
                <th className="text-center px-4 py-3 text-xs text-gray-500 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0
                ? <tr><td colSpan={8} className="text-center py-12 text-gray-400">Sin datos</td></tr>
                : sortedFiltered.map(p => {
                    const cfg = STATUS_CONFIG[p.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.normal
                    const daysLabel = p.daysOfInventory >= 999 ? '∞' : String(p.daysOfInventory)
                    return (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium text-gray-800">{p.name}</td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs">{p.category}</td>
                        <td className="px-4 py-2.5 text-right text-gray-700">{p.currentStock % 1 === 0 ? p.currentStock : p.currentStock.toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-right text-gray-700">{p.salesLast30Days}</td>
                        <td className="px-4 py-2.5 text-right text-gray-500">{p.averageDailySales}</td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Clock size={12} className="text-gray-400" />
                            <span className={p.daysOfInventory < 7 ? 'text-red-500 font-semibold' : p.daysOfInventory < 15 ? 'text-yellow-600' : 'text-gray-700'}>{daysLabel}d</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-gray-800">{p.rotationIndex.toFixed(2)}x</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg}`}>{cfg.label}</span>
                        </td>
                      </tr>
                    )
                  })
              }
            </tbody>
          </table>
        </div>
      </div>

      <AIRecommendations
        reportData={{ type: 'product_rotation', data: { products: products.slice(0, 20), counts } }}
      />
    </div>
  )
}
