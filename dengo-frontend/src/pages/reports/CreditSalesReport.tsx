import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CreditCard, Users, DollarSign, AlertTriangle, Search } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store'
import AIRecommendations from '../../components/reports/AIRecommendations'

export default function CreditSalesReport() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [customers, setCustomers] = useState<any[]>([])
  const [creditSales, setCreditSales] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'customers' | 'transactions'>('customers')

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const branchQ = user?.branchId ? `&branchId=${user.branchId}` : ''
      const [custs, sales] = await Promise.all([
        api.get<any[]>('/api/customers'),
        api.get<any[]>(`/api/reports/sales-history?paymentMethod=CREDIT${branchQ}`),
      ])
      setCustomers((custs ?? []).filter((c: any) => Number(c.creditLimit ?? 0) > 0))
      setCreditSales(sales ?? [])
    } catch { setCustomers([]); setCreditSales([]) } finally { setLoading(false) }
  }

  // Build balance per customer from credit sales
  const balanceMap: Record<string, number> = {}
  for (const sale of creditSales) {
    const cid = sale.customerId ?? sale.customer?.id
    if (cid) balanceMap[cid] = (balanceMap[cid] ?? 0) + Number(sale.total)
  }

  const enriched = customers.map(c => ({
    ...c,
    creditLimit: Number(c.creditLimit ?? 0),
    balance: balanceMap[c.id] ?? 0,
    availableCredit: Number(c.creditLimit ?? 0) - (balanceMap[c.id] ?? 0),
    status: (balanceMap[c.id] ?? 0) > Number(c.creditLimit ?? 0) * 0.9 ? 'warning' : 'active',
  }))

  const filteredCustomers = enriched.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()))
  const filteredSales = creditSales.filter(s => !search || (s.customer?.name ?? '').toLowerCase().includes(search.toLowerCase()))

  const totalCreditBalance = enriched.reduce((s, c) => s + c.balance, 0)
  const overdueCount = enriched.filter(c => c.status === 'warning').length
  const totalCreditLimit = enriched.reduce((s, c) => s + c.creditLimit, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/reports')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Ventas al Crédito</h1>
          <p className="text-gray-600 text-sm mt-0.5">Clientes con crédito activo y saldo pendiente</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Clientes con crédito', value: String(enriched.length), icon: Users, color: 'text-blue-600 bg-blue-100' },
          { label: 'Saldo total pendiente', value: `Q${totalCreditBalance.toFixed(2)}`, icon: DollarSign, color: 'text-orange-600 bg-orange-100' },
          { label: 'Límite total', value: `Q${totalCreditLimit.toFixed(2)}`, icon: CreditCard, color: 'text-purple-600 bg-purple-100' },
          { label: 'Cerca del límite', value: String(overdueCount), icon: AlertTriangle, color: overdueCount > 0 ? 'text-red-600 bg-red-100' : 'text-green-600 bg-green-100' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-3">
            <div className={`p-2.5 rounded-lg ${s.color}`}><s.icon size={20} /></div>
            <div><p className="text-xs text-gray-400">{s.label}</p><p className="text-xl font-bold text-gray-800">{s.value}</p></div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4 flex items-center gap-3">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          <button onClick={() => setTab('customers')} className={`px-4 py-1.5 text-sm font-medium transition-colors ${tab === 'customers' ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>Clientes</button>
          <button onClick={() => setTab('transactions')} className={`px-4 py-1.5 text-sm font-medium transition-colors ${tab === 'transactions' ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>Transacciones</button>
        </div>
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente..." className="input pl-8 w-full" />
        </div>
        {loading && <span className="text-sm text-gray-400">Cargando...</span>}
      </div>

      {tab === 'customers' ? (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Cliente</th>
                  <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium">Límite crédito</th>
                  <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium">Saldo usado</th>
                  <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium">Disponible</th>
                  <th className="text-center px-4 py-3 text-xs text-gray-500 font-medium">Uso</th>
                  <th className="text-center px-4 py-3 text-xs text-gray-500 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredCustomers.length === 0
                  ? <tr><td colSpan={6} className="text-center py-10 text-gray-400">Sin clientes con crédito</td></tr>
                  : filteredCustomers.map(c => {
                      const usagePct = c.creditLimit > 0 ? Math.min(100, (c.balance / c.creditLimit) * 100) : 0
                      return (
                        <tr key={c.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-gray-800">{c.name}</p>
                            <p className="text-xs text-gray-400">{c.phone ?? c.nit ?? '–'}</p>
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-700">Q{c.creditLimit.toFixed(2)}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-orange-600">Q{c.balance.toFixed(2)}</td>
                          <td className="px-4 py-2.5 text-right text-green-600">Q{c.availableCredit.toFixed(2)}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${usagePct}%`, backgroundColor: usagePct >= 90 ? '#EF4444' : usagePct >= 70 ? '#F59E0B' : '#10B981' }} />
                              </div>
                              <span className="text-xs text-gray-400 w-8">{Math.round(usagePct)}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${c.status === 'warning' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                              {c.status === 'warning' ? 'Alerta' : 'Normal'}
                            </span>
                          </td>
                        </tr>
                      )
                    })
                }
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Factura</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Fecha</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Cliente</th>
                  <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredSales.length === 0
                  ? <tr><td colSpan={4} className="text-center py-10 text-gray-400">Sin ventas al crédito</td></tr>
                  : filteredSales.map(s => (
                      <tr key={s.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{s.invoiceNumber}</td>
                        <td className="px-4 py-2.5 text-gray-600 text-xs">{format(new Date(s.createdAt), "dd/MM/yyyy HH:mm", { locale: es })}</td>
                        <td className="px-4 py-2.5 font-medium text-gray-800">{s.customer?.name ?? '–'}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-orange-600">Q{Number(s.total).toFixed(2)}</td>
                      </tr>
                    ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AIRecommendations
        reportData={{ type: 'credit_sales', data: { totalCredit: totalCreditBalance, outstanding: overdueCount, totalLimit: totalCreditLimit, customers: enriched.length } }}
        autoGenerate={customers.length > 0}
      />
    </div>
  )
}
