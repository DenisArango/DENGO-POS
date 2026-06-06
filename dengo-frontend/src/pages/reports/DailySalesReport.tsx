import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Calendar, DollarSign, ShoppingCart, TrendingUp, Package } from 'lucide-react'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store'
import { useStore } from '../../contexts/StoreContext'
import AIRecommendations from '../../components/reports/AIRecommendations'
import ReportFilters, { type ReportFilterState } from '../../components/reports/ReportFilters'

const PAYMENT_COLORS: Record<string, string> = { CASH: '#10B981', CARD: '#3B82F6', TRANSFER: '#8B5CF6', CREDIT: '#F59E0B', MIXED: '#6B7280' }
const PAYMENT_LABELS: Record<string, string> = { CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia', CREDIT: 'Crédito', MIXED: 'Mixto' }

export default function DailySalesReport() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { currentStore } = useStore()
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [loading, setLoading] = useState(false)
  const [sales, setSales] = useState<any[]>([])
  const [filters, setFilters] = useState<ReportFilterState>({ branchId: currentStore?.id ?? user?.branchId ?? '', cashRegisterId: '' })

  useEffect(() => { fetchSales() }, [selectedDate, filters])

  async function fetchSales() {
    setLoading(true)
    try {
      const branchQ = filters.branchId ? `&branchId=${filters.branchId}` : ''
      const regQ = filters.cashRegisterId ? `&cashRegisterId=${filters.cashRegisterId}` : ''
      const data = await api.get<any[]>(`/api/reports/sales-history?from=${selectedDate}T00:00:00&to=${selectedDate}T23:59:59${branchQ}${regQ}`)
      setSales(data ?? [])
    } catch { setSales([]) } finally { setLoading(false) }
  }

  const totalSales = sales.reduce((s, x) => s + Number(x.total), 0)
  const transactions = sales.length
  const avgTicket = transactions > 0 ? totalSales / transactions : 0
  const itemsSold = sales.reduce((s, x) => s + (x.items?.reduce((a: number, i: any) => a + Number(i.quantity), 0) ?? 0), 0)

  const hourlyMap: Record<number, number> = {}
  for (let h = 6; h <= 22; h++) hourlyMap[h] = 0
  for (const sale of sales) {
    const h = new Date(sale.createdAt).getHours()
    hourlyMap[h] = (hourlyMap[h] ?? 0) + Number(sale.total)
  }
  const byHour = Object.entries(hourlyMap).map(([h, v]) => ({ hour: `${String(h).padStart(2, '0')}:00`, sales: Math.round(v * 100) / 100 }))

  const methodMap: Record<string, number> = {}
  for (const sale of sales) { const m = sale.paymentMethod ?? 'CASH'; methodMap[m] = (methodMap[m] ?? 0) + Number(sale.total) }
  const byMethod = Object.entries(methodMap).map(([m, v]) => ({ name: PAYMENT_LABELS[m] ?? m, value: Math.round(v * 100) / 100, color: PAYMENT_COLORS[m] ?? '#6B7280' }))

  const prodMap: Record<string, { name: string; quantity: number; revenue: number }> = {}
  for (const sale of sales) {
    for (const item of sale.items ?? []) {
      const name = item.product?.name ?? item.productName ?? '–'
      if (!prodMap[name]) prodMap[name] = { name, quantity: 0, revenue: 0 }
      prodMap[name]!.quantity += Number(item.quantity); prodMap[name]!.revenue += Number(item.total)
    }
  }
  const topProducts = Object.values(prodMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5)

  const catMap: Record<string, number> = {}
  for (const sale of sales) {
    for (const item of sale.items ?? []) {
      const cat = item.product?.category?.name ?? 'Sin categoría'
      catMap[cat] = (catMap[cat] ?? 0) + Number(item.total)
    }
  }
  const byCategory = Object.entries(catMap)
    .map(([c, v]) => ({ category: c, sales: v, percentage: totalSales > 0 ? Math.round((v / totalSales) * 100) : 0 }))
    .sort((a, b) => b.sales - a.sales).slice(0, 6)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/reports')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Ventas del Día</h1>
          <p className="text-gray-600 text-sm mt-0.5">
            {format(new Date(selectedDate + 'T12:00:00'), "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4 flex flex-wrap items-center gap-3">
        <Calendar className="text-gray-400" size={18} />
        <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="input" />
        <ReportFilters value={filters} onChange={setFilters} />
        {loading && <span className="text-sm text-gray-400">Cargando...</span>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total ventas', value: `Q${totalSales.toFixed(2)}`, icon: DollarSign, color: 'text-green-600 bg-green-100' },
          { label: 'Transacciones', value: String(transactions), icon: ShoppingCart, color: 'text-blue-600 bg-blue-100' },
          { label: 'Ticket promedio', value: `Q${avgTicket.toFixed(2)}`, icon: TrendingUp, color: 'text-purple-600 bg-purple-100' },
          { label: 'Artículos vendidos', value: String(Math.round(itemsSold)), icon: Package, color: 'text-orange-600 bg-orange-100' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-3">
            <div className={`p-2.5 rounded-lg ${s.color}`}><s.icon size={20} /></div>
            <div><p className="text-xs text-gray-400">{s.label}</p><p className="text-xl font-bold text-gray-800">{s.value}</p></div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Ventas por hora</h2>
          {sales.length === 0
            ? <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Sin ventas en este día</div>
            : <ResponsiveContainer width="100%" height={220}>
                <BarChart data={byHour}><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={2} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => [`Q${Number(v).toFixed(2)}`, 'Ventas']} />
                  <Bar dataKey="sales" fill="#6366F1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
          }
        </div>

        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Métodos de pago</h2>
          {byMethod.length === 0
            ? <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Sin datos</div>
            : <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={180}>
                  <PieChart><Pie data={byMethod} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value">
                    {byMethod.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie><Tooltip formatter={(v: any) => [`Q${Number(v).toFixed(2)}`]} /></PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 flex-1">
                  {byMethod.map(m => (
                    <div key={m.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: m.color }} />
                        <span className="text-gray-600">{m.name}</span>
                      </div>
                      <span className="font-semibold">Q{m.value.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
          }
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Top 5 productos</h2>
          {topProducts.length === 0
            ? <p className="text-sm text-gray-400 text-center py-6">Sin datos</p>
            : <table className="w-full text-sm"><thead className="bg-gray-50"><tr>
                <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium">Producto</th>
                <th className="text-right px-3 py-2 text-xs text-gray-500 font-medium">Cant.</th>
                <th className="text-right px-3 py-2 text-xs text-gray-500 font-medium">Ingresos</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {topProducts.map(p => (
                  <tr key={p.name}>
                    <td className="px-3 py-2.5 font-medium text-gray-800">{p.name}</td>
                    <td className="px-3 py-2.5 text-right text-gray-600">{p.quantity % 1 === 0 ? p.quantity : p.quantity.toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold">Q{p.revenue.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        </div>

        {byCategory.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Ventas por categoría</h2>
            <div className="space-y-3">
              {byCategory.map(c => (
                <div key={c.category}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-700">{c.category}</span>
                    <span className="font-semibold">Q{c.sales.toFixed(2)} ({c.percentage}%)</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-primary-500 rounded-full" style={{ width: `${c.percentage}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <AIRecommendations
        reportData={{ type: 'daily_sales', data: { totalSales, transactions, avgTicket, itemsSold, topProducts: topProducts.slice(0, 5), byCategory: byCategory.slice(0, 6), byMethod, date: selectedDate } }}
        autoGenerate={sales.length > 0}
      />
    </div>
  )
}
