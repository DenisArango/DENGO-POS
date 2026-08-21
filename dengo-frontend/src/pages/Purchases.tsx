import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Search, ArrowLeft, Minus, Trash2, CheckCircle,
  Package, TrendingUp, ChevronDown, ChevronRight, Edit2,
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { useAuthStore } from '../store'

// ─── Types ───────────────────────────────────────────────────────────────────
interface StockMovement {
  id: string
  productId: string
  product: { id: string; name: string }
  branchId: string
  branch: { id: string; name: string }
  type: string
  quantity: number
  quantityBefore: number
  quantityAfter: number
  reason?: string
  referenceId?: string
  performedBy: { id: string; name: string }
  createdAt: string
}

interface IntakeGroup {
  referenceId: string
  date: string
  user: string
  branch: string
  supplier: string
  itemCount: number
  totalUnits: number
  items: StockMovement[]
}

interface ProductVariation {
  id: string
  productId: string
  name: string
  conversionFactor: number
  price: number
  barcode?: string
  isDefault?: boolean
}

interface ProductOption {
  id: string
  name: string
  fullName?: string
  barcode?: string
  sku?: string
  cost?: number
  isActive?: boolean
  variations?: ProductVariation[]
}

interface IntakeItem {
  id: string
  productId: string
  productName: string
  quantity: number
  unitCost: number
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Purchases() {
  const { user } = useAuthStore()

  const [view, setView] = useState<'list' | 'create'>('list')

  // List state
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)

  // Create form state
  const [intakeItems, setIntakeItems] = useState<IntakeItem[]>([])
  const [selectedBranchId, setSelectedBranchId] = useState(user?.branchId ?? '')
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [suppliers, setSuppliers] = useState<{ id: string; name: string; code: string }[]>([])

  // Product search
  const [posSearch, setPosSearch] = useState('')
  const [posResults, setPosResults] = useState<ProductOption[]>([])
  const [showResults, setShowResults] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Variation modal
  const [showVariationModal, setShowVariationModal] = useState(false)
  const [selectedForVariation, setSelectedForVariation] = useState<ProductOption | null>(null)

  // Inline cost edit
  const [editingCostId, setEditingCostId] = useState<string | null>(null)
  const [editCostVal, setEditCostVal] = useState('')

  // ── Load data ─────────────────────────────────────────────────────────────
  const fetchMovements = () => {
    setLoading(true)
    api.get<StockMovement[]>('/api/inventory/movements?type=IN')
      .then(data => setMovements((data ?? []).filter(m => m.referenceId?.startsWith('INTAKE-'))))
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchMovements()
    api.get<{ id: string; name: string }[]>('/api/branches')
      .then(setBranches)
      .catch(() => {})
    api.get<{ id: string; name: string; code: string }[]>('/api/suppliers')
      .then(d => setSuppliers(d ?? []))
      .catch(() => {})
  }, [])

  // ── Debounced search ───────────────────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!posSearch.trim()) { setPosResults([]); setShowResults(false); return }
    debounceRef.current = setTimeout(() => searchProducts(posSearch.trim()), 250)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [posSearch])

  async function searchProducts(query: string) {
    try {
      const data = await api.get<ProductOption[]>(`/api/products?search=${encodeURIComponent(query)}&isActive=true`)
      const results = (data ?? []).filter(p => p.isActive !== false).slice(0, 8)
      setPosResults(results)
      setShowResults(results.length > 0)
    } catch {
      setPosResults([])
      setShowResults(false)
    }
  }

  // ── Product add ────────────────────────────────────────────────────────────
  function handleSelectProduct(product: ProductOption) {
    setPosSearch('')
    setShowResults(false)
    const variations = product.variations?.length ? product.variations : null
    if (variations && variations.length > 1) {
      setSelectedForVariation(product)
      setShowVariationModal(true)
    } else {
      addItem(product, variations?.[0] ?? null)
    }
  }

  function addItem(product: ProductOption, variation: ProductVariation | null) {
    // Inventory is tracked per Product (not per variation) — always use product.id
    const productId = product.id
    const name = variation && !variation.isDefault
      ? `${product.fullName ?? product.name} (${variation.name})`
      : (product.fullName ?? product.name)
    const cost = Number(product.cost ?? 0)
    setIntakeItems(prev => {
      const existing = prev.find(i => i.productId === productId)
      if (existing) {
        return prev.map(i => i.productId === productId ? { ...i, quantity: i.quantity + 1 } : i)
      }
      return [...prev, { id: Math.random().toString(36).slice(2), productId, productName: name, quantity: 1, unitCost: cost }]
    })
    setShowVariationModal(false)
    setSelectedForVariation(null)
  }

  // ── Item helpers ───────────────────────────────────────────────────────────
  const updateQty = (id: string, delta: number) =>
    setIntakeItems(prev => prev.map(i => i.id === id ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i))

  const setQtyDirect = (id: string, val: string) => {
    const n = parseFloat(val)
    if (!isNaN(n) && n > 0) setIntakeItems(prev => prev.map(i => i.id === id ? { ...i, quantity: n } : i))
  }

  const removeItem = (id: string) => setIntakeItems(prev => prev.filter(i => i.id !== id))

  const startEditCost = (item: IntakeItem) => {
    setEditingCostId(item.id)
    setEditCostVal(item.unitCost.toFixed(2))
  }

  const commitCost = (id: string) => {
    const n = parseFloat(editCostVal)
    if (!isNaN(n) && n >= 0) setIntakeItems(prev => prev.map(i => i.id === id ? { ...i, unitCost: n } : i))
    setEditingCostId(null)
  }

  const resetForm = () => {
    setIntakeItems([])
    setNotes('')
    setSelectedSupplierId('')
    setPosSearch('')
    setPosResults([])
    setShowResults(false)
    setEditingCostId(null)
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const totalUnits = intakeItems.reduce((s, i) => s + i.quantity, 0)
  const totalCost = intakeItems.reduce((s, i) => s + i.quantity * i.unitCost, 0)

  const intakeGroups = useMemo<IntakeGroup[]>(() => {
    const map = new Map<string, IntakeGroup>()
    for (const m of movements) {
      const key = m.referenceId ?? m.id
      if (!map.has(key)) {
        // Extract supplier from reason "Proveedor: X | notes"
        const reasonParts = (m.reason ?? '').split(' | ')
        const supplierPart = reasonParts.find(p => p.startsWith('Proveedor:'))
        const supplierName = supplierPart ? supplierPart.replace('Proveedor: ', '') : ''
        map.set(key, {
          referenceId: key,
          date: m.createdAt,
          user: m.performedBy?.name ?? '–',
          branch: m.branch?.name ?? '–',
          supplier: supplierName,
          itemCount: 0,
          totalUnits: 0,
          items: [],
        })
      }
      const g = map.get(key)!
      g.itemCount++
      g.totalUnits += Number(m.quantity)
      g.items.push(m)
    }
    return Array.from(map.values()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [movements])

  // ── Confirm intake ─────────────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!selectedBranchId) { toast.error('Selecciona una sucursal'); return }
    if (intakeItems.length === 0) { toast.error('Agrega al menos un producto'); return }
    setSaving(true)
    try {
      await api.post('/api/inventory/intake', {
        branchId: selectedBranchId,
        supplierId: selectedSupplierId || undefined,
        notes: notes || undefined,
        items: intakeItems.map(i => ({
          productId: i.productId,
          productName: i.productName,
          quantity: i.quantity,
          unitCost: i.unitCost,
        })),
      })
      toast.success(`Ingreso confirmado — ${intakeItems.length} producto(s), ${totalUnits % 1 === 0 ? totalUnits : totalUnits.toFixed(2)} unidades`)
      resetForm()
      setView('list')
      fetchMovements()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  // ── CREATE VIEW ────────────────────────────────────────────────────────────
  if (view === 'create') {
    return (
      <div className="flex flex-col gap-3 md:h-[calc(100vh-7rem)]">

        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => { resetForm(); setView('list') }}
            className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-lg font-bold text-gray-800">Nuevo Ingreso de Mercancía</h1>
            <p className="text-xs text-gray-500">
              {intakeItems.length > 0
                ? `${intakeItems.length} producto(s) · ${totalUnits % 1 === 0 ? totalUnits : totalUnits.toFixed(2)} unidades totales`
                : 'Busca y agrega productos al ingreso'}
            </p>
          </div>
        </div>

        {/* Split layout */}
        <div className="flex flex-col md:flex-row gap-3 flex-1 overflow-auto md:overflow-hidden md:min-h-0">

          {/* LEFT: search + item list */}
          <div className="flex-1 bg-white rounded-lg shadow-sm flex flex-col min-h-[280px] md:min-h-0">

            {/* Search bar */}
            <div className="p-3 border-b relative">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Buscar producto por nombre o código..."
                value={posSearch}
                onChange={e => setPosSearch(e.target.value)}
                onFocus={() => posSearch.trim() && setShowResults(true)}
                onBlur={() => setTimeout(() => setShowResults(false), 150)}
                className="input pl-10 w-full"
              />
              {showResults && posResults.length > 0 && (
                <div className="absolute left-3 right-3 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-60 overflow-y-auto">
                  {posResults.map(p => (
                    <div
                      key={p.id}
                      onMouseDown={() => handleSelectProduct(p)}
                      className="px-3 py-2.5 hover:bg-primary-50 cursor-pointer flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-800">{p.fullName ?? p.name}</p>
                        <p className="text-xs text-gray-400">{p.barcode ?? p.sku}</p>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        <p className="text-sm font-semibold text-gray-700">Q{Number(p.cost ?? 0).toFixed(2)}</p>
                        {p.variations && p.variations.length > 1 && (
                          <p className="text-xs text-blue-500">{p.variations.length} variantes</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Item list */}
            <div className="flex-1 overflow-y-auto">
              {intakeItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
                  <Package size={40} strokeWidth={1.5} />
                  <p className="text-sm">Busca productos para agregarlos al ingreso</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Producto</th>
                      <th className="text-center px-3 py-2 text-xs font-medium text-gray-500 w-36">Cantidad</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 w-32">Costo unit.</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 w-28">Subtotal</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {intakeItems.map((item, idx) => (
                      <motion.tr
                        key={item.id}
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}
                      >
                        <td className="px-4 py-2.5 font-medium text-gray-800">{item.productName}</td>

                        {/* Qty controls */}
                        <td className="px-3 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => updateQty(item.id, -1)}
                              className="w-6 h-6 rounded flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
                            >
                              <Minus size={12} />
                            </button>
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={e => setQtyDirect(item.id, e.target.value)}
                              className="w-14 text-center border border-gray-200 rounded px-1 py-0.5 text-sm focus:outline-none focus:border-primary-400"
                              min="0.001"
                              step="1"
                            />
                            <button
                              onClick={() => updateQty(item.id, 1)}
                              className="w-6 h-6 rounded flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                        </td>

                        {/* Cost (inline edit) */}
                        <td className="px-4 py-2 text-right">
                          {editingCostId === item.id ? (
                            <input
                              type="number"
                              value={editCostVal}
                              onChange={e => setEditCostVal(e.target.value)}
                              onBlur={() => commitCost(item.id)}
                              onKeyDown={e => { if (e.key === 'Enter') commitCost(item.id); if (e.key === 'Escape') setEditingCostId(null) }}
                              className="w-24 text-right border border-primary-400 rounded px-2 py-0.5 text-sm focus:outline-none"
                              autoFocus
                              step="0.01"
                              min="0"
                            />
                          ) : (
                            <button
                              onClick={() => startEditCost(item)}
                              className="flex items-center gap-1 ml-auto text-gray-700 hover:text-primary-600 group"
                              title="Editar costo"
                            >
                              <span>Q{item.unitCost.toFixed(2)}</span>
                              <Edit2 size={11} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                          )}
                        </td>

                        <td className="px-4 py-2 text-right font-semibold text-gray-800">
                          Q{(item.quantity * item.unitCost).toFixed(2)}
                        </td>

                        <td className="pr-2">
                          <button
                            onClick={() => removeItem(item.id)}
                            className="p-1.5 text-gray-300 hover:text-red-500 transition-colors rounded"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* RIGHT: options + confirm */}
          <div className="w-full md:w-72 flex flex-col gap-3">

            {/* Branch */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Sucursal de destino</h3>
              <div className="relative">
                <select
                  value={selectedBranchId}
                  onChange={e => setSelectedBranchId(e.target.value)}
                  className="input w-full appearance-none pr-8"
                >
                  <option value="">Seleccionar...</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {/* Supplier */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Proveedor</h3>
              <div className="relative">
                <select
                  value={selectedSupplierId}
                  onChange={e => setSelectedSupplierId(e.target.value)}
                  className="input w-full appearance-none pr-8"
                >
                  <option value="">Sin proveedor especificado</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {/* Notes */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Notas (opcional)</h3>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder="Referencia, número de factura, observaciones..."
                className="input w-full resize-none text-sm"
              />
            </div>

            {/* Summary + confirm */}
            <div className="bg-white rounded-lg shadow-sm p-4 flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-gray-700">Resumen del ingreso</h3>

              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Productos distintos</span>
                  <span className="font-semibold">{intakeItems.length}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Unidades totales</span>
                  <span className="font-semibold">
                    {totalUnits % 1 === 0 ? totalUnits : totalUnits.toFixed(2)}
                  </span>
                </div>
                <div className="border-t pt-1.5 flex justify-between text-gray-800 font-semibold">
                  <span>Costo total</span>
                  <span>Q{totalCost.toFixed(2)}</span>
                </div>
              </div>

              <button
                onClick={handleConfirm}
                disabled={saving || intakeItems.length === 0 || !selectedBranchId}
                className="btn-primary w-full flex items-center justify-center gap-2 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                ) : (
                  <CheckCircle size={18} />
                )}
                {saving ? 'Confirmando...' : 'Confirmar ingreso'}
              </button>
            </div>
          </div>
        </div>

        {/* Variation modal */}
        <AnimatePresence>
          {showVariationModal && selectedForVariation && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
              onClick={() => { setShowVariationModal(false); setSelectedForVariation(null) }}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-xl shadow-2xl p-5 w-80"
                onClick={e => e.stopPropagation()}
              >
                <h3 className="font-semibold text-gray-800 mb-1">{selectedForVariation.fullName ?? selectedForVariation.name}</h3>
                <p className="text-xs text-gray-400 mb-4">Selecciona una variante</p>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {selectedForVariation.variations?.map(v => (
                    <button
                      key={v.id}
                      onMouseDown={() => addItem(selectedForVariation, v)}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-gray-200 hover:border-primary-400 hover:bg-primary-50 transition-colors text-left"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-800">{v.name}</p>
                        {v.barcode && <p className="text-xs text-gray-400">{v.barcode}</p>}
                      </div>
                      <span className="text-sm font-semibold text-gray-700">Q{Number(v.price ?? 0).toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  // ── LIST VIEW ──────────────────────────────────────────────────────────────
  const todayStr = new Date().toDateString()
  const todayGroups = intakeGroups.filter(g => new Date(g.date).toDateString() === todayStr)
  const todayUnits = todayGroups.reduce((s, g) => s + g.totalUnits, 0)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Ingresos de Mercancía</h1>
          <p className="text-sm text-gray-500 mt-0.5">Registra entradas de productos al inventario</p>
        </div>
        <button
          onClick={() => { resetForm(); setSelectedBranchId(user?.branchId ?? ''); setView('create') }}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={18} /> Nuevo Ingreso
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-3">
          <div className="p-2.5 bg-blue-100 rounded-lg"><Package size={20} className="text-blue-600" /></div>
          <div>
            <p className="text-xs text-gray-400">Ingresos hoy</p>
            <p className="text-xl font-bold text-gray-800">{todayGroups.length}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-3">
          <div className="p-2.5 bg-green-100 rounded-lg"><TrendingUp size={20} className="text-green-600" /></div>
          <div>
            <p className="text-xs text-gray-400">Unidades hoy</p>
            <p className="text-xl font-bold text-gray-800">
              {todayUnits % 1 === 0 ? todayUnits : todayUnits.toFixed(2)}
            </p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-3">
          <div className="p-2.5 bg-purple-100 rounded-lg"><CheckCircle size={20} className="text-purple-600" /></div>
          <div>
            <p className="text-xs text-gray-400">Total registros</p>
            <p className="text-xl font-bold text-gray-800">{intakeGroups.length}</p>
          </div>
        </div>
      </div>

      {/* Intake history */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b">
          <h2 className="text-sm font-semibold text-gray-700">Historial de ingresos</h2>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary-400 border-t-transparent" />
          </div>
        ) : intakeGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
            <Package size={40} strokeWidth={1.5} />
            <p className="text-sm">No hay ingresos registrados</p>
          </div>
        ) : (
          <div className="divide-y">
            {intakeGroups.map(group => (
              <div key={group.referenceId}>
                {/* Group row */}
                <button
                  onClick={() => setExpandedGroup(expandedGroup === group.referenceId ? null : group.referenceId)}
                  className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-green-100 rounded-lg flex-shrink-0">
                      <Package size={16} className="text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">
                        {group.itemCount} producto{group.itemCount !== 1 ? 's' : ''}
                        {' · '}
                        <span className="font-normal text-gray-600">
                          {group.totalUnits % 1 === 0 ? group.totalUnits : group.totalUnits.toFixed(2)} unidades
                        </span>
                      </p>
                      <p className="text-xs text-gray-400">
                        {format(new Date(group.date), "d 'de' MMMM, HH:mm", { locale: es })}
                        {' · '}{group.user}
                        {' · '}{group.branch}
                        {group.supplier && <span className="text-blue-500"> · {group.supplier}</span>}
                      </p>
                    </div>
                  </div>
                  {expandedGroup === group.referenceId
                    ? <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />
                    : <ChevronRight size={16} className="text-gray-400 flex-shrink-0" />}
                </button>

                {/* Expanded detail */}
                <AnimatePresence>
                  {expandedGroup === group.referenceId && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden bg-gray-50"
                    >
                      <div className="px-5 pb-3 pt-1">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-xs text-gray-400">
                              <th className="text-left py-1.5 font-medium">Producto</th>
                              <th className="text-right py-1.5 font-medium">Cantidad</th>
                              <th className="text-right py-1.5 font-medium">Antes</th>
                              <th className="text-right py-1.5 font-medium">Después</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {group.items.map(item => (
                              <tr key={item.id}>
                                <td className="py-1.5 text-gray-700">{item.product?.name}</td>
                                <td className="py-1.5 text-right font-semibold text-green-600">
                                  +{Number(item.quantity) % 1 === 0 ? Number(item.quantity) : Number(item.quantity).toFixed(2)}
                                </td>
                                <td className="py-1.5 text-right text-gray-400">{Number(item.quantityBefore).toFixed(0)}</td>
                                <td className="py-1.5 text-right text-gray-700">{Number(item.quantityAfter).toFixed(0)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {group.items[0]?.reason && (
                          <p className="text-xs text-gray-400 mt-2 italic">Nota: {group.items[0].reason}</p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
