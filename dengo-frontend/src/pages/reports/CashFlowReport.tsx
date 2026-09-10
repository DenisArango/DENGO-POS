import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Calendar, DollarSign, CreditCard, TrendingUp, TrendingDown, ChevronRight, ChevronDown } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { format, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store'
import { useStore } from '../../contexts/StoreContext'
import AIRecommendations from '../../components/reports/AIRecommendations'
import ReportFilters, { type ReportFilterState } from '../../components/reports/ReportFilters'

const PM_COLOR: Record<string, string> = { CASH: '#10B981', CARD: '#3B82F6', TRANSFER: '#8B5CF6', CREDIT: '#F59E0B', MIXED: '#6B7280' }

export default function CashFlowReport() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { currentStore } = useStore()
  const [from, setFrom] = useState(format(subDays(new Date(), 6), 'yyyy-MM-dd'))
  const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [loading, setLoading] = useState(false)
  const [registers, setRegisters] = useState<any[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filters, setFilters] = useState<ReportFilterState>({ branchId: currentStore?.id ?? user?.branchId ?? '', cashRegisterId: '' })

  useEffect(() => { fetchData() }, [from, to, filters])

  async function fetchData() {
    setLoading(true)
    try {
      const branchQ = filters.branchId ? `&branchId=${filters.branchId}` : ''
      const data = await api.get<any[]>(`/api/reports/cash-registers-history?from=${from}T00:00:00&to=${to}T23:59:59${branchQ}`)
      setRegisters(data ?? [])
    } catch { setRegisters([]) } finally { setLoading(false) }
  }

  const totalSales = registers.reduce((s, r) => s + Number(r.totalSales ?? 0), 0)
  const totalCash = registers.reduce((s, r) => s + Number(r.cashSales ?? 0), 0)
  const totalCard = registers.reduce((s, r) => s + Number(r.cardSales ?? 0), 0)
  const totalTransfer = registers.reduce((s, r) => s + Number(r.transferSales ?? 0), 0)

  const chartData = [...registers].reverse().map(r => ({
    date: format(new Date(r.openedAt), 'dd/MM', { locale: es }),
    Efectivo: Math.round(Number(r.cashSales ?? 0) * 100) / 100,
    Tarjeta: Math.round(Number(r.cardSales ?? 0) * 100) / 100,
    Transferencia: Math.round(Number(r.transferSales ?? 0) * 100) / 100,
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/reports')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Flujo de Caja</h1>
          <p className="text-gray-600 text-sm mt-0.5">Sesiones de caja y ventas por método de pago</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4 flex flex-wrap items-center gap-3">
        <Calendar size={16} className="text-gray-400" />
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input" />
        <span className="text-gray-400">–</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input" />
        <ReportFilters value={filters} onChange={setFilters} showRegister={false} />
        {loading && <span className="text-sm text-gray-400">Cargando...</span>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Ventas totales', value: `Q${totalSales.toFixed(2)}`, icon: DollarSign, color: 'text-green-600 bg-green-100' },
          { label: 'En efectivo', value: `Q${totalCash.toFixed(2)}`, icon: TrendingUp, color: 'text-blue-600 bg-blue-100' },
          { label: 'Tarjeta/Trans.', value: `Q${(totalCard + totalTransfer).toFixed(2)}`, icon: CreditCard, color: 'text-purple-600 bg-purple-100' },
          { label: 'Sesiones de caja', value: String(registers.length), icon: TrendingDown, color: 'text-orange-600 bg-orange-100' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-3">
            <div className={`p-2.5 rounded-lg ${s.color}`}><s.icon size={20} /></div>
            <div><p className="text-xs text-gray-400">{s.label}</p><p className="text-xl font-bold text-gray-800">{s.value}</p></div>
          </div>
        ))}
      </div>

      {chartData.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Ventas por método de pago por día</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any, name: string) => [`Q${Number(v).toFixed(2)}`, name]} />
              <Legend />
              <Bar dataKey="Efectivo" fill={PM_COLOR.CASH} stackId="a" />
              <Bar dataKey="Tarjeta" fill={PM_COLOR.CARD} stackId="a" />
              <Bar dataKey="Transferencia" fill={PM_COLOR.TRANSFER} stackId="a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b"><h2 className="text-sm font-semibold text-gray-700">Sesiones de caja</h2></div>
        {registers.length === 0
          ? <div className="flex items-center justify-center py-12 text-gray-400 text-sm">Sin sesiones en el período seleccionado</div>
          : <div className="divide-y">
              {registers.map(r => {
                const diff = Number(r.difference ?? 0)
                const isOpen = r.status === 'OPEN'
                return (
                  <div key={r.id}>
                    <button
                      onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                      className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 text-left"
                    >
                      <div className="flex items-center gap-4">
                        <div>
                          <p className="text-sm font-semibold text-gray-800">
                            {format(new Date(r.openedAt), "d 'de' MMMM, HH:mm", { locale: es })}
                            {r.closedAt && ` → ${format(new Date(r.closedAt), 'HH:mm')}`}
                          </p>
                          <p className="text-xs text-gray-400">
                            Abierta por {r.openedBy?.name ?? '–'}
                            {r.closedBy ? ` · Cerrada por ${r.closedBy.name}` : ''}
                          </p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isOpen ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {isOpen ? 'Abierta' : 'Cerrada'}
                        </span>
                      </div>
                      <div className="flex items-center gap-6 text-right">
                        <div>
                          <p className="text-xs text-gray-400">Ventas</p>
                          <p className="text-sm font-semibold text-gray-800">Q{Number(r.totalSales ?? 0).toFixed(2)}</p>
                        </div>
                        {r.difference != null && (
                          <div>
                            <p className="text-xs text-gray-400">Diferencia</p>
                            <p className={`text-sm font-semibold ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-500' : 'text-gray-500'}`}>
                              {diff > 0 ? '+' : ''}Q{diff.toFixed(2)}
                            </p>
                          </div>
                        )}
                        {expanded === r.id ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                      </div>
                    </button>
                    {expanded === r.id && (
                      <div className="bg-gray-50 px-5 py-3 text-sm space-y-3">
                        <div className="grid grid-cols-3 gap-4">
                          <div><p className="text-xs text-gray-400">Monto inicial</p><p className="font-medium">Q{Number(r.initialAmount).toFixed(2)}</p></div>
                          {r.finalAmount != null && <div><p className="text-xs text-gray-400">Monto final</p><p className="font-medium">Q{Number(r.finalAmount).toFixed(2)}</p></div>}
                          {r.expectedAmount != null && <div><p className="text-xs text-gray-400">Esperado</p><p className="font-medium">Q{Number(r.expectedAmount).toFixed(2)}</p></div>}
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div><p className="text-xs text-gray-400">Efectivo</p><p className="font-medium text-green-700">Q{Number(r.cashSales ?? 0).toFixed(2)}</p></div>
                          <div><p className="text-xs text-gray-400">Tarjeta</p><p className="font-medium text-blue-700">Q{Number(r.cardSales ?? 0).toFixed(2)}</p></div>
                          <div><p className="text-xs text-gray-400">Transferencia</p><p className="font-medium text-purple-700">Q{Number(r.transferSales ?? 0).toFixed(2)}</p></div>
                        </div>
                        {r.movements?.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-gray-500 mb-1">MOVIMIENTOS DE CAJA</p>
                            <div className="space-y-1">
                              {r.movements.map((m: any) => (
                                <div key={m.id} className="flex justify-between text-xs">
                                  <span className="text-gray-600">{m.description}</span>
                                  <span className={`font-medium ${m.type === 'INCOME' ? 'text-green-600' : 'text-red-500'}`}>
                                    {m.type === 'INCOME' ? '+' : '-'}Q{Number(m.amount).toFixed(2)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
        }
      </div>

      <AIRecommendations
        reportData={{ type: 'cash_flow', data: { cashIn: totalCash, cashOut: totalCard + totalTransfer, netFlow: totalSales } }}
      />
    </div>
  )
}
