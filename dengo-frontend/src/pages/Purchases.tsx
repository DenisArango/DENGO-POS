import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Search, ArrowLeft, Trash2, CheckCircle,
  Package, TrendingUp, ChevronDown, ChevronRight, Edit2, X, UserPlus, DollarSign,
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { useAuthStore } from '../store'
import { usePermissions } from '../hooks/usePermissions'
import { matchesSearch } from '../lib/search'

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
  unitCost?: number | null
  supplierId?: string | null
  supplier?: { id: string; name: string } | null
}

interface IntakeGroup {
  referenceId: string
  purchaseNumber: string | null // short "número de compra" parsed from COMPRA-N referenceIds; null for legacy INTAKE-* entries
  date: string
  user: string
  branch: string
  branchId: string
  supplier: string
  supplierId: string
  itemCount: number
  totalUnits: number
  totalCost: number | null // null = none of these movements have cost data (ej. before this feature existed)
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
  basePrice?: number
  isActive?: boolean
  variations?: ProductVariation[]
}

interface IntakeItem {
  id: string
  productId: string
  productName: string
  quantity: number
  unitCost: number
  unitPrice: number
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Purchases() {
  const { user } = useAuthStore()
  const { hasPermission } = usePermissions()
  // The actual submit calls POST /api/inventory/intake, gated server-side by
  // purchases.receive — the only permission this module has, since receiving
  // is a single direct action with no purchase-order document behind it.
  const canCreatePurchase = hasPermission('purchases.receive')
  const canEditPurchase = hasPermission('purchases.edit')
  const canCreateSupplier = hasPermission('suppliers.create')
  const canEditSupplier = hasPermission('suppliers.edit')

  const [view, setView] = useState<'list' | 'create'>('list')

  // List state
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const [historySearch, setHistorySearch] = useState('')

  // Create form state
  const [intakeItems, setIntakeItems] = useState<IntakeItem[]>([])
  const [selectedBranchId, setSelectedBranchId] = useState(user?.branchId ?? '')
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [suppliers, setSuppliers] = useState<{ id: string; name: string; code: string; phone?: string; email?: string; contactName?: string }[]>([])
  const [supplierSearch, setSupplierSearch] = useState('')
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false)

  // Quick add/edit supplier (inline, without leaving the purchase)
  const [showQuickSupplierModal, setShowQuickSupplierModal] = useState(false)
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null)
  const [quickSupplierForm, setQuickSupplierForm] = useState({ name: '', code: '', contactName: '', phone: '', email: '' })
  const [savingQuickSupplier, setSavingQuickSupplier] = useState(false)

  // Product search
  const [posSearch, setPosSearch] = useState('')
  const [posResults, setPosResults] = useState<ProductOption[]>([])
  const [showResults, setShowResults] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Variation modal
  const [showVariationModal, setShowVariationModal] = useState(false)
  const [selectedForVariation, setSelectedForVariation] = useState<ProductOption | null>(null)

  // Inline cost/price edit
  const [editingCostId, setEditingCostId] = useState<string | null>(null)
  const [editCostVal, setEditCostVal] = useState('')
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null)
  const [editPriceVal, setEditPriceVal] = useState('')
  const draftHydratedRef = useRef(false)

  // Editing an already-closed purchase reuses the same create-view form —
  // set only while correcting an existing one, never for a brand-new intake.
  const [editingReferenceId, setEditingReferenceId] = useState<string | null>(null)
  const [editingOriginalBranchId, setEditingOriginalBranchId] = useState<string | null>(null)
  const [loadingEdit, setLoadingEdit] = useState(false)

  // ── Load data ─────────────────────────────────────────────────────────────
  const fetchMovements = () => {
    setLoading(true)
    // ADJUSTMENT is included alongside IN because editing a purchase files
    // its reversal as ADJUSTMENT (see PUT /intake/:referenceId) — without it
    // the signed-delta grouping below can't net an edited purchase back to
    // its true current total.
    api.get<StockMovement[]>('/api/inventory/movements?type=IN,ADJUSTMENT')
      .then(data => setMovements((data ?? []).filter(m => m.referenceId?.startsWith('INTAKE-') || m.referenceId?.startsWith('COMPRA-'))))
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

  // ── Draft: survives a corte de luz/internet or navegar a otra pantalla ─────
  // Same pattern as POS.tsx's in-progress-sale draft — keyed per user (not
  // per branch) since selectedBranchId here is itself a form field, not a
  // fixed "where this device is" context like POS's BRANCH_ID.
  const draftKey = `purchases-draft-intake-${user?.id ?? ''}`
  useEffect(() => {
    if (draftHydratedRef.current || !user?.id) return
    draftHydratedRef.current = true
    try {
      const raw = localStorage.getItem(draftKey)
      if (!raw) return
      const draft = JSON.parse(raw)
      if (Array.isArray(draft.intakeItems) && draft.intakeItems.length > 0) {
        setIntakeItems(draft.intakeItems)
        setSelectedBranchId(draft.selectedBranchId ?? (user?.branchId ?? ''))
        setSelectedSupplierId(draft.selectedSupplierId ?? '')
        setNotes(draft.notes ?? '')
        setView('create')
        toast.info('Se restauró el ingreso que tenías en curso')
      }
    } catch {
      // Draft corrupto o ilegible — se ignora, no bloquea el uso normal.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  useEffect(() => {
    // Never persist/restore a draft while editing an already-closed purchase
    // — that's a separate flow (PUT /intake/:referenceId), not a new intake.
    if (!draftHydratedRef.current || !user?.id || editingReferenceId) return
    try {
      if (intakeItems.length === 0) {
        localStorage.removeItem(draftKey)
      } else {
        localStorage.setItem(draftKey, JSON.stringify({ intakeItems, selectedBranchId, selectedSupplierId, notes }))
      }
    } catch {
      // localStorage lleno o bloqueado — el ingreso sigue funcionando, solo no persiste.
    }
  }, [intakeItems, selectedBranchId, selectedSupplierId, notes, user?.id, editingReferenceId])

  const selectedSupplier = suppliers.find(s => s.id === selectedSupplierId) ?? null
  const filteredSuppliers = suppliers.filter(s => matchesSearch([s.name, s.code], supplierSearch))

  const openQuickAddSupplier = () => {
    setEditingSupplierId(null)
    setQuickSupplierForm({ name: supplierSearch, code: '', contactName: '', phone: '', email: '' })
    setShowQuickSupplierModal(true)
  }

  const openQuickEditSupplier = () => {
    const supplier = suppliers.find(s => s.id === selectedSupplierId)
    if (!supplier) return
    setEditingSupplierId(supplier.id)
    setQuickSupplierForm({
      name: supplier.name, code: supplier.code,
      contactName: supplier.contactName ?? '', phone: supplier.phone ?? '', email: supplier.email ?? '',
    })
    setShowQuickSupplierModal(true)
  }

  const handleSaveQuickSupplier = async () => {
    if (!quickSupplierForm.name.trim() || !quickSupplierForm.code.trim()) {
      toast.error('Nombre y código son requeridos'); return
    }
    setSavingQuickSupplier(true)
    try {
      const payload: { name: string; code: string; contactName?: string; phone?: string; email?: string } = {
        name: quickSupplierForm.name.trim(),
        code: quickSupplierForm.code.trim(),
        contactName: quickSupplierForm.contactName.trim() || undefined,
        phone: quickSupplierForm.phone.trim() || undefined,
        email: quickSupplierForm.email.trim() || undefined,
      }
      const saved = editingSupplierId
        ? await api.put<typeof suppliers[number]>(`/api/suppliers/${editingSupplierId}`, payload)
        : await api.post<typeof suppliers[number]>('/api/suppliers', payload)
      if (editingSupplierId) {
        setSuppliers(prev => prev.map(s => s.id === saved.id ? saved : s))
        toast.success('Proveedor actualizado')
      } else {
        setSuppliers(prev => [...prev, saved])
        setSelectedSupplierId(saved.id)
        setSupplierSearch('')
        setShowSupplierDropdown(false)
        toast.success('Proveedor agregado')
      }
      setShowQuickSupplierModal(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar proveedor')
    } finally {
      setSavingQuickSupplier(false)
    }
  }

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
      const results = (data ?? []).filter(p => p.isActive !== false)
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
    // Used to require 2+ variations before asking — with exactly one defined,
    // this silently picked that one variation (never the base), with no way
    // to receive the product as a loose piece via search at all. Now any
    // real variation (even just one) opens the picker, which always offers
    // the base ("Pieza") alongside it — see the modal below.
    if (product.variations && product.variations.length > 0) {
      setSelectedForVariation(product)
      setShowVariationModal(true)
    } else {
      addItem(product, null)
    }
  }

  function addItem(product: ProductOption, variation: ProductVariation | null) {
    // Inventory is tracked per Product (not per variation) — always use product.id
    const productId = product.id
    const name = variation && !variation.isDefault
      ? `${product.fullName ?? product.name} (${variation.name})`
      : (product.fullName ?? product.name)
    const cost = Number(product.cost ?? 0)
    const price = Number(product.basePrice ?? 0)
    setIntakeItems(prev => {
      const existing = prev.find(i => i.productId === productId)
      if (existing) {
        return prev.map(i => i.productId === productId ? { ...i, quantity: i.quantity + 1 } : i)
      }
      return [...prev, { id: Math.random().toString(36).slice(2), productId, productName: name, quantity: 1, unitCost: cost, unitPrice: price }]
    })
    setShowVariationModal(false)
    setSelectedForVariation(null)
  }

  // ── Item helpers ───────────────────────────────────────────────────────────
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

  const startEditPrice = (item: IntakeItem) => {
    setEditingPriceId(item.id)
    setEditPriceVal(item.unitPrice.toFixed(2))
  }

  const commitPrice = (id: string) => {
    const n = parseFloat(editPriceVal)
    if (!isNaN(n) && n >= 0) setIntakeItems(prev => prev.map(i => i.id === id ? { ...i, unitPrice: n } : i))
    setEditingPriceId(null)
  }

  const resetForm = () => {
    setIntakeItems([])
    setNotes('')
    setSelectedSupplierId('')
    setSupplierSearch('')
    setShowSupplierDropdown(false)
    setPosSearch('')
    setPosResults([])
    setShowResults(false)
    setEditingCostId(null)
    setEditingPriceId(null)
    setEditingReferenceId(null)
    setEditingOriginalBranchId(null)
  }

  // ── Edit an already-closed purchase ────────────────────────────────────────
  // Reconstructs the purchase's CURRENT state from its StockMovement group
  // (group.items, newest-first): nets each product's signed quantity across
  // every movement under this referenceId (so a purchase already corrected
  // once still reconstructs correctly) and keeps the most recent unitCost
  // seen per product. Sale price isn't stored on StockMovement, so it's
  // filled from the product's current basePrice as a starting point.
  const openEditGroup = async (group: IntakeGroup) => {
    setLoadingEdit(true)
    try {
      const netByProduct = new Map<string, { name: string; qty: number; cost: number }>()
      for (const m of group.items) {
        const delta = Number(m.quantityAfter) - Number(m.quantityBefore)
        const entry = netByProduct.get(m.productId)
        if (entry) {
          entry.qty += delta
        } else {
          netByProduct.set(m.productId, { name: m.product?.name ?? '—', qty: delta, cost: Number(m.unitCost ?? 0) })
        }
      }
      const reconstructed = Array.from(netByProduct.entries()).filter(([, v]) => v.qty > 0.0005)
      if (reconstructed.length === 0) {
        toast.error('No se pudo reconstruir esta compra (sin unidades netas)')
        return
      }

      const prices = await Promise.all(
        reconstructed.map(([productId]) =>
          api.get<{ basePrice?: number }>(`/api/products/${productId}`).catch(() => null)
        )
      )

      setIntakeItems(reconstructed.map(([productId, v], idx) => ({
        id: Math.random().toString(36).slice(2),
        productId,
        productName: v.name,
        quantity: v.qty,
        unitCost: v.cost,
        unitPrice: Number(prices[idx]?.basePrice ?? 0),
      })))
      setSelectedBranchId(group.branchId)
      setEditingOriginalBranchId(group.branchId)
      setSelectedSupplierId(group.supplierId)
      setSupplierSearch('')
      // Best-effort notes recovery: the backend folds "Proveedor: X" and
      // notes (or an auto "Ingreso — <producto>" fallback when notes was
      // empty) into one `reason` string — split it back apart.
      const firstReason = group.items[0]?.reason ?? ''
      const notesPart = firstReason.split(' | ').find(p => !p.startsWith('Proveedor:')) ?? ''
      setNotes(notesPart.startsWith('Ingreso — ') ? '' : notesPart)
      setEditingReferenceId(group.referenceId)
      setView('create')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar la compra para editar')
    } finally {
      setLoadingEdit(false)
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const totalUnits = intakeItems.reduce((s, i) => s + i.quantity, 0)
  const totalCost = intakeItems.reduce((s, i) => s + i.quantity * i.unitCost, 0)

  const intakeGroups = useMemo<IntakeGroup[]>(() => {
    const map = new Map<string, IntakeGroup>()
    // `movements` comes back newest-first (GET /movements orders by
    // createdAt desc), so within one referenceId the FIRST row this loop
    // encounters is always the most recent one — used below to seed each
    // group's "current" branch/supplier from whatever an edit last set,
    // not from whenever the purchase was originally created.
    for (const m of movements) {
      const key = m.referenceId ?? m.id
      if (!map.has(key)) {
        // Extract supplier from reason "Proveedor: X | notes" — fallback for
        // movements made before supplierId existed as a real FK.
        const reasonParts = (m.reason ?? '').split(' | ')
        const supplierPart = reasonParts.find(p => p.startsWith('Proveedor:'))
        const supplierName = m.supplier?.name ?? (supplierPart ? supplierPart.replace('Proveedor: ', '') : '')
        map.set(key, {
          referenceId: key,
          purchaseNumber: key.startsWith('COMPRA-') ? key.slice('COMPRA-'.length) : null,
          date: m.createdAt,
          user: m.performedBy?.name ?? '–',
          branch: m.branch?.name ?? '–',
          branchId: m.branchId,
          supplier: supplierName,
          supplierId: m.supplierId ?? '',
          itemCount: 0,
          totalUnits: 0,
          totalCost: null,
          items: [],
        })
      }
      const g = map.get(key)!
      g.itemCount++
      // Signed, not the always-positive `quantity` column — an edit reverses
      // the old movements (RETURN, decreasing) and re-applies the corrected
      // ones (IN, increasing) under this SAME referenceId, so summing the
      // raw magnitude would double-count the reversal instead of netting it
      // out to the purchase's true final total.
      const delta = Number(m.quantityAfter) - Number(m.quantityBefore)
      g.totalUnits += delta
      // null stays null until the first movement with real cost data shows
      // up — an intake made before this field existed has none at all, and
      // showing "Q0.00" for that would read as "this cost nothing" instead
      // of "no sabemos".
      if (m.unitCost != null) {
        g.totalCost = (g.totalCost ?? 0) + delta * Number(m.unitCost)
      }
      g.items.push(m)
    }
    return Array.from(map.values()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [movements])

  const filteredIntakeGroups = useMemo(() => {
    if (!historySearch.trim()) return intakeGroups
    return intakeGroups.filter(g => matchesSearch([g.purchaseNumber ?? '', g.referenceId, g.supplier], historySearch))
  }, [intakeGroups, historySearch])

  // ── Confirm intake (or save edits to an existing one) ──────────────────────
  const handleConfirm = async () => {
    if (!selectedBranchId) { toast.error('Selecciona una sucursal'); return }
    if (intakeItems.length === 0) { toast.error('Agrega al menos un producto'); return }
    setSaving(true)
    try {
      const payload = {
        branchId: selectedBranchId,
        supplierId: selectedSupplierId || undefined,
        notes: notes || undefined,
        items: intakeItems.map(i => ({
          productId: i.productId,
          productName: i.productName,
          quantity: i.quantity,
          unitCost: i.unitCost,
          unitPrice: i.unitPrice,
        })),
      }
      if (editingReferenceId) {
        await api.put(`/api/inventory/intake/${editingReferenceId}`, payload)
        toast.success('Compra actualizada')
      } else {
        await api.post('/api/inventory/intake', payload)
        toast.success(`Ingreso confirmado — ${intakeItems.length} producto(s), ${totalUnits % 1 === 0 ? totalUnits : totalUnits.toFixed(2)} unidades`)
      }
      resetForm()
      setView('list')
      fetchMovements()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : (editingReferenceId ? 'Error al actualizar la compra' : 'Error al confirmar ingreso'))
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
          <div className="flex-1">
            <h1 className="text-lg font-bold text-gray-800">
              {editingReferenceId
                ? `Editar Compra${editingReferenceId.startsWith('COMPRA-') ? ` #${editingReferenceId.slice('COMPRA-'.length)}` : ''}`
                : 'Nuevo Ingreso de Mercancía'}
            </h1>
            <p className="text-xs text-gray-500">
              {intakeItems.length > 0
                ? `${intakeItems.length} producto(s) · ${totalUnits % 1 === 0 ? totalUnits : totalUnits.toFixed(2)} unidades totales`
                : 'Busca y agrega productos al ingreso'}
            </p>
          </div>
          {intakeItems.length > 0 && (
            <div className="text-right">
              <p className="text-xs text-gray-500">Costo total</p>
              <p className="text-lg font-bold text-primary-700">Q{totalCost.toFixed(2)}</p>
            </div>
          )}
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
                        {p.variations && p.variations.length > 0 && (
                          <p className="text-xs text-blue-500">{p.variations.length} variante{p.variations.length !== 1 ? 's' : ''}</p>
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
                <>
                <p className="px-4 pt-2 text-xs text-gray-400">Costo y precio de venta se guardan en el producto al confirmar el ingreso.</p>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Producto</th>
                      <th className="text-center px-3 py-2 text-xs font-medium text-gray-500 w-36">Cantidad</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 w-32">Costo unit.</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 w-32">Precio venta</th>
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
                          <div className="flex items-center justify-center">
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={e => setQtyDirect(item.id, e.target.value)}
                              className="w-16 text-center border border-gray-200 rounded px-1 py-1 text-sm focus:outline-none focus:border-primary-400"
                              min="0.001"
                              step="1"
                            />
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

                        {/* Sale price (inline edit) — saved to Product.basePrice on confirm */}
                        <td className="px-4 py-2 text-right">
                          {editingPriceId === item.id ? (
                            <input
                              type="number"
                              value={editPriceVal}
                              onChange={e => setEditPriceVal(e.target.value)}
                              onBlur={() => commitPrice(item.id)}
                              onKeyDown={e => { if (e.key === 'Enter') commitPrice(item.id); if (e.key === 'Escape') setEditingPriceId(null) }}
                              className="w-24 text-right border border-primary-400 rounded px-2 py-0.5 text-sm focus:outline-none"
                              autoFocus
                              step="0.01"
                              min="0"
                            />
                          ) : (
                            <button
                              onClick={() => startEditPrice(item)}
                              className="flex items-center gap-1 ml-auto text-gray-700 hover:text-primary-600 group"
                              title="Editar precio de venta"
                            >
                              <span>Q{item.unitPrice.toFixed(2)}</span>
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
                </>
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
              {editingOriginalBranchId && selectedBranchId && selectedBranchId !== editingOriginalBranchId && (
                <p className="text-xs text-amber-600 mt-2">
                  Al guardar, el inventario de esta compra se moverá de {branches.find(b => b.id === editingOriginalBranchId)?.name ?? 'la sucursal original'} a {branches.find(b => b.id === selectedBranchId)?.name ?? 'esta sucursal'}.
                </p>
              )}
            </div>

            {/* Supplier */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Proveedor</h3>
              <div className="flex items-center gap-2">
                {selectedSupplier ? (
                  <div className="flex-1 flex items-center justify-between bg-primary-50 border border-primary-200 rounded-lg px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{selectedSupplier.name}</p>
                      <p className="text-xs text-gray-500">{selectedSupplier.code}</p>
                    </div>
                    <button
                      onClick={() => setSelectedSupplierId('')}
                      title="Quitar proveedor"
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      value={supplierSearch}
                      onChange={e => { setSupplierSearch(e.target.value); setShowSupplierDropdown(true) }}
                      onFocus={() => setShowSupplierDropdown(true)}
                      onBlur={() => setTimeout(() => setShowSupplierDropdown(false), 150)}
                      placeholder="Buscar proveedor por nombre o código..."
                      className="input w-full pl-8 text-sm py-2"
                    />
                    {showSupplierDropdown && (
                      <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                        {filteredSuppliers.length === 0 ? (
                          <p className="px-3 py-2 text-xs text-gray-400">{supplierSearch ? 'Sin resultados' : 'Escribe para buscar... (o deja vacío para ingreso sin proveedor)'}</p>
                        ) : (
                          filteredSuppliers.slice(0, 50).map(s => (
                            <button key={s.id} onMouseDown={() => { setSelectedSupplierId(s.id); setSupplierSearch(''); setShowSupplierDropdown(false) }}
                              className="w-full text-left px-3 py-2 hover:bg-primary-50 transition-colors border-b border-gray-50 last:border-0">
                              <p className="text-sm font-medium text-gray-800">{s.name}</p>
                              <p className="text-xs text-gray-400">{s.code}</p>
                            </button>
                          ))
                        )}
                        {canCreateSupplier && (
                          <button onMouseDown={openQuickAddSupplier}
                            className="w-full text-left px-3 py-2 hover:bg-primary-50 transition-colors flex items-center gap-1.5 text-primary-600 font-medium text-sm">
                            <UserPlus size={14} /> Nuevo proveedor{supplierSearch ? ` "${supplierSearch}"` : ''}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {canEditSupplier && selectedSupplierId && (
                  <button onClick={openQuickEditSupplier} title="Editar proveedor" className="p-2 text-gray-400 hover:text-primary-600 hover:bg-gray-50 rounded-lg transition-colors">
                    <Edit2 size={16} />
                  </button>
                )}
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
                {saving ? 'Guardando...' : (editingReferenceId ? 'Guardar cambios' : 'Confirmar ingreso')}
              </button>
            </div>
          </div>
        </div>

        {/* Quick add/edit supplier modal */}
        <AnimatePresence>
          {showQuickSupplierModal && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
              onClick={() => setShowQuickSupplierModal(false)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <UserPlus size={20} className="text-primary-600" /> {editingSupplierId ? 'Editar proveedor' : 'Nuevo proveedor'}
                  </h3>
                  <button onClick={() => setShowQuickSupplierModal(false)} className="text-gray-400 hover:text-gray-600">
                    <X size={20} />
                  </button>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="label">Nombre *</label>
                    <input type="text" value={quickSupplierForm.name}
                      onChange={e => setQuickSupplierForm(f => ({ ...f, name: e.target.value }))}
                      className="input w-full" placeholder="Nombre del proveedor" autoFocus />
                  </div>
                  <div>
                    <label className="label">Código *</label>
                    <input type="text" value={quickSupplierForm.code}
                      onChange={e => setQuickSupplierForm(f => ({ ...f, code: e.target.value }))}
                      className="input w-full" placeholder="PROV001" />
                  </div>
                  <div>
                    <label className="label">Contacto</label>
                    <input type="text" value={quickSupplierForm.contactName}
                      onChange={e => setQuickSupplierForm(f => ({ ...f, contactName: e.target.value }))}
                      className="input w-full" placeholder="Persona de contacto" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Teléfono</label>
                      <input type="tel" value={quickSupplierForm.phone}
                        onChange={e => setQuickSupplierForm(f => ({ ...f, phone: e.target.value }))}
                        className="input w-full" />
                    </div>
                    <div>
                      <label className="label">Email</label>
                      <input type="email" value={quickSupplierForm.email}
                        onChange={e => setQuickSupplierForm(f => ({ ...f, email: e.target.value }))}
                        className="input w-full" />
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 mt-5">
                  <button onClick={() => setShowQuickSupplierModal(false)} className="flex-1 btn-outline btn-md" disabled={savingQuickSupplier}>
                    Cancelar
                  </button>
                  <button onClick={handleSaveQuickSupplier} disabled={savingQuickSupplier} className="flex-1 btn-primary btn-md flex items-center justify-center gap-2">
                    {savingQuickSupplier && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
                    {editingSupplierId ? 'Guardar' : 'Agregar y seleccionar'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

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
                <p className="text-xs text-gray-400 mb-4">Selecciona una presentación</p>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {/* La base ("Pieza") siempre es una opción, aunque el
                      producto ya tenga variantes definidas — recibir la
                      mercadería suelta sigue siendo válido. */}
                  <button
                    onMouseDown={() => addItem(selectedForVariation, null)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-gray-200 hover:border-primary-400 hover:bg-primary-50 transition-colors text-left"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-800">Pieza</p>
                      <p className="text-xs text-gray-400">Unidad base</p>
                    </div>
                    <span className="text-sm font-semibold text-gray-700">Q{Number(selectedForVariation.cost ?? 0).toFixed(2)}</span>
                  </button>
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
  const todayCost = todayGroups.reduce((s, g) => s + (g.totalCost ?? 0), 0)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Ingresos de Mercancía</h1>
          <p className="text-sm text-gray-500 mt-0.5">Registra entradas de productos al inventario</p>
        </div>
        {canCreatePurchase && (
          <button
            onClick={() => { resetForm(); setSelectedBranchId(user?.branchId ?? ''); setView('create') }}
            className="btn-primary btn-md flex items-center gap-2"
          >
            <Plus size={18} /> Nuevo Ingreso
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
          <div className="p-2.5 bg-primary-100 rounded-lg"><DollarSign size={20} className="text-primary-700" /></div>
          <div>
            <p className="text-xs text-gray-400">Costo hoy</p>
            <p className="text-xl font-bold text-gray-800">
              {todayGroups.some(g => g.totalCost !== null) ? `Q${todayCost.toFixed(2)}` : '—'}
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
        <div className="px-5 py-3 border-b flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-700 flex-shrink-0">Historial de ingresos</h2>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            <input
              type="text"
              placeholder="Buscar por número de compra..."
              value={historySearch}
              onChange={e => setHistorySearch(e.target.value)}
              className="input pl-8 py-1.5 text-sm w-full"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary-400 border-t-transparent" />
          </div>
        ) : filteredIntakeGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
            <Package size={40} strokeWidth={1.5} />
            <p className="text-sm">{historySearch.trim() ? 'Sin resultados para esa búsqueda' : 'No hay ingresos registrados'}</p>
          </div>
        ) : (
          <div className="divide-y">
            {filteredIntakeGroups.map(group => (
              <div key={group.referenceId}>
                {/* Group row */}
                <div className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors">
                  <button
                    onClick={() => setExpandedGroup(expandedGroup === group.referenceId ? null : group.referenceId)}
                    className="flex items-center gap-4 flex-1 min-w-0 text-left"
                  >
                    <div className="p-2 bg-green-100 rounded-lg flex-shrink-0">
                      <Package size={16} className="text-green-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800">
                        {group.purchaseNumber && (
                          <span className="inline-block bg-gray-100 text-gray-500 rounded px-1.5 py-0.5 text-xs font-mono mr-1.5 align-middle">#{group.purchaseNumber}</span>
                        )}
                        {group.itemCount} producto{group.itemCount !== 1 ? 's' : ''}
                        {' · '}
                        <span className="font-normal text-gray-600">
                          {group.totalUnits % 1 === 0 ? group.totalUnits : group.totalUnits.toFixed(2)} unidades
                        </span>
                        {group.totalCost !== null && (
                          <span className="font-normal text-primary-700"> · Q{group.totalCost.toFixed(2)}</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-400">
                        {format(new Date(group.date), "d 'de' MMMM, HH:mm", { locale: es })}
                        {' · '}{group.user}
                        {' · '}{group.branch}
                        {group.supplier && <span className="text-blue-500"> · {group.supplier}</span>}
                      </p>
                    </div>
                  </button>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {canEditPurchase && (
                      <button
                        onClick={() => openEditGroup(group)}
                        disabled={loadingEdit}
                        title="Editar esta compra"
                        className="p-2 text-gray-400 hover:text-primary-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <Edit2 size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => setExpandedGroup(expandedGroup === group.referenceId ? null : group.referenceId)}
                      className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      {expandedGroup === group.referenceId
                        ? <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />
                        : <ChevronRight size={16} className="text-gray-400 flex-shrink-0" />}
                    </button>
                  </div>
                </div>

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
                              <th className="text-right py-1.5 font-medium">Costo unit.</th>
                              <th className="text-right py-1.5 font-medium">Antes</th>
                              <th className="text-right py-1.5 font-medium">Después</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {group.items.map(item => {
                              const delta = Number(item.quantityAfter) - Number(item.quantityBefore)
                              return (
                                <tr key={item.id}>
                                  <td className="py-1.5 text-gray-700">
                                    {item.product?.name}
                                    {item.reason?.startsWith('Reverso por edición') && <span className="text-xs text-amber-500 ml-1">(reverso por edición)</span>}
                                  </td>
                                  <td className={`py-1.5 text-right font-semibold ${delta < 0 ? 'text-red-500' : 'text-green-600'}`}>
                                    {delta >= 0 ? '+' : ''}{delta % 1 === 0 ? delta : delta.toFixed(2)}
                                  </td>
                                  <td className="py-1.5 text-right text-gray-500">
                                    {item.unitCost != null ? `Q${Number(item.unitCost).toFixed(2)}` : '—'}
                                  </td>
                                  <td className="py-1.5 text-right text-gray-400">{Number(item.quantityBefore).toFixed(0)}</td>
                                  <td className="py-1.5 text-right text-gray-700">{Number(item.quantityAfter).toFixed(0)}</td>
                                </tr>
                              )
                            })}
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
