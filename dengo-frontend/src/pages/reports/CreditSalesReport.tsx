import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, CreditCard, Users, DollarSign, AlertTriangle,
  Search, X, CheckCircle, History, Plus
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store'
import AIRecommendations from '../../components/reports/AIRecommendations'
import { toast } from 'sonner'

export default function CreditSalesReport() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'ADMIN'

  const [loading, setLoading] = useState(false)
  const [customers, setCustomers] = useState<any[]>([])
  const [creditSales, setCreditSales] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'customers' | 'transactions'>('customers')

  // Payment modal
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentSale, setPaymentSale] = useState<any | null>(null)
  const [paymentCustomerSales, setPaymentCustomerSales] = useState<any[]>([]) // all unpaid sales for a customer
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState<'CASH' | 'TRANSFER'>('CASH')
  const [payTransferDoc, setPayTransferDoc] = useState('')
  const [payBank, setPayBank] = useState('')
  const [payNotes, setPayNotes] = useState('')
  const [paying, setPaying] = useState(false)
  const [paymentHistory, setPaymentHistory] = useState<any[]>([])

  // Sale detail
  const [showDetail, setShowDetail] = useState(false)
  const [detailSale, setDetailSale] = useState<any | null>(null)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const branchQ = user?.role !== 'ADMIN' && user?.branchId ? `&branchId=${user.branchId}` : ''
      const [custs, sales] = await Promise.all([
        api.get<any[]>('/api/customers'),
        api.get<any[]>(`/api/reports/sales-history?paymentMethod=CREDIT${branchQ}&includeVoided=false`),
      ])
      setCustomers((custs ?? []).filter((c: any) => Number(c.creditLimit ?? 0) > 0))
      setCreditSales(sales ?? [])
    } catch { setCustomers([]); setCreditSales([]) } finally { setLoading(false) }
  }

  const openPaymentForCustomer = async (customerId: string) => {
    const sales = creditSales.filter(s => s.customerId === customerId && !s.isPaid && !s.isVoided)
    setPaymentCustomerSales(sales)
    setPaymentSale(sales[0] ?? null)
    // Load all credit payments for this customer's sales
    const allPayments: any[] = []
    for (const s of sales) {
      try {
        const ps = await api.get<any[]>(`/api/sales/${s.id}/payments`)
        allPayments.push(...(ps ?? []).map(p => ({ ...p, invoiceNumber: s.invoiceNumber })))
      } catch {}
    }
    setPaymentHistory(allPayments)
    setPayAmount('')
    setPayMethod('CASH')
    setPayTransferDoc('')
    setPayBank('')
    setPayNotes('')
    setShowPaymentModal(true)
  }

  const openPaymentForSale = async (sale: any) => {
    setPaymentCustomerSales([sale])
    setPaymentSale(sale)
    try {
      const ps = await api.get<any[]>(`/api/sales/${sale.id}/payments`)
      setPaymentHistory((ps ?? []).map(p => ({ ...p, invoiceNumber: sale.invoiceNumber })))
    } catch { setPaymentHistory([]) }
    setPayAmount('')
    setPayMethod('CASH')
    setPayTransferDoc('')
    setPayBank('')
    setPayNotes('')
    setShowPaymentModal(true)
  }

  const handlePay = async () => {
    if (!paymentSale) return
    const amount = parseFloat(payAmount)
    if (!amount || amount <= 0) { toast.error('Ingresa un monto válido'); return }
    if (payMethod === 'TRANSFER' && !payTransferDoc.trim()) {
      toast.error('Ingresa el número de documento de transferencia')
      return
    }
    setPaying(true)
    try {
      const payment = await api.post<any>(`/api/sales/${paymentSale.id}/payments`, {
        amount,
        paymentMethod: payMethod,
        transferDocumentNumber: payMethod === 'TRANSFER' ? payTransferDoc : undefined,
        transferBank: payMethod === 'TRANSFER' ? payBank : undefined,
        notes: payNotes || undefined,
      })
      toast.success(`Abono de Q${amount.toFixed(2)} registrado`)
      setPaymentHistory(prev => [...prev, { ...payment, invoiceNumber: paymentSale.invoiceNumber }])
      setPayAmount('')
      setPayTransferDoc('')
      setPayBank('')
      setPayNotes('')
      fetchData() // refresh balances
    } catch (e: any) {
      toast.error(e?.message ?? 'Error al registrar abono')
    } finally { setPaying(false) }
  }

  // Build balance per customer from credit sales
  const balanceMap: Record<string, number> = {}
  for (const sale of creditSales) {
    if (sale.isVoided) continue
    const cid = sale.customerId ?? sale.customer?.id
    if (cid) {
      const paid = (sale.paidAmount ?? (sale.isPaid ? Number(sale.total) : 0))
      balanceMap[cid] = (balanceMap[cid] ?? 0) + Number(sale.total) - Number(paid)
    }
  }

  const enriched = customers.map(c => ({
    ...c,
    creditLimit: Number(c.creditLimit ?? 0),
    balance: Math.max(0, balanceMap[c.id] ?? 0),
    availableCredit: Math.max(0, Number(c.creditLimit ?? 0) - (balanceMap[c.id] ?? 0)),
    status: (balanceMap[c.id] ?? 0) > Number(c.creditLimit ?? 0) * 0.9 ? 'warning' : 'active',
  }))

  const filteredCustomers = enriched.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()))
  const filteredSales = creditSales.filter(s => !search || (s.customer?.name ?? '').toLowerCase().includes(search.toLowerCase()))

  const totalCreditBalance = enriched.reduce((s, c) => s + c.balance, 0)
  const overdueCount = enriched.filter(c => c.status === 'warning').length
  const totalCreditLimit = enriched.reduce((s, c) => s + c.creditLimit, 0)

  // Remaining on selected sale
  const selectedSalePaid = paymentHistory
    .filter(p => p.invoiceNumber === paymentSale?.invoiceNumber)
    .reduce((s, p) => s + Number(p.amount), 0)
  const selectedSaleRemaining = paymentSale ? Math.max(0, Number(paymentSale.total) - selectedSalePaid) : 0

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
                  <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium">Límite</th>
                  <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium">Pendiente</th>
                  <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium">Disponible</th>
                  <th className="text-center px-4 py-3 text-xs text-gray-500 font-medium">Uso</th>
                  <th className="text-center px-4 py-3 text-xs text-gray-500 font-medium">Estado</th>
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredCustomers.length === 0
                  ? <tr><td colSpan={7} className="text-center py-10 text-gray-400">Sin clientes con crédito</td></tr>
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
                          <td className="px-4 py-2.5">
                            {c.balance > 0 && (
                              <button
                                onClick={() => openPaymentForCustomer(c.id)}
                                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors"
                              >
                                <Plus size={12} /> Abonar
                              </button>
                            )}
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
                  <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium">Abonado</th>
                  <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium">Pendiente</th>
                  <th className="text-center px-4 py-3 text-xs text-gray-500 font-medium">Estado</th>
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredSales.length === 0
                  ? <tr><td colSpan={8} className="text-center py-10 text-gray-400">Sin ventas al crédito</td></tr>
                  : filteredSales.map(s => {
                      const paid = Number(s.paidAmount ?? (s.isPaid ? s.total : 0))
                      const pending = Math.max(0, Number(s.total) - paid)
                      return (
                        <tr key={s.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{s.invoiceNumber}</td>
                          <td className="px-4 py-2.5 text-gray-600 text-xs">{format(new Date(s.createdAt), "dd/MM/yyyy", { locale: es })}</td>
                          <td className="px-4 py-2.5 font-medium text-gray-800">{s.customer?.name ?? '–'}</td>
                          <td className="px-4 py-2.5 text-right text-gray-700">Q{Number(s.total).toFixed(2)}</td>
                          <td className="px-4 py-2.5 text-right text-green-600">Q{paid.toFixed(2)}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-orange-600">Q{pending.toFixed(2)}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${s.isPaid ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                              {s.isPaid ? 'Pagado' : 'Pendiente'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1">
                              <button onClick={() => { setDetailSale(s); setShowDetail(true) }} className="p-1 hover:bg-gray-100 rounded text-gray-400" title="Historial abonos">
                                <History size={13} />
                              </button>
                              {!s.isPaid && (
                                <button onClick={() => openPaymentForSale(s)} className="flex items-center gap-0.5 px-1.5 py-1 text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 rounded transition-colors">
                                  <Plus size={11} /> Abonar
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })
                }
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payment modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <h2 className="font-semibold text-gray-800">Registrar Abono</h2>
                {paymentSale && (
                  <p className="text-xs text-gray-400">{paymentSale.invoiceNumber} — {paymentSale.customer?.name}</p>
                )}
              </div>
              <button onClick={() => setShowPaymentModal(false)}><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* Sale selector if multiple */}
              {paymentCustomerSales.length > 1 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Venta a abonar</label>
                  <select
                    value={paymentSale?.id ?? ''}
                    onChange={e => setPaymentSale(paymentCustomerSales.find(s => s.id === e.target.value) ?? null)}
                    className="input w-full"
                  >
                    {paymentCustomerSales.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.invoiceNumber} — Pendiente: Q{Math.max(0, Number(s.total) - Number(s.paidAmount ?? 0)).toFixed(2)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {paymentSale && (
                <div className="bg-orange-50 rounded-lg p-3 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Total venta</span><span className="font-medium">Q{Number(paymentSale.total).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Ya pagado</span><span className="text-green-600">Q{(Number(paymentSale.total) - selectedSaleRemaining).toFixed(2)}</span></div>
                  <div className="flex justify-between font-bold border-t mt-1 pt-1"><span>Pendiente</span><span className="text-orange-600">Q{selectedSaleRemaining.toFixed(2)}</span></div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Monto del abono *</label>
                <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder={`Máx. Q${selectedSaleRemaining.toFixed(2)}`} className="input w-full" min="0.01" step="0.01" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Método de pago *</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['CASH', 'TRANSFER'] as const).map(m => (
                    <button key={m} onClick={() => setPayMethod(m)} className={`py-2 rounded-lg text-sm font-medium transition-all ${payMethod === m ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      {m === 'CASH' ? 'Efectivo' : 'Transferencia'}
                    </button>
                  ))}
                </div>
              </div>

              {payMethod === 'TRANSFER' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">No. de documento / referencia *</label>
                    <input type="text" value={payTransferDoc} onChange={e => setPayTransferDoc(e.target.value)} placeholder="Número de referencia" className="input w-full" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Banco (opcional)</label>
                    <input type="text" value={payBank} onChange={e => setPayBank(e.target.value)} placeholder="Nombre del banco" className="input w-full" />
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
                <input type="text" value={payNotes} onChange={e => setPayNotes(e.target.value)} placeholder="Notas adicionales" className="input w-full" />
              </div>

              {/* Payment history */}
              {paymentHistory.length > 0 && (
                <div className="border-t pt-3">
                  <p className="text-xs font-medium text-gray-500 mb-2">ABONOS REGISTRADOS</p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {paymentHistory.map((p, i) => (
                      <div key={i} className="flex justify-between text-xs text-gray-600">
                        <span>{format(new Date(p.createdAt), "dd/MM HH:mm", { locale: es })} — {p.paymentMethod === 'CASH' ? 'Efectivo' : 'Transfer.'}</span>
                        <span className="font-medium text-green-600">+Q{Number(p.amount).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowPaymentModal(false)} className="flex-1 btn-outline btn-md" disabled={paying}>Cancelar</button>
                <button onClick={handlePay} disabled={paying || !payAmount || parseFloat(payAmount) <= 0} className="flex-1 btn-primary btn-md flex items-center justify-center gap-2">
                  {paying ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <CheckCircle size={16} />}
                  Registrar Abono
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sale detail / payment history */}
      {showDetail && detailSale && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowDetail(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800">Abonos — {detailSale.invoiceNumber}</h3>
              <button onClick={() => setShowDetail(false)}><X size={18} /></button>
            </div>
            <CreditPaymentsLoader saleId={detailSale.id} total={Number(detailSale.total)} />
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

// Small helper component to load + show credit payments for a sale
function CreditPaymentsLoader({ saleId, total }: { saleId: string; total: number }) {
  const [payments, setPayments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    api.get<any[]>(`/api/sales/${saleId}/payments`)
      .then(d => setPayments(d ?? []))
      .finally(() => setLoading(false))
  }, [saleId])
  if (loading) return <p className="text-sm text-gray-400 text-center py-4">Cargando...</p>
  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0)
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm font-medium border-b pb-2 mb-2">
        <span>Total venta: Q{total.toFixed(2)}</span>
        <span className="text-orange-600">Pendiente: Q{Math.max(0, total - totalPaid).toFixed(2)}</span>
      </div>
      {payments.length === 0
        ? <p className="text-sm text-gray-400 text-center py-2">Sin abonos registrados</p>
        : payments.map((p, i) => (
            <div key={i} className="flex justify-between text-sm">
              <div>
                <p className="text-gray-700">{p.paymentMethod === 'CASH' ? 'Efectivo' : 'Transferencia'}</p>
                {p.transferDocumentNumber && <p className="text-xs text-gray-400">Ref: {p.transferDocumentNumber}</p>}
                <p className="text-xs text-gray-400">{format(new Date(p.createdAt), "dd/MM/yyyy HH:mm", { locale: es })} — {p.paidBy?.name}</p>
              </div>
              <span className="font-bold text-green-600">Q{Number(p.amount).toFixed(2)}</span>
            </div>
          ))
      }
    </div>
  )
}
