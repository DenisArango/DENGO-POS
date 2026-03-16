import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Search, Package, TrendingUp, Clock, CheckCircle, XCircle,
  Eye, Trash2, AlertCircle, PackageCheck, FileText, Truck, X,
  Minus, Send, RotateCcw, ArrowLeft, ChevronDown
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { useAuthStore } from '../store'

// ─── Types ───────────────────────────────────────────────────────────────────
type PurchaseStatus = 'DRAFT' | 'PENDING' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED'

interface Supplier {
  id: string
  name: string
  contactName?: string
  phone?: string
  isActive?: boolean
}

interface PurchaseOrderItem {
  id: string
  productId?: string
  productName: string
  quantity: number
  receivedQuantity?: number
  unitCost: number
  total: number
}

interface PurchaseOrder {
  id: string
  orderNumber: string
  supplier: Supplier
  supplierId?: string
  branchId?: string
  branch?: { id: string; name: string }
  items: PurchaseOrderItem[]
  subtotal: number
  tax: number
  total: number
  status: PurchaseStatus
  expectedDate?: string
  receivedDate?: string
  notes?: string
  createdAt: string
  updatedAt?: string
}

interface DraftItem {
  id: string
  productName: string
  quantity: number
  unitCost: number
  total: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<PurchaseStatus, { label: string; color: string }> = {
  DRAFT:     { label: 'Borrador',  color: 'bg-gray-100 text-gray-700' },
  PENDING:   { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-700' },
  PARTIAL:   { label: 'Parcial',   color: 'bg-blue-100 text-blue-700' },
  RECEIVED:  { label: 'Recibido',  color: 'bg-green-100 text-green-700' },
  CANCELLED: { label: 'Cancelado', color: 'bg-red-100 text-red-700' },
}

function StatusBadge({ status }: { status: PurchaseStatus }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: 'bg-gray-100 text-gray-700' }
  const Icon = {
    DRAFT: FileText, PENDING: Clock, PARTIAL: Package,
    RECEIVED: CheckCircle, CANCELLED: XCircle,
  }[status] ?? FileText
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${cfg.color}`}>
      <Icon size={12} /> {cfg.label}
    </span>
  )
}

const BRANCH_ID = 'branch-001'

// ─── Component ────────────────────────────────────────────────────────────────
export default function Purchases() {
  const { user } = useAuthStore()

  const [purchases, setPurchases] = useState<PurchaseOrder[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [view, setView] = useState<'list' | 'create'>('list')
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [showReceiveModal, setShowReceiveModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)
  const [selectedPurchase, setSelectedPurchase] = useState<PurchaseOrder | null>(null)

  // Create form state
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [orderNotes, setOrderNotes] = useState('')
  const [expectedDate, setExpectedDate] = useState('')
  const [draftItems, setDraftItems] = useState<DraftItem[]>([
    { id: crypto.randomUUID(), productName: '', quantity: 1, unitCost: 0, total: 0 }
  ])

  // Receive modal state
  const [receivedQtys, setReceivedQtys] = useState<Record<string, number>>({})

  // ── Load data ─────────────────────────────────────────────────────────────
  const fetchPurchases = () => {
    setLoading(true)
    api.get<PurchaseOrder[]>('/api/purchases')
      .then(setPurchases)
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchPurchases()
    api.get<Supplier[]>('/api/suppliers')
      .then(setSuppliers)
      .catch(e => toast.error(e.message))
  }, [])

  // ── Derived ───────────────────────────────────────────────────────────────
  const filteredPurchases = purchases.filter(p => {
    const matchSearch =
      (p.orderNumber ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.supplier?.name ?? '').toLowerCase().includes(searchTerm.toLowerCase())
    const matchStatus = filterStatus === 'all' || p.status === filterStatus
    return matchSearch && matchStatus
  })

  const stats = {
    total: purchases.length,
    pending: purchases.filter(p => p.status === 'PENDING').length,
    received: purchases.filter(p => p.status === 'RECEIVED').length,
    totalAmount: purchases.reduce((s, p) => s + (p.total ?? 0), 0),
  }

  const draftSubtotal = draftItems.reduce((s, i) => s + i.total, 0)
  const draftTax = draftSubtotal * 0.12
  const draftTotal = draftSubtotal + draftTax

  const selectedSupplier = suppliers.find(s => s.id === selectedSupplierId)

  // ── Draft item helpers ────────────────────────────────────────────────────
  const addDraftItem = () =>
    setDraftItems(prev => [...prev, { id: crypto.randomUUID(), productName: '', quantity: 1, unitCost: 0, total: 0 }])

  const removeDraftItem = (id: string) =>
    setDraftItems(prev => prev.filter(i => i.id !== id))

  const updateDraftItem = (id: string, field: keyof DraftItem, value: string | number) =>
    setDraftItems(prev => prev.map(item => {
      if (item.id !== id) return item
      const updated = { ...item, [field]: value }
      updated.total = updated.quantity * updated.unitCost
      return updated
    }))

  const resetCreateForm = () => {
    setSelectedSupplierId('')
    setOrderNotes('')
    setExpectedDate('')
    setDraftItems([{ id: crypto.randomUUID(), productName: '', quantity: 1, unitCost: 0, total: 0 }])
  }

  // ── Create order ──────────────────────────────────────────────────────────
  const handleCreateOrder = (saveAsDraft: boolean) => {
    if (!selectedSupplierId) { toast.error('Selecciona un proveedor'); return }
    const validItems = draftItems.filter(i => i.productName.trim())
    if (validItems.length === 0) { toast.error('Agrega al menos un producto'); return }

    setSaving(true)
    api.post('/api/purchases', {
      supplierId: selectedSupplierId,
      branchId: BRANCH_ID,
      items: validItems.map(i => ({
        productName: i.productName,
        quantity: i.quantity,
        unitCost: i.unitCost,
        total: i.total,
      })),
      notes: orderNotes || undefined,
      expectedDate: expectedDate || undefined,
      status: saveAsDraft ? 'DRAFT' : 'PENDING',
    })
      .then(() => {
        toast.success(saveAsDraft ? 'Orden guardada como borrador' : 'Orden enviada al proveedor')
        resetCreateForm()
        setView('list')
        fetchPurchases()
      })
      .catch(e => toast.error(e.message))
      .finally(() => setSaving(false))
  }

  // ── Receive merchandise ───────────────────────────────────────────────────
  const openReceiveModal = (purchase: PurchaseOrder) => {
    const initialQtys: Record<string, number> = {}
    purchase.items.forEach(item => { initialQtys[item.id] = item.quantity })
    setReceivedQtys(initialQtys)
    setSelectedPurchase(purchase)
    setShowReceiveModal(true)
    setShowDetailsModal(false)
  }

  const handleConfirmReceive = () => {
    if (!selectedPurchase) return
    const hasAny = selectedPurchase.items.some(i => (receivedQtys[i.id] ?? 0) > 0)
    if (!hasAny) { toast.error('Ingresa las cantidades recibidas'); return }

    setSaving(true)
    api.patch(`/api/purchases/${selectedPurchase.id}/receive`, {
      items: selectedPurchase.items.map(item => ({
        id: item.id,
        receivedQuantity: receivedQtys[item.id] ?? 0,
      })),
      receivedById: user?.id,
    })
      .then(() => {
        const allFull = selectedPurchase.items.every(i => (receivedQtys[i.id] ?? 0) >= i.quantity)
        toast.success(allFull ? 'Mercancía recibida completa. Inventario actualizado.' : 'Recepción parcial guardada.')
        setShowReceiveModal(false)
        fetchPurchases()
      })
      .catch(e => toast.error(e.message))
      .finally(() => setSaving(false))
  }

  const handleCancelOrder = (id: string) => {
    api.patch(`/api/purchases/${id}/cancel`, {})
      .then(() => {
        toast.success('Orden cancelada')
        setShowDetailsModal(false)
        fetchPurchases()
      })
      .catch(e => toast.error(e.message))
  }

  const handleDelete = (id: string) => {
    api.delete(`/api/purchases/${id}`)
      .then(() => {
        toast.success('Orden eliminada')
        setShowDeleteConfirm(null)
        fetchPurchases()
      })
      .catch(e => toast.error(e.message))
  }

  // ── Render: CREATE VIEW ───────────────────────────────────────────────────
  if (view === 'create') {
    return (
      <div className="flex flex-col gap-3 h-[calc(100vh-7rem)]">

        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => { resetCreateForm(); setView('list') }}
            className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-lg font-bold text-gray-800">Nueva Orden de Compra</h1>
            <p className="text-xs text-gray-500">
              {selectedSupplier ? selectedSupplier.name : 'Sin proveedor seleccionado'}
              {draftItems.filter(i => i.productName.trim()).length > 0 &&
                ` · ${draftItems.filter(i => i.productName.trim()).length} producto(s)`}
            </p>
          </div>
        </div>

        {/* Split layout */}
        <div className="flex gap-3 flex-1 min-h-0">

          {/* LEFT: Items table */}
          <div className="flex-1 bg-white rounded-lg shadow-sm flex flex-col min-h-0">

            {/* Table header */}
            <div className="grid items-center px-4 py-2 border-b bg-gray-50 rounded-t-lg text-xs font-semibold text-gray-500 uppercase tracking-wide"
              style={{ gridTemplateColumns: '1fr 100px 130px 90px 32px' }}>
              <span>Producto / Descripción</span>
              <span className="text-right">Cantidad</span>
              <span className="text-right">Costo Unit.</span>
              <span className="text-right">Total</span>
              <span></span>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto">
              <AnimatePresence>
                {draftItems.map((item, index) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="grid items-center px-4 py-2 border-b border-gray-100 hover:bg-gray-50 group"
                    style={{ gridTemplateColumns: '1fr 100px 130px 90px 32px' }}
                  >
                    <div className="flex items-center gap-2 pr-3">
                      <span className="text-xs text-gray-400 w-4 text-right flex-shrink-0">{index + 1}</span>
                      <input
                        type="text"
                        value={item.productName}
                        onChange={e => updateDraftItem(item.id, 'productName', e.target.value)}
                        placeholder="Nombre del producto..."
                        className="input text-sm w-full py-1.5"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => updateDraftItem(item.id, 'quantity', Math.max(1, item.quantity - 1))}
                        className="p-1 rounded hover:bg-gray-200 text-gray-500"
                      >
                        <Minus size={12} />
                      </button>
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={e => updateDraftItem(item.id, 'quantity', Math.max(1, Number(e.target.value)))}
                        className="input text-sm text-center w-12 py-1.5 px-1"
                      />
                      <button
                        onClick={() => updateDraftItem(item.id, 'quantity', item.quantity + 1)}
                        className="p-1 rounded hover:bg-gray-200 text-gray-500"
                      >
                        <Plus size={12} />
                      </button>
                    </div>

                    <div className="flex items-center justify-end">
                      <span className="text-xs text-gray-400 mr-1">Q</span>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={item.unitCost}
                        onChange={e => updateDraftItem(item.id, 'unitCost', Number(e.target.value))}
                        className="input text-sm text-right w-24 py-1.5"
                      />
                    </div>

                    <div className="text-right font-semibold text-gray-800 text-sm">
                      Q{item.total.toFixed(2)}
                    </div>

                    <div className="flex justify-center">
                      {draftItems.length > 1 && (
                        <button
                          onClick={() => removeDraftItem(item.id)}
                          className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="border-t p-3 flex items-center justify-between bg-gray-50 rounded-b-lg">
              <button
                onClick={addDraftItem}
                className="btn-outline btn-sm flex items-center gap-1.5"
              >
                <Plus size={14} /> Agregar producto
              </button>
              <div className="text-sm text-gray-600">
                Subtotal: <span className="font-semibold text-gray-800">Q{draftSubtotal.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* RIGHT: Order panel */}
          <div className="w-72 flex flex-col gap-3">

            {/* Supplier card */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                <Truck size={12} /> Proveedor
              </p>
              <div className="relative">
                <select
                  value={selectedSupplierId}
                  onChange={e => setSelectedSupplierId(e.target.value)}
                  className="input w-full pr-8 appearance-none"
                >
                  <option value="">-- Selecciona --</option>
                  {suppliers.filter(s => s.isActive !== false).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
              {selectedSupplier && (
                <div className="mt-2 text-xs text-gray-500 space-y-0.5">
                  {selectedSupplier.contactName && <p>{selectedSupplier.contactName}</p>}
                  {selectedSupplier.phone && <p>{selectedSupplier.phone}</p>}
                </div>
              )}
              {suppliers.length === 0 && (
                <p className="text-xs text-orange-600 mt-1">Sin proveedores. Agrégalos en Proveedores.</p>
              )}
            </div>

            {/* Date & Notes */}
            <div className="bg-white rounded-lg shadow-sm p-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                  Entrega estimada
                </label>
                <input
                  type="date"
                  value={expectedDate}
                  onChange={e => setExpectedDate(e.target.value)}
                  className="input w-full text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                  Notas
                </label>
                <textarea
                  value={orderNotes}
                  onChange={e => setOrderNotes(e.target.value)}
                  placeholder="Instrucciones, condiciones de pago..."
                  className="input w-full text-sm resize-none"
                  rows={3}
                />
              </div>
            </div>

            {/* Totals */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>Q{draftSubtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>IVA (12%)</span>
                  <span>Q{draftTax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg border-t pt-2 text-gray-800">
                  <span>Total</span>
                  <span>Q{draftTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleCreateOrder(false)}
                disabled={saving}
                className="btn-primary btn-md flex items-center justify-center gap-2 w-full"
              >
                {saving ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <Send size={16} />}
                Enviar Orden
              </button>
              <button
                onClick={() => handleCreateOrder(true)}
                disabled={saving}
                className="btn-outline btn-md flex items-center justify-center gap-2 w-full"
              >
                <FileText size={16} /> Guardar Borrador
              </button>
              <button
                onClick={() => { resetCreateForm(); setView('list') }}
                className="btn-secondary btn-sm w-full"
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

  // ── Render: LIST VIEW ─────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Compras y Recepción</h1>
          <p className="text-gray-600 mt-1">Crea órdenes de compra y registra la entrada de mercancía</p>
        </div>
        <button onClick={() => setView('create')} className="btn-primary btn-md flex items-center gap-2">
          <Plus size={20} /> Nueva Orden de Compra
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
        </div>
      )}

      {/* Stats */}
      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Órdenes', value: stats.total, color: 'blue', Icon: Package },
            { label: 'Pendientes', value: stats.pending, color: 'yellow', Icon: Clock },
            { label: 'Recibidas', value: stats.received, color: 'green', Icon: CheckCircle },
            { label: 'Monto Total', value: `Q${stats.totalAmount.toLocaleString()}`, color: 'primary', Icon: TrendingUp },
          ].map(({ label, value, color, Icon }) => (
            <div key={label} className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">{label}</p>
                  <p className={`text-2xl font-bold mt-1 text-${color === 'primary' ? 'gray-800' : `${color}-600`}`}>{value}</p>
                </div>
                <div className={`p-3 bg-${color}-100 rounded-lg`}>
                  <Icon className={`text-${color}-600`} size={24} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      {!loading && (
        <div className="bg-white rounded-lg shadow-sm p-4 flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text" placeholder="Buscar por orden o proveedor…"
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
        filteredPurchases.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <PackageCheck size={48} className="mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600">
              {searchTerm || filterStatus !== 'all' ? 'Sin resultados' : 'No hay órdenes de compra registradas'}
            </p>
            {!searchTerm && filterStatus === 'all' && (
              <button onClick={() => setView('create')} className="btn-primary btn-md mt-4">
                Crear Primera Orden
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  {['Orden', 'Proveedor', 'Fecha', 'Items', 'Total', 'Estado', 'Acciones'].map(h => (
                    <th key={h} className="text-left p-4 text-sm font-semibold text-gray-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredPurchases.map(purchase => (
                  <motion.tr key={purchase.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-gray-50">
                    <td className="p-4 font-mono text-sm text-gray-600">{purchase.orderNumber}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Truck size={16} className="text-gray-400" />
                        <span className="text-sm">{purchase.supplier?.name ?? '—'}</span>
                      </div>
                    </td>
                    <td className="p-4 text-sm text-gray-700">
                      {format(new Date(purchase.createdAt), "d MMM, yyyy", { locale: es })}
                    </td>
                    <td className="p-4 text-sm text-gray-700">{purchase.items?.length ?? 0} productos</td>
                    <td className="p-4 font-semibold text-gray-800">Q{(purchase.total ?? 0).toLocaleString()}</td>
                    <td className="p-4"><StatusBadge status={purchase.status} /></td>
                    <td className="p-4">
                      <div className="flex gap-1">
                        <button onClick={() => { setSelectedPurchase(purchase); setShowDetailsModal(true) }}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="Ver detalles">
                          <Eye size={16} />
                        </button>
                        {purchase.status === 'PENDING' && (
                          <button onClick={() => openReceiveModal(purchase)}
                            className="p-2 text-green-600 hover:bg-green-50 rounded-lg" title="Recibir">
                            <PackageCheck size={16} />
                          </button>
                        )}
                        {!['RECEIVED', 'CANCELLED'].includes(purchase.status) && (
                          <button onClick={() => setShowDeleteConfirm(purchase.id)}
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
        )
      )}

      {/* MODAL: DETAILS */}
      {showDetailsModal && selectedPurchase && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">

            <div className="p-6 border-b flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Orden #{selectedPurchase.orderNumber}</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {format(new Date(selectedPurchase.createdAt), "d 'de' MMMM, yyyy – HH:mm", { locale: es })}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={selectedPurchase.status} />
                <button onClick={() => setShowDetailsModal(false)} className="p-1 hover:bg-gray-100 rounded">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded-lg p-4 text-sm">
                <div><p className="text-gray-500">Proveedor</p><p className="font-medium">{selectedPurchase.supplier?.name}</p></div>
                <div><p className="text-gray-500">Contacto</p><p className="font-medium">{selectedPurchase.supplier?.contactName ?? '—'}</p></div>
                <div><p className="text-gray-500">Teléfono</p><p className="font-medium">{selectedPurchase.supplier?.phone ?? '—'}</p></div>
                <div><p className="text-gray-500">Sucursal</p><p className="font-medium">{selectedPurchase.branch?.name ?? '—'}</p></div>
                {selectedPurchase.expectedDate && (
                  <div>
                    <p className="text-gray-500">Entrega estimada</p>
                    <p className="font-medium">{format(new Date(selectedPurchase.expectedDate), "d MMM, yyyy", { locale: es })}</p>
                  </div>
                )}
                {selectedPurchase.receivedDate && (
                  <div>
                    <p className="text-gray-500">Recibido el</p>
                    <p className="font-medium">{format(new Date(selectedPurchase.receivedDate), "d MMM, yyyy", { locale: es })}</p>
                  </div>
                )}
              </div>

              <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-3 font-medium text-gray-600">Producto</th>
                    <th className="text-right p-3 font-medium text-gray-600">Ordenado</th>
                    {selectedPurchase.status !== 'PENDING' && selectedPurchase.status !== 'DRAFT' && (
                      <th className="text-right p-3 font-medium text-gray-600">Recibido</th>
                    )}
                    <th className="text-right p-3 font-medium text-gray-600">Costo</th>
                    <th className="text-right p-3 font-medium text-gray-600">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {selectedPurchase.items.map(item => (
                    <tr key={item.id}>
                      <td className="p-3">{item.productName}</td>
                      <td className="p-3 text-right">{item.quantity}</td>
                      {selectedPurchase.status !== 'PENDING' && selectedPurchase.status !== 'DRAFT' && (
                        <td className={`p-3 text-right font-medium ${(item.receivedQuantity ?? 0) < item.quantity ? 'text-orange-600' : 'text-green-600'}`}>
                          {item.receivedQuantity ?? 0}
                        </td>
                      )}
                      <td className="p-3 text-right">Q{item.unitCost.toFixed(2)}</td>
                      <td className="p-3 text-right font-semibold">Q{item.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-end">
                <div className="w-56 space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-gray-600">Subtotal:</span><span>Q{(selectedPurchase.subtotal ?? 0).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">IVA:</span><span>Q{(selectedPurchase.tax ?? 0).toFixed(2)}</span></div>
                  <div className="flex justify-between font-bold text-base border-t pt-1"><span>Total:</span><span>Q{(selectedPurchase.total ?? 0).toFixed(2)}</span></div>
                </div>
              </div>

              {selectedPurchase.notes && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
                  <strong className="text-yellow-900">Notas: </strong>{selectedPurchase.notes}
                </div>
              )}
            </div>

            <div className="p-6 border-t flex gap-3 justify-end">
              <button onClick={() => setShowDetailsModal(false)} className="btn-secondary btn-md">Cerrar</button>
              {selectedPurchase.status === 'PENDING' && (
                <>
                  <button onClick={() => handleCancelOrder(selectedPurchase.id)}
                    className="btn-danger btn-md flex items-center gap-2">
                    <RotateCcw size={16} /> Cancelar Orden
                  </button>
                  <button onClick={() => openReceiveModal(selectedPurchase)}
                    className="btn-primary btn-md flex items-center gap-2">
                    <PackageCheck size={16} /> Recibir Mercancía
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* MODAL: RECEIVE */}
      {showReceiveModal && selectedPurchase && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

            <div className="p-6 border-b flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Recibir Mercancía</h2>
                <p className="text-sm text-gray-500">Orden #{selectedPurchase.orderNumber} — {selectedPurchase.supplier?.name}</p>
              </div>
              <button onClick={() => setShowReceiveModal(false)} className="p-1 hover:bg-gray-100 rounded">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                Ingresa la cantidad física recibida de cada producto. Si es menor a la ordenada se guardará como <strong>recepción parcial</strong>.
              </div>

              <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-3 font-medium text-gray-600">Producto</th>
                    <th className="text-right p-3 font-medium text-gray-600">Ordenado</th>
                    <th className="text-right p-3 font-medium text-gray-600">Recibido *</th>
                    <th className="text-right p-3 font-medium text-gray-600">Diferencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {selectedPurchase.items.map(item => {
                    const received = receivedQtys[item.id] ?? item.quantity
                    const diff = received - item.quantity
                    return (
                      <tr key={item.id}>
                        <td className="p-3 font-medium">{item.productName}</td>
                        <td className="p-3 text-right text-gray-600">{item.quantity}</td>
                        <td className="p-2">
                          <input
                            type="number" min={0} max={item.quantity} value={received}
                            onChange={e => setReceivedQtys(prev => ({ ...prev, [item.id]: Number(e.target.value) }))}
                            className="input text-sm text-right w-full"
                          />
                        </td>
                        <td className={`p-3 text-right font-semibold ${diff < 0 ? 'text-orange-600' : 'text-green-600'}`}>
                          {diff > 0 ? '+' : ''}{diff}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-6 border-t flex gap-3 justify-end">
              <button onClick={() => setShowReceiveModal(false)} className="btn-secondary btn-md">Cancelar</button>
              <button onClick={handleConfirmReceive} disabled={saving} className="btn-primary btn-md flex items-center gap-2">
                {saving ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <CheckCircle size={16} />}
                Confirmar Recepción
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Delete Confirm */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-red-100 rounded-full"><AlertCircle className="text-red-600" size={24} /></div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-800 mb-2">Eliminar Orden</h3>
                <p className="text-gray-600 mb-6">¿Seguro que deseas eliminar esta orden? Esta acción no puede deshacerse.</p>
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
