import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Calendar, ClipboardCheck, CheckCircle, Clock, AlertTriangle } from 'lucide-react'
import { format, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store'

interface CountItem {
  id: string
  product: { id: string; name: string; sku?: string; barcode?: string }
  systemQuantity: number
  countedQuantity: number | null
  adjusted: boolean
  reason?: string
}

interface Count {
  id: string
  branch: { id: string; name: string }
  status: 'IN_PROGRESS' | 'COMPLETED'
  notes?: string
  createdBy: { id: string; name: string }
  createdAt: string
  completedAt?: string
  items: CountItem[]
}

export default function InventoryCountsReport() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'ADMIN'

  const [from, setFrom] = useState(format(subDays(new Date(), 29), 'yyyy-MM-dd'))
  const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [branchId, setBranchId] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [userFilter, setUserFilter] = useState('')
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [counts, setCounts] = useState<Count[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    if (isAdmin) api.get<{ id: string; name: string }[]>('/api/branches').then(setBranches).catch(() => {})
  }, [isAdmin])

  useEffect(() => { fetchData() }, [from, to, branchId])

  async function fetchData() {
    setLoading(true)
    try {
      const branchQ = branchId ? `&branchId=${branchId}` : ''
      const res = await api.get<{ data: Count[] }>(`/api/inventory-counts?from=${from}T00:00:00&to=${to}T23:59:59${branchQ}&limit=200`)
      setCounts(res.data ?? [])
    } catch {
      setCounts([])
    } finally {
      setLoading(false)
    }
  }

  // Derived client-side so the user dropdown's options stay scoped to the
  // current date/branch filters without needing a second round-trip — low
  // volume data (count TASKS, not raw movements), so this is cheap.
  const userOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of counts) map.set(c.createdBy.id, c.createdBy.name)
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [counts])

  const filtered = useMemo(() => counts.filter(c =>
    (!statusFilter || c.status === statusFilter) &&
    (!userFilter || c.createdBy.id === userFilter)
  ), [counts, statusFilter, userFilter])

  const totalDiscrepant = filtered.reduce((s, c) =>
    s + c.items.filter(i => i.countedQuantity !== null && Number(i.countedQuantity) !== Number(i.systemQuantity)).length, 0)
  const totalUnadjusted = filtered.reduce((s, c) =>
    s + c.items.filter(i => i.countedQuantity !== null && Number(i.countedQuantity) !== Number(i.systemQuantity) && !i.adjusted).length, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/reports')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Conteos de Inventario</h1>
          <p className="text-gray-600 text-sm mt-0.5">Tareas de conteo físico, diferencias encontradas y ajustes aplicados</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4 flex flex-wrap items-center gap-3">
        <Calendar size={16} className="text-gray-400" />
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input text-sm" />
        <span className="text-gray-400">–</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input text-sm" />
        {isAdmin && (
          <select value={branchId} onChange={e => setBranchId(e.target.value)} className="input text-sm">
            <option value="">Todas las sucursales</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input text-sm">
          <option value="">Todos los estados</option>
          <option value="IN_PROGRESS">En progreso</option>
          <option value="COMPLETED">Completado</option>
        </select>
        <select value={userFilter} onChange={e => setUserFilter(e.target.value)} className="input text-sm">
          <option value="">Todos los usuarios</option>
          {userOptions.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        {loading && <span className="text-sm text-gray-400">Cargando...</span>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Conteos', value: String(filtered.length), icon: ClipboardCheck, color: 'text-blue-600 bg-blue-100' },
          { label: 'Completados', value: String(filtered.filter(c => c.status === 'COMPLETED').length), icon: CheckCircle, color: 'text-green-600 bg-green-100' },
          { label: 'Líneas con diferencia', value: String(totalDiscrepant), icon: AlertTriangle, color: 'text-orange-600 bg-orange-100' },
          { label: 'Diferencias sin ajustar', value: String(totalUnadjusted), icon: Clock, color: 'text-red-600 bg-red-100' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-3">
            <div className={`p-2.5 rounded-lg ${s.color}`}><s.icon size={20} /></div>
            <div><p className="text-xs text-gray-400">{s.label}</p><p className="text-xl font-bold text-gray-800">{s.value}</p></div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
            <ClipboardCheck size={40} strokeWidth={1.5} />
            <p className="text-sm">Sin conteos en el período seleccionado</p>
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map(count => {
              const countedItems = count.items.filter(i => i.countedQuantity !== null)
              const diffItems = countedItems.filter(i => Number(i.countedQuantity) !== Number(i.systemQuantity))
              const expanded = expandedId === count.id
              return (
                <div key={count.id}>
                  <button onClick={() => setExpandedId(expanded ? null : count.id)}
                    className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors text-left">
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-lg flex-shrink-0 ${count.status === 'COMPLETED' ? 'bg-green-100' : 'bg-blue-100'}`}>
                        {count.status === 'COMPLETED' ? <CheckCircle size={16} className="text-green-600" /> : <Clock size={16} className="text-blue-600" />}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-800">
                          {count.branch.name}
                          {' · '}
                          <span className="font-normal text-gray-600">{count.items.length} producto{count.items.length !== 1 ? 's' : ''}</span>
                          {diffItems.length > 0 && <span className="font-normal text-orange-600"> · {diffItems.length} con diferencia</span>}
                        </p>
                        <p className="text-xs text-gray-400">
                          {format(new Date(count.createdAt), "d MMM yyyy, HH:mm", { locale: es })} · {count.createdBy.name}
                          {count.status === 'COMPLETED' && count.completedAt && (
                            <span> · Completado {format(new Date(count.completedAt), "d MMM, HH:mm", { locale: es })}</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </button>
                  {expanded && (
                    <div className="px-5 pb-4 bg-gray-50">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-gray-400">
                            <th className="text-left py-1.5 font-medium">Producto</th>
                            <th className="text-right py-1.5 font-medium">Sistema</th>
                            <th className="text-right py-1.5 font-medium">Contado</th>
                            <th className="text-right py-1.5 font-medium">Diferencia</th>
                            <th className="text-left py-1.5 font-medium">Motivo</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {count.items.map(item => {
                            const diff = item.countedQuantity !== null ? Number(item.countedQuantity) - Number(item.systemQuantity) : null
                            return (
                              <tr key={item.id}>
                                <td className="py-1.5 text-gray-700">{item.product.name}</td>
                                <td className="py-1.5 text-right text-gray-500">{Number(item.systemQuantity).toFixed(0)}</td>
                                <td className="py-1.5 text-right text-gray-700">{item.countedQuantity !== null ? Number(item.countedQuantity).toFixed(0) : '—'}</td>
                                <td className={`py-1.5 text-right font-semibold ${diff === null ? 'text-gray-300' : diff === 0 ? 'text-gray-400' : diff > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                  {diff === null ? '—' : `${diff > 0 ? '+' : ''}${diff.toFixed(0)}`}
                                </td>
                                <td className="py-1.5 text-gray-500 text-xs">
                                  {item.adjusted ? (item.reason ?? 'Ajustado') : (diff !== null && diff !== 0 ? 'Sin ajustar' : '—')}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
