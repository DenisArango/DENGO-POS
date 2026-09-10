import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Calendar, DollarSign, ShoppingCart, TrendingUp } from 'lucide-react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { format, subDays } from 'date-fns'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store'
import { useStore } from '../../contexts/StoreContext'
import AIRecommendations from '../../components/reports/AIRecommendations'
import ReportFilters, { type ReportFilterState } from '../../components/reports/ReportFilters'

export default function SalesByPeriodReport() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { currentStore } = useStore()
  const [from, setFrom] = useState(format(subDays(new Date(), 29), 'yyyy-MM-dd'))
  const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<{ date: string; count: number; total: number; cash: number; card: number; transfer: number; credit: number }[]>([])
  const [filters, setFilters] = useState<ReportFilterState>({ branchId: currentStore?.id ?? user?.branchId ?? '', cashRegisterId: '' })

  useEffect(() => { fetchData() }, [from, to, filters])

  async function fetchData() {
    setLoading(true)
    try {
      const branchQ = filters.branchId ? `&branchId=${filters.branchId}` : ''
      const regQ = filters.cashRegisterId ? `&cashRegisterId=${filters.cashRegisterId}` : ''
      const result = await api.get<any[]>(`/api/reports/daily-sales?from=${from}T00:00:00&to=${to}T23:59:59${branchQ}${regQ}`)
      setData((result ?? []).map(d => ({ date: d.date, total: Number(d.total), count: Number(d.count), cash: Number(d.cash ?? 0), card: Number(d.card ?? 0), transfer: Number(d.transfer ?? 0), credit: Number(d.credit ?? 0) })))
    } catch { setData([]) } finally { setLoading(false) }
  }

  const totalSales = data.reduce((s, d) => s + d.total, 0)
  const totalTx = data.reduce((s, d) => s + d.count, 0)
  const avgTicket = totalTx > 0 ? totalSales / totalTx : 0
  const bestDay = data.length > 0 ? data.reduce((b, d) => d.total > b.total ? d : b) : null
  const chartData = data.map(d => ({ date: d.date.slice(5), total: Math.round(d.total * 100) / 100, transacciones: d.count }))

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/reports')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Ventas por Período</h1>
          <p className="text-gray-600 text-sm mt-0.5">Análisis de ventas en el rango seleccionado</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4 flex flex-wrap items-center gap-4">
        <Calendar size={16} className="text-gray-400" />
        <label className="text-sm text-gray-600">Desde</label>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input" />
        <label className="text-sm text-gray-600">Hasta</label>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input" />
        <ReportFilters value={filters} onChange={setFilters} />
        {loading && <span className="text-sm text-gray-400">Cargando...</span>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total ventas', value: `Q${totalSales.toFixed(2)}`, icon: DollarSign, color: 'text-green-600 bg-green-100' },
          { label: 'Transacciones', value: String(totalTx), icon: ShoppingCart, color: 'text-blue-600 bg-blue-100' },
          { label: 'Ticket promedio', value: `Q${avgTicket.toFixed(2)}`, icon: TrendingUp, color: 'text-purple-600 bg-purple-100' },
          { label: 'Mejor día', value: bestDay ? `Q${bestDay.total.toFixed(2)}` : '–', icon: Calendar, color: 'text-orange-600 bg-orange-100' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-3">
            <div className={`p-2.5 rounded-lg ${s.color}`}><s.icon size={20} /></div>
            <div><p className="text-xs text-gray-400">{s.label}</p><p className="text-xl font-bold text-gray-800">{s.value}</p></div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Ventas diarias (Q)</h2>
        {data.length === 0
          ? <div className="flex items-center justify-center h-52 text-gray-400 text-sm">Sin datos en el período seleccionado</div>
          : <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3} /><stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => [`Q${Number(v).toFixed(2)}`, 'Ventas']} />
                <Area type="monotone" dataKey="total" stroke="#6366F1" strokeWidth={2} fill="url(#g1)" />
              </AreaChart>
            </ResponsiveContainer>
        }
      </div>

      <div className="bg-white rounded-xl shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Transacciones por día</h2>
        {data.length === 0 ? null
          : <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip formatter={(v: any) => [v, 'Transacciones']} />
                <Bar dataKey="transacciones" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
        }
      </div>

      {data.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b"><h2 className="text-sm font-semibold text-gray-700">Detalle por día</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Fecha', 'Transacciones', 'Total ventas', 'Ticket prom.'].map(h => (
                    <th key={h} className={`px-4 py-2 text-xs text-gray-500 font-medium ${h === 'Fecha' ? 'text-left' : 'text-right'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...data].reverse().map(d => (
                  <tr key={d.date} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-800">{d.date}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{d.count}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">Q{d.total.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">Q{d.count > 0 ? (d.total / d.count).toFixed(2) : '0.00'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AIRecommendations
        reportData={{ type: 'sales_by_period', data: { totalSales, transactions: totalTx, period: `${from} to ${to}` } }}
      />
    </div>
  )
}
