import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Package, DollarSign, TrendingUp, ShoppingCart, Tag, ExternalLink } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { format, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store'
import { useStore } from '../../contexts/StoreContext'
import ReportFilters, { type ReportFilterState } from '../../components/reports/ReportFilters'

interface ProductInfo {
  id: string
  name: string
  barcode?: string
  sku?: string
  imageUrl?: string
  category?: string
  baseUnit?: string
  basePrice: number
  cost: number
}

interface HistoryRow {
  saleId: string
  invoiceNumber: string
  date: string
  isVoided: boolean
  saleType: string
  paymentMethod: string
  branch: { id: string; name: string } | null
  customer: { id: string; name: string } | null
  cashier: { id: string; name: string } | null
  variationName: string | null
  quantity: number
  unitPrice: number
  discount: number
  total: number
  cost: number
  profit: number
}

interface Summary {
  transactionCount: number
  totalQuantity: number
  totalRevenue: number
  totalProfit: number
  avgUnitPrice: number
}

export default function ProductSalesHistoryReport() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { currentStore } = useStore()
  const [searchParams] = useSearchParams()
  const productId = searchParams.get('productId') ?? ''

  const [from, setFrom] = useState(format(subDays(new Date(), 364), 'yyyy-MM-dd'))
  const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [loading, setLoading] = useState(false)
  const [product, setProduct] = useState<ProductInfo | null>(null)
  const [summary, setSummary] = useState<Summary>({ transactionCount: 0, totalQuantity: 0, totalRevenue: 0, totalProfit: 0, avgUnitPrice: 0 })
  const [rows, setRows] = useState<HistoryRow[]>([])
  const [filters, setFilters] = useState<ReportFilterState>({ branchId: currentStore?.id ?? user?.branchId ?? '', cashRegisterId: '' })

  useEffect(() => { fetchData() }, [productId, from, to, filters])

  async function fetchData() {
    if (!productId) return
    setLoading(true)
    try {
      const branchQ = filters.branchId ? `&branchId=${filters.branchId}` : ''
      const data = await api.get<{ product: ProductInfo; summary: Summary; rows: HistoryRow[] }>(
        `/api/reports/product-sales-history?productId=${productId}&from=${from}T00:00:00&to=${to}T23:59:59${branchQ}`
      )
      setProduct(data.product)
      setSummary(data.summary)
      setRows(data.rows ?? [])
    } catch {
      setProduct(null)
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  // Revenue by day, most recent 20 days that actually had a sale — a daily
  // bar for a whole year would be unreadable, and most days have nothing.
  const byDay = new Map<string, number>()
  for (const r of rows) {
    const key = format(new Date(r.date), 'yyyy-MM-dd')
    byDay.set(key, (byDay.get(key) ?? 0) + r.total)
  }
  const chartData = Array.from(byDay.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-20)
    .map(([day, revenue]) => ({ day: format(new Date(day + 'T12:00:00'), 'd MMM', { locale: es }), revenue: Math.round(revenue * 100) / 100 }))

  if (!productId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft size={20} /></button>
          <h1 className="text-2xl font-bold text-gray-800">Historial de Ventas del Producto</h1>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-12 text-center text-gray-500">
          Entra a este reporte desde el botón de historial de ventas en Inventario.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><ArrowLeft size={20} /></button>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {product?.imageUrl ? (
            <img src={product.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover border border-gray-200 flex-shrink-0" />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
              <Package size={22} className="text-gray-300" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-800 truncate">{product?.name ?? 'Historial de Ventas del Producto'}</h1>
            <p className="text-gray-500 text-sm flex items-center gap-1.5 flex-wrap">
              {product?.sku && <span className="font-mono text-xs">{product.sku}</span>}
              {product?.category && <span className="flex items-center gap-1"><Tag size={11} />{product.category}</span>}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4 flex flex-wrap items-center gap-3">
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input" />
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input" />
        <ReportFilters value={filters} onChange={setFilters} showRegister={false} />
        {loading && <span className="text-sm text-gray-400">Cargando...</span>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Transacciones', value: String(summary.transactionCount), icon: ShoppingCart, color: 'text-blue-600 bg-blue-100' },
          { label: 'Unidades vendidas', value: summary.totalQuantity % 1 === 0 ? String(summary.totalQuantity) : summary.totalQuantity.toFixed(2), icon: Package, color: 'text-purple-600 bg-purple-100' },
          { label: 'Ingresos', value: `Q${summary.totalRevenue.toFixed(2)}`, icon: DollarSign, color: 'text-green-600 bg-green-100' },
          { label: 'Ganancia', value: `Q${summary.totalProfit.toFixed(2)}`, icon: TrendingUp, color: 'text-emerald-600 bg-emerald-100' },
          { label: 'Precio promedio', value: `Q${summary.avgUnitPrice.toFixed(2)}`, icon: Tag, color: 'text-orange-600 bg-orange-100' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-3">
            <div className={`p-2.5 rounded-lg ${s.color}`}><s.icon size={20} /></div>
            <div><p className="text-xs text-gray-400">{s.label}</p><p className="text-lg font-bold text-gray-800">{s.value}</p></div>
          </div>
        ))}
      </div>

      {chartData.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Ingresos por día (últimos días con venta)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any) => [`Q${Number(v).toFixed(2)}`, 'Ingresos']} />
              <Bar dataKey="revenue" fill="#6366F1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                {['Fecha', 'Venta', 'Cliente', 'Sucursal', 'Variante', 'Cant.', 'Precio Unit.', 'Total', 'Ganancia'].map(h => (
                  <th key={h} className="text-left py-3 px-4 text-sm font-semibold text-gray-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(r => (
                <tr
                  key={`${r.saleId}-${r.date}`}
                  onClick={() => navigate(`/reports/sales/${r.saleId}`)}
                  className="hover:bg-primary-50 cursor-pointer transition-colors"
                >
                  <td className="py-3 px-4 text-sm text-gray-600 whitespace-nowrap">{format(new Date(r.date), "d MMM yyyy, HH:mm", { locale: es })}</td>
                  <td className="py-3 px-4">
                    <span className="font-mono text-xs text-primary-700 flex items-center gap-1">{r.invoiceNumber}<ExternalLink size={11} /></span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-700">{r.customer?.name ?? '—'}</td>
                  <td className="py-3 px-4 text-sm text-gray-500">{r.branch?.name ?? '—'}</td>
                  <td className="py-3 px-4 text-sm text-gray-500">{r.variationName ?? '—'}</td>
                  <td className="py-3 px-4 text-sm text-gray-700">{r.quantity}</td>
                  <td className="py-3 px-4 text-sm text-gray-700">Q{r.unitPrice.toFixed(2)}</td>
                  <td className="py-3 px-4 text-sm font-semibold text-gray-800">Q{r.total.toFixed(2)}</td>
                  <td className="py-3 px-4 text-sm font-semibold text-emerald-600">Q{r.profit.toFixed(2)}</td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-gray-500">Sin ventas de este producto en el período seleccionado</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
