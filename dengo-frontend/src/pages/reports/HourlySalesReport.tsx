import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Calendar, Clock, DollarSign, ShoppingCart, TrendingUp } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { format } from 'date-fns'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store'
import AIRecommendations from '../../components/reports/AIRecommendations'

export default function HourlySalesReport() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [loading, setLoading] = useState(false)
  const [sales, setSales] = useState<any[]>([])

  useEffect(() => { fetchData() }, [selectedDate])

  async function fetchData() {
    setLoading(true)
    try {
      const branchQ = user?.branchId ? `&branchId=${user.branchId}` : ''
      const data = await api.get<any[]>(`/api/reports/sales-history?from=${selectedDate}T00:00:00&to=${selectedDate}T23:59:59${branchQ}`)
      setSales(data ?? [])
    } catch { setSales([]) } finally { setLoading(false) }
  }

  // Group by hour
  const hourlyMap: Record<number, { sales: number; transactions: number }> = {}
  for (let h = 0; h < 24; h++) hourlyMap[h] = { sales: 0, transactions: 0 }
  for (const sale of sales) {
    const h = new Date(sale.createdAt).getHours()
    hourlyMap[h]!.sales += Number(sale.total)
    hourlyMap[h]!.transactions++
  }
  const hourlyData = Object.entries(hourlyMap)
    .filter(([h]) => Number(h) >= 6 && Number(h) <= 22)
    .map(([h, v]) => ({
      hour: `${String(h).padStart(2, '0')}:00`,
      hourNum: Number(h),
      sales: Math.round(v.sales * 100) / 100,
      transactions: v.transactions,
      avgTicket: v.transactions > 0 ? Math.round((v.sales / v.transactions) * 100) / 100 : 0,
    }))

  const peakHour = hourlyData.length > 0 ? hourlyData.reduce((b, d) => d.sales > b.sales ? d : b) : null
  const maxSales = Math.max(...hourlyData.map(d => d.sales), 1)
  const totalSales = sales.reduce((s, x) => s + Number(x.total), 0)
  const totalTx = sales.length

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/reports')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Ventas por Hora</h1>
          <p className="text-gray-600 text-sm mt-0.5">Análisis de actividad por franja horaria</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4 flex items-center gap-3">
        <Calendar size={16} className="text-gray-400" />
        <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="input" />
        {loading && <span className="text-sm text-gray-400">Cargando...</span>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total ventas', value: `Q${totalSales.toFixed(2)}`, icon: DollarSign, color: 'text-green-600 bg-green-100' },
          { label: 'Transacciones', value: String(totalTx), icon: ShoppingCart, color: 'text-blue-600 bg-blue-100' },
          { label: 'Hora pico', value: peakHour?.hour ?? '–', icon: Clock, color: 'text-red-600 bg-red-100' },
          { label: 'Ventas hora pico', value: peakHour ? `Q${peakHour.sales.toFixed(2)}` : '–', icon: TrendingUp, color: 'text-purple-600 bg-purple-100' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-3">
            <div className={`p-2.5 rounded-lg ${s.color}`}><s.icon size={20} /></div>
            <div><p className="text-xs text-gray-400">{s.label}</p><p className="text-xl font-bold text-gray-800">{s.value}</p></div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Ventas por hora del día</h2>
        {sales.length === 0
          ? <div className="flex items-center justify-center h-52 text-gray-400 text-sm">Sin ventas en este día</div>
          : <ResponsiveContainer width="100%" height={260}>
              <BarChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any, name: string) => [name === 'sales' ? `Q${Number(v).toFixed(2)}` : v, name === 'sales' ? 'Ventas' : 'Transacciones']} />
                <Bar dataKey="sales" radius={[4, 4, 0, 0]}>
                  {hourlyData.map((d, i) => (
                    <Cell key={i} fill={d.sales === maxSales ? '#EF4444' : d.sales > maxSales * 0.7 ? '#F59E0B' : '#6366F1'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
        }
      </div>

      {hourlyData.filter(d => d.transactions > 0).length > 0 && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b"><h2 className="text-sm font-semibold text-gray-700">Detalle por hora</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Hora', 'Transacciones', 'Total ventas', 'Ticket prom.', 'Actividad'].map(h => (
                    <th key={h} className={`px-4 py-2 text-xs text-gray-500 font-medium ${h === 'Hora' ? 'text-left' : h === 'Actividad' ? 'text-left' : 'text-right'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {hourlyData.filter(d => d.transactions > 0).map(d => (
                  <tr key={d.hour} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-mono font-medium text-gray-800">{d.hour}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{d.transactions}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">Q{d.sales.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">Q{d.avgTicket.toFixed(2)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${(d.sales / maxSales) * 100}%`, backgroundColor: d.sales === maxSales ? '#EF4444' : '#6366F1' }} />
                        </div>
                        <span className="text-xs text-gray-400 w-8 text-right">{Math.round((d.sales / maxSales) * 100)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AIRecommendations
        reportData={{ type: 'hourly_sales', data: { totalSales, transactions: sales.length, peakHour: peakHour?.hour, byHour: hourlyData } }}
        autoGenerate={sales.length > 0}
      />
    </div>
  )
}
