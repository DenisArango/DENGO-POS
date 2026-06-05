import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Package, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store'
import AIRecommendations from '../../components/reports/AIRecommendations'

const STATUS_CONFIG = {
  normal:    { label: 'Normal',     color: '#10B981', bg: 'bg-green-100 text-green-700' },
  low:       { label: 'Stock bajo', color: '#F59E0B', bg: 'bg-yellow-100 text-yellow-700' },
  critical:  { label: 'Crítico',    color: '#EF4444', bg: 'bg-red-100 text-red-700' },
  out:       { label: 'Agotado',    color: '#6B7280', bg: 'bg-gray-100 text-gray-700' },
  overstock: { label: 'Sobrestock', color: '#3B82F6', bg: 'bg-blue-100 text-blue-700' },
}

function getStatus(quantity: number, minStock: number, maxStock: number): keyof typeof STATUS_CONFIG {
  if (quantity === 0) return 'out'
  if (quantity <= minStock * 0.5) return 'critical'
  if (quantity <= minStock) return 'low'
  if (maxStock > 0 && quantity > maxStock) return 'overstock'
  return 'normal'
}

export default function InventoryStatusReport() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [inventory, setInventory] = useState<any[]>([])
  const [filterStatus, setFilterStatus] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const branchQ = user?.branchId ? `?branchId=${user.branchId}` : ''
      const data = await api.get<any[]>(`/api/reports/inventory-status${branchQ}`)
      setInventory(data ?? [])
    } catch { setInventory([]) } finally { setLoading(false) }
  }

  const enriched = inventory.map(inv => ({
    ...inv,
    quantity: Number(inv.quantity),
    minStock: Number(inv.product?.minStock ?? 0),
    maxStock: Number(inv.product?.maxStock ?? 0),
    cost: Number(inv.product?.cost ?? 0),
    status: getStatus(Number(inv.quantity), Number(inv.product?.minStock ?? 0), Number(inv.product?.maxStock ?? 0)),
  }))

  const filtered = enriched.filter(inv => {
    const matchSearch = !search || (inv.product?.name ?? '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = !filterStatus || inv.status === filterStatus
    return matchSearch && matchStatus
  })

  const statusCounts = Object.keys(STATUS_CONFIG).reduce((acc, k) => {
    acc[k] = enriched.filter(i => i.status === k).length
    return acc
  }, {} as Record<string, number>)

  const pieData = Object.entries(STATUS_CONFIG)
    .map(([k, v]) => ({ name: v.label, value: statusCounts[k] ?? 0, color: v.color }))
    .filter(d => d.value > 0)

  const totalValue = enriched.reduce((s, i) => s + i.quantity * i.cost, 0)
  const alertCount = enriched.filter(i => i.status === 'low' || i.status === 'critical' || i.status === 'out').length

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/reports')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Estado de Inventario</h1>
          <p className="text-gray-600 text-sm mt-0.5">Niveles de stock actuales por producto</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total productos', value: String(enriched.length), icon: Package, color: 'text-blue-600 bg-blue-100' },
          { label: 'Alertas activas', value: String(alertCount), icon: AlertTriangle, color: alertCount > 0 ? 'text-red-600 bg-red-100' : 'text-green-600 bg-green-100' },
          { label: 'En stock normal', value: String(statusCounts['normal'] ?? 0), icon: CheckCircle, color: 'text-green-600 bg-green-100' },
          { label: 'Valor total (costo)', value: `Q${totalValue.toFixed(2)}`, icon: XCircle, color: 'text-purple-600 bg-purple-100' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-3">
            <div className={`p-2.5 rounded-lg ${s.color}`}><s.icon size={20} /></div>
            <div><p className="text-xs text-gray-400">{s.label}</p><p className="text-xl font-bold text-gray-800">{s.value}</p></div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Distribución por estado</h2>
          {pieData.length === 0 ? <p className="text-center text-gray-400 text-sm py-8">Sin datos</p>
            : <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value">
                    {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie><Tooltip /></PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 mt-3">
                  {pieData.map(d => (
                    <div key={d.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} /><span className="text-gray-600">{d.name}</span></div>
                      <span className="font-semibold">{d.value}</span>
                    </div>
                  ))}
                </div>
              </>
          }
        </div>

        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm flex flex-col">
          <div className="px-5 py-3 border-b flex flex-wrap items-center gap-3">
            <input type="text" placeholder="Buscar producto..." value={search} onChange={e => setSearch(e.target.value)} className="input flex-1 min-w-40" />
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input">
              <option value="">Todos los estados</option>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            {loading && <span className="text-sm text-gray-400">Cargando...</span>}
          </div>
          <div className="overflow-y-auto flex-1 max-h-96">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Producto</th>
                  <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Categoría</th>
                  <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Stock actual</th>
                  <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Stock mín.</th>
                  <th className="text-center px-4 py-2 text-xs text-gray-500 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0
                  ? <tr><td colSpan={5} className="text-center py-8 text-gray-400">Sin productos</td></tr>
                  : filtered.map(inv => {
                      const cfg = STATUS_CONFIG[inv.status]
                      return (
                        <tr key={inv.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 font-medium text-gray-800">{inv.product?.name}</td>
                          <td className="px-4 py-2.5 text-gray-500 text-xs">{inv.product?.category?.name ?? '–'}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-gray-800">{inv.quantity.toFixed(inv.quantity % 1 === 0 ? 0 : 2)} {inv.product?.baseUnit?.symbol ?? ''}</td>
                          <td className="px-4 py-2.5 text-right text-gray-500">{inv.minStock}</td>
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
      </div>

      <AIRecommendations
        reportData={{ type: 'inventory_status', data: { lowStock: statusCounts['low'] ?? 0, overstock: statusCounts['overstock'] ?? 0, totalProducts: enriched.length, totalValue } }}
        autoGenerate={inventory.length > 0}
      />
    </div>
  )
}
