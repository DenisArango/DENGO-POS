import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Inbox, Search, Eye, CheckCircle2, XCircle, FileText, Clock, X,
  GraduationCap, School as SchoolIcon, Package, AlertCircle, CalendarClock, MessageSquare,
} from 'lucide-react'
import { api } from '../../lib/api'

// ── Shared labels ──
const PROGRAM_LABELS: Record<string, string> = {
  FOOD_PACKAGE: 'Alimentación Escolar',
  SCHOOL_SUPPLIES: 'Útiles Escolares',
  TEACHING_KIT: 'Valija Didáctica',
  GRATUITY: 'Gratuidades',
}
const STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'En revisión', cls: 'bg-yellow-100 text-yellow-700' },
  APPROVED: { label: 'Aprobado', cls: 'bg-green-100 text-green-700' },
  REJECTED: { label: 'Rechazado', cls: 'bg-red-100 text-red-700' },
  QUOTED: { label: 'Cotizado', cls: 'bg-blue-100 text-blue-700' },
  INVOICED: { label: 'Facturado', cls: 'bg-purple-100 text-purple-700' },
}
const money = (v: number | string) => `Q${Number(v).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const programLabel = (t: string) => PROGRAM_LABELS[t] ?? t
const statusStyle = (s: string) => STATUS[s] ?? { label: s, cls: 'bg-gray-100 text-gray-600' }

interface OrderItem { id: string; productName: string; quantity: number; unitPrice: number; total: number }
interface Order {
  id: string
  orderNumber: string
  grade?: string
  programType: string
  status: string
  notes?: string
  adminNotes?: string
  deliveryDate?: string | null
  deliveryTime?: string | null
  deliveryNotes?: string | null
  totalAmount: number
  createdAt: string
  teacher?: { id: string; user?: { name: string; email: string } }
  school?: { name: string }
  items?: OrderItem[]
}
interface Branch { id: string; name: string }
interface Customer { id: string; name: string; nit: string }

const STATUS_FILTERS = ['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'QUOTED', 'INVOICED']

export default function PortalOrders() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [search, setSearch] = useState('')

  const [selected, setSelected] = useState<Order | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [rejectMode, setRejectMode] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [actionBusy, setActionBusy] = useState(false)

  // Approval dialog
  const [approveOpen, setApproveOpen] = useState(false)
  const [approveTarget, setApproveTarget] = useState<Order | null>(null)
  const [approveForm, setApproveForm] = useState({ deliveryDate: '', deliveryTime: '', deliveryNotes: '', adminNotes: '' })

  // Quotation dialog
  const [quoteOpen, setQuoteOpen] = useState(false)
  const [branches, setBranches] = useState<Branch[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [quoteForm, setQuoteForm] = useState({ branchId: '', customerId: '', validUntil: '', notes: '' })


  const fetchOrders = () => {
    setLoading(true)
    const qs = statusFilter !== 'ALL' ? `?status=${statusFilter}&limit=200` : '?limit=200'
    api.get<{ data: Order[] }>(`/api/portal-admin/orders${qs}`)
      .then(r => setOrders(r.data ?? []))
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(fetchOrders, [statusFilter])

  const filtered = useMemo(() => orders.filter(o => {
    const q = search.toLowerCase()
    return !q ||
      o.orderNumber.toLowerCase().includes(q) ||
      (o.teacher?.user?.name ?? '').toLowerCase().includes(q) ||
      (o.school?.name ?? '').toLowerCase().includes(q)
  }), [orders, search])

  const stats = useMemo(() => ({
    pending: orders.filter(o => o.status === 'PENDING').length,
    approved: orders.filter(o => o.status === 'APPROVED').length,
    total: orders.length,
  }), [orders])

  const openDetail = (order: Order) => {
    setRejectMode(false)
    setRejectReason('')
    setSelected(order)
    setDetailLoading(true)
    api.get<Order>(`/api/portal-admin/orders/${order.id}`)
      .then(setSelected)
      .catch(e => toast.error(e.message))
      .finally(() => setDetailLoading(false))
  }

  const openApprove = (order: Order) => {
    setApproveTarget(order)
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    setApproveForm({ deliveryDate: tomorrow.toISOString().slice(0, 10), deliveryTime: '08:00', deliveryNotes: '', adminNotes: '' })
    setApproveOpen(true)
  }

  const submitApprove = () => {
    if (!approveTarget) return
    if (!approveForm.deliveryDate) return toast.error('La fecha de entrega es requerida')
    if (!approveForm.deliveryTime) return toast.error('La hora de entrega es requerida')
    setActionBusy(true)
    api.put(`/api/portal-admin/orders/${approveTarget.id}/approve`, {
      deliveryDate: approveForm.deliveryDate,
      deliveryTime: approveForm.deliveryTime,
      deliveryNotes: approveForm.deliveryNotes || undefined,
      adminNotes: approveForm.adminNotes || undefined,
    })
      .then(() => { toast.success('Pedido aprobado'); setApproveOpen(false); setSelected(null); fetchOrders() })
      .catch(e => toast.error(e.message))
      .finally(() => setActionBusy(false))
  }

  const reject = (order: Order) => {
    if (!rejectReason.trim()) return toast.error('Indica el motivo del rechazo')
    setActionBusy(true)
    api.put(`/api/portal-admin/orders/${order.id}/reject`, { adminNotes: rejectReason })
      .then(() => { toast.success('Pedido rechazado'); fetchOrders(); setSelected(null) })
      .catch(e => toast.error(e.message))
      .finally(() => setActionBusy(false))
  }

  const openQuote = (order: Order) => {
    setSelected(order)
    const validUntil = new Date()
    validUntil.setDate(validUntil.getDate() + 30)
    setQuoteForm({ branchId: '', customerId: '', validUntil: validUntil.toISOString().slice(0, 10), notes: '' })
    setQuoteOpen(true)
    Promise.all([
      api.get<Branch[]>('/api/branches').catch(() => []),
      api.get<Customer[]>('/api/customers').catch(() => []),
    ]).then(([b, c]) => {
      setBranches(b)
      setCustomers(c)
      if (b.length === 1) setQuoteForm(f => ({ ...f, branchId: b[0].id }))
    })
  }

  const submitQuote = () => {
    if (!selected) return
    if (!quoteForm.branchId) return toast.error('Selecciona una sucursal')
    if (!quoteForm.customerId) return toast.error('Selecciona un cliente')
    setActionBusy(true)
    api.post<{ id: string; quotationNumber: string }>(`/api/portal-admin/orders/${selected.id}/quote`, {
      branchId: quoteForm.branchId,
      customerId: quoteForm.customerId,
      validUntil: quoteForm.validUntil,
      notes: quoteForm.notes || undefined,
    })
      .then(q => {
        toast.success(`Cotización ${q.quotationNumber} creada`)
        setQuoteOpen(false)
        setSelected(null)
        fetchOrders()
      })
      .catch(e => toast.error(e.message))
      .finally(() => setActionBusy(false))
  }

  const filteredCustomers = customers.filter(c =>
    !customerSearch ||
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.nit.includes(customerSearch)
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Pedidos del Portal</h1>
          <p className="text-gray-600 mt-1">Solicitudes enviadas por los maestros</p>
        </div>
        <div className="flex gap-3">
          <span className="px-3 py-1.5 rounded-lg bg-yellow-50 text-yellow-700 text-sm font-semibold flex items-center gap-1.5"><Clock size={15} /> {stats.pending} pendientes</span>
          <span className="px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-sm font-semibold flex items-center gap-1.5"><CheckCircle2 size={15} /> {stats.approved} aprobados</span>
          <span className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-sm font-semibold flex items-center gap-1.5"><Inbox size={15} /> {stats.total} total</span>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por número, maestro o escuela…"
            className="input pl-10 w-full"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {STATUS_FILTERS.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${statusFilter === s ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {s === 'ALL' ? 'Todos' : statusStyle(s).label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <Inbox size={48} className="mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600">No hay pedidos para mostrar.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Pedido', 'Maestro', 'Escuela', 'Grado', 'Programa', 'Estado', 'Monto', 'Fecha', 'Acciones'].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filtered.map(o => {
                const st = statusStyle(o.status)
                return (
                  <tr key={o.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-700 whitespace-nowrap">{o.orderNumber}</td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{o.teacher?.user?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{o.school?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{o.grade ?? '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{programLabel(o.programType)}</td>
                    <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${st.cls}`}>{st.label}</span></td>
                    <td className="px-4 py-3 font-semibold text-gray-800 whitespace-nowrap">{money(o.totalAmount)}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{format(new Date(o.createdAt), 'dd/MM/yyyy', { locale: es })}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openDetail(o)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="Ver detalle"><Eye size={16} /></button>
                        {o.status === 'PENDING' && (
                          <button onClick={() => openApprove(o)} className="p-2 text-green-600 hover:bg-green-50 rounded-lg" title="Aprobar"><CheckCircle2 size={16} /></button>
                        )}
                        {(o.status === 'APPROVED') && (
                          <button onClick={() => openQuote(o)} className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg" title="Crear cotización"><FileText size={16} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Detail drawer ── */}
      {selected && !quoteOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSelected(null)} />
          <motion.div
            initial={{ x: '100%' }} animate={{ x: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="relative w-full max-w-lg bg-white h-full overflow-y-auto shadow-2xl"
          >
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
              <div>
                <p className="font-mono text-xs text-gray-500">{selected.orderNumber}</p>
                <h2 className="text-lg font-bold text-gray-800">{programLabel(selected.programType)}</h2>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>

            {detailLoading ? (
              <div className="flex justify-center py-16"><div className="w-7 h-7 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" /></div>
            ) : (
              <div className="p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold ${statusStyle(selected.status).cls}`}>{statusStyle(selected.status).label}</span>
                  <span className="text-sm text-gray-500">{format(new Date(selected.createdAt), "dd 'de' MMMM, yyyy", { locale: es })}</span>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <InfoRow icon={GraduationCap} label="Maestro" value={selected.teacher?.user?.name ?? '—'} sub={selected.teacher?.user?.email} />
                  <InfoRow icon={SchoolIcon} label="Escuela" value={selected.school?.name ?? '—'} sub={selected.grade ? `Grado: ${selected.grade}` : undefined} />
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5"><Package size={16} /> Productos</p>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-500">
                        <tr><th className="text-left px-3 py-2">Producto</th><th className="px-3 py-2 text-right">Cant.</th><th className="px-3 py-2 text-right">P. Unit</th><th className="px-3 py-2 text-right">Total</th></tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {(selected.items ?? []).map(it => (
                          <tr key={it.id}>
                            <td className="px-3 py-2 text-gray-800">{it.productName}</td>
                            <td className="px-3 py-2 text-right text-gray-600">{Number(it.quantity)}</td>
                            <td className="px-3 py-2 text-right text-gray-600">{money(it.unitPrice)}</td>
                            <td className="px-3 py-2 text-right font-semibold">{money(it.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-50 border-t"><td colSpan={3} className="px-3 py-2 text-right font-bold text-gray-700">Total</td><td className="px-3 py-2 text-right font-bold text-primary-600">{money(selected.totalAmount)}</td></tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {selected.notes && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs font-semibold text-gray-500 mb-1">Notas del maestro</p>
                    <p className="text-sm text-gray-700">{selected.notes}</p>
                  </div>
                )}
                {selected.adminNotes && (
                  <div className="bg-blue-50 rounded-lg p-3">
                    <p className="text-xs font-semibold text-blue-600 mb-1">Notas del administrador</p>
                    <p className="text-sm text-blue-800">{selected.adminNotes}</p>
                  </div>
                )}

                {selected.deliveryDate && (
                  <div className="bg-green-50 rounded-lg p-3">
                    <p className="text-xs font-semibold text-green-700 mb-2 flex items-center gap-1.5"><CalendarClock size={13} /> Entrega programada</p>
                    <p className="text-sm font-semibold text-green-900">
                      {new Date(selected.deliveryDate).toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                      {selected.deliveryTime ? ` · ${selected.deliveryTime}` : ''}
                    </p>
                    {selected.deliveryNotes && <p className="text-xs text-green-700 mt-1">{selected.deliveryNotes}</p>}
                  </div>
                )}

                {rejectMode && (
                  <div>
                    <label className="label">Motivo del rechazo *</label>
                    <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3} className="input w-full resize-none" placeholder="Explica por qué se rechaza…" />
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  {selected.status === 'PENDING' && !rejectMode && (
                    <>
                      <button onClick={() => openApprove(selected)} className="btn-primary btn-md flex items-center gap-1.5"><CheckCircle2 size={16} /> Aprobar Pedido</button>
                      <button onClick={() => setRejectMode(true)} className="btn-danger btn-md flex items-center gap-1.5"><XCircle size={16} /> Rechazar</button>
                    </>
                  )}
                  {selected.status === 'PENDING' && rejectMode && (
                    <>
                      <button onClick={() => reject(selected)} disabled={actionBusy} className="btn-danger btn-md flex items-center gap-1.5"><XCircle size={16} /> Confirmar rechazo</button>
                      <button onClick={() => setRejectMode(false)} className="btn-secondary btn-md">Cancelar</button>
                    </>
                  )}
                  {selected.status === 'APPROVED' && (
                    <button onClick={() => openQuote(selected)} className="btn-primary btn-md flex items-center gap-1.5"><FileText size={16} /> Crear Cotización</button>
                  )}
                </div>

                {/* ── Messages shortcut ── */}
                {selected.teacher?.id && (
                  <div className="border-t pt-4">
                    <Link
                      to={`/portal/messages?teacherId=${selected.teacher.id}`}
                      className="flex items-center gap-3 p-3 rounded-xl bg-primary-50 hover:bg-primary-100 transition-colors"
                    >
                      <MessageSquare size={18} className="text-primary-600 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-primary-700">Ver mensajes de {selected.teacher.user?.name}</p>
                        <p className="text-xs text-primary-500">Abre la conversación completa con este maestro</p>
                      </div>
                    </Link>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* ── Approval dialog ── */}
      {approveOpen && approveTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col">
            <div className="p-6 border-b flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Aprobar Pedido</h2>
                <p className="text-sm text-gray-500 mt-0.5">{approveTarget.orderNumber}</p>
              </div>
              <button onClick={() => setApproveOpen(false)} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-amber-50 rounded-lg p-3 text-sm text-amber-700 flex items-start gap-2">
                <CalendarClock size={16} className="flex-shrink-0 mt-0.5" />
                Indica cuándo se realizará la entrega. El maestro verá esta información en su pedido.
              </div>
              <div>
                <label className="label">Fecha de entrega *</label>
                <input
                  type="date"
                  value={approveForm.deliveryDate}
                  onChange={e => setApproveForm({ ...approveForm, deliveryDate: e.target.value })}
                  className="input w-full"
                  min={new Date().toISOString().slice(0, 10)}
                />
              </div>
              <div>
                <label className="label">Hora de entrega *</label>
                <input
                  type="time"
                  value={approveForm.deliveryTime}
                  onChange={e => setApproveForm({ ...approveForm, deliveryTime: e.target.value })}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="label">Instrucciones de entrega</label>
                <textarea
                  value={approveForm.deliveryNotes}
                  onChange={e => setApproveForm({ ...approveForm, deliveryNotes: e.target.value })}
                  rows={2}
                  placeholder="Punto de entrega, instrucciones especiales…"
                  className="input w-full resize-none"
                />
              </div>
              <div>
                <label className="label">Notas para el maestro</label>
                <textarea
                  value={approveForm.adminNotes}
                  onChange={e => setApproveForm({ ...approveForm, adminNotes: e.target.value })}
                  rows={2}
                  placeholder="Mensaje adicional para el maestro (opcional)…"
                  className="input w-full resize-none"
                />
              </div>
            </div>
            <div className="p-6 border-t flex gap-3 justify-end">
              <button onClick={() => setApproveOpen(false)} className="btn-secondary btn-md">Cancelar</button>
              <button onClick={submitApprove} disabled={actionBusy} className="btn-primary btn-md flex items-center gap-1.5">
                {actionBusy ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle2 size={16} />} Aprobar Pedido
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ── Quotation dialog ── */}
      {quoteOpen && selected && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-800">Crear Cotización</h2>
              <button onClick={() => setQuoteOpen(false)} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="bg-gray-50 rounded-lg p-3 text-sm flex items-start gap-2">
                <AlertCircle size={16} className="text-primary-500 mt-0.5 flex-shrink-0" />
                <span className="text-gray-600">Pedido <strong>{selected.orderNumber}</strong> · {money(selected.totalAmount)} · {(selected.items?.length ?? 0)} productos</span>
              </div>
              <div>
                <label className="label">Sucursal *</label>
                <select value={quoteForm.branchId} onChange={e => setQuoteForm({ ...quoteForm, branchId: e.target.value })} className="input w-full">
                  <option value="">Selecciona…</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Cliente *</label>
                <input value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} placeholder="Buscar cliente por nombre o NIT…" className="input w-full mb-2" />
                <select value={quoteForm.customerId} onChange={e => setQuoteForm({ ...quoteForm, customerId: e.target.value })} className="input w-full" size={5}>
                  {filteredCustomers.map(c => <option key={c.id} value={c.id}>{c.name} — {c.nit}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Válida hasta *</label>
                <input type="date" value={quoteForm.validUntil} onChange={e => setQuoteForm({ ...quoteForm, validUntil: e.target.value })} className="input w-full" />
              </div>
              <div>
                <label className="label">Notas</label>
                <textarea value={quoteForm.notes} onChange={e => setQuoteForm({ ...quoteForm, notes: e.target.value })} rows={2} className="input w-full resize-none" />
              </div>
            </div>
            <div className="p-6 border-t flex gap-3 justify-end">
              <button onClick={() => setQuoteOpen(false)} className="btn-secondary btn-md">Cancelar</button>
              <button onClick={submitQuote} disabled={actionBusy} className="btn-primary btn-md flex items-center gap-1.5">
                {actionBusy ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <FileText size={16} />} Crear Cotización
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}

function InfoRow({ icon: Icon, label, value, sub }: { icon: typeof GraduationCap; label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center flex-shrink-0"><Icon size={18} /></div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="font-semibold text-gray-800">{value}</p>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
    </div>
  )
}
