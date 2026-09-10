import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Search, DollarSign, ShoppingCart, TrendingUp, CreditCard, ExternalLink, Receipt
} from 'lucide-react'
import { format, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store'
import { useStore } from '../../contexts/StoreContext'
import { usePermissions } from '../../hooks/usePermissions'
import AIRecommendations from '../../components/reports/AIRecommendations'
import ReportFilters, { type ReportFilterState } from '../../components/reports/ReportFilters'

const PM_LABEL: Record<string, string> = { CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia', CREDIT: 'Crédito', MIXED: 'Mixto' }
const PM_COLOR: Record<string, string> = { CASH: 'bg-green-100 text-green-700', CARD: 'bg-blue-100 text-blue-700', TRANSFER: 'bg-purple-100 text-purple-700', CREDIT: 'bg-yellow-100 text-yellow-700', MIXED: 'bg-gray-100 text-gray-700' }

export default function SalesHistoryReport() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { currentStore } = useStore()
  const { hasPermission } = usePermissions()
  const canGenerateInvoice = hasPermission('sales.edit')

  const [from, setFrom] = useState(format(subDays(new Date(), 6), 'yyyy-MM-dd'))
  const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [search, setSearch] = useState('')
  const [method, setMethod] = useState('')
  const [saleTypeFilter, setSaleTypeFilter] = useState('')
  const [includeVoided, setIncludeVoided] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sales, setSales] = useState<any[]>([])
  const [filters, setFilters] = useState<ReportFilterState>({
    branchId: currentStore?.id ?? user?.branchId ?? '',
    cashRegisterId: '',
  })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [generating, setGenerating] = useState(false)

  useEffect(() => { fetchData() }, [from, to, method, saleTypeFilter, filters, includeVoided])
  useEffect(() => { setSelected(new Set()) }, [from, to, method, saleTypeFilter, filters, includeVoided, search])

  async function fetchData() {
    setLoading(true)
    try {
      const branchQ = filters.branchId ? `&branchId=${filters.branchId}` : ''
      const regQ = filters.cashRegisterId ? `&cashRegisterId=${filters.cashRegisterId}` : ''
      const methodQ = method ? `&paymentMethod=${method}` : ''
      const saleTypeQ = saleTypeFilter ? `&saleType=${saleTypeFilter}` : ''
      const voidQ = includeVoided ? `&includeVoided=true` : ''
      const data = await api.get<any[]>(
        `/api/reports/sales-history?from=${from}T00:00:00&to=${to}T23:59:59${branchQ}${regQ}${methodQ}${saleTypeQ}${voidQ}`
      )
      setSales(data ?? [])
    } catch { setSales([]) } finally { setLoading(false) }
  }

  const filtered = sales.filter(s => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (s.invoiceNumber ?? '').toLowerCase().includes(q)
      || (s.customer?.name ?? '').toLowerCase().includes(q)
  })

  // Only sales that can actually receive a factura are selectable for the
  // bulk action — not voided, not already invoiced.
  const invoiceable = filtered.filter(s => !s.isVoided && !s.requiresInvoice)
  const allInvoiceableSelected = invoiceable.length > 0 && invoiceable.every(s => selected.has(s.id))

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelected(allInvoiceableSelected ? new Set() : new Set(invoiceable.map(s => s.id)))
  }

  const generateBulkInvoices = async () => {
    if (selected.size === 0) return
    setGenerating(true)
    try {
      const result = await api.post<{ succeeded: string[]; failed: { saleId: string; error: string }[] }>(
        '/api/sales/bulk-generate-invoices',
        { saleIds: Array.from(selected) }
      )
      if (result.succeeded.length > 0) toast.success(`${result.succeeded.length} factura${result.succeeded.length === 1 ? '' : 's'} generada${result.succeeded.length === 1 ? '' : 's'}`)
      if (result.failed.length > 0) {
        const firstReason = result.failed[0]?.error
        toast.error(`${result.failed.length} venta${result.failed.length === 1 ? '' : 's'} sin facturar — ${firstReason}${result.failed.length > 1 ? ' (y otras)' : ''}`)
      }
      setSelected(new Set())
      fetchData()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al generar facturas')
    } finally {
      setGenerating(false)
    }
  }

  const active = filtered.filter(s => !s.isVoided)
  const totalSales = active.reduce((s, x) => s + Number(x.total), 0)
  const totalProfit = active.reduce((s, x) => s + (x.saleProfit ?? 0), 0)
  const avgTicket = active.length > 0 ? totalSales / active.length : 0

  // Payment breakdown
  const cashTotal = active.reduce((s, x) => {
    if (x.paymentMethod === 'CASH') return s + Number(x.total)
    if (x.paymentMethod === 'MIXED') return s + Number(x.cashAmount ?? 0)
    return s
  }, 0)
  const cardTotal = active.reduce((s, x) => {
    if (x.paymentMethod === 'CARD') return s + Number(x.total)
    if (x.paymentMethod === 'MIXED') return s + Number(x.cardAmount ?? 0)
    return s
  }, 0)
  const transferTotal = active.reduce((s, x) => {
    if (x.paymentMethod === 'TRANSFER') return s + Number(x.total)
    if (x.paymentMethod === 'MIXED') return s + Number(x.transferAmount ?? 0)
    return s
  }, 0)
  const creditTotal = active.reduce((s, x) =>
    x.saleType === 'CREDIT' ? s + Number(x.total) : s, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/reports')} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Historial de Ventas</h1>
          <p className="text-gray-600 text-sm mt-0.5">Haz clic en una venta para ver el detalle completo, imprimir o editar</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm p-4 flex flex-wrap gap-3">
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input" />
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input" />
        <select value={method} onChange={e => setMethod(e.target.value)} className="input">
          <option value="">Todos los métodos</option>
          {Object.entries(PM_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={saleTypeFilter} onChange={e => setSaleTypeFilter(e.target.value)} className="input">
          <option value="">Contado y Crédito</option>
          <option value="CASH">Solo Contado</option>
          <option value="CREDIT">Solo Crédito</option>
        </select>
        <ReportFilters value={filters} onChange={setFilters} />
        <label className="flex items-center gap-2 text-sm text-gray-600 self-center">
          <input type="checkbox" checked={includeVoided} onChange={e => setIncludeVoided(e.target.checked)} />
          Ver anuladas
        </label>
        <div className="flex-1 min-w-48 flex items-center h-10 rounded-md border border-gray-300 bg-white px-3 gap-2 focus-within:ring-2 focus-within:ring-primary-600 focus-within:border-transparent">
          <Search size={15} className="text-gray-400 flex-shrink-0" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar factura o cliente..."
            className="flex-1 bg-transparent text-sm placeholder:text-gray-400 focus:outline-none min-w-0" />
        </div>
        {loading && <span className="text-sm text-gray-400 self-center">Cargando...</span>}
      </div>

      {/* Bulk invoice generation */}
      {canGenerateInvoice && selected.size > 0 && (
        <div className="bg-primary-50 border border-primary-200 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
          <span className="text-sm text-primary-800 font-medium">
            {selected.size} venta{selected.size === 1 ? '' : 's'} seleccionada{selected.size === 1 ? '' : 's'} para facturar
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => setSelected(new Set())} className="btn-outline btn-sm">Cancelar</button>
            <button onClick={generateBulkInvoices} disabled={generating} className="btn-primary btn-sm flex items-center gap-1.5 disabled:opacity-50">
              {generating ? <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" /> : <Receipt size={15} />}
              Generar facturas
            </button>
          </div>
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total ventas', value: `Q${totalSales.toFixed(2)}`, icon: DollarSign, color: 'text-green-600 bg-green-100' },
          { label: 'Ganancia total', value: `Q${totalProfit.toFixed(2)}`, icon: TrendingUp, color: 'text-emerald-600 bg-emerald-100' },
          { label: 'Transacciones', value: String(active.length), icon: ShoppingCart, color: 'text-blue-600 bg-blue-100' },
          { label: 'Ticket promedio', value: `Q${avgTicket.toFixed(2)}`, icon: CreditCard, color: 'text-purple-600 bg-purple-100' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-3">
            <div className={`p-2.5 rounded-lg ${s.color}`}><s.icon size={20} /></div>
            <div><p className="text-xs text-gray-400">{s.label}</p><p className="text-lg font-bold text-gray-800">{s.value}</p></div>
          </div>
        ))}
      </div>

      {/* Payment breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Efectivo', value: cashTotal, color: 'text-green-600' },
          { label: 'Tarjeta', value: cardTotal, color: 'text-blue-600' },
          { label: 'Transferencia', value: transferTotal, color: 'text-purple-600' },
          { label: 'Crédito', value: creditTotal, color: 'text-orange-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl shadow-sm p-3 flex items-center justify-between">
            <span className="text-sm text-gray-500">{s.label}</span>
            <span className={`font-bold ${s.color}`}>Q{s.value.toFixed(2)}</span>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {canGenerateInvoice && (
                  <th className="w-10 px-4 py-3">
                    <input type="checkbox" checked={allInvoiceableSelected} onChange={toggleAll} onClick={e => e.stopPropagation()} disabled={invoiceable.length === 0} />
                  </th>
                )}
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Factura</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Fecha</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Cliente</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Cajero</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Caja</th>
                <th className="text-center px-4 py-3 text-xs text-gray-500 font-medium">Método</th>
                <th className="text-center px-4 py-3 text-xs text-gray-500 font-medium">Documento</th>
                <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium">Total</th>
                <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium">Ganancia</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0
                ? <tr><td colSpan={10} className="text-center py-12 text-gray-400">Sin registros en el período seleccionado</td></tr>
                : filtered.map(sale => (
                  <tr
                    key={sale.id}
                    onClick={() => navigate(`/reports/sales/${sale.id}`)}
                    className={`hover:bg-primary-50 cursor-pointer transition-colors ${sale.isVoided ? 'opacity-50 bg-red-50' : ''}`}
                  >
                    {canGenerateInvoice && (
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(sale.id)}
                          onChange={() => toggleOne(sale.id)}
                          disabled={sale.isVoided || sale.requiresInvoice}
                        />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-gray-700">{sale.invoiceNumber}</span>
                      {sale.isVoided && <span className="ml-1 text-xs text-red-500 font-medium">ANULADA</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">
                      {format(new Date(sale.createdAt), "dd/MM/yyyy HH:mm", { locale: es })}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{sale.customer?.name ?? 'General'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{sale.cashier?.name ?? '–'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {sale.cashRegister ? `${sale.cashRegister.name} #${sale.cashRegister.registerNumber}` : '–'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        sale.saleType === 'CREDIT' ? 'bg-yellow-100 text-yellow-700' : (PM_COLOR[sale.paymentMethod] ?? 'bg-gray-100 text-gray-700')
                      }`}>
                        {sale.saleType === 'CREDIT' ? 'Crédito' : (PM_LABEL[sale.paymentMethod] ?? sale.paymentMethod)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {sale.requiresInvoice ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                          Factura {sale.felStatus === 'CERTIFIED' ? '' : '(pend.)'}
                        </span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Recibo</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800">Q{Number(sale.total).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-xs text-emerald-600 font-medium">
                      {sale.saleProfit !== undefined ? `Q${Number(sale.saleProfit).toFixed(2)}` : '–'}
                    </td>
                    <td className="pr-3 text-gray-400">
                      <ExternalLink size={14} />
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>

      <AIRecommendations
        reportData={{ type: 'sales_history', data: { totalRevenue: totalSales, transactions: sales.length, profit: totalProfit } }}
      />
    </div>
  )
}
