import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ClipboardCheck, ArrowLeft, Plus, Search, Trash2, CheckCircle,
  Package, AlertCircle, X, Clock,
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { useAuthStore } from '../store'
import { useStore } from '../contexts/StoreContext'
import { usePermissions } from '../hooks/usePermissions'
import { getAdjustmentReasons, type AdjustmentReason } from '../lib/inventoryReasons'

// ─── Types ────────────────────────────────────────────────────────────────────
interface CountItem {
  id: string
  productId: string
  product: { id: string; name: string; sku?: string; barcode?: string }
  systemQuantity: number
  countedQuantity: number | null
  adjusted: boolean
  reason?: string
  notes?: string
}

interface Count {
  id: string
  branchId: string
  branch: { id: string; name: string }
  status: 'IN_PROGRESS' | 'COMPLETED'
  notes?: string
  createdBy: { id: string; name: string }
  createdAt: string
  completedAt?: string
  items: CountItem[]
}

interface ProductOption {
  id: string
  name: string
  fullName?: string
  sku?: string
  barcode?: string
  isActive?: boolean
}

export default function InventoryCounts() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuthStore()
  const { currentStore } = useStore()
  const { hasPermission } = usePermissions()
  const canAdjust = hasPermission('inventory.adjust')

  const [view, setView] = useState<'list' | 'take'>('list')
  const [counts, setCounts] = useState<Count[]>([])
  const [loading, setLoading] = useState(false)
  const [activeCount, setActiveCount] = useState<Count | null>(null)

  // New-count form (shown while view === 'take' and activeCount is still null)
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [newBranchId, setNewBranchId] = useState(currentStore?.id ?? user?.branchId ?? '')
  const [newNotes, setNewNotes] = useState('')
  const [creating, setCreating] = useState(false)

  // Product search (to add a SKU to the active count)
  const [posSearch, setPosSearch] = useState('')
  const [searchResults, setSearchResults] = useState<ProductOption[]>([])
  const [showSearchResults, setShowSearchResults] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [addingProductId, setAddingProductId] = useState<string | null>(null)

  // Counted-quantity draft text per item — same pattern as everywhere else in
  // this app: a plain text input (not type="number"), so no native spinner
  // and no forced "01" when overtyping a starting value.
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({})
  const [savingQtyId, setSavingQtyId] = useState<string | null>(null)

  // Adjust modal
  const [adjustingItem, setAdjustingItem] = useState<CountItem | null>(null)
  const [adjustReason, setAdjustReason] = useState('')
  const [reasonOptions, setReasonOptions] = useState<AdjustmentReason[]>([])
  const [applyingAdjust, setApplyingAdjust] = useState(false)
  const [completing, setCompleting] = useState(false)

  // ── Data fetching ──────────────────────────────────────────────────────────
  useEffect(() => {
    api.get<{ id: string; name: string }[]>('/api/branches').then(setBranches).catch(() => {})
  }, [])

  const fetchCounts = () => {
    setLoading(true)
    return api.get<{ data: Count[] }>('/api/inventory-counts?limit=30')
      .then(res => { setCounts(res.data ?? []); return res.data ?? [] })
      .catch(e => { toast.error(e.message); return [] as Count[] })
      .finally(() => setLoading(false))
  }
  useEffect(() => { fetchCounts() }, [])

  function openExistingCount(count: Count) {
    setActiveCount(count)
    setView('take')
  }

  // Starting "a new count" for a branch that already has one IN_PROGRESS
  // just reopens that one instead — before this, leaving mid-count (to ring
  // up a sale, say) and coming back via the same "Nueva Tarea de Conteo"
  // button dropped the person into a blank branch picker, with their
  // already-counted lines only reachable by remembering to dig for the old
  // task in the list view instead. The data was never actually lost (it's
  // DB-backed from the first item added on) — this just makes the obvious
  // entry point find it automatically instead of looking abandoned.
  function startOrResumeCount(list: Count[], branchId: string) {
    const existing = list.find(c => c.status === 'IN_PROGRESS' && c.branchId === branchId)
    if (existing) {
      toast.info(`Continuando el conteo en progreso de ${existing.branch.name} (${existing.items.length} producto${existing.items.length !== 1 ? 's' : ''} hasta ahora)`)
      openExistingCount(existing)
    } else {
      setActiveCount(null)
      setView('take')
    }
  }

  const didHandleNewParam = useRef(false)
  // The "Nueva Tarea de Conteo" button in Inventario links here with ?new=1
  // so it drops straight into the create/resume flow instead of the list —
  // waits for fetchCounts to actually finish so the resume check above has
  // real data to check against, not an empty list on the very first render.
  useEffect(() => {
    if (didHandleNewParam.current || loading) return
    if (searchParams.get('new') === '1') {
      didHandleNewParam.current = true
      startOrResumeCount(counts, currentStore?.id ?? user?.branchId ?? '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  async function refreshActiveCount(id: string) {
    try {
      const fresh = await api.get<Count>(`/api/inventory-counts/${id}`)
      setActiveCount(fresh)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al actualizar el conteo')
    }
  }

  // ── Create ─────────────────────────────────────────────────────────────────
  async function handleStartCount() {
    if (!newBranchId) { toast.error('Selecciona una sucursal'); return }
    setCreating(true)
    try {
      const count = await api.post<Count>('/api/inventory-counts', { branchId: newBranchId, notes: newNotes || undefined })
      setActiveCount(count)
      setNewNotes('')
      toast.success('Conteo iniciado')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al iniciar el conteo')
    } finally {
      setCreating(false)
    }
  }

  // ── Product search ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!posSearch.trim()) { setSearchResults([]); setShowSearchResults(false); return }
    debounceRef.current = setTimeout(() => searchProducts(posSearch.trim()), 250)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [posSearch])

  async function searchProducts(query: string) {
    try {
      const data = await api.get<ProductOption[]>(`/api/products?search=${encodeURIComponent(query)}&isActive=true`)
      const results = (data ?? []).filter(p => p.isActive !== false)
      setSearchResults(results)
      setShowSearchResults(results.length > 0)
    } catch {
      setSearchResults([])
      setShowSearchResults(false)
    }
  }

  async function handleAddProduct(product: ProductOption) {
    if (!activeCount) return
    setPosSearch('')
    setShowSearchResults(false)
    if (activeCount.items.some(i => i.productId === product.id)) {
      toast.error('Ese producto ya está en este conteo')
      return
    }
    setAddingProductId(product.id)
    try {
      const item = await api.post<CountItem>(`/api/inventory-counts/${activeCount.id}/items`, { productId: product.id })
      setActiveCount(prev => prev ? { ...prev, items: [...prev.items, item] } : prev)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al agregar el producto')
    } finally {
      setAddingProductId(null)
    }
  }

  // ── Counted quantity ───────────────────────────────────────────────────────
  async function commitCountedQty(item: CountItem, raw: string) {
    setQtyDrafts(prev => { const next = { ...prev }; delete next[item.id]; return next })
    if (!activeCount) return
    const n = parseFloat(raw)
    if (raw.trim() === '' || isNaN(n) || n < 0) return
    setSavingQtyId(item.id)
    try {
      const updated = await api.put<CountItem>(`/api/inventory-counts/${activeCount.id}/items/${item.id}`, { countedQuantity: n })
      setActiveCount(prev => prev ? { ...prev, items: prev.items.map(i => i.id === item.id ? updated : i) } : prev)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar la cantidad contada')
    } finally {
      setSavingQtyId(null)
    }
  }

  async function removeItem(item: CountItem) {
    if (!activeCount) return
    if (!confirm(`¿Quitar "${item.product.name}" de este conteo?`)) return
    try {
      await api.delete(`/api/inventory-counts/${activeCount.id}/items/${item.id}`)
      setActiveCount(prev => prev ? { ...prev, items: prev.items.filter(i => i.id !== item.id) } : prev)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al quitar el producto')
    }
  }

  // ── Adjust ─────────────────────────────────────────────────────────────────
  async function openAdjustModal(item: CountItem) {
    setAdjustingItem(item)
    setAdjustReason('')
    const diff = Number(item.countedQuantity ?? 0) - Number(item.systemQuantity)
    const reasons = await getAdjustmentReasons(diff > 0 ? 'UP' : 'DOWN')
    setReasonOptions(reasons)
  }

  async function confirmAdjust() {
    if (!adjustingItem || !activeCount || !adjustReason) return
    setApplyingAdjust(true)
    try {
      const updated = await api.post<CountItem>(`/api/inventory-counts/${activeCount.id}/items/${adjustingItem.id}/adjust`, { reason: adjustReason })
      setActiveCount(prev => prev ? { ...prev, items: prev.items.map(i => i.id === updated.id ? updated : i) } : prev)
      toast.success('Ajuste aplicado')
      setAdjustingItem(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al aplicar el ajuste')
    } finally {
      setApplyingAdjust(false)
    }
  }

  // ── Complete ───────────────────────────────────────────────────────────────
  async function handleComplete() {
    if (!activeCount) return
    const pending = activeCount.items.filter(i => i.countedQuantity !== null && Number(i.countedQuantity) !== Number(i.systemQuantity) && !i.adjusted)
    if (pending.length > 0 && !confirm(`Hay ${pending.length} línea(s) con diferencia sin ajustar. ¿Completar el conteo de todas formas? El inventario del sistema no cambiará para esas líneas.`)) return
    setCompleting(true)
    try {
      await api.put(`/api/inventory-counts/${activeCount.id}/complete`, {})
      toast.success('Conteo completado')
      await refreshActiveCount(activeCount.id)
      fetchCounts()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al completar el conteo')
    } finally {
      setCompleting(false)
    }
  }

  // ── Render: TAKE VIEW ──────────────────────────────────────────────────────
  if (view === 'take') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => { setView('list'); setActiveCount(null); fetchCounts() }} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-800 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-800">
              {activeCount ? `Conteo — ${activeCount.branch.name}` : 'Nueva Tarea de Conteo'}
            </h1>
            {activeCount && (
              <p className="text-xs text-gray-500">
                {format(new Date(activeCount.createdAt), "d 'de' MMMM, HH:mm", { locale: es })} · {activeCount.createdBy.name}
                {activeCount.status === 'COMPLETED' && <span className="ml-1.5 text-green-600 font-medium">· Completado</span>}
              </p>
            )}
          </div>
        </div>

        {!activeCount ? (
          // ── Branch picker before the count exists ──
          <div className="bg-white rounded-lg shadow-sm p-5 max-w-md space-y-4">
            <div>
              <label className="label">Sucursal a contar *</label>
              <select value={newBranchId} onChange={e => setNewBranchId(e.target.value)} className="input w-full">
                <option value="">Seleccionar...</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Notas (opcional)</label>
              <textarea value={newNotes} onChange={e => setNewNotes(e.target.value)} rows={3} placeholder="Ej: conteo mensual de papelería..." className="input w-full resize-none" />
            </div>
            <button onClick={handleStartCount} disabled={creating || !newBranchId} className="btn-primary btn-md w-full flex items-center justify-center gap-2 disabled:opacity-50">
              {creating ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <ClipboardCheck size={18} />}
              Iniciar Conteo
            </button>
          </div>
        ) : (
          // ── Items of the active/opened count ──
          <>
            {activeCount.status === 'IN_PROGRESS' && (
              <div className="bg-white rounded-lg shadow-sm p-3 relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="text"
                    placeholder="Buscar producto por nombre o código para agregar al conteo..."
                    value={posSearch}
                    onChange={e => setPosSearch(e.target.value)}
                    onFocus={() => posSearch.trim() && setShowSearchResults(true)}
                    onBlur={() => setTimeout(() => setShowSearchResults(false), 150)}
                    className="input pl-10 w-full"
                  />
                  {showSearchResults && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-60 overflow-y-auto">
                      {searchResults.length > 0 ? searchResults.map(p => (
                        <div key={p.id} onMouseDown={() => handleAddProduct(p)}
                          className="px-3 py-2.5 hover:bg-primary-50 cursor-pointer flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-800">{p.fullName ?? p.name}</p>
                            <p className="text-xs text-gray-400">{p.barcode ?? p.sku ?? ''}</p>
                          </div>
                          {addingProductId === p.id && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-500" />}
                        </div>
                      )) : (
                        <p className="px-3 py-3 text-sm text-gray-500 text-center">Sin resultados para "{posSearch}"</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Producto</th>
                      <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium w-28">Sistema</th>
                      <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium w-32">Contado</th>
                      <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium w-28">Diferencia</th>
                      <th className="text-center px-4 py-3 text-xs text-gray-500 font-medium w-40">Ajuste</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {activeCount.items.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-12 text-gray-400">
                        <Package size={36} className="mx-auto mb-2 opacity-30" />
                        Busca productos arriba para agregarlos al conteo
                      </td></tr>
                    ) : activeCount.items.map(item => {
                      const counted = item.countedQuantity
                      const diff = counted !== null ? Number(counted) - Number(item.systemQuantity) : null
                      return (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-gray-800">{item.product.name}</p>
                            <p className="text-xs text-gray-400">{item.product.barcode ?? item.product.sku ?? ''}</p>
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-500">{Number(item.systemQuantity).toFixed(0)}</td>
                          <td className="px-4 py-2.5 text-right">
                            <input
                              type="text"
                              inputMode="decimal"
                              disabled={activeCount.status === 'COMPLETED'}
                              value={qtyDrafts[item.id] ?? (counted !== null ? String(counted) : '')}
                              onChange={e => setQtyDrafts(prev => ({ ...prev, [item.id]: e.target.value }))}
                              onFocus={e => e.target.select()}
                              onBlur={e => commitCountedQty(item, e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                              placeholder="—"
                              className="input text-right w-24 py-1 disabled:bg-gray-50 disabled:text-gray-400"
                            />
                            {savingQtyId === item.id && <span className="text-[10px] text-gray-400 block">guardando...</span>}
                          </td>
                          <td className={`px-4 py-2.5 text-right font-semibold ${diff === null ? 'text-gray-300' : diff === 0 ? 'text-gray-400' : diff > 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {diff === null ? '—' : `${diff > 0 ? '+' : ''}${diff.toFixed(0)}`}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {item.adjusted ? (
                              <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-1 rounded-full"><CheckCircle size={12} /> Ajustado</span>
                            ) : diff !== null && diff !== 0 ? (
                              canAdjust && (
                                <button onClick={() => openAdjustModal(item)} className="btn-outline btn-sm">Ajustar</button>
                              )
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-2">
                            {activeCount.status === 'IN_PROGRESS' && !item.adjusted && (
                              <button onClick={() => removeItem(item)} className="p-1.5 text-gray-300 hover:text-red-500 rounded">
                                <Trash2 size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {activeCount.status === 'IN_PROGRESS' && (
              <div className="flex justify-end">
                <button onClick={handleComplete} disabled={completing || activeCount.items.length === 0}
                  className="btn-primary btn-md flex items-center gap-2 disabled:opacity-50">
                  {completing ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <CheckCircle size={18} />}
                  Completar Conteo
                </button>
              </div>
            )}
          </>
        )}

        {/* Adjust modal */}
        <AnimatePresence>
          {adjustingItem && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
              onClick={() => setAdjustingItem(null)}>
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full max-h-[90vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-gray-800">Aplicar Ajuste</h3>
                  <button onClick={() => setAdjustingItem(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                </div>
                <div className="space-y-3">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="font-medium text-gray-800">{adjustingItem.product.name}</p>
                    <div className="flex justify-between text-sm mt-1">
                      <span className="text-gray-500">Sistema: {Number(adjustingItem.systemQuantity).toFixed(0)}</span>
                      <span className="text-gray-700 font-medium">Contado: {Number(adjustingItem.countedQuantity ?? 0).toFixed(0)}</span>
                    </div>
                  </div>
                  <div>
                    <label className="label">Motivo del ajuste *</label>
                    <select value={adjustReason} onChange={e => setAdjustReason(e.target.value)} className="input w-full">
                      <option value="">Seleccionar motivo</option>
                      {reasonOptions.map(r => <option key={r.id} value={r.label}>{r.label}</option>)}
                    </select>
                    {reasonOptions.length === 0 && (
                      <p className="text-xs text-gray-400 mt-1">No hay motivos configurados — agrégalos en Configuración → Motivos de Ajuste.</p>
                    )}
                  </div>
                  <div className="bg-yellow-50 p-3 rounded-lg flex items-start gap-2">
                    <AlertCircle size={16} className="text-yellow-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-yellow-800">Esto actualiza el inventario real del sistema a la cantidad contada y queda registrado en el historial.</p>
                  </div>
                </div>
                <div className="mt-5 flex gap-3">
                  <button onClick={() => setAdjustingItem(null)} className="flex-1 btn-outline btn-md" disabled={applyingAdjust}>Cancelar</button>
                  <button onClick={confirmAdjust} disabled={applyingAdjust || !adjustReason} className="flex-1 btn-primary btn-md flex items-center justify-center gap-2 disabled:opacity-50">
                    {applyingAdjust && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
                    Aplicar
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  // ── Render: LIST VIEW ──────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <ClipboardCheck size={28} />
            Conteos de Inventario
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Tareas de conteo físico y sus diferencias contra el sistema</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => navigate('/reports/inventory-counts')} className="btn-outline btn-md">Ver reporte completo</button>
          {canAdjust && (
            <button onClick={() => startOrResumeCount(counts, currentStore?.id ?? user?.branchId ?? '')} className="btn-primary btn-md flex items-center gap-2">
              <Plus size={18} /> Nueva Tarea de Conteo
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary-400 border-t-transparent" />
          </div>
        ) : counts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
            <ClipboardCheck size={40} strokeWidth={1.5} />
            <p className="text-sm">No hay conteos registrados</p>
          </div>
        ) : (
          <div className="divide-y">
            {counts.map(count => {
              const counted = count.items.filter(i => i.countedQuantity !== null)
              const withDiff = counted.filter(i => Number(i.countedQuantity) !== Number(i.systemQuantity))
              return (
                <button key={count.id} onClick={() => openExistingCount(count)}
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
                        {withDiff.length > 0 && <span className="font-normal text-orange-600"> · {withDiff.length} con diferencia</span>}
                      </p>
                      <p className="text-xs text-gray-400">
                        {format(new Date(count.createdAt), "d 'de' MMMM, HH:mm", { locale: es })} · {count.createdBy.name}
                        {count.status === 'COMPLETED' && <span className="text-green-600"> · Completado</span>}
                      </p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
