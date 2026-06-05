import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Calendar, TrendingUp, DollarSign, Package } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { format, subDays } from 'date-fns'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store'
import AIRecommendations from '../../components/reports/AIRecommendations'

export default function TopProductsReport() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [from, setFrom] = useState(format(subDays(new Date(), 29), 'yyyy-MM-dd'))
  const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [loading, setLoading] = useState(false)
  const [products, setProducts] = useState<any[]>([])

  useEffect(() => { fetchData() }, [from, to])

  async function fetchData() {
    setLoading(true)
    try {
      const branchQ = user?.branchId ? `&branchId=${user.branchId}` : ''
      const data = await api.get<any[]>(`/api/reports/sales-by-product?from=${from}T00:00:00&to=${to}T23:59:59${branchQ}&limit=20`)
      setProducts(data ?? [])
    } catch { setProducts([]) } finally { setLoading(false) }
  }

  const totalRevenue = products.reduce((s, p) => s + Number(p.revenue), 0)
  const totalUnits = products.reduce((s, p) => s + Number(p.quantitySold), 0)
  const topByRevenue = products.slice(0, 10).map(p => ({ name: p.name.slice(0, 20), revenue: Math.round(Number(p.revenue) * 100) / 100 }))

  const STATUS_COLOR: Record<string, string> = {
    1: 'bg-yellow-400', 2: 'bg-gray-300', 3: 'bg-orange-300',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/reports')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Productos Más Vendidos</h1>
          <p className="text-gray-600 text-sm mt-0.5">Ranking por ingresos en el período seleccionado</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4 flex flex-wrap items-center gap-4">
        <Calendar size={16} className="text-gray-400" />
        <label className="text-sm text-gray-600">Desde</label>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input" />
        <label className="text-sm text-gray-600">Hasta</label>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input" />
        {loading && <span className="text-sm text-gray-400">Cargando...</span>}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Ingresos totales', value: `Q${totalRevenue.toFixed(2)}`, icon: DollarSign, color: 'text-green-600 bg-green-100' },
          { label: 'Unidades vendidas', value: Math.round(totalUnits).toLocaleString(), icon: Package, color: 'text-blue-600 bg-blue-100' },
          { label: 'Productos distintos', value: String(products.length), icon: TrendingUp, color: 'text-purple-600 bg-purple-100' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-3">
            <div className={`p-2.5 rounded-lg ${s.color}`}><s.icon size={20} /></div>
            <div><p className="text-xs text-gray-400">{s.label}</p><p className="text-xl font-bold text-gray-800">{s.value}</p></div>
          </div>
        ))}
      </div>

      {topByRevenue.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Top 10 por ingresos</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={topByRevenue} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={140} />
              <Tooltip formatter={(v: any) => [`Q${Number(v).toFixed(2)}`, 'Ingresos']} />
              <Bar dataKey="revenue" fill="#6366F1" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b"><h2 className="text-sm font-semibold text-gray-700">Ranking completo</h2></div>
        {products.length === 0
          ? <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Sin ventas en el período seleccionado</div>
          : <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-center px-3 py-2 text-xs text-gray-500 font-medium w-12">#</th>
                    <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Producto</th>
                    <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Categoría</th>
                    <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Unidades</th>
                    <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Ingresos</th>
                    <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Margen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {products.map((p, i) => (
                    <tr key={p.productId} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5 text-center">
                        {i < 3
                          ? <div className={`w-6 h-6 rounded-full ${STATUS_COLOR[i + 1] ?? 'bg-gray-100'} flex items-center justify-center text-xs font-bold mx-auto`}>{i + 1}</div>
                          : <span className="text-gray-400 text-xs">{i + 1}</span>
                        }
                      </td>
                      <td className="px-4 py-2.5 font-medium text-gray-800">{p.name}</td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{p.category}</td>
                      <td className="px-4 py-2.5 text-right text-gray-700">{Math.round(Number(p.quantitySold)).toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-800">Q{Number(p.revenue).toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`text-xs font-medium ${Number(p.marginPercent) >= 30 ? 'text-green-600' : Number(p.marginPercent) >= 15 ? 'text-yellow-600' : 'text-red-500'}`}>
                          {Number(p.marginPercent).toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        }
      </div>

      <AIRecommendations
        reportData={{ type: 'top_products', data: { totalRevenue, totalUnits, products: products.slice(0, 10) } }}
        autoGenerate={products.length > 0}
      />
    </div>
  )
}
