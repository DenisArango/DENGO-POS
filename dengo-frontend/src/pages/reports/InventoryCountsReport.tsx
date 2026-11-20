import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Calendar, ClipboardCheck, CheckCircle, Clock, AlertTriangle, X, AlertCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { format, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store'
import { ClipboardCheck as PageClipboardCheck } from 'lucide-react'
import PageIcon from '../../components/common/PageIcon'
import { usePermissions } from '../../hooks/usePermissions'
import { getAdjustmentReasons, type AdjustmentReason } from '../../lib/inventoryReasons'

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
  // Whoever counted may not be allowed to change stock: their differences
  // wait here, and someone with inventory.adjust applies them.
  const { hasPermission } = usePermissions()
  const canAdjust = hasPermission('inventory.adjust')
  const [pendingOnly, setPendingOnly] = useState(false)
  // One modal for a single line or "all pending lines of a count". Reasons
  // are direction-specific (UP/DOWN), so a batch asks one reason per sign.
  const [adjusting, setAdjusting] = useState<{ count: Count; items: CountItem[] } | null>(null)
  const [reasonUp, setReasonUp] = useState('')
  const [reasonDown, setReasonDown] = useState('')
  const [reasonsUp, setReasonsUp] = useState<AdjustmentReason[]>([])
  const [reasonsDown, setReasonsDown] = useState<AdjustmentReason[]>([])
  const [applying, setApplying] = useState(false)
  const lineDiff = (i: CountItem) => i.countedQuantity !== null ? Number(i.countedQuantity) - Number(i.systemQuantity) : 0
  const isPending = (i: CountItem) => i.countedQuantity !== null && lineDiff(i) !== 0 && !i.adjusted

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
    (!userFilter || c.createdBy.id === userFilter) &&
    (!pendingOnly || c.items.some(isPending))
  ), [counts, statusFilter, userFilter, pendingOnly])

  const totalDiscrepant = filtered.reduce((s, c) =>
    s + c.items.filter(i => i.countedQuantity !== null && Number(i.countedQuantity) !== Number(i.systemQuantity)).length, 0)
  const totalUnadjusted = filtered.reduce((s, c) =>
    s + c.items.filter(i => i.countedQuantity !== null && Number(i.countedQuantity) !== Number(i.systemQuantity) && !i.adjusted).length, 0)

  async function openAdjust(count: Count, items: CountItem[]) {
    setAdjusting({ count, items })
    setReasonUp('')
    setReasonDown('')
    const [up, down] = await Promise.all([getAdjustmentReasons('UP'), getAdjustmentReasons('DOWN')])
    setReasonsUp(up)
    setReasonsDown(down)
  }

  async function applyAdjust() {
    if (!adjusting) return
    const ups = adjusting.items.filter(i => lineDiff(i) > 0)
    const downs = adjusting.items.filter(i => lineDiff(i) < 0)
    if ((ups.length && !reasonUp) || (downs.length && !reasonDown)) { toast.error('Selecciona el motivo del ajuste'); return }
    setApplying(true)
    let ok = 0
    const failed: string[] = []
    for (const item of adjusting.items) {
      try {
        await api.post(`/api/inventory-counts/${adjusting.count.id}/items/${item.id}/adjust`, { reason: lineDiff(item) > 0 ? reasonUp : reasonDown })
        ok++
      } catch (e) {
        failed.push(`${item.product.name}: ${e instanceof Error ? e.message : 'error'}`)
      }
    }
    setApplying(false)
    setAdjusting(null)
    if (ok) toast.success(ok === 1 ? 'Ajuste aplicado' : `${ok} ajustes aplicados`)
    if (failed.length) toast.error(failed.slice(0, 3).join(' · '))
    fetchData()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/reports')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-3"><PageIcon icon={PageClipboardCheck} color="emerald" />Conteos de Inventario</h1>
          <p className="text-gray-600 text-sm mt-0.5">Tareas de conteo físico, diferencias encontradas y ajustes aplicados</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4 flex flex-wrap items-center gap-3">
        <Calendar size={16} className="text-gray-400" />
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input w-auto text-sm" />
        <span className="text-gray-400">–</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input w-auto text-sm" />
        {isAdmin && (
          <select value={branchId} onChange={e => setBranchId(e.target.value)} className="input w-auto text-sm">
            <option value="">Todas las sucursales</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input w-auto text-sm">
          <option value="">Todos los estados</option>
          <option value="IN_PROGRESS">En progreso</option>
          <option value="COMPLETED">Completado</option>
        </select>
        <select value={userFilter} onChange={e => setUserFilter(e.target.value)} className="input w-auto text-sm">
          <option value="">Todos los usuarios</option>
          {userOptions.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
          <input type="checkbox" checked={pendingOnly} onChange={e => setPendingOnly(e.target.checked)} className="rounded" />
          Solo con ajustes pendientes
        </label>
        {loading && <span className="text-sm text-gray-400">Cargando...</span>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Conteos', value: String(filtered.length), icon: ClipboardCheck, color: 'text-blue-600 bg-blue-100' },
          { label: 'Completados', value: String(filtered.filter(c => c.status === 'COMPLETED').length), icon: CheckCircle, color: 'text-green-600 bg-green-100' },
          { label: 'Líneas con diferencia', value: String(totalDiscrepant), icon: AlertTriangle, color: 'text-orange-600 bg-orange-100' },
          { label: 'Diferencias sin ajustar', value: String(totalUnadjusted), icon: Clock, color: 'text-red-600 bg-red-100' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4 flex items-center gap-3">
            <div className={`stat-tile p-2.5 rounded-xl ${s.color}`}><s.icon size={20} /></div>
            <div><p className="text-xs text-gray-500">{s.label}</p><p className="text-xl font-bold text-gray-800">{s.value}</p></div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
            <span className="empty-tile mb-1"><ClipboardCheck size={26} aria-hidden /></span>
            <p className="text-sm">Sin conteos en el período seleccionado</p>
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map(count => {
              const countedItems = count.items.filter(i => i.countedQuantity !== null)
              const diffItems = countedItems.filter(i => Number(i.countedQuantity) !== Number(i.systemQuantity))
              const expanded = expandedId === count.id
              const pendingItems = count.items.filter(isPending)
              return (
                <div key={count.id} className="relative">
                  {canAdjust && pendingItems.length > 0 && (
                    <button onClick={() => openAdjust(count, pendingItems)}
                      className="absolute right-5 top-3 z-10 btn-primary btn-sm">
                      Ajustar {pendingItems.length} pendiente{pendingItems.length !== 1 ? 's' : ''}
                    </button>
                  )}
                  <button onClick={() => setExpandedId(expanded ? null : count.id)}
                    className={`w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors text-left ${canAdjust && pendingItems.length > 0 ? 'pr-48' : ''}`}>
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
                        <p className="text-xs text-gray-500">
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
                                  {item.adjusted ? (item.reason ?? 'Ajustado') : isPending(item) ? (
                                    canAdjust ? (
                                      <button onClick={() => openAdjust(count, [item])} className="btn-outline btn-sm">Ajustar</button>
                                    ) : <span className="text-amber-700">Pendiente de ajuste</span>
                                  ) : '—'}
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

      <AnimatePresence>
        {adjusting && (() => {
          const ups = adjusting.items.filter(i => lineDiff(i) > 0)
          const downs = adjusting.items.filter(i => lineDiff(i) < 0)
          const missingReasons = (ups.length > 0 && reasonsUp.length === 0) || (downs.length > 0 && reasonsDown.length === 0)
          return (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-gray-950/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4"
              onClick={() => { if (!applying) setAdjusting(null) }}>
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-bold text-gray-800">Aplicar ajuste{adjusting.items.length > 1 ? 's' : ''}</h3>
                  <button onClick={() => setAdjusting(null)} disabled={applying} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                </div>
                <p className="text-xs text-gray-500 mb-3">{adjusting.count.branch.name} · conteo de {adjusting.count.createdBy.name}</p>
                <div className="bg-gray-50 rounded-lg divide-y divide-gray-200 mb-4 max-h-48 overflow-y-auto">
                  {adjusting.items.map(i => {
                    const d = lineDiff(i)
                    return (
                      <div key={i.id} className="flex justify-between gap-3 px-3 py-2 text-sm">
                        <span className="text-gray-800 truncate">{i.product.name}</span>
                        <span className={`font-semibold flex-shrink-0 ${d > 0 ? 'text-green-600' : 'text-red-500'}`}>{d > 0 ? '+' : ''}{d.toFixed(0)}</span>
                      </div>
                    )
                  })}
                </div>
                <div className="space-y-3">
                  {ups.length > 0 && (
                    <div>
                      <label className="label">Motivo de los que suben ({ups.length}) *</label>
                      <select value={reasonUp} onChange={e => setReasonUp(e.target.value)} className="input w-full">
                        <option value="">Seleccionar motivo</option>
                        {reasonsUp.map(r => <option key={r.id} value={r.label}>{r.label}</option>)}
                      </select>
                    </div>
                  )}
                  {downs.length > 0 && (
                    <div>
                      <label className="label">Motivo de los que bajan ({downs.length}) *</label>
                      <select value={reasonDown} onChange={e => setReasonDown(e.target.value)} className="input w-full">
                        <option value="">Seleccionar motivo</option>
                        {reasonsDown.map(r => <option key={r.id} value={r.label}>{r.label}</option>)}
                      </select>
                    </div>
                  )}
                  {missingReasons && (
                    <p className="text-xs text-gray-400">No hay motivos configurados — agrégalos en Configuración → Motivos de Ajuste.</p>
                  )}
                  <div className="bg-yellow-50 p-3 rounded-lg flex items-start gap-2">
                    <AlertCircle size={16} className="text-yellow-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-yellow-800">Se suma o resta la diferencia encontrada al inventario actual de la sucursal, así que las ventas hechas después del conteo se respetan. Queda registrado en el historial.</p>
                  </div>
                </div>
                <div className="mt-5 flex gap-3">
                  <button onClick={() => setAdjusting(null)} className="flex-1 btn-outline btn-md" disabled={applying}>Cancelar</button>
                  <button onClick={applyAdjust}
                    disabled={applying || (ups.length > 0 && !reasonUp) || (downs.length > 0 && !reasonDown)}
                    className="flex-1 btn-primary btn-md flex items-center justify-center gap-2 disabled:opacity-50">
                    {applying && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
                    Aplicar
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )
        })()}
      </AnimatePresence>
    </div>
  )
}
