import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Calendar, DollarSign, TrendingUp, Percent } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { format, subDays } from 'date-fns'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store'
import AIRecommendations from '../../components/reports/AIRecommendations'

export default function ProfitMarginsReport() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [from, setFrom] = useState(format(subDays(new Date(), 29), 'yyyy-MM-dd'))
  const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [loading, setLoading] = useState(false)
  const [products, setProducts] = useState<any[]>([])
  const [minMargin, setMinMargin] = useState('')

  useEffect(() => { fetchData() }, [from, to])

  async function fetchData() {
    setLoading(true)
    try {
      const branchQ = user?.branchId ? `&branchId=${user.branchId}` : ''
      const data = await api.get<any[]>(`/api/reports/sales-by-product?from=${from}T00:00:00&to=${to}T23:59:59${branchQ}&limit=100`)
      setProducts(data ?? [])
    } catch { setProducts([]) } finally { setLoading(false) }
  }

  const filtered = products.filter(p => !minMargin || Number(p.marginPercent) >= Number(minMargin))
  const totalRevenue = filtered.reduce((s, p) => s + Number(p.revenue), 0)
  const totalProfit = filtered.reduce((s, p) => s + Number(p.profit), 0)
  const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0

  const chartData = filtered.slice(0, 10).map(p => ({
    name: p.name.slice(0, 18),
    margen: Math.round(Number(p.marginPercent) * 10) / 10,
    ingresos: Math.round(Number(p.revenue) * 100) / 100,
  }))

  const byCategory = filtered.reduce((acc, p) => {
    const cat = p.category ?? 'Sin categoría'
    if (!acc[cat]) acc[cat] = { revenue: 0, profit: 0, count: 0 }
    acc[cat]!.revenue += Number(p.revenue)
    acc[cat]!.profit += Number(p.profit)
    acc[cat]!.count++
    return acc
  }, {} as Record<string, { revenue: number; profit: number; count: number }>)
  const catData = Object.entries(byCategory)
    .map(([cat, v]) => ({ cat, ...v, margin: v.revenue > 0 ? (v.profit / v.revenue) * 100 : 0 }))
    .sort((a, b) => b.revenue - a.revenue)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/reports')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Márgenes de Ganancia</h1>
          <p className="text-gray-600 text-sm mt-0.5">Rentabilidad por producto en el período</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4 flex flex-wrap items-center gap-3">
        <Calendar size={16} className="text-gray-400" />
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input" />
        <span className="text-gray-400">–</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input" />
        <div className="flex items-center gap-2">
          <Percent size={14} className="text-gray-400" />
          <input type="number" value={minMargin} onChange={e => setMinMargin(e.target.value)} placeholder="Margen mín. %" className="input w-32" min="0" max="100" />
        </div>
        {loading && <span className="text-sm text-gray-400">Cargando...</span>}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Ingresos totales', value: `Q${totalRevenue.toFixed(2)}`, icon: DollarSign, color: 'text-green-600 bg-green-100' },
          { label: 'Ganancia neta', value: `Q${totalProfit.toFixed(2)}`, icon: TrendingUp, color: 'text-blue-600 bg-blue-100' },
          { label: 'Margen promedio', value: `${avgMargin.toFixed(1)}%`, icon: Percent, color: avgMargin >= 30 ? 'text-green-600 bg-green-100' : avgMargin >= 15 ? 'text-yellow-600 bg-yellow-100' : 'text-red-600 bg-red-100' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-3">
            <div className={`p-2.5 rounded-lg ${s.color}`}><s.icon size={20} /></div>
            <div><p className="text-xs text-gray-400">{s.label}</p><p className="text-xl font-bold text-gray-800">{s.value}</p></div>
          </div>
        ))}
      </div>

      {chartData.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Top 10 — Margen por producto (%)</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fontSize: 11 }} unit="%" />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={140} />
              <Tooltip formatter={(v: any) => [`${Number(v).toFixed(1)}%`, 'Margen']} />
              <Bar dataKey="margen" radius={[0, 4, 4, 0]}
                fill="#10B981"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {catData.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Por categoría</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Categoría', 'Productos', 'Ingresos', 'Ganancia', 'Margen'].map(h => (
                    <th key={h} className={`px-4 py-2 text-xs text-gray-500 font-medium ${h === 'Categoría' ? 'text-left' : 'text-right'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {catData.map(c => (
                  <tr key={c.cat} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-800">{c.cat}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{c.count}</td>
                    <td className="px-4 py-2.5 text-right">Q{c.revenue.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right text-green-600 font-medium">Q{c.profit.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`font-semibold ${c.margin >= 30 ? 'text-green-600' : c.margin >= 15 ? 'text-yellow-600' : 'text-red-500'}`}>{c.margin.toFixed(1)}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b"><h2 className="text-sm font-semibold text-gray-700">Detalle por producto</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-center px-3 py-2 text-xs text-gray-500 font-medium w-10">#</th>
                <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Producto</th>
                <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Categoría</th>
                <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Unidades</th>
                <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Ingresos</th>
                <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Ganancia</th>
                <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Margen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0
                ? <tr><td colSpan={7} className="text-center py-10 text-gray-400">Sin datos en el período seleccionado</td></tr>
                : filtered.map((p, i) => (
                    <tr key={p.productId} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5 text-center text-gray-400 text-xs">{i + 1}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-800">{p.name}</td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{p.category}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{Math.round(Number(p.quantitySold))}</td>
                      <td className="px-4 py-2.5 text-right">Q{Number(p.revenue).toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right text-green-600 font-medium">Q{Number(p.profit).toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`text-xs font-semibold ${Number(p.marginPercent) >= 30 ? 'text-green-600' : Number(p.marginPercent) >= 15 ? 'text-yellow-600' : 'text-red-500'}`}>
                          {Number(p.marginPercent).toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
      </div>

      <AIRecommendations
        reportData={{ type: 'profit_margins', data: { totalRevenue, avgMargin, products: filtered.slice(0, 10) } }}
        autoGenerate={products.length > 0}
      />
    </div>
  )
}
