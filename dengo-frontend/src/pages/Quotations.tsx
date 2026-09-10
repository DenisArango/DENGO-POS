import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  Plus, Search, Eye, Trash2, Send, CheckCircle, XCircle,
  FileText, AlertCircle, X, ClipboardList,
  RefreshCw, Clock, DollarSign, ArrowLeft, Package,
  Minus, User
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { useAuthStore } from '../store'
import { useStore } from '../contexts/StoreContext'
import { usePermissions } from '../hooks/usePermissions'

// ─── Types ────────────────────────────────────────────────────────────────────
type QuotationStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CONVERTED'

interface Customer {
  id: string
  name: string
  nit?: string
  email?: string
  phone?: string
  isActive?: boolean
}

interface QuotationItem {
  id: string
  productId?: string
  productName?: string
  product?: { id: string; name: string }
  quantity: number
  unitPrice: number
  discount?: number
  total: number
}

interface Quotation {
  id: string
  quotationNumber: string
  customer: Customer
  customerId?: string
  branch?: { id: string; name: string }
  items: QuotationItem[]
  subtotal: number
  tax: number
  discount: number
  total: number
  status: QuotationStatus
  validUntil: string
  notes?: string
  createdAt: string
  updatedAt?: string
}

interface ProductOption {
  id: string
  name: string
  fullName?: string
  sku?: string
  barcode?: string
  basePrice?: number
}

interface DraftItem {
  id: string
  productId?: string
  productName: string
  quantity: number
  unitPrice: number
  discount: number
  subtotal: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<QuotationStatus, { label: string; color: string }> = {
  DRAFT:     { label: 'Borrador',   color: 'bg-gray-100 text-gray-700' },
  SENT:      { label: 'Enviada',    color: 'bg-blue-100 text-blue-700' },
  ACCEPTED:  { label: 'Aceptada',   color: 'bg-green-100 text-green-700' },
  REJECTED:  { label: 'Rechazada',  color: 'bg-red-100 text-red-700' },
  EXPIRED:   { label: 'Vencida',    color: 'bg-orange-100 text-orange-700' },
  CONVERTED: { label: 'Convertida', color: 'bg-purple-100 text-purple-700' },
}

function safeDate(value: any, fallback = '—'): string {
  try {
    const d = new Date(value)
    if (isNaN(d.getTime())) return fallback
    return format(d, "d MMM, yyyy", { locale: es })
  } catch { return fallback }
}

function safeDateLong(value: any, fallback = '—'): string {
  try {
    const d = new Date(value)
    if (isNaN(d.getTime())) return fallback
    return format(d, "d 'de' MMMM, yyyy – HH:mm", { locale: es })
  } catch { return fallback }
}

function StatusBadge({ status }: { status: QuotationStatus }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: 'bg-gray-100 text-gray-700' }
  const Icon = { DRAFT: FileText, SENT: Send, ACCEPTED: CheckCircle, REJECTED: XCircle, EXPIRED: Clock, CONVERTED: RefreshCw }[status] ?? FileText
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${cfg.color}`}>
      <Icon size={12} /> {cfg.label}
    </span>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Quotations() {
  const { user } = useAuthStore()
  const { currentStore } = useStore()
  const branchId = currentStore?.id ?? user?.branchId ?? ''
  const { hasPermission } = usePermissions()
  const canManage = hasPermission('quotations.create')
  const canConvert = hasPermission('quotations.convert')

  // View state
  const [view, setView] = useState<'list' | 'create'>('list')

  // List state
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null)

  // Create form state
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [quotationNotes, setQuotationNotes] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [discountPct, setDiscountPct] = useState(0)
  const [draftItems, setDraftItems] = useState<DraftItem[]>([])

  // Product search state
  const [posSearch, setPosSearch] = useState('')
  const [searchResults, setSearchResults] = useState<ProductOption[]>([])
  const [showSearchResults, setShowSearchResults] = useState(false)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Data fetching ──────────────────────────────────────────────────────────
  const fetchQuotations = () => {
    setLoading(true)
    api.get<Quotation[]>('/api/quotations')
      .then(setQuotations)
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchQuotations()
    api.get<Customer[]>('/api/customers')
      .then(list => setCustomers((list ?? []).filter(c => c.isActive !== false)))
      .catch(() => {})
  }, [])

  // ── Debounced product search ───────────────────────────────────────────────
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    if (!posSearch.trim()) { setSearchResults([]); setShowSearchResults(false); return }
    searchDebounceRef.current = setTimeout(() => performSearch(posSearch.trim()), 250)
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current) }
  }, [posSearch])

  async function performSearch(query: string) {
    try {
      const data = await api.get<ProductOption[]>(`/api/products?search=${encodeURIComponent(query)}&isActive=true`)
      const results = (data ?? []).slice(0, 8)
      setSearchResults(results)
      setShowSearchResults(results.length > 0)
    } catch {
      setSearchResults([])
      setShowSearchResults(false)
    }
  }

  // ── Create form helpers ────────────────────────────────────────────────────
  function handleSelectProduct(product: ProductOption) {
    setPosSearch('')
    setShowSearchResults(false)
    const price = Number(product.basePrice ?? 0)
    const name = product.fullName ?? product.name

    setDraftItems(prev => {
      const existing = prev.find(i => i.productId === product.id)
      if (existing) {
        return prev.map(i => i.productId === product.id
          ? { ...i, quantity: i.quantity + 1, subtotal: (i.quantity + 1) * i.unitPrice }
          : i
        )
      }
      return [...prev, {
        id: Math.random().toString(36).slice(2),
        productId: product.id,
        productName: name,
        quantity: 1,
        unitPrice: price,
        discount: 0,
        subtotal: price
      }]
    })
  }

  function updateItemField(id: string, field: keyof DraftItem, value: string | number) {
    setDraftItems(prev => prev.map(item => {
      if (item.id !== id) return item
      const updated = { ...item, [field]: value }
      if (field === 'productName') updated.productId = undefined
      updated.subtotal = updated.quantity * updated.unitPrice
      return updated
    }))
  }

  function updateItemQty(id: string, delta: number) {
    setDraftItems(prev => prev.map(item => {
      if (item.id !== id) return item
      const newQty = Math.max(1, item.quantity + delta)
      return { ...item, quantity: newQty, subtotal: newQty * item.unitPrice }
    }))
  }

  function removeItem(id: string) {
    setDraftItems(prev => prev.filter(i => i.id !== id))
  }

  function resetCreateForm() {
    setSelectedCustomerId('')
    setQuotationNotes('')
    setValidUntil('')
    setDiscountPct(0)
    setDraftItems([])
    setPosSearch('')
    setSearchResults([])
    setShowSearchResults(false)
  }

  const itemsSubtotal = draftItems.reduce((s, i) => s + i.subtotal, 0)
  const discountAmount = itemsSubtotal * (discountPct / 100)
  const afterDiscount = itemsSubtotal - discountAmount
  const taxAmount = afterDiscount * 0.12
  const grandTotal = afterDiscount + taxAmount

  const handleCreateQuotation = (saveAsDraft: boolean) => {
    if (!selectedCustomerId) { toast.error('Selecciona un cliente'); return }
    if (!branchId) { toast.error('No hay sucursal seleccionada'); return }
    const validItems = draftItems.filter(i => i.productId)
    if (validItems.length === 0) { toast.error('Agrega al menos un producto del catálogo'); return }
    if (!validUntil) { toast.error('Indica la fecha de validez'); return }

    setSaving(true)
    api.post('/api/quotations', {
      branchId,
      customerId: selectedCustomerId,
      subtotal: itemsSubtotal,
      tax: taxAmount,
      discount: discountAmount,
      total: grandTotal,
      validUntil,
      notes: quotationNotes || undefined,
      items: validItems.map(i => ({
        productId: i.productId!,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discount: 0,
        total: i.subtotal,
      })),
    })
      .then(() => {
        toast.success(saveAsDraft ? 'Cotización guardada como borrador' : 'Cotización enviada')
        resetCreateForm()
        setView('list')
        fetchQuotations()
      })
      .catch(e => toast.error(e.message))
      .finally(() => setSaving(false))
  }

  // ── Status transitions ─────────────────────────────────────────────────────
  const transitionStatus = (id: string, action: string, successMsg: string) => {
    api.put(`/api/quotations/${id}/${action}`, {})
      .then(() => { toast.success(successMsg); setShowDetailsModal(false); fetchQuotations() })
      .catch(e => toast.error(e.message))
  }

  const handleSend    = (id: string) => transitionStatus(id, 'send', 'Cotización marcada como enviada')
  const handleAccept  = (id: string) => transitionStatus(id, 'accept', 'Cotización aceptada')
  const handleReject  = (id: string) => transitionStatus(id, 'reject', 'Cotización rechazada')

  // Convert uses POST not PUT
  const handleConvert = (id: string) => {
    api.post(`/api/quotations/${id}/convert`, { paymentMethod: 'CASH' })
      .then(() => { toast.success('Cotización convertida a venta exitosamente'); setShowDetailsModal(false); fetchQuotations() })
      .catch(e => toast.error(e.message))
  }

  const handleDelete = (id: string) => {
    api.delete(`/api/quotations/${id}`)
      .then(() => { toast.success('Cotización eliminada'); setShowDeleteConfirm(null); setShowDetailsModal(false); fetchQuotations() })
      .catch(e => toast.error(e.message))
  }

  const filteredQuotations = quotations.filter(q => {
    const matchSearch =
      (q.quotationNumber ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (q.customer?.name ?? '').toLowerCase().includes(searchTerm.toLowerCase())
    const matchStatus = filterStatus === 'all' || q.status === filterStatus
    return matchSearch && matchStatus
  })

  const stats = {
    total: quotations.length,
    draft: quotations.filter(q => q.status === 'DRAFT').length,
    sent: quotations.filter(q => q.status === 'SENT').length,
    accepted: quotations.filter(q => q.status === 'ACCEPTED').length,
    rejected: quotations.filter(q => q.status === 'REJECTED' || q.status === 'EXPIRED').length,
  }

  // ── CREATE VIEW ────────────────────────────────────────────────────────────
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
            <h1 className="text-lg font-bold text-gray-800">Nueva Cotización</h1>
            <p className="text-xs text-gray-500">
              {draftItems.length > 0
                ? `${draftItems.length} producto(s) · Q${grandTotal.toFixed(2)}`
                : 'Sin productos agregados'}
            </p>
          </div>
        </div>

        {/* Split layout */}
        <div className="flex flex-col md:flex-row gap-3 flex-1 overflow-auto md:overflow-hidden md:min-h-0">

          {/* LEFT: Product search + items */}
          <div className="flex-1 bg-white rounded-lg shadow-sm flex flex-col min-h-[280px] md:min-h-0">

            {/* Search bar */}
            <div className="p-3 border-b relative">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Buscar producto por nombre, código o SKU..."
                value={posSearch}
                onChange={e => setPosSearch(e.target.value)}
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
                        <p className="text-xs text-gray-400">{p.barcode ?? p.sku ?? ''}</p>
                      </div>
                      <span className="text-sm font-semibold text-primary-600 ml-3 flex-shrink-0">
                        Q{Number(p.basePrice ?? 0).toFixed(2)}
                      </span>
                    </div>
                  )) : (
                    <p className="px-3 py-3 text-sm text-gray-500 text-center">Sin resultados para "{posSearch}"</p>
                  )}
                </div>
              )}
            </div>

            {/* Column headers */}
            <div className="grid px-4 py-2 border-b bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide"
              style={{ gridTemplateColumns: '1fr 110px 100px 80px 28px' }}>
              <span>Producto</span>
              <span className="text-center">Cantidad</span>
              <span className="text-right">Precio Unit.</span>
              <span className="text-right">Subtotal</span>
              <span></span>
            </div>

            {/* Items list */}
            <div className="flex-1 overflow-y-auto">
              {draftItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 py-16">
                  <Package size={48} className="mb-3 opacity-30" />
                  <p className="text-sm text-center">Busca un producto por nombre o código de barras<br/>para agregarlo a la cotización</p>
                </div>
              ) : (
                draftItems.map(item => (
                  <div
                    key={item.id}
                    className="grid items-center px-4 py-3 border-b hover:bg-gray-50"
                    style={{ gridTemplateColumns: '1fr 110px 100px 80px 28px' }}
                  >
                    {/* Product name */}
                    <div>
                      <p className="text-sm font-medium text-gray-800 truncate">{item.productName}</p>
                    </div>

                    {/* Quantity */}
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => updateItemQty(item.id, -1)} className="p-1 rounded hover:bg-gray-200 text-gray-500">
                        <Minus size={13} />
                      </button>
                      <span className="w-8 text-center font-semibold text-sm">{item.quantity}</span>
                      <button onClick={() => updateItemQty(item.id, 1)} className="p-1 rounded hover:bg-gray-200 text-gray-500">
                        <Plus size={13} />
                      </button>
                    </div>

                    {/* Unit price */}
                    <div className="flex items-center justify-end">
                      <span className="text-xs text-gray-400 mr-1">Q</span>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={item.unitPrice === 0 ? '' : item.unitPrice}
                        onChange={e => updateItemField(item.id, 'unitPrice', Number(e.target.value))}
                        className="input text-sm text-right w-20 py-1"
                      />
                    </div>

                    {/* Subtotal */}
                    <p className="text-right text-sm font-semibold text-gray-800">Q{item.subtotal.toFixed(2)}</p>

                    {/* Remove */}
                    <button onClick={() => removeItem(item.id)} className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded">
                      <XCircle size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="border-t p-3 flex items-center justify-between bg-gray-50 rounded-b-lg">
              <span className="text-xs text-gray-500">{draftItems.length} producto(s)</span>
              <span className="text-sm font-semibold text-gray-800">Q{itemsSubtotal.toFixed(2)}</span>
            </div>
          </div>

          {/* RIGHT: Form */}
          <div className="w-full md:w-80 flex flex-col gap-3 overflow-y-auto">

            {/* Customer */}
            <div className="bg-white rounded-lg shadow-sm p-5 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
                <User size={12} /> Cliente
              </p>
              <select
                value={selectedCustomerId}
                onChange={e => setSelectedCustomerId(e.target.value)}
                className="input w-full"
              >
                <option value="">-- Selecciona un cliente --</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {customers.length === 0 && (
                <p className="text-xs text-orange-600">No hay clientes. Agrégalos en la sección Clientes.</p>
              )}
            </div>

            {/* Dates & Discount */}
            <div className="bg-white rounded-lg shadow-sm p-5 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Detalles</p>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Válida hasta *</label>
                <input
                  type="date"
                  value={validUntil}
                  onChange={e => setValidUntil(e.target.value)}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Descuento global (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={discountPct}
                  onChange={e => setDiscountPct(Number(e.target.value))}
                  className="input w-full"
                />
              </div>
            </div>

            {/* Notes */}
            <div className="bg-white rounded-lg shadow-sm p-5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                Notas / Condiciones
              </label>
              <textarea
                value={quotationNotes}
                onChange={e => setQuotationNotes(e.target.value)}
                placeholder="Condiciones de pago, términos, observaciones..."
                className="input w-full text-sm resize-none"
                rows={4}
              />
            </div>

            {/* Totals */}
            <div className="bg-white rounded-lg shadow-sm p-5 space-y-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal:</span>
                <span>Q{itemsSubtotal.toFixed(2)}</span>
              </div>
              {discountPct > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Descuento ({discountPct}%):</span>
                  <span>-Q{discountAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-gray-600">
                <span>IVA (12%):</span>
                <span>Q{taxAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-base border-t pt-2 mt-1">
                <span>Total:</span>
                <span className="text-primary-700">Q{grandTotal.toFixed(2)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleCreateQuotation(false)}
                disabled={saving || !selectedCustomerId || draftItems.length === 0 || !validUntil}
                className="btn-primary btn-md flex items-center justify-center gap-2 w-full disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving
                  ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  : <Send size={16} />}
                Enviar Cotización
              </button>
              <button
                onClick={() => handleCreateQuotation(true)}
                disabled={saving || !selectedCustomerId || draftItems.length === 0 || !validUntil}
                className="btn-outline btn-md flex items-center justify-center gap-2 w-full disabled:opacity-50"
              >
                <FileText size={16} /> Guardar Borrador
              </button>
              <button
                onClick={() => { resetCreateForm(); setView('list') }}
                className="btn-outline btn-md w-full text-gray-500"
                disabled={saving}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── LIST VIEW ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <ClipboardList size={28} />
            Cotizaciones
          </h1>
          <p className="text-gray-600 text-sm mt-1">Gestiona cotizaciones para tus clientes</p>
        </div>
        {canManage && (
          <button onClick={() => setView('create')} className="btn-primary btn-md flex items-center gap-2">
            <Plus size={20} /> Nueva Cotización
          </button>
        )}
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
          {[
            { label: 'Total', value: stats.total, color: 'blue', Icon: ClipboardList },
            { label: 'Borrador', value: stats.draft, color: 'gray', Icon: FileText },
            { label: 'Enviadas', value: stats.sent, color: 'blue', Icon: Send },
            { label: 'Aceptadas', value: stats.accepted, color: 'green', Icon: CheckCircle },
            { label: 'Rechaz./Venc.', value: stats.rejected, color: 'red', Icon: XCircle },
          ].map(({ label, value, color, Icon }) => (
            <motion.div key={label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-lg shadow-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-600 text-sm">{label}</span>
                <div className={`p-2 bg-${color}-100 rounded-lg`}>
                  <Icon className={`text-${color}-600`} size={18} />
                </div>
              </div>
              <p className={`text-2xl font-bold text-${color}-600`}>{value}</p>
            </motion.div>
          ))}
        </div>
      )}

      {/* Filters */}
      {!loading && (
        <div className="bg-white rounded-lg shadow-sm p-4 flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text" placeholder="Buscar por número de cotización o cliente…"
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="input pl-10 w-full"
            />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input">
            <option value="all">Todos los estados</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* List */}
      {!loading && (
        filteredQuotations.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <ClipboardList size={48} className="mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600 mb-4">
              {searchTerm || filterStatus !== 'all' ? 'Sin resultados' : 'No hay cotizaciones registradas'}
            </p>
            {!searchTerm && filterStatus === 'all' && (
              <button onClick={() => setView('create')} className="btn-primary btn-md">
                Crear Primera Cotización
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    {['Cotización', 'Cliente', 'Fecha', 'Válida hasta', 'Items', 'Total', 'Estado', 'Acciones'].map(h => (
                      <th key={h} className="text-left p-4 text-sm font-semibold text-gray-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredQuotations.map(quotation => (
                    <motion.tr key={quotation.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="hover:bg-gray-50">
                      <td className="p-4 font-mono text-sm text-gray-600">{quotation.quotationNumber}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-gray-100 rounded-lg"><User size={14} className="text-gray-500" /></div>
                          <span className="text-sm font-medium">{quotation.customer?.name ?? '—'}</span>
                        </div>
                      </td>
                      <td className="p-4 text-sm text-gray-700">{safeDate(quotation.createdAt)}</td>
                      <td className="p-4 text-sm text-gray-700">{safeDate(quotation.validUntil)}</td>
                      <td className="p-4 text-sm text-gray-700">{Array.isArray(quotation.items) ? quotation.items.length : 0} productos</td>
                      <td className="p-4 font-semibold text-gray-800">
                        Q{Number(quotation.total ?? 0).toFixed(2)}
                      </td>
                      <td className="p-4"><StatusBadge status={quotation.status} /></td>
                      <td className="p-4">
                        <div className="flex gap-1">
                          <button
                            onClick={() => { setSelectedQuotation(quotation); setShowDetailsModal(true) }}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="Ver detalles">
                            <Eye size={16} />
                          </button>
                          {canManage && quotation.status === 'DRAFT' && (
                            <button onClick={() => handleSend(quotation.id)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="Enviar al cliente">
                              <Send size={16} />
                            </button>
                          )}
                          {canManage && quotation.status === 'SENT' && (
                            <>
                              <button onClick={() => handleAccept(quotation.id)}
                                className="p-2 text-green-600 hover:bg-green-50 rounded-lg" title="Aceptada">
                                <CheckCircle size={16} />
                              </button>
                              <button onClick={() => handleReject(quotation.id)}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg" title="Rechazada">
                                <XCircle size={16} />
                              </button>
                            </>
                          )}
                          {canConvert && quotation.status === 'ACCEPTED' && (
                            <button onClick={() => handleConvert(quotation.id)}
                              className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg" title="Convertir a venta">
                              <DollarSign size={16} />
                            </button>
                          )}
                          {canManage && (
                            <button onClick={() => setShowDeleteConfirm(quotation.id)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg" title="Eliminar">
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* DETAILS MODAL */}
      {showDetailsModal && selectedQuotation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">

            <div className="p-6 border-b flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Cotización #{selectedQuotation.quotationNumber}</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {safeDateLong(selectedQuotation.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={selectedQuotation.status} />
                <button onClick={() => setShowDetailsModal(false)} className="p-1 hover:bg-gray-100 rounded"><X size={20} /></button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded-lg p-4 text-sm">
                <div><p className="text-gray-500">Cliente</p><p className="font-medium">{selectedQuotation.customer?.name}</p></div>
                <div><p className="text-gray-500">NIT</p><p className="font-medium">{selectedQuotation.customer?.nit || '—'}</p></div>
                <div><p className="text-gray-500">Sucursal</p><p className="font-medium">{selectedQuotation.branch?.name ?? '—'}</p></div>
                <div>
                  <p className="text-gray-500">Válida hasta</p>
                  <p className="font-medium">{safeDate(selectedQuotation.validUntil)}</p>
                </div>
              </div>

              <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-3 font-medium text-gray-600">Descripción</th>
                    <th className="text-right p-3 font-medium text-gray-600">Cant.</th>
                    <th className="text-right p-3 font-medium text-gray-600">Precio Unit.</th>
                    <th className="text-right p-3 font-medium text-gray-600">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(selectedQuotation.items ?? []).map(item => (
                    <tr key={item.id}>
                      <td className="p-3">{item.product?.name ?? item.productName ?? '—'}</td>
                      <td className="p-3 text-right">{Number(item.quantity ?? 0)}</td>
                      <td className="p-3 text-right">Q{Number(item.unitPrice ?? 0).toFixed(2)}</td>
                      <td className="p-3 text-right font-semibold">Q{Number(item.total ?? 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-end">
                <div className="w-56 space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-gray-600">Subtotal:</span><span>Q{Number(selectedQuotation.subtotal ?? 0).toFixed(2)}</span></div>
                  {Number(selectedQuotation.discount ?? 0) > 0 && (
                    <div className="flex justify-between text-red-600"><span>Descuento:</span><span>-Q{Number(selectedQuotation.discount ?? 0).toFixed(2)}</span></div>
                  )}
                  <div className="flex justify-between"><span className="text-gray-600">IVA (12%):</span><span>Q{Number(selectedQuotation.tax ?? 0).toFixed(2)}</span></div>
                  <div className="flex justify-between font-bold text-base border-t pt-1"><span>Total:</span><span>Q{Number(selectedQuotation.total ?? 0).toFixed(2)}</span></div>
                </div>
              </div>

              {selectedQuotation.notes && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
                  <strong className="text-yellow-900">Notas: </strong>{selectedQuotation.notes}
                </div>
              )}
            </div>

            <div className="p-6 border-t flex gap-3 justify-end flex-wrap">
              <button onClick={() => setShowDetailsModal(false)} className="btn-secondary btn-md">Cerrar</button>
              {canManage && selectedQuotation.status === 'DRAFT' && (
                <>
                  <button onClick={() => handleSend(selectedQuotation.id)} className="btn-primary btn-md flex items-center gap-2">
                    <Send size={16} /> Enviar al Cliente
                  </button>
                  <button onClick={() => setShowDeleteConfirm(selectedQuotation.id)} className="btn-danger btn-md flex items-center gap-2">
                    <Trash2 size={16} /> Eliminar
                  </button>
                </>
              )}
              {canManage && selectedQuotation.status === 'SENT' && (
                <>
                  <button onClick={() => handleReject(selectedQuotation.id)}
                    className="btn-outline btn-md flex items-center gap-2 text-red-600 border-red-300 hover:bg-red-50">
                    <XCircle size={16} /> Rechazada
                  </button>
                  <button onClick={() => handleAccept(selectedQuotation.id)} className="btn-primary btn-md flex items-center gap-2">
                    <CheckCircle size={16} /> Aceptada
                  </button>
                </>
              )}
              {canConvert && selectedQuotation.status === 'ACCEPTED' && (
                <button onClick={() => handleConvert(selectedQuotation.id)} className="btn-primary btn-md flex items-center gap-2">
                  <DollarSign size={16} /> Convertir a Venta
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* DELETE CONFIRM */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-red-100 rounded-full"><AlertCircle className="text-red-600" size={24} /></div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-800 mb-2">Eliminar Cotización</h3>
                <p className="text-gray-600 mb-6">¿Seguro que deseas eliminar esta cotización? Esta acción no puede deshacerse.</p>
                <div className="flex gap-3 justify-end">
                  <button onClick={() => setShowDeleteConfirm(null)} className="btn-secondary btn-md">Cancelar</button>
                  <button onClick={() => handleDelete(showDeleteConfirm)} className="btn-danger btn-md">Eliminar</button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
