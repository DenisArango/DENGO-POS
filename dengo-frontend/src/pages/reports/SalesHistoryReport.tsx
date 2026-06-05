import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Search, Eye, DollarSign, ShoppingCart, TrendingUp, CreditCard, X } from 'lucide-react'
import { format, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store'
import AIRecommendations from '../../components/reports/AIRecommendations'

const PM_LABEL: Record<string, string> = { CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia', CREDIT: 'Crédito', MIXED: 'Mixto' }
const PM_COLOR: Record<string, string> = { CASH: 'bg-green-100 text-green-700', CARD: 'bg-blue-100 text-blue-700', TRANSFER: 'bg-purple-100 text-purple-700', CREDIT: 'bg-yellow-100 text-yellow-700', MIXED: 'bg-gray-100 text-gray-700' }

export default function SalesHistoryReport() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [from, setFrom] = useState(format(subDays(new Date(), 6), 'yyyy-MM-dd'))
  const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [search, setSearch] = useState('')
  const [method, setMethod] = useState('')
  const [loading, setLoading] = useState(false)
  const [sales, setSales] = useState<any[]>([])
  const [selected, setSelected] = useState<any | null>(null)

  useEffect(() => { fetchData() }, [from, to, method])

  async function fetchData() {
    setLoading(true)
    try {
      const branchQ = user?.branchId ? `&branchId=${user.branchId}` : ''
      const methodQ = method ? `&paymentMethod=${method}` : ''
      const data = await api.get<any[]>(`/api/reports/sales-history?from=${from}T00:00:00&to=${to}T23:59:59${branchQ}${methodQ}`)
      setSales(data ?? [])
    } catch { setSales([]) } finally { setLoading(false) }
  }

  const filtered = sales.filter(s => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (s.invoiceNumber ?? '').toLowerCase().includes(q) || (s.customer?.name ?? '').toLowerCase().includes(q)
  })

  const totalSales = filtered.reduce((s, x) => s + Number(x.total), 0)
  const avgTicket = filtered.length > 0 ? totalSales / filtered.length : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/reports')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Historial de Ventas</h1>
          <p className="text-gray-600 text-sm mt-0.5">Todas las transacciones en el período</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4 flex flex-wrap gap-3">
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input" />
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input" />
        <select value={method} onChange={e => setMethod(e.target.value)} className="input">
          <option value="">Todos los métodos</option>
          {Object.entries(PM_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div className="relative flex-1 min-w-48">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por factura o cliente..." className="input pl-9 w-full" />
        </div>
        {loading && <span className="text-sm text-gray-400 self-center">Cargando...</span>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total ventas', value: `Q${totalSales.toFixed(2)}`, icon: DollarSign, color: 'text-green-600 bg-green-100' },
          { label: 'Transacciones', value: String(filtered.length), icon: ShoppingCart, color: 'text-blue-600 bg-blue-100' },
          { label: 'Ticket promedio', value: `Q${avgTicket.toFixed(2)}`, icon: TrendingUp, color: 'text-purple-600 bg-purple-100' },
          { label: 'Método más usado', value: (() => { const m: Record<string, number> = {}; filtered.forEach(s => { m[s.paymentMethod] = (m[s.paymentMethod] ?? 0) + 1 }); const top = Object.entries(m).sort((a,b) => b[1]-a[1])[0]; return top ? PM_LABEL[top[0]] ?? top[0] : '–' })(), icon: CreditCard, color: 'text-orange-600 bg-orange-100' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-3">
            <div className={`p-2.5 rounded-lg ${s.color}`}><s.icon size={20} /></div>
            <div><p className="text-xs text-gray-400">{s.label}</p><p className="text-lg font-bold text-gray-800">{s.value}</p></div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Factura</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Fecha</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Cliente</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Cajero</th>
                <th className="text-center px-4 py-3 text-xs text-gray-500 font-medium">Método</th>
                <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium">Total</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0
                ? <tr><td colSpan={7} className="text-center py-12 text-gray-400">Sin registros en el período seleccionado</td></tr>
                : filtered.map(sale => (
                    <tr key={sale.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">{sale.invoiceNumber}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{format(new Date(sale.createdAt), "dd/MM/yyyy HH:mm", { locale: es })}</td>
                      <td className="px-4 py-3 text-gray-700">{sale.customer?.name ?? 'General'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{sale.cashier?.name ?? '–'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${PM_COLOR[sale.paymentMethod] ?? 'bg-gray-100 text-gray-700'}`}>
                          {PM_LABEL[sale.paymentMethod] ?? sale.paymentMethod}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-800">Q{Number(sale.total).toFixed(2)}</td>
                      <td className="pr-3">
                        <button onClick={() => setSelected(sale)} className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-700 transition-colors">
                          <Eye size={15} />
                        </button>
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <h2 className="font-semibold text-gray-800">{selected.invoiceNumber}</h2>
                <p className="text-xs text-gray-400">{format(new Date(selected.createdAt), "d 'de' MMMM yyyy, HH:mm", { locale: es })}</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-1.5 hover:bg-gray-100 rounded"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Cliente</span><span className="font-medium">{selected.customer?.name ?? 'General'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Cajero</span><span>{selected.cashier?.name ?? '–'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Método de pago</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PM_COLOR[selected.paymentMethod] ?? 'bg-gray-100 text-gray-700'}`}>
                  {PM_LABEL[selected.paymentMethod] ?? selected.paymentMethod}
                </span>
              </div>
              <div className="border-t pt-3 mt-3">
                <p className="text-xs font-medium text-gray-500 mb-2">ARTÍCULOS</p>
                <div className="space-y-1.5">
                  {(selected.items ?? []).map((item: any, i: number) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-gray-700">{item.product?.name ?? item.productName} × {Number(item.quantity).toFixed(0)}</span>
                      <span className="font-medium">Q{Number(item.total).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t pt-3 space-y-1">
                <div className="flex justify-between text-sm text-gray-500"><span>Subtotal</span><span>Q{Number(selected.subtotal).toFixed(2)}</span></div>
                {Number(selected.tax) > 0 && <div className="flex justify-between text-sm text-gray-500"><span>IVA</span><span>Q{Number(selected.tax).toFixed(2)}</span></div>}
                {Number(selected.discount) > 0 && <div className="flex justify-between text-sm text-red-500"><span>Descuento</span><span>-Q{Number(selected.discount).toFixed(2)}</span></div>}
                <div className="flex justify-between font-bold text-gray-800 pt-1 border-t"><span>Total</span><span>Q{Number(selected.total).toFixed(2)}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      <AIRecommendations
        reportData={{ type: 'sales_history', data: { totalRevenue: totalSales, transactions: sales.length } }}
        autoGenerate={sales.length > 0}
      />
    </div>
  )
}
