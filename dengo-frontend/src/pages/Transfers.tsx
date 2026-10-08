import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowUpDown, Plus, Search, Filter, Package,
  Building2, Truck, Clock, CheckCircle,
  XCircle, ArrowRight, ChevronDown,
  Download, Eye, BarChart3, ArrowLeft, Printer,
  ArrowLeftRight, Ban
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { useAuthStore } from '../store'
import { useStore } from '../contexts/StoreContext'
import { usePermissions } from '../hooks/usePermissions'
import { ThermalTransferSlip } from '../components/print/ThermalTransferSlip'

interface Branch {
  id: string
  name: string
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

interface Product {
  id: string
  name: string
  fullName?: string
  sku?: string
  barcode?: string
  basePrice?: number
  unitCost?: number
  cost?: number
  isActive?: boolean
  variations?: ProductVariation[]
}

interface TransferItem {
  productId: string
  productName: string
  productCode: string
  quantity: number
  unitCost: number
  totalCost: number
  basePrice?: number
  availableStock?: number
  // Carried along so the row can offer "cambiar variación"/"agregar otra
  // presentación" without re-fetching the product — undefined/empty means
  // this product has no real variations defined at all.
  productVariations?: ProductVariation[]
}

interface Transfer {
  id: string
  code?: string
  fromBranchId?: string
  toBranchId?: string
  fromStore?: string
  toStore?: string
  fromBranch?: Branch
  toBranch?: Branch
  status: 'pending' | 'in_transit' | 'approved' | 'completed' | 'cancelled' | 'rejected'
  createdAt: string
  createdBy?: string
  requestedBy?: { id: string; name: string }
  items: TransferItem[]
  totalItems?: number
  totalValue?: number
  notes?: string
  receivedAt?: string
  receivedBy?: { id: string; name: string }
}

// Same model as POS.tsx: a product with no real variations sells as a
// synthetic "Pieza" (the base); scanning/clicking by default always resolves
// to the base, and getVariations() is only consulted once something already
// confirmed there's a real variation to offer.
function buildDefaultVariation(product: Product): ProductVariation {
  return {
    id: `${product.id}-default`,
    productId: product.id,
    name: 'Pieza',
    conversionFactor: 1,
    price: Number(product.basePrice ?? 0),
    isDefault: true,
  }
}

function getVariations(product: Product): ProductVariation[] {
  if (product.variations && product.variations.length > 0) return product.variations
  return [buildDefaultVariation(product)]
}

// Whether there's a REAL (admin-defined) variation to pick from — see the
// matching comment in POS.tsx. getVariations() alone can't answer this: it
// always returns at least one entry (the synthetic base when there are no
// real variations), so "length > 0" on its result is never useful here.
function hasVariationChoice(product: Product): boolean {
  return (product.variations?.length ?? 0) > 0
}

export default function StoreTransfers() {
  const { user } = useAuthStore()
  const { currentStore } = useStore()
  const { hasPermission } = usePermissions()
  const canCreate = hasPermission('transfers.create')
  const canApprove = hasPermission('transfers.approve')
  const canReceive = hasPermission('transfers.receive')
  const canReject = hasPermission('transfers.reject')

  const [view, setView] = useState<'list' | 'create'>('list')
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const PAGE_SIZE = 50
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [selectedTransfer, setSelectedTransfer] = useState<Transfer | null>(null)
  const [printingTransfer, setPrintingTransfer] = useState<Transfer | null>(null)
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [stats, setStats] = useState({ total: 0, pending: 0, inTransit: 0, completed: 0, totalValue: 0 })

  // ── Create view state ──────────────────────────────────────────────────────
  const [fromStore, setFromStore] = useState('')
  const [toStore, setToStore] = useState('')
  const [notes, setNotes] = useState('')
  const [transferItems, setTransferItems] = useState<TransferItem[]>([])
  const draftHydratedRef = useRef(false)
  // Draft text for the quantity input while being edited — same pattern as
  // POS.tsx: a plain text input (not type="number") so there's no native
  // spinner and no forced "01" when overtyping a starting "1"; the typed
  // value only commits to transferItems on blur/Enter.
  const [itemQtyStrings, setItemQtyStrings] = useState<Record<string, string>>({})

  // Product search
  const [posSearch, setPosSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [showSearchResults, setShowSearchResults] = useState(false)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Variation modal — used both to add a fresh presentation line and (when
  // changingItem is set) to switch an existing line's variation, same
  // dual-purpose modal as POS.tsx's showVariationModal/changingVariationItem.
  const [showVariationModal, setShowVariationModal] = useState(false)
  const [selectedProductForVariation, setSelectedProductForVariation] = useState<Product | null>(null)
  const [changingItem, setChangingItem] = useState<{ key: string; quantity: number } | null>(null)

  // Guards against a double "Crear Transferencia" — disabled={saving} alone
  // doesn't close the window between two rapid clicks/Enters and React
  // actually re-rendering the disabled button, which is exactly how a
  // cashier ended up with two identical transfers from one double-press.
  const creatingTransferRef = useRef(false)

  // ── Normalizers ────────────────────────────────────────────────────────────
  const normalizeTransferStatus = (s: string): Transfer['status'] => {
    switch ((s ?? '').toUpperCase()) {
      case 'PENDING': return 'pending'
      case 'IN_TRANSIT': return 'in_transit'
      case 'RECEIVED': return 'completed'
      case 'REJECTED': return 'rejected'
      case 'CANCELLED': case 'CANCELED': return 'cancelled'
      default: return (s ?? 'pending').toLowerCase() as Transfer['status']
    }
  }

  const normalizeTransfer = (t: any): Transfer => ({
    ...t,
    status: normalizeTransferStatus(t.status),
    items: (t.items ?? []).map((item: any) => {
      const qty = Number(item.quantity ?? 0)
      // unitCost: prefer stored value, fall back to product.cost (cost field from Products table)
      const unitCost = Number(item.unitCost ?? item.product?.cost ?? 0)
      const totalCost = Number(item.totalCost ?? 0) || qty * unitCost
      const basePrice = Number(item.product?.basePrice ?? 0)
      return {
        productId: item.productId ?? item.product?.id ?? '',
        productName: item.product?.name ?? item.productName ?? '',
        productCode: item.product?.barcode ?? item.product?.sku ?? item.productCode ?? item.productId ?? '',
        quantity: qty,
        unitCost,
        totalCost,
        basePrice,
      }
    }),
  })

  // ── Data fetching ──────────────────────────────────────────────────────────
  const STATUS_TO_API: Record<string, string> = {
    pending: 'PENDING', approved: 'APPROVED', in_transit: 'IN_TRANSIT',
    completed: 'RECEIVED', cancelled: 'CANCELLED', rejected: 'REJECTED',
  }

  const fetchTransfers = () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) })
    if (selectedStatus !== 'all' && STATUS_TO_API[selectedStatus]) params.set('status', STATUS_TO_API[selectedStatus]!)
    api.get<{ data: any[]; total: number; stats: typeof stats }>(`/api/transfers?${params}`)
      .then(res => {
        setTransfers((res.data ?? []).map(normalizeTransfer))
        setTotalCount(res.total ?? 0)
        setStats(res.stats ?? { total: 0, pending: 0, inTransit: 0, completed: 0, totalValue: 0 })
      })
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { setPage(1) }, [selectedStatus])
  useEffect(() => { fetchTransfers() }, [page, selectedStatus])

  useEffect(() => {
    api.get<Branch[]>('/api/branches').then(setBranches).catch(e => toast.error(e.message))
  }, [])

  // ── Draft: survives a corte de luz/internet o navegar a otra pantalla ──────
  // Same pattern as Purchases.tsx's intake draft and POS.tsx's in-progress
  // sale — a traslado being built (origen/destino/productos) lived only in
  // React state before this, so a power outage mid-entry lost it all.
  const draftKey = `transfers-draft-${user?.id ?? ''}`
  useEffect(() => {
    if (draftHydratedRef.current || !user?.id) return
    draftHydratedRef.current = true
    try {
      const raw = localStorage.getItem(draftKey)
      if (!raw) return
      const draft = JSON.parse(raw)
      if (Array.isArray(draft.transferItems) && draft.transferItems.length > 0) {
        setTransferItems(draft.transferItems)
        setFromStore(draft.fromStore ?? '')
        setToStore(draft.toStore ?? '')
        setNotes(draft.notes ?? '')
        setView('create')
        toast.info('Se restauró el traslado que tenías en curso')
      }
    } catch {
      // Draft corrupto o ilegible — se ignora, no bloquea el uso normal.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  useEffect(() => {
    if (!draftHydratedRef.current || !user?.id) return
    try {
      if (transferItems.length === 0) {
        localStorage.removeItem(draftKey)
      } else {
        localStorage.setItem(draftKey, JSON.stringify({ transferItems, fromStore, toStore, notes }))
      }
    } catch {
      // localStorage lleno o bloqueado — el traslado sigue funcionando, solo no persiste.
    }
  }, [transferItems, fromStore, toStore, notes, user?.id])

  // ── Debounced product search ───────────────────────────────────────────────
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    if (!posSearch.trim()) { setSearchResults([]); setShowSearchResults(false); return }
    searchDebounceRef.current = setTimeout(() => performSearch(posSearch.trim()), 250)
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current) }
  }, [posSearch])

  async function performSearch(query: string) {
    try {
      const data = await api.get<Product[]>(`/api/products?search=${encodeURIComponent(query)}&isActive=true`)
      const results = (data ?? []).filter(p => p.isActive !== false)
      setSearchResults(results)
      setShowSearchResults(results.length > 0)
    } catch {
      setSearchResults([])
      setShowSearchResults(false)
    }
  }

  // ── Create view helpers ────────────────────────────────────────────────────
  // Always adds the base unit straight to the transfer, same as POS's
  // handleAddProduct — even for a product that also has named presentations.
  // Picking an actual presentation is a deliberate extra step from the item
  // row (see openVariationPicker) instead of a mandatory first step, so the
  // base itself stays reachable even once a product has variations.
  function handleSelectProduct(product: Product) {
    setPosSearch('')
    setShowSearchResults(false)
    addTransferItem(product, null, 1)
  }

  // Adds an additional presentation of a product already in the list — the
  // base line (added above) stays untouched; each pick becomes its own new
  // row instead of replacing one.
  function openVariationPicker(product: Product) {
    if (!hasVariationChoice(product)) return
    setChangingItem(null)
    setSelectedProductForVariation(product)
    setShowVariationModal(true)
  }

  // An existing row only carries flat fields, not the full Product it came
  // from — rebuilds just enough of one (id + variations) for the modal to
  // work, for both "agregar otra presentación" and "cambiar variación" below.
  function productFromItem(item: TransferItem): Product {
    return {
      id: item.productId.includes('__') ? item.productId.split('__')[0]! : item.productId,
      name: item.productName,
      barcode: item.productCode,
      cost: item.unitCost,
      basePrice: item.basePrice,
      variations: item.productVariations,
    }
  }

  function openVariationPickerForItem(item: TransferItem) {
    openVariationPicker(productFromItem(item))
  }

  // Switches an EXISTING line's variation (or back to the base) — unlike
  // openVariationPicker, this replaces the one row instead of adding another.
  function handleChangeItemVariation(item: TransferItem) {
    if (!item.productVariations?.length) return
    setChangingItem({ key: item.productId, quantity: item.quantity })
    setSelectedProductForVariation(productFromItem(item))
    setShowVariationModal(true)
  }

  async function addTransferItem(product: Product, variation: ProductVariation | null, qty: number) {
    const name = variation && !variation.isDefault
      ? `${product.fullName ?? product.name} (${variation.name})`
      : (product.fullName ?? product.name)
    const code = product.barcode ?? product.sku ?? product.id
    const cost = Number(product.cost ?? product.unitCost ?? 0)
    // Use product+variation combo as dedup key so different variants are separate rows
    const dedupKey = variation && !variation.isDefault ? `${product.id}__${variation.id}` : product.id

    // Fetch available stock from origin branch
    let availableStock: number | undefined
    if (fromStore) {
      try {
        const inv = await api.get<{ quantity: number }>(`/api/inventory/${product.id}/${fromStore}`)
        availableStock = Number(inv?.quantity ?? 0)
        if (availableStock === 0) {
          toast.warning(`"${name}" no tiene stock disponible en la sucursal de origen`)
        }
      } catch { /* no inventory record */ }
    }

    setTransferItems(prev => {
      const existing = prev.find(i => i.productId === dedupKey)
      if (existing) {
        return prev.map(i => i.productId === dedupKey
          ? { ...i, quantity: i.quantity + qty, totalCost: (i.quantity + qty) * i.unitCost, availableStock }
          : i
        )
      }
      return [...prev, {
        productId: dedupKey, productName: name, productCode: code, quantity: qty,
        unitCost: cost, totalCost: qty * cost, availableStock, productVariations: product.variations,
      }]
    })
  }

  // Replaces one line's variation (keeping its quantity) — removes the old
  // row, then reuses addTransferItem so landing on an already-existing
  // variation line merges quantities the same way adding fresh does.
  function switchItemVariation(oldKey: string, product: Product, variation: ProductVariation | null, qty: number) {
    setTransferItems(prev => prev.filter(i => i.productId !== oldKey))
    addTransferItem(product, variation, qty)
  }

  // ── Barcode scan (Enter) ───────────────────────────────────────────────────
  // Mirrors POS.tsx's handleBarcodeScan exactly: scanning the BASE's own
  // barcode adds the base; scanning a specific variation's own barcode adds
  // that variation directly — neither used to work here at all (no Enter
  // handling), so every add had to go through the dropdown by hand.
  async function handleBarcodeScan(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' || !posSearch.trim()) return
    const barcode = posSearch.trim()
    const barcodeEq = (b?: string) => !!b && b.toUpperCase() === barcode.toUpperCase()

    const exactProduct = searchResults.find(
      p => barcodeEq(p.barcode) || getVariations(p).some(v => barcodeEq(v.barcode))
    )
    if (exactProduct) {
      const matchedVariation = getVariations(exactProduct).find(v => barcodeEq(v.barcode))
      await addTransferItem(exactProduct, matchedVariation ?? null, 1)
      setPosSearch('')
      setShowSearchResults(false)
      toast.success(matchedVariation ? `${exactProduct.name} (${matchedVariation.name}) agregado` : `${exactProduct.name} agregado`)
      return
    }

    try {
      const data = await api.get<{ product: Product; variation?: ProductVariation }>(
        `/api/products/barcode/${encodeURIComponent(barcode)}`
      )
      if (data?.product) {
        await addTransferItem(data.product, data.variation ?? null, 1)
        setPosSearch('')
        setShowSearchResults(false)
        toast.success(data.variation ? `${data.product.name} (${data.variation.name}) agregado` : `${data.product.name} agregado`)
      } else {
        toast.error('Producto no encontrado')
      }
    } catch {
      toast.error('Producto no encontrado')
    }
  }

  function setItemQty(productId: string, quantity: number) {
    setTransferItems(prev => prev.map(i => {
      if (i.productId !== productId) return i
      const newQty = Math.max(1, quantity)
      return { ...i, quantity: newQty, totalCost: newQty * i.unitCost }
    }))
  }

  function removeTransferItem(productId: string) {
    setTransferItems(prev => prev.filter(i => i.productId !== productId))
  }

  function resetCreateForm() {
    setFromStore(''); setToStore(''); setNotes(''); setTransferItems([])
    setPosSearch(''); setSearchResults([]); setShowSearchResults(false)
  }

  // Re-fetch stock when origin branch changes
  useEffect(() => {
    if (!fromStore || transferItems.length === 0) return
    Promise.all(
      transferItems.map(async (item) => {
        try {
          // Strip dedup suffix to get real product ID
          const realProductId = item.productId.includes('__') ? item.productId.split('__')[0] : item.productId
          const inv = await api.get<{ quantity: number }>(`/api/inventory/${realProductId}/${fromStore}`)
          return { ...item, availableStock: Number(inv?.quantity ?? 0) }
        } catch { return item }
      })
    ).then(updated => setTransferItems(updated))
  }, [fromStore])

  const handleCreateTransfer = () => {
    // creatingTransferRef (checked+set synchronously, before any state
    // update) is what actually stops a double-submit — disabled={saving}
    // alone leaves a window between a second click/Enter and React
    // re-rendering the button, which is exactly how a cashier ended up with
    // two identical transfers from one double-press.
    if (creatingTransferRef.current) return
    if (!fromStore || !toStore) { toast.error('Debes seleccionar tienda de origen y destino'); return }
    if (fromStore === toStore) { toast.error('La tienda de origen y destino no pueden ser la misma'); return }
    if (transferItems.length === 0) { toast.error('Debes agregar al menos un producto'); return }

    // Warn (don't block) if quantities exceed available stock
    const overStockItems = transferItems.filter(i => i.availableStock !== undefined && i.quantity > i.availableStock)
    if (overStockItems.length > 0) {
      const names = overStockItems.map(i => `${i.productName} (disponible: ${i.availableStock})`).join(', ')
      toast.warning(`Stock bajo en origen: ${names}. El traslado se creará de todas formas.`, { duration: 4000 })
    }

    creatingTransferRef.current = true
    setSaving(true)
    api.post('/api/transfers', {
      fromBranchId: fromStore,
      toBranchId: toStore,
      // Strip the dedup suffix (__variationId) to send the real product ID to the backend
      items: transferItems.map(i => ({
        productId: i.productId.includes('__') ? i.productId.split('__')[0] : i.productId,
        quantity: i.quantity,
      })),
      notes: notes || undefined,
      requestedById: user?.id,
    })
      .then(() => {
        toast.success('Transferencia creada exitosamente')
        resetCreateForm()
        setView('list')
        fetchTransfers()
      })
      .catch(e => toast.error(e.message))
      .finally(() => { setSaving(false); creatingTransferRef.current = false })
  }

  // ── List view helpers ──────────────────────────────────────────────────────
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-yellow-600 bg-yellow-100'
      case 'in_transit':
      case 'approved': return 'text-blue-600 bg-blue-100'
      case 'completed': return 'text-green-600 bg-green-100'
      case 'cancelled':
      case 'rejected': return 'text-red-600 bg-red-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock size={16} />
      case 'in_transit':
      case 'approved': return <Truck size={16} />
      case 'completed': return <CheckCircle size={16} />
      case 'cancelled':
      case 'rejected': return <XCircle size={16} />
      default: return null
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return 'Pendiente'
      case 'in_transit': return 'En Tránsito'
      case 'approved': return 'Aprobada'
      case 'completed': return 'Completada'
      case 'cancelled': return 'Cancelada'
      case 'rejected': return 'Rechazada'
      default: return status
    }
  }

  const displayName = (t: Transfer, side: 'from' | 'to') => {
    if (side === 'from') return t.fromBranch?.name ?? t.fromStore ?? t.fromBranchId ?? '—'
    return t.toBranch?.name ?? t.toStore ?? t.toBranchId ?? '—'
  }

  const handleApproveTransfer = (transfer: Transfer) => {
    api.put(`/api/transfers/${transfer.id}/approve`, {})
      .then(() => { toast.success('Transferencia aprobada.'); fetchTransfers(); if (selectedTransfer?.id === transfer.id) setShowDetailsModal(false) })
      .catch(e => toast.error(e.message))
  }

  const handleReceiveTransfer = (transfer: Transfer) => {
    api.put(`/api/transfers/${transfer.id}/receive`, {})
      .then(() => { toast.success('Recepción confirmada. Inventario actualizado.'); fetchTransfers(); if (selectedTransfer?.id === transfer.id) setShowDetailsModal(false) })
      .catch(e => toast.error(e.message))
  }

  const handleRejectTransfer = (transfer: Transfer) => {
    api.put(`/api/transfers/${transfer.id}/reject`, {})
      .then(() => { toast.success('Transferencia rechazada.'); fetchTransfers(); if (selectedTransfer?.id === transfer.id) setShowDetailsModal(false) })
      .catch(e => toast.error(e.message))
  }

  const handlePrintTransfer = (transfer: Transfer) => {
    setPrintingTransfer(transfer)
    requestAnimationFrame(() => window.print())
  }

  // Búsqueda por código/sucursal sigue siendo del lado del cliente, aplicada
  // solo sobre la página actual — estado y paginación ya van al servidor.
  const filteredTransfers = transfers.filter(transfer => {
    const from = displayName(transfer, 'from').toLowerCase()
    const to = displayName(transfer, 'to').toLowerCase()
    const code = (transfer.code ?? transfer.id ?? '').toLowerCase()
    return code.includes(searchTerm.toLowerCase()) || from.includes(searchTerm.toLowerCase()) || to.includes(searchTerm.toLowerCase())
  })

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  // ── Render: CREATE VIEW ───────────────────────────────────────────────────
  if (view === 'create') {
    return (
      <div className="flex flex-col gap-3 md:h-[calc(100vh-7rem)]">

        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => { resetCreateForm(); setView('list') }}
            className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-lg font-bold text-gray-800">Nueva Transferencia</h1>
            <p className="text-xs text-gray-500">
              {transferItems.length > 0
                ? `${transferItems.length} producto(s) · Q${transferItems.reduce((s, i) => s + i.totalCost, 0).toFixed(2)}`
                : 'Sin productos agregados'}
            </p>
          </div>
        </div>

        {/* Split layout */}
        <div className="flex flex-col md:flex-row gap-3 flex-1 overflow-auto md:overflow-hidden md:min-h-0">

          {/* LEFT: Search + items */}
          <div className="flex-1 bg-white rounded-lg shadow-sm flex flex-col min-h-[280px] md:min-h-0">

            {/* Search bar */}
            <div className="p-3 border-b relative">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Escanear código de barras o buscar producto por nombre..."
                value={posSearch}
                onChange={e => setPosSearch(e.target.value)}
                onKeyDown={handleBarcodeScan}
                onFocus={() => posSearch.trim() && setShowSearchResults(true)}
                onBlur={() => setTimeout(() => setShowSearchResults(false), 150)}
                className="input pl-10 w-full"
                autoFocus
              />
              {showSearchResults && (
                <div className="absolute left-3 right-3 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-60 overflow-y-auto">
                  {searchResults.length > 0 ? searchResults.map(p => (
                    <div
                      key={p.id}
                      onMouseDown={() => handleSelectProduct(p)}
                      className="px-3 py-2.5 hover:bg-primary-50 cursor-pointer flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-800">{p.fullName ?? p.name}</p>
                        <p className="text-xs text-gray-400">{p.barcode ?? p.sku ?? p.id}</p>
                      </div>
                      {hasVariationChoice(p) && (
                        <span className="text-xs text-blue-500 ml-3 flex-shrink-0">{p.variations!.length} variante{p.variations!.length !== 1 ? 's' : ''}</span>
                      )}
                    </div>
                  )) : (
                    <p className="px-3 py-3 text-sm text-gray-500 text-center">Sin resultados para "{posSearch}"</p>
                  )}
                </div>
              )}
            </div>

            {/* Column header */}
            <div
              className="grid items-center px-4 py-2 border-b bg-gray-50 rounded-none text-xs font-semibold text-gray-500 uppercase tracking-wide"
              style={{ gridTemplateColumns: '1fr 140px 32px' }}
            >
              <span>Producto</span>
              <span className="text-center">Cantidad</span>
              <span></span>
            </div>

            {/* Item list */}
            <div className="flex-1 overflow-y-auto">
              {transferItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 py-16">
                  <Package size={48} className="mb-3 opacity-30" />
                  <p className="text-sm">Busca productos para agregar a la transferencia</p>
                  {!fromStore && <p className="text-xs mt-2 text-orange-500">Selecciona primero la sucursal de origen</p>}
                </div>
              ) : (
                transferItems.map(item => {
                  const overStock = item.availableStock !== undefined && item.quantity > item.availableStock
                  return (
                    <div
                      key={item.productId}
                      className={`grid items-center px-4 py-3 border-b hover:bg-gray-50 ${overStock ? 'bg-red-50' : ''}`}
                      style={{ gridTemplateColumns: '1fr 140px 32px' }}
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-800">{item.productName}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-xs text-gray-400">{item.productCode}</p>
                          {item.availableStock !== undefined && (
                            <span className={`text-xs font-medium ${overStock ? 'text-red-600' : 'text-green-600'}`}>
                              · Disponible: {item.availableStock}
                            </span>
                          )}
                          {(item.productVariations?.length ?? 0) > 0 && (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleChangeItemVariation(item)}
                                title="Cambiar variación de esta línea"
                                className="text-primary-400 hover:text-primary-600 transition-colors">
                                <ArrowLeftRight size={11} />
                              </button>
                              <button
                                onClick={() => openVariationPickerForItem(item)}
                                title="Agregar otra presentación de este producto"
                                className="text-primary-400 hover:text-primary-600 transition-colors">
                                <Plus size={12} />
                              </button>
                            </div>
                          )}
                        </div>
                        {overStock && (
                          <p className="text-xs text-red-600 mt-0.5">⚠ Cantidad supera el stock disponible</p>
                        )}
                      </div>
                      <div className="flex items-center justify-center">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={itemQtyStrings[item.productId] ?? String(item.quantity)}
                          onChange={e => setItemQtyStrings(prev => ({ ...prev, [item.productId]: e.target.value }))}
                          onFocus={e => e.target.select()}
                          onBlur={() => {
                            const str = itemQtyStrings[item.productId]
                            if (str !== undefined) {
                              const n = parseFloat(str)
                              if (!isNaN(n) && n > 0) setItemQty(item.productId, n)
                              setItemQtyStrings(prev => { const next = { ...prev }; delete next[item.productId]; return next })
                            }
                          }}
                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                          className={`w-14 text-center border rounded py-1 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-primary-500 ${overStock ? 'text-red-600 border-red-300' : 'text-gray-800 border-gray-200'}`}
                        />
                      </div>
                      <button onClick={() => removeTransferItem(item.productId)} className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded">
                        <XCircle size={16} />
                      </button>
                    </div>
                  )
                })
              )}
            </div>

            {/* Footer */}
            <div className="border-t p-3 flex items-center justify-between bg-gray-50 rounded-b-lg text-sm">
              <span className="text-gray-500">{transferItems.length} producto(s)</span>
              <span className="font-semibold text-gray-800">
                Q{transferItems.reduce((s, i) => s + i.totalCost, 0).toFixed(2)}
              </span>
            </div>
          </div>

          {/* RIGHT: Form */}
          <div className="w-full md:w-72 flex flex-col gap-3">

            {/* Branch selection */}
            <div className="bg-white rounded-lg shadow-sm p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
                <Building2 size={12} /> Tiendas
              </p>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Origen *</label>
                <select
                  value={fromStore}
                  onChange={e => setFromStore(e.target.value)}
                  className="input w-full"
                >
                  <option value="">-- Selecciona --</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Destino *</label>
                <select
                  value={toStore}
                  onChange={e => setToStore(e.target.value)}
                  className="input w-full"
                >
                  <option value="">-- Selecciona --</option>
                  {branches.filter(b => b.id !== fromStore).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>

            {/* Notes */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                Comentario
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Instrucciones o notas adicionales..."
                className="input w-full text-sm resize-none"
                rows={4}
              />
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <button
                onClick={handleCreateTransfer}
                disabled={saving || !fromStore || !toStore || transferItems.length === 0}
                className="btn-primary btn-md flex items-center justify-center gap-2 w-full disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving
                  ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  : <ArrowRight size={16} />}
                Crear Transferencia
              </button>
              <button
                onClick={() => { resetCreateForm(); setView('list') }}
                className="btn-outline btn-md w-full"
                disabled={saving}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>

        {/* Variation modal — adding fresh (changingItem null) only lists real
            variations (the base is already its own line); switching an
            existing line also offers "Pieza" so you can go back to the base. */}
        {showVariationModal && selectedProductForVariation && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full">
              <h3 className="text-lg font-bold text-gray-800 mb-1">
                {changingItem ? 'Cambiar presentación' : 'Agregar presentación'}
              </h3>
              <p className="text-sm text-gray-500 mb-4">{selectedProductForVariation.fullName ?? selectedProductForVariation.name}</p>
              <div className="space-y-2">
                {changingItem && (
                  <button
                    onMouseDown={() => {
                      switchItemVariation(changingItem.key, selectedProductForVariation, null, changingItem.quantity)
                      setShowVariationModal(false)
                      setSelectedProductForVariation(null)
                      setChangingItem(null)
                    }}
                    className="w-full flex items-center justify-between p-3 border rounded-lg hover:bg-primary-50 hover:border-primary-300 transition-colors text-left"
                  >
                    <span className="font-medium text-gray-800">Pieza</span>
                    <span className="text-xs text-gray-400">Unidad base</span>
                  </button>
                )}
                {(selectedProductForVariation.variations ?? []).map(v => (
                  <button
                    key={v.id}
                    onMouseDown={() => {
                      if (changingItem) {
                        switchItemVariation(changingItem.key, selectedProductForVariation, v, changingItem.quantity)
                      } else {
                        addTransferItem(selectedProductForVariation, v, 1)
                      }
                      setShowVariationModal(false)
                      setSelectedProductForVariation(null)
                      setChangingItem(null)
                    }}
                    className="w-full flex items-center justify-between p-3 border rounded-lg hover:bg-primary-50 hover:border-primary-300 transition-colors text-left"
                  >
                    <span className="font-medium text-gray-800">{v.name}</span>
                    <span className="text-xs text-gray-400">x{v.conversionFactor}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => { setShowVariationModal(false); setSelectedProductForVariation(null); setChangingItem(null) }}
                className="mt-4 w-full btn-outline btn-md"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Render: LIST VIEW ─────────────────────────────────────────────────────
  return (
    <>
    <div className="space-y-6 print:hidden">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <ArrowUpDown size={28} />
            Transferencias entre Tiendas
          </h1>
          <p className="text-gray-600 text-sm mt-1">
            Gestión de movimientos de productos entre sucursales
          </p>
        </div>

        <div className="flex gap-3">
          <button className="btn-outline btn-md flex items-center gap-2">
            <BarChart3 size={18} />
            Reporte
          </button>
          <button className="btn-outline btn-md flex items-center gap-2">
            <Download size={18} />
            Exportar
          </button>
          {canCreate && (
            <button
              onClick={() => setView('create')}
              className="btn-primary btn-md flex items-center gap-2"
            >
              <Plus size={18} />
              Nueva Transferencia
            </button>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
        </div>
      )}

      {/* Stats */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600 text-sm">Total Transferencias</span>
              <ArrowUpDown className="text-blue-600" size={20} />
            </div>
            <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
            <p className="text-xs text-gray-500 mt-1">Este mes</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600 text-sm">Pendientes</span>
              <Clock className="text-yellow-600" size={20} />
            </div>
            <p className="text-2xl font-bold text-gray-800">{stats.pending}</p>
            <p className="text-xs text-yellow-600 mt-1">Por enviar</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600 text-sm">En Tránsito</span>
              <Truck className="text-blue-600" size={20} />
            </div>
            <p className="text-2xl font-bold text-gray-800">{stats.inTransit}</p>
            <p className="text-xs text-blue-600 mt-1">En camino</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600 text-sm">Completadas</span>
              <CheckCircle className="text-green-600" size={20} />
            </div>
            <p className="text-2xl font-bold text-gray-800">{stats.completed}</p>
            <p className="text-xs text-green-600 mt-1">Recibidas</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600 text-sm">Valor Total</span>
              <Package className="text-purple-600" size={20} />
            </div>
            <p className="text-2xl font-bold text-gray-800">Q{stats.totalValue.toLocaleString()}</p>
            <p className="text-xs text-purple-600 mt-1">En transferencias</p>
          </motion.div>
        </div>
      )}

      {/* Filters */}
      {!loading && (
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Buscar por código o tienda..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input pl-10 w-full"
              />
            </div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="input"
            >
              <option value="all">Todos los estados</option>
              <option value="pending">Pendientes</option>
              <option value="approved">Aprobadas</option>
              <option value="in_transit">En tránsito</option>
              <option value="completed">Completadas</option>
              <option value="cancelled">Canceladas</option>
              <option value="rejected">Rechazadas</option>
            </select>
            <button className="btn-outline btn-md flex items-center gap-2">
              <Filter size={18} />
              Más filtros
              <ChevronDown size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Transfer list */}
      {!loading && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Código</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Origen</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Destino</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Items</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Valor</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Estado</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Fecha</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransfers.map((transfer) => {
                  const itemTotal = transfer.items.reduce((s, i) => s + i.totalCost, 0)
                  const value = transfer.totalValue ?? itemTotal
                  return (
                    <tr key={transfer.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <p className="font-medium text-gray-800">{transfer.code ?? transfer.id.slice(0, 8)}</p>
                        <p className="text-xs text-gray-500">Por: {transfer.requestedBy?.name ?? transfer.createdBy ?? '—'}</p>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Building2 size={16} className="text-gray-400" />
                          <span className="text-sm">{displayName(transfer, 'from')}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Building2 size={16} className="text-gray-400" />
                          <span className="text-sm">{displayName(transfer, 'to')}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="font-medium">{transfer.totalItems ?? transfer.items.length}</span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="font-medium">Q{value.toFixed(2)}</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(transfer.status)}`}>
                          {getStatusIcon(transfer.status)}
                          {getStatusLabel(transfer.status)}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-sm">{format(new Date(transfer.createdAt), "d MMM", { locale: es })}</p>
                        <p className="text-xs text-gray-500">{format(new Date(transfer.createdAt), "HH:mm", { locale: es })}</p>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => { setSelectedTransfer(transfer); setShowDetailsModal(true) }}
                            className="p-1 hover:bg-gray-100 rounded transition-colors"
                            title="Ver detalles"
                          >
                            <Eye size={18} className="text-gray-600" />
                          </button>
                          {canApprove && transfer.status === 'pending' && (
                            <button
                              onClick={() => handleApproveTransfer(transfer)}
                              className="p-1 hover:bg-blue-50 rounded transition-colors"
                              title="Aprobar"
                            >
                              <Truck size={18} className="text-blue-600" />
                            </button>
                          )}
                          {canReceive && (transfer.status === 'in_transit' || transfer.status === 'approved') && (
                            <button
                              onClick={() => handleReceiveTransfer(transfer)}
                              className="p-1 hover:bg-green-50 rounded transition-colors"
                              title="Confirmar recepción"
                            >
                              <CheckCircle size={18} className="text-green-600" />
                            </button>
                          )}
                          {canReject && (transfer.status === 'pending' || transfer.status === 'in_transit' || transfer.status === 'approved') && (
                            <button
                              onClick={() => {
                                if (confirm('¿Anular este traslado? Esto no se puede deshacer.')) handleRejectTransfer(transfer)
                              }}
                              className="p-1 hover:bg-red-50 rounded transition-colors"
                              title="Anular traslado"
                            >
                              <Ban size={18} className="text-red-500" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {filteredTransfers.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-gray-500">No se encontraron transferencias</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t">
              <p className="text-sm text-gray-600">Página {page} de {totalPages} · {totalCount} transferencias</p>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                  className="btn-outline btn-sm disabled:opacity-40 disabled:cursor-not-allowed">Anterior</button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                  className="btn-outline btn-sm disabled:opacity-40 disabled:cursor-not-allowed">Siguiente</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Details modal */}
      {showDetailsModal && selectedTransfer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-800">Detalles de Transferencia</h2>
              <button onClick={() => setShowDetailsModal(false)} className="p-1 hover:bg-gray-100 rounded transition-colors">
                <XCircle size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm text-gray-600">Código</p>
                  <p className="font-bold text-lg">{selectedTransfer.code ?? selectedTransfer.id.slice(0, 8)}</p>
                </div>
                <span className={`inline-flex items-center gap-1 px-3 py-1 text-sm font-medium rounded-full ${getStatusColor(selectedTransfer.status)}`}>
                  {getStatusIcon(selectedTransfer.status)}
                  {getStatusLabel(selectedTransfer.status)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Origen</p>
                  <div className="flex items-center gap-2">
                    <Building2 size={18} className="text-gray-400" />
                    <span className="font-medium">{displayName(selectedTransfer, 'from')}</span>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Destino</p>
                  <div className="flex items-center gap-2">
                    <Building2 size={18} className="text-gray-400" />
                    <span className="font-medium">{displayName(selectedTransfer, 'to')}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Creado por</p>
                  <p className="font-medium">{selectedTransfer.requestedBy?.name ?? selectedTransfer.createdBy ?? '—'}</p>
                  <p className="text-xs text-gray-500">
                    {format(new Date(selectedTransfer.createdAt), "d 'de' MMMM, HH:mm", { locale: es })}
                  </p>
                </div>
                {selectedTransfer.receivedBy && (
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Recibido por</p>
                    <p className="font-medium">{selectedTransfer.receivedBy.name}</p>
                    {selectedTransfer.receivedAt && (
                      <p className="text-xs text-gray-500">
                        {format(new Date(selectedTransfer.receivedAt), "d 'de' MMMM, HH:mm", { locale: es })}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {selectedTransfer.notes && (
                <div className="p-3 bg-yellow-50 rounded-lg">
                  <p className="text-sm font-medium text-yellow-900 mb-1">Notas</p>
                  <p className="text-sm text-yellow-800">{selectedTransfer.notes}</p>
                </div>
              )}

              <div>
                <h3 className="font-medium text-gray-800 mb-3">Productos Transferidos</h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left py-2 px-3 text-sm font-medium text-gray-700">Producto</th>
                        <th className="text-center py-2 px-3 text-sm font-medium text-gray-700">Cantidad</th>
                        <th className="text-right py-2 px-3 text-sm font-medium text-gray-700">Costo Unit.</th>
                        <th className="text-right py-2 px-3 text-sm font-medium text-gray-700">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTransfer.items.map((item, index) => (
                        <tr key={index} className="border-b">
                          <td className="py-2 px-3">
                            <p className="text-sm font-medium">{item.productName}</p>
                            <p className="text-xs text-gray-500">{item.productCode}</p>
                          </td>
                          <td className="py-2 px-3 text-center">{item.quantity}</td>
                          <td className="py-2 px-3 text-right">Q{item.unitCost.toFixed(2)}</td>
                          <td className="py-2 px-3 text-right font-medium">Q{item.totalCost.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td colSpan={3} className="py-2 px-3 text-right font-medium">Total:</td>
                        <td className="py-2 px-3 text-right font-bold">
                          Q{(selectedTransfer.totalValue ?? selectedTransfer.items.reduce((s, i) => s + i.totalCost, 0)).toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-4 mt-4 border-t">
              <button onClick={() => setShowDetailsModal(false)} className="btn-outline btn-md flex-1">Cerrar</button>
              <button onClick={() => handlePrintTransfer(selectedTransfer)} className="btn-outline btn-md flex items-center gap-2">
                <Printer size={16} /> Imprimir
              </button>
              {canReject && (selectedTransfer.status === 'pending' || selectedTransfer.status === 'in_transit' || selectedTransfer.status === 'approved') && (
                <button
                  onClick={() => {
                    if (confirm('¿Anular este traslado? Esto no se puede deshacer.')) handleRejectTransfer(selectedTransfer)
                  }}
                  className="btn-danger btn-md"
                >
                  Anular
                </button>
              )}
              {selectedTransfer.status === 'pending' && canApprove && (
                <button onClick={() => handleApproveTransfer(selectedTransfer)} className="btn-primary btn-md flex-1">
                  Aprobar Transferencia
                </button>
              )}
              {canReceive && (selectedTransfer.status === 'in_transit' || selectedTransfer.status === 'approved') && (
                <button onClick={() => handleReceiveTransfer(selectedTransfer)} className="btn-primary btn-md flex-1">
                  Confirmar Recepción
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>

    {/* Print-only checklist — a true sibling of the page (not nested inside
        it) so print:hidden on the page above fully collapses it for print
        instead of leaving its height reserved — same fix as ThermalReceipt/
        ThermalCashCloseReport. */}
    {printingTransfer && (
      <ThermalTransferSlip
        widthMm={currentStore?.receiptWidthMm ?? 55}
        data={{
          code: printingTransfer.code ?? printingTransfer.id.slice(0, 8),
          fromBranchName: displayName(printingTransfer, 'from'),
          toBranchName: displayName(printingTransfer, 'to'),
          createdAt: printingTransfer.createdAt,
          requestedByName: printingTransfer.requestedBy?.name ?? printingTransfer.createdBy,
          notes: printingTransfer.notes,
          logo: currentStore?.logo,
          companyName: currentStore?.companyName,
          items: printingTransfer.items.map(item => ({
            productName: item.productName,
            productCode: item.productCode,
            quantity: item.quantity,
            cost: item.unitCost,
            basePrice: item.basePrice,
          })),
        }}
      />
    )}
    </>
  )
}
