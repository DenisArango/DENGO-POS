import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Plus, Search, Eye, Trash2, Send, CheckCircle, XCircle,
  FileText, AlertCircle, X, Minus, ClipboardList,
  RefreshCw, Clock, DollarSign
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { useAuthStore } from '../store'

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
  productName: string
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

interface DraftItem {
  id: string
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

  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null)

  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [quotationNotes, setQuotationNotes] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [discountPct, setDiscountPct] = useState(0)
  const [draftItems, setDraftItems] = useState<DraftItem[]>([
    { id: crypto.randomUUID(), productName: '', quantity: 1, unitPrice: 0, discount: 0, subtotal: 0 }
  ])

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
      .then(setCustomers)
      .catch(e => toast.error(e.message))
  }, [])

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
    rejectedOrExpired: quotations.filter(q => q.status === 'REJECTED' || q.status === 'EXPIRED').length,
  }

  const draftItemsSubtotal = draftItems.reduce((s, i) => s + i.subtotal, 0)
  const draftDiscountAmount = draftItemsSubtotal * (discountPct / 100)
  const draftAfterDiscount = draftItemsSubtotal - draftDiscountAmount
  const draftTax = draftAfterDiscount * 0.12
  const draftTotal = draftAfterDiscount + draftTax

  const addDraftItem = () =>
    setDraftItems(prev => [...prev, { id: crypto.randomUUID(), productName: '', quantity: 1, unitPrice: 0, discount: 0, subtotal: 0 }])

  const removeDraftItem = (id: string) =>
    setDraftItems(prev => prev.filter(i => i.id !== id))

  const updateDraftItem = (id: string, field: keyof DraftItem, value: string | number) =>
    setDraftItems(prev => prev.map(item => {
      if (item.id !== id) return item
      const updated = { ...item, [field]: value }
      updated.subtotal = updated.quantity * updated.unitPrice
      return updated
    }))

  const resetCreateForm = () => {
    setSelectedCustomerId('')
    setQuotationNotes('')
    setValidUntil('')
    setDiscountPct(0)
    setDraftItems([{ id: crypto.randomUUID(), productName: '', quantity: 1, unitPrice: 0, discount: 0, subtotal: 0 }])
  }

  const handleCreateQuotation = (saveAsDraft: boolean) => {
    if (!selectedCustomerId) { toast.error('Selecciona un cliente'); return }
    const validItems = draftItems.filter(i => i.productName.trim())
    if (validItems.length === 0) { toast.error('Agrega al menos un producto'); return }
    if (!validUntil) { toast.error('Indica la fecha de validez'); return }

    setSaving(true)
    api.post('/api/quotations', {
      customerId: selectedCustomerId,
      items: validItems.map(i => ({
        productName: i.productName,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discount: i.discount,
        total: i.subtotal,
      })),
      discountPct,
      validUntil,
      notes: quotationNotes || undefined,
      status: saveAsDraft ? 'DRAFT' : 'SENT',
    })
      .then(() => {
        toast.success(saveAsDraft ? 'Cotización guardada como borrador' : 'Cotización enviada al cliente')
        resetCreateForm()
        setShowCreateModal(false)
        fetchQuotations()
      })
      .catch(e => toast.error(e.message))
      .finally(() => setSaving(false))
  }

  const transitionStatus = (id: string, action: string, successMsg: string) => {
    api.patch(`/api/quotations/${id}/${action}`, {})
      .then(() => {
        toast.success(successMsg)
        setShowDetailsModal(false)
        fetchQuotations()
      })
      .catch(e => toast.error(e.message))
  }

  const handleSend = (id: string) => transitionStatus(id, 'send', 'Cotización marcada como enviada')
  const handleAccept = (id: string) => transitionStatus(id, 'accept', 'Cotización aceptada')
  const handleReject = (id: string) => transitionStatus(id, 'reject', 'Cotización marcada como rechazada')
  const handleConvertToSale = (id: string) => transitionStatus(id, 'convert', 'Cotización convertida a venta exitosamente')

  const handleDelete = (id: string) => {
    api.delete(`/api/quotations/${id}`)
      .then(() => {
        toast.success('Cotización eliminada')
        setShowDeleteConfirm(null)
        if (showDetailsModal) setShowDetailsModal(false)
        fetchQuotations()
      })
      .catch(e => toast.error(e.message))
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Cotizaciones</h1>
          <p className="text-gray-600 mt-1">Crea y gestiona cotizaciones para tus clientes</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="btn-primary btn-md flex items-center gap-2">
          <Plus size={20} /> Nueva Cotización
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
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {[
            { label: 'Total', value: stats.total, color: 'blue', Icon: ClipboardList },
            { label: 'Borrador', value: stats.draft, color: 'gray', Icon: FileText },
            { label: 'Enviadas', value: stats.sent, color: 'blue', Icon: Send },
            { label: 'Aceptadas', value: stats.accepted, color: 'green', Icon: CheckCircle },
            { label: 'Rechaz./Venc.', value: stats.rejectedOrExpired, color: 'red', Icon: XCircle },
          ].map(({ label, value, color, Icon }) => (
            <div key={label} className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">{label}</p>
                  <p className={`text-2xl font-bold mt-1 text-${color}-600`}>{value}</p>
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
            <p className="text-gray-600">
              {searchTerm || filterStatus !== 'all' ? 'Sin resultados' : 'No hay cotizaciones registradas'}
            </p>
            {!searchTerm && filterStatus === 'all' && (
              <button onClick={() => setShowCreateModal(true)} className="btn-primary btn-md mt-4">
                Crear Primera Cotización
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
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
                  <motion.tr key={quotation.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-gray-50">
                    <td className="p-4 font-mono text-sm text-gray-600">{quotation.quotationNumber}</td>
                    <td className="p-4 text-sm">{quotation.customer?.name ?? '—'}</td>
                    <td className="p-4 text-sm text-gray-700">
                      {format(new Date(quotation.createdAt), "d MMM, yyyy", { locale: es })}
                    </td>
                    <td className="p-4 text-sm text-gray-700">
                      {format(new Date(quotation.validUntil), "d MMM, yyyy", { locale: es })}
                    </td>
                    <td className="p-4 text-sm text-gray-700">{quotation.items?.length ?? 0} productos</td>
                    <td className="p-4 font-semibold text-gray-800">Q{(quotation.total ?? 0).toLocaleString('es', { minimumFractionDigits: 2 })}</td>
                    <td className="p-4"><StatusBadge status={quotation.status} /></td>
                    <td className="p-4">
                      <div className="flex gap-1">
                        <button
                          onClick={() => { setSelectedQuotation(quotation); setShowDetailsModal(true) }}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="Ver detalles">
                          <Eye size={16} />
                        </button>
                        {quotation.status === 'DRAFT' && (
                          <button onClick={() => handleSend(quotation.id)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="Enviar al cliente">
                            <Send size={16} />
                          </button>
                        )}
                        {quotation.status === 'SENT' && (
                          <>
                            <button onClick={() => handleAccept(quotation.id)}
                              className="p-2 text-green-600 hover:bg-green-50 rounded-lg" title="Marcar como aceptada">
                              <CheckCircle size={16} />
                            </button>
                            <button onClick={() => handleReject(quotation.id)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg" title="Marcar como rechazada">
                              <XCircle size={16} />
                            </button>
                          </>
                        )}
                        {quotation.status === 'ACCEPTED' && (
                          <button onClick={() => handleConvertToSale(quotation.id)}
                            className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg" title="Convertir a venta">
                            <DollarSign size={16} />
                          </button>
                        )}
                        <button onClick={() => setShowDeleteConfirm(quotation.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg" title="Eliminar">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* MODAL: CREATE QUOTATION */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-lg shadow-xl w-full max-w-3xl my-6">

            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold text-gray-800">Nueva Cotización</h2>
              <button onClick={() => { resetCreateForm(); setShowCreateModal(false) }}
                className="p-1 hover:bg-gray-100 rounded"><X size={20} /></button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="label">Cliente *</label>
                  <select value={selectedCustomerId} onChange={e => setSelectedCustomerId(e.target.value)} className="input">
                    <option value="">-- Selecciona un cliente --</option>
                    {customers.filter(c => c.isActive !== false).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {customers.length === 0 && (
                    <p className="text-xs text-orange-600 mt-1">No hay clientes. Agrégalos en la sección Clientes.</p>
                  )}
                </div>
                <div>
                  <label className="label">Válida hasta *</label>
                  <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} className="input" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-800">Productos / Servicios</h3>
                  <button onClick={addDraftItem} className="btn-outline btn-sm flex items-center gap-1">
                    <Plus size={14} /> Agregar línea
                  </button>
                </div>

                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left p-3 font-medium text-gray-600">Descripción</th>
                        <th className="text-right p-3 font-medium text-gray-600 w-24">Cantidad</th>
                        <th className="text-right p-3 font-medium text-gray-600 w-28">Precio Unit.</th>
                        <th className="text-right p-3 font-medium text-gray-600 w-24">Subtotal</th>
                        <th className="p-3 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {draftItems.map(item => (
                        <tr key={item.id}>
                          <td className="p-2">
                            <input
                              type="text" value={item.productName}
                              onChange={e => updateDraftItem(item.id, 'productName', e.target.value)}
                              placeholder="Nombre del producto o servicio"
                              className="input text-sm w-full"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number" min={1} value={item.quantity}
                              onChange={e => updateDraftItem(item.id, 'quantity', Number(e.target.value))}
                              className="input text-sm text-right w-full"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number" min={0} step={0.01} value={item.unitPrice}
                              onChange={e => updateDraftItem(item.id, 'unitPrice', Number(e.target.value))}
                              className="input text-sm text-right w-full"
                            />
                          </td>
                          <td className="p-3 text-right font-semibold text-gray-800">
                            Q{item.subtotal.toFixed(2)}
                          </td>
                          <td className="p-2 text-center">
                            {draftItems.length > 1 && (
                              <button onClick={() => removeDraftItem(item.id)}
                                className="p-1 text-red-500 hover:bg-red-50 rounded">
                                <Minus size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-between items-start mt-4 gap-4">
                  <div className="flex-1">
                    <label className="label">Descuento (%)</label>
                    <input
                      type="number" min={0} max={100} step={0.5} value={discountPct}
                      onChange={e => setDiscountPct(Number(e.target.value))}
                      className="input w-32"
                    />
                  </div>
                  <div className="w-56 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Subtotal:</span>
                      <span>Q{draftItemsSubtotal.toFixed(2)}</span>
                    </div>
                    {discountPct > 0 && (
                      <div className="flex justify-between text-red-600">
                        <span>Descuento ({discountPct}%):</span>
                        <span>-Q{draftDiscountAmount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-600">IVA (12%):</span>
                      <span>Q{draftTax.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-base border-t pt-1">
                      <span>Total:</span>
                      <span>Q{draftTotal.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="label">Notas</label>
                <textarea value={quotationNotes} onChange={e => setQuotationNotes(e.target.value)}
                  className="input min-h-[80px]" placeholder="Condiciones, términos de pago, observaciones…" />
              </div>
            </div>

            <div className="p-6 border-t flex gap-3 justify-end">
              <button onClick={() => { resetCreateForm(); setShowCreateModal(false) }} className="btn-secondary btn-md" disabled={saving}>
                Cancelar
              </button>
              <button onClick={() => handleCreateQuotation(true)} disabled={saving} className="btn-outline btn-md flex items-center gap-2">
                <FileText size={16} /> Guardar Borrador
              </button>
              <button onClick={() => handleCreateQuotation(false)} disabled={saving} className="btn-primary btn-md flex items-center gap-2">
                {saving ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <Send size={16} />}
                Enviar Cotización
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* MODAL: DETAILS */}
      {showDetailsModal && selectedQuotation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">

            <div className="p-6 border-b flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Cotización #{selectedQuotation.quotationNumber}</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {format(new Date(selectedQuotation.createdAt), "d 'de' MMMM, yyyy – HH:mm", { locale: es })}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={selectedQuotation.status} />
                <button onClick={() => setShowDetailsModal(false)} className="p-1 hover:bg-gray-100 rounded">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded-lg p-4 text-sm">
                <div><p className="text-gray-500">Cliente</p><p className="font-medium">{selectedQuotation.customer?.name}</p></div>
                <div><p className="text-gray-500">NIT/RUT</p><p className="font-medium">{selectedQuotation.customer?.nit || '—'}</p></div>
                <div><p className="text-gray-500">Sucursal</p><p className="font-medium">{selectedQuotation.branch?.name ?? '—'}</p></div>
                <div>
                  <p className="text-gray-500">Válida hasta</p>
                  <p className="font-medium">{format(new Date(selectedQuotation.validUntil), "d MMM, yyyy", { locale: es })}</p>
                </div>
                {selectedQuotation.customer?.email && (
                  <div><p className="text-gray-500">Email</p><p className="font-medium">{selectedQuotation.customer.email}</p></div>
                )}
                {selectedQuotation.customer?.phone && (
                  <div><p className="text-gray-500">Teléfono</p><p className="font-medium">{selectedQuotation.customer.phone}</p></div>
                )}
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
                  {selectedQuotation.items.map(item => (
                    <tr key={item.id}>
                      <td className="p-3">{item.productName}</td>
                      <td className="p-3 text-right">{item.quantity}</td>
                      <td className="p-3 text-right">Q{(item.unitPrice ?? 0).toFixed(2)}</td>
                      <td className="p-3 text-right font-semibold">Q{(item.total ?? 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-end">
                <div className="w-56 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Subtotal:</span>
                    <span>Q{(selectedQuotation.subtotal ?? 0).toFixed(2)}</span>
                  </div>
                  {(selectedQuotation.discount ?? 0) > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>Descuento:</span>
                      <span>-Q{selectedQuotation.discount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-600">IVA (12%):</span>
                    <span>Q{(selectedQuotation.tax ?? 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-base border-t pt-1">
                    <span>Total:</span>
                    <span>Q{(selectedQuotation.total ?? 0).toFixed(2)}</span>
                  </div>
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
              {selectedQuotation.status === 'DRAFT' && (
                <>
                  <button onClick={() => handleSend(selectedQuotation.id)}
                    className="btn-primary btn-md flex items-center gap-2">
                    <Send size={16} /> Enviar al Cliente
                  </button>
                  <button onClick={() => setShowDeleteConfirm(selectedQuotation.id)}
                    className="btn-danger btn-md flex items-center gap-2">
                    <Trash2 size={16} /> Eliminar
                  </button>
                </>
              )}
              {selectedQuotation.status === 'SENT' && (
                <>
                  <button onClick={() => handleReject(selectedQuotation.id)}
                    className="btn-outline btn-md flex items-center gap-2 text-red-600 border-red-300 hover:bg-red-50">
                    <XCircle size={16} /> Rechazada
                  </button>
                  <button onClick={() => handleAccept(selectedQuotation.id)}
                    className="btn-primary btn-md flex items-center gap-2">
                    <CheckCircle size={16} /> Aceptada
                  </button>
                </>
              )}
              {selectedQuotation.status === 'ACCEPTED' && (
                <button onClick={() => handleConvertToSale(selectedQuotation.id)}
                  className="btn-primary btn-md flex items-center gap-2">
                  <DollarSign size={16} /> Convertir a Venta
                </button>
              )}
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
