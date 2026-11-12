import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Inbox, Search, Eye, CheckCircle2, XCircle, FileText, Clock, X,
  GraduationCap, School as SchoolIcon, Package, AlertCircle, CalendarClock, MessageSquare,
  Pencil, Printer, Plus, Trash2, Users, Send, Receipt,
} from 'lucide-react'
import { api } from '../../lib/api'
import { Inbox as PageInbox } from 'lucide-react'
import PageIcon from '../../components/common/PageIcon'
import AlternateQuotes from '../../components/quotations/AlternateQuotes'
import { Building2 as AltBranchIcon } from 'lucide-react'

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

interface OrderItem { id: string; productId: string | null; productName: string; quantity: number; qtyPerStudent?: number | null; unitPrice: number; unitCost?: number | null; total: number; product?: { cost?: number | string | null } | null }
// One line in the correction form. productId null = typed in, not in the catalog.
interface EditItem { key: string; productId: string | null; productName: string; unitPrice: string; unitCost: string; quantity: string }
interface OrderGrade { id?: string; gradeName: string; studentCount: number }
interface Balance { expected: number; diff: number; balanced: boolean }
interface Order {
  id: string
  orderNumber: string
  grade?: string
  orderGradeSummary?: string | null
  studentCount?: number | null
  grades?: OrderGrade[]
  perStudent?: boolean
  balance?: Balance | null
  totalCost?: number
  profit?: number
  quotationId?: string | null
  adjustedAt?: string | null
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
interface Program { type: string; name: string; limitPerStudent?: number | null; maxAmountPerTeacher?: number | null; perStudent?: boolean }
interface ProductHit { id: string; name: string; brand?: string | null; basePrice: number | string; cost?: number | string | null }
interface Branch { id: string; name: string }

// Same rule as the backend (lib/portalOrders.ts): what the order should add up to.
function expectedFor(program: Program | undefined, students: number): number | null {
  if (!program) return null
  if (program.limitPerStudent != null && students > 0) return Number((program.limitPerStudent * students).toFixed(2))
  if (program.maxAmountPerTeacher != null) return program.maxAmountPerTeacher
  return null
}

/** "Cuadra" / "Faltan Q5" / "Sobran Q5" — at a glance in the list and the drawer. */
function BalanceBadge({ balance }: { balance?: Balance | null }) {
  if (!balance) return <span className="text-xs text-gray-400">—</span>
  if (balance.balanced) return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">Cuadra</span>
  return balance.diff < 0
    ? <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 whitespace-nowrap">Faltan {money(-balance.diff)}</span>
    : <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 whitespace-nowrap">Sobran {money(balance.diff)}</span>
}

const gradeText = (o: Order) => o.orderGradeSummary || o.grade || '—'

interface Customer { id: string; name: string; nit: string }

const STATUS_FILTERS = ['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'QUOTED', 'INVOICED']

export default function PortalOrders() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [search, setSearch] = useState('')
  const [onlyUnbalanced, setOnlyUnbalanced] = useState(false)
  const [programs, setPrograms] = useState<Program[]>([])

  // Correcting an order (provider side)
  const [editing, setEditing] = useState(false)
  const [editGrades, setEditGrades] = useState<{ gradeName: string; studentCount: string }[]>([])
  const [editItems, setEditItems] = useState<EditItem[]>([])
  const [editMessage, setEditMessage] = useState('')
  const [productQuery, setProductQuery] = useState('')
  const [productHits, setProductHits] = useState<ProductHit[]>([])

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
  useEffect(() => { api.get<Program[]>('/api/portal-admin/programs').then(setPrograms).catch(() => {}) }, [])

  // Pending orders that don't add up are what needs the provider's attention.
  const needsFix = (o: Order) => (o.status === 'PENDING' || o.status === 'APPROVED') && !!o.balance && !o.balance.balanced

  const filtered = useMemo(() => orders.filter(o => {
    const q = search.toLowerCase()
    if (onlyUnbalanced && !needsFix(o)) return false
    return !q ||
      o.orderNumber.toLowerCase().includes(q) ||
      (o.teacher?.user?.name ?? '').toLowerCase().includes(q) ||
      (o.school?.name ?? '').toLowerCase().includes(q)
  }), [orders, search, onlyUnbalanced])

  const stats = useMemo(() => ({
    pending: orders.filter(o => o.status === 'PENDING').length,
    approved: orders.filter(o => o.status === 'APPROVED').length,
    unbalanced: orders.filter(needsFix).length,
    total: orders.length,
  }), [orders])

  // ── Correct the order ──
  const startEdit = (o: Order) => {
    const kit = !!o.perStudent
    setEditGrades((o.grades?.length ? o.grades : [{ gradeName: o.grade ?? '', studentCount: o.studentCount ?? 0 }])
      .map(g => ({ gradeName: g.gradeName, studentCount: String(g.studentCount || '') })))
    setEditItems((o.items ?? []).map(it => ({
      key: it.id,
      productId: it.productId,
      productName: it.productName,
      unitPrice: String(Number(it.unitPrice)),
      unitCost: String(Number(it.unitCost ?? it.product?.cost ?? 0)),
      quantity: String(Number(kit ? (it.qtyPerStudent ?? it.quantity) : it.quantity)),
    })))
    setEditMessage('')
    setProductQuery('')
    setProductHits([])
    setEditing(true)
  }

  useEffect(() => {
    if (!editing || productQuery.trim().length < 2) { setProductHits([]); return }
    const t = setTimeout(() => {
      api.get<ProductHit[]>(`/api/products?search=${encodeURIComponent(productQuery.trim())}`)
        .then(r => setProductHits(Array.isArray(r) ? r.slice(0, 8) : []))
        .catch(() => setProductHits([]))
    }, 250)
    return () => clearTimeout(t)
  }, [editing, productQuery])

  const editStudents = editGrades.reduce((s, g) => s + (Number(g.studentCount) || 0), 0)
  const editKit = !!selected?.perStudent
  const lineQty = (it: EditItem) => (Number(it.quantity) || 0) * (editKit ? editStudents : 1)
  const editTotal = editItems.reduce((s, it) => s + (Number(it.unitPrice) || 0) * lineQty(it), 0)
  const editCost = editItems.reduce((s, it) => s + (Number(it.unitCost) || 0) * lineQty(it), 0)
  const editExpected = selected ? expectedFor(programs.find(p => p.type === selected.programType), editStudents) : null
  const editDiff = editExpected != null ? Number((editTotal - editExpected).toFixed(2)) : null

  const addEditProduct = (p: ProductHit) => {
    setEditItems(items => items.some(i => i.productId === p.id)
      ? items
      : [...items, { key: p.id, productId: p.id, productName: p.name, unitPrice: String(Number(p.basePrice)), unitCost: String(Number(p.cost ?? 0)), quantity: '1' }])
    setProductQuery('')
    setProductHits([])
  }

  const saveEdit = () => {
    if (!selected) return
    const grades = editGrades.filter(g => g.gradeName.trim() || Number(g.studentCount))
    if (grades.length === 0 || grades.some(g => !g.gradeName.trim() || !(Number(g.studentCount) > 0))) return toast.error('Cada grado necesita nombre y número de alumnos')
    const items = editItems.filter(i => Number(i.quantity) > 0)
    if (items.length === 0) return toast.error('El pedido debe tener al menos un producto')
    if (items.some(i => !i.productId && (!i.productName.trim() || !(Number(i.unitPrice) > 0)))) return toast.error('Cada producto fuera del catálogo necesita nombre y precio de venta')
    setActionBusy(true)
    api.put<Order>(`/api/portal-admin/orders/${selected.id}`, {
      grades: grades.map(g => ({ gradeName: g.gradeName.trim(), studentCount: Number(g.studentCount) })),
      items: items.map(i => ({
        ...(i.productId ? { productId: i.productId } : { customName: i.productName.trim() }),
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice) || 0,
        unitCost: Number(i.unitCost) || 0,
      })),
      ...(editMessage.trim() ? { message: editMessage.trim() } : {}),
    })
      .then(updated => {
        toast.success(editMessage.trim() ? 'Pedido corregido y mensaje enviado al maestro' : 'Pedido corregido')
        setSelected(updated)
        setOrders(prev => prev.map(o => o.id === updated.id ? updated : o))
        setEditing(false)
      })
      .catch(e => toast.error(e.message))
      .finally(() => setActionBusy(false))
  }

  const printSheet = () => requestAnimationFrame(() => window.print())

  // Quotation / invoice to the teacher's inbox (+ phone notification).
  const sendDocument = (kind: 'QUOTATION' | 'INVOICE') => {
    if (!selected) return
    setActionBusy(true)
    api.post(`/api/portal-admin/orders/${selected.id}/send-document`, { kind })
      .then(() => toast.success(kind === 'QUOTATION' ? 'Cotización enviada al maestro' : 'Factura enviada al maestro'))
      .catch(e => toast.error(e.message))
      .finally(() => setActionBusy(false))
  }

  // The order's quotation issued by another of the owner's businesses.
  const [alternateFor, setAlternateFor] = useState<string | null>(null)
  const sendAlternate = (quotationId: string) => {
    if (!selected) return Promise.resolve()
    return api.post(`/api/portal-admin/orders/${selected.id}/send-document`, { kind: 'QUOTATION', quotationId })
      .then(() => { toast.success('Cotización enviada al maestro') })
      .catch(e => { toast.error(e.message) })
  }

  const openDetail = (order: Order) => {
    setEditing(false)
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
    (c.nit ?? '').includes(customerSearch)
  )

  return (
    <>
    <div className="space-y-6 print:hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-3"><PageIcon icon={PageInbox} color="blue" />Pedidos del Portal</h1>
          <p className="text-gray-600 mt-1">Solicitudes enviadas por los maestros</p>
        </div>
        <div className="flex gap-3">
          <span className="px-3 py-1.5 rounded-lg bg-yellow-50 text-yellow-700 text-sm font-semibold flex items-center gap-1.5"><Clock size={15} /> {stats.pending} pendientes</span>
          <span className="px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-sm font-semibold flex items-center gap-1.5"><CheckCircle2 size={15} /> {stats.approved} aprobados</span>
          {stats.unbalanced > 0 && (
            <button
              onClick={() => setOnlyUnbalanced(v => !v)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-1.5 ${onlyUnbalanced ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-800 hover:bg-amber-100'}`}
              title="Pedidos por revisar cuyo total no cuadra con el monto del programa"
            >
              <AlertCircle size={15} /> {stats.unbalanced} sin cuadrar
            </button>
          )}
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
          <span className="empty-tile mb-4"><Inbox size={26} aria-hidden /></span>
          <p className="text-gray-600">No hay pedidos para mostrar.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/70 border-b border-gray-200/80">
              <tr>
                {['Pedido', 'Maestro', 'Escuela', 'Grados', 'Programa', 'Estado', 'Monto', 'Cuadre', 'Fecha', 'Acciones'].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filtered.map(o => {
                const st = statusStyle(o.status)
                return (
                  <tr key={o.id} className={needsFix(o) ? (o.balance!.diff > 0 ? 'bg-red-50/60 hover:bg-red-50' : 'bg-amber-50/60 hover:bg-amber-50') : 'hover:bg-gray-50'}>
                    <td className={`px-4 py-3 font-mono text-xs text-gray-700 whitespace-nowrap ${needsFix(o) ? (o.balance!.diff > 0 ? 'border-l-4 border-red-400' : 'border-l-4 border-amber-400') : ''}`}>{o.orderNumber}</td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{o.teacher?.user?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{o.school?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 max-w-[14rem]">
                      <span className="line-clamp-2">{gradeText(o)}</span>
                      {o.studentCount ? <span className="block text-xs text-gray-400">{o.studentCount} alumnos</span> : null}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{programLabel(o.programType)}</td>
                    <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${st.cls}`}>{st.label}</span></td>
                    <td className="px-4 py-3 font-semibold text-gray-800 whitespace-nowrap">{money(o.totalAmount)}</td>
                    <td className="px-4 py-3"><BalanceBadge balance={o.balance} /></td>
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
          <div className="absolute inset-0 bg-black/40" onClick={() => { setSelected(null); setEditing(false) }} />
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
              <button onClick={() => { setSelected(null); setEditing(false) }} className="p-2 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
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
                  <InfoRow icon={SchoolIcon} label="Escuela" value={selected.school?.name ?? '—'} sub={`Grados: ${gradeText(selected)}`} />
                  {selected.studentCount ? <InfoRow icon={Users} label="Alumnos" value={String(selected.studentCount)} sub={selected.perStudent ? 'Un kit por alumno' : undefined} /> : null}
                </div>

                {!editing && selected.totalCost != null && (
                  <div className="rounded-lg bg-gray-50 p-3 text-sm grid grid-cols-3 gap-2" title="Solo lo ves tú: el maestro nunca ve el costo">
                    <div><p className="text-xs text-gray-500">Venta</p><p className="font-semibold">{money(selected.totalAmount)}</p></div>
                    <div><p className="text-xs text-gray-500">Costo</p><p className="font-semibold">{money(selected.totalCost)}</p></div>
                    <div><p className="text-xs text-gray-500">Ganancia</p><p className={`font-semibold ${(selected.profit ?? 0) < 0 ? 'text-red-600' : 'text-green-700'}`}>{money(selected.profit ?? 0)}{Number(selected.totalAmount) > 0 ? <span className="text-xs font-normal text-gray-500"> · {(((selected.profit ?? 0) / Number(selected.totalAmount)) * 100).toFixed(1)}%</span> : null}</p></div>
                  </div>
                )}

                {selected.balance && !editing && (
                  <div className={`rounded-lg p-3 text-sm flex items-center justify-between gap-3 ${selected.balance.balanced ? 'bg-green-50 text-green-800' : selected.balance.diff < 0 ? 'bg-amber-50 text-amber-900' : 'bg-red-50 text-red-800'}`}>
                    <span>Debe sumar <strong>{money(selected.balance.expected)}</strong> · suma {money(selected.totalAmount)}</span>
                    <BalanceBadge balance={selected.balance} />
                  </div>
                )}

                {editing ? (
                  <EditPanel
                    kit={editKit}
                    grades={editGrades}
                    setGrades={setEditGrades}
                    items={editItems}
                    setItems={setEditItems}
                    students={editStudents}
                    total={editTotal}
                    cost={editCost}
                    expected={editExpected}
                    diff={editDiff}
                    productQuery={productQuery}
                    setProductQuery={setProductQuery}
                    productHits={productHits}
                    onAddProduct={addEditProduct}
                    message={editMessage}
                    setMessage={setEditMessage}
                    orderNumber={selected.orderNumber}
                  />
                ) : (
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5"><Package size={16} /> Productos</p>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-500">
                        <tr>
                          <th className="text-left px-3 py-2">Producto</th>
                          {selected.perStudent && <th className="px-3 py-2 text-right">x alumno</th>}
                          <th className="px-3 py-2 text-right">Cant.</th><th className="px-3 py-2 text-right">P. Unit</th><th className="px-3 py-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {(selected.items ?? []).map(it => (
                          <tr key={it.id}>
                            <td className="px-3 py-2 text-gray-800">{it.productName}</td>
                            {selected.perStudent && <td className="px-3 py-2 text-right text-gray-600">{Number(it.qtyPerStudent ?? 0)}</td>}
                            <td className="px-3 py-2 text-right text-gray-600">{Number(it.quantity)}</td>
                            <td className="px-3 py-2 text-right text-gray-600">{money(it.unitPrice)}</td>
                            <td className="px-3 py-2 text-right font-semibold">{money(it.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-50 border-t"><td colSpan={selected.perStudent ? 4 : 3} className="px-3 py-2 text-right font-bold text-gray-700">Total</td><td className="px-3 py-2 text-right font-bold text-primary-600">{money(selected.totalAmount)}</td></tr>
                      </tfoot>
                    </table>
                  </div>
                  {selected.adjustedAt && <p className="text-xs text-gray-400 mt-1.5">Corregido el {format(new Date(selected.adjustedAt), "dd/MM/yyyy HH:mm", { locale: es })}</p>}
                </div>
                )}

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
                      {new Date(selected.deliveryDate).toLocaleDateString('es-GT', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
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
                  {editing && (
                    <>
                      <button onClick={saveEdit} disabled={actionBusy} className="btn-primary btn-md flex items-center gap-1.5"><CheckCircle2 size={16} /> Guardar corrección</button>
                      <button onClick={() => setEditing(false)} className="btn-secondary btn-md">Cancelar</button>
                    </>
                  )}
                  {!editing && ['PENDING', 'APPROVED'].includes(selected.status) && !rejectMode && (
                    <button onClick={() => startEdit(selected)} className="btn-secondary btn-md flex items-center gap-1.5"><Pencil size={16} /> Corregir pedido</button>
                  )}
                  {!editing && (
                    <button onClick={printSheet} className="btn-secondary btn-md flex items-center gap-1.5"><Printer size={16} /> Hoja de preparación</button>
                  )}
                  {!editing && selected.status === 'PENDING' && !rejectMode && (
                    <>
                      <button onClick={() => openApprove(selected)} className="btn-primary btn-md flex items-center gap-1.5"><CheckCircle2 size={16} /> Aprobar Pedido</button>
                      <button onClick={() => setRejectMode(true)} className="btn-danger btn-md flex items-center gap-1.5"><XCircle size={16} /> Rechazar</button>
                    </>
                  )}
                  {!editing && selected.status === 'PENDING' && rejectMode && (
                    <>
                      <button onClick={() => reject(selected)} disabled={actionBusy} className="btn-danger btn-md flex items-center gap-1.5"><XCircle size={16} /> Confirmar rechazo</button>
                      <button onClick={() => setRejectMode(false)} className="btn-secondary btn-md">Cancelar</button>
                    </>
                  )}
                  {!editing && selected.quotationId && ['QUOTED', 'INVOICED'].includes(selected.status) && (
                    <button onClick={() => sendDocument('QUOTATION')} disabled={actionBusy} className="btn-secondary btn-md flex items-center gap-1.5"><Send size={16} /> Enviar cotización al maestro</button>
                  )}
                  {!editing && selected.quotationId && ['QUOTED', 'INVOICED'].includes(selected.status) && (
                    <button onClick={() => setAlternateFor(selected.quotationId!)} className="btn-outline btn-md flex items-center gap-1.5 text-violet-700 border-violet-300 hover:bg-violet-50"><AltBranchIcon size={16} /> Cotización de otra sucursal</button>
                  )}
                  {!editing && selected.status === 'INVOICED' && (
                    <button onClick={() => sendDocument('INVOICE')} disabled={actionBusy} className="btn-secondary btn-md flex items-center gap-1.5"><Receipt size={16} /> Enviar factura al maestro</button>
                  )}
                  {!editing && selected.status === 'APPROVED' && (
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
                  {filteredCustomers.map(c => <option key={c.id} value={c.id}>{c.name} — {c.nit || 'CF'}</option>)}
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
    {selected && !editing && <PrepSheet order={selected} />}
    {alternateFor && (
      <AlternateQuotes sourceId={alternateFor} onClose={() => setAlternateFor(null)} onSendToTeacher={sendAlternate} />
    )}
    </>
  )
}

// ── Correction form (inside the drawer) ──
function EditPanel(props: {
  kit: boolean
  grades: { gradeName: string; studentCount: string }[]
  setGrades: React.Dispatch<React.SetStateAction<{ gradeName: string; studentCount: string }[]>>
  items: EditItem[]
  setItems: React.Dispatch<React.SetStateAction<EditItem[]>>
  students: number
  total: number
  cost: number
  expected: number | null
  diff: number | null
  productQuery: string
  setProductQuery: (v: string) => void
  productHits: ProductHit[]
  onAddProduct: (p: ProductHit) => void
  message: string
  setMessage: (v: string) => void
  orderNumber: string
}) {
  const { kit, grades, setGrades, items, setItems, students, total, cost, expected, diff } = props
  const setField = (i: number, field: 'quantity' | 'unitPrice' | 'unitCost' | 'productName', value: string) =>
    setItems(xs => xs.map((x, j) => j === i ? { ...x, [field]: value } : x))
  const addCustom = () => setItems(xs => [...xs, { key: `custom-${Date.now()}`, productId: null, productName: '', unitPrice: '', unitCost: '', quantity: '1' }])
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5"><Users size={16} /> Grados y alumnos</p>
        <div className="space-y-2">
          {grades.map((g, i) => (
            <div key={i} className="grid grid-cols-[1fr_5.5rem_2rem] gap-2">
              <input className="input" value={g.gradeName} aria-label="Grado" onChange={e => setGrades(gs => gs.map((x, j) => j === i ? { ...x, gradeName: e.target.value } : x))} />
              <input className="input text-center" type="number" min={1} value={g.studentCount} aria-label="Alumnos" onChange={e => setGrades(gs => gs.map((x, j) => j === i ? { ...x, studentCount: e.target.value } : x))} />
              <button type="button" disabled={grades.length === 1} onClick={() => setGrades(gs => gs.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500 disabled:opacity-20" aria-label="Quitar grado"><Trash2 size={15} /></button>
            </div>
          ))}
          <button type="button" onClick={() => setGrades(gs => [...gs, { gradeName: '', studentCount: '' }])} className="text-sm text-primary-600 font-medium flex items-center gap-1"><Plus size={14} /> Agregar grado</button>
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5"><Package size={16} /> Productos {kit && <span className="font-normal text-gray-500">(cantidad por alumno)</span>}</p>
        <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
          {items.map((it, i) => {
            const q = Number(it.quantity) || 0
            const custom = !it.productId
            return (
              <div key={it.key} className="px-3 py-2 text-sm space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    {custom ? (
                      <input className="input w-full" value={it.productName} placeholder="Nombre del producto" aria-label="Nombre del producto" onChange={e => setField(i, 'productName', e.target.value)} />
                    ) : (
                      <p className="text-gray-800 truncate">{it.productName}</p>
                    )}
                    <p className="text-xs text-gray-400">{custom ? 'Fuera del catálogo · ' : ''}{kit && q > 0 ? `${q * students} en total` : ''}</p>
                  </div>
                  <input className="input w-20 text-center" type="number" min={0} step="1" value={it.quantity} aria-label={`Cantidad de ${it.productName || 'producto'}`} onChange={e => setField(i, 'quantity', e.target.value)} />
                  <button type="button" onClick={() => setItems(xs => xs.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500" aria-label={`Quitar ${it.productName || 'producto'}`}><Trash2 size={15} /></button>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <label className="flex items-center gap-1">Venta Q
                    <input className="input !py-1 w-20" type="number" min={0} step="0.01" value={it.unitPrice} onChange={e => setField(i, 'unitPrice', e.target.value)} />
                  </label>
                  <label className="flex items-center gap-1">Costo Q
                    <input className="input !py-1 w-20" type="number" min={0} step="0.01" value={it.unitCost} onChange={e => setField(i, 'unitCost', e.target.value)} />
                  </label>
                  <span className="ml-auto">c/u</span>
                </div>
              </div>
            )
          })}
        </div>
        <button type="button" onClick={addCustom} className="mt-2 text-sm text-primary-600 font-medium flex items-center gap-1"><Plus size={14} /> Producto que no está en el catálogo</button>
        <div className="relative mt-2">
          <input className="input w-full" placeholder="Agregar producto: escribe para buscar…" value={props.productQuery} onChange={e => props.setProductQuery(e.target.value)} />
          {props.productHits.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
              {props.productHits.map(p => (
                <button key={p.id} type="button" onClick={() => props.onAddProduct(p)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex justify-between gap-2">
                  <span className="truncate">{p.name}{p.brand ? ` · ${p.brand}` : ''}</span>
                  <span className="text-gray-500 whitespace-nowrap">{money(p.basePrice)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={`rounded-lg p-3 text-sm ${diff == null ? 'bg-gray-50 text-gray-700' : Math.abs(diff) < 0.01 ? 'bg-green-50 text-green-800' : diff < 0 ? 'bg-amber-50 text-amber-900' : 'bg-red-50 text-red-800'}`}>
        <p>Nuevo total: <strong>{money(total)}</strong>{kit ? ` (${students} alumnos)` : ''}</p>
        <p className="mt-0.5 opacity-80">Costo {money(cost)} · ganancia <strong>{money(total - cost)}</strong>{total > 0 ? ` (${(((total - cost) / total) * 100).toFixed(1)}%)` : ''}</p>
        {expected != null && diff != null && (
          <p className="mt-0.5">Debe sumar {money(expected)} · {Math.abs(diff) < 0.01 ? 'cuadra' : diff < 0 ? `faltan ${money(-diff)}` : `sobran ${money(diff)}`}</p>
        )}
      </div>

      <div>
        <label className="label">Mensaje para el maestro (opcional)</label>
        <textarea rows={2} className="input w-full resize-none" value={props.message} onChange={e => props.setMessage(e.target.value)} placeholder={`Ej: Ajustamos tu pedido ${props.orderNumber}: cambiamos los crayones por marcadores, como pediste.`} />
        <p className="text-xs text-gray-400 mt-1">Le llega a su bandeja de Mensajes, ligado a este pedido.</p>
      </div>
    </div>
  )
}

// ── Packing sheet: one student's kit, how many kits per grade, and the totals ──
function PrepSheet({ order }: { order: Order }) {
  const items = order.items ?? []
  const kit = !!order.perStudent
  const grades = order.grades?.length ? order.grades : []
  const box = <span className="inline-block w-4 h-4 border border-gray-700 align-middle" />
  return (
    <div id="receipt-content" className="hidden print:block p-8 text-[12px] text-black bg-white">
      <div className="flex justify-between items-start border-b-2 border-black pb-3 mb-4">
        <div>
          <h1 className="text-xl font-bold">Hoja de preparación</h1>
          <p>{programLabel(order.programType)} · Pedido {order.orderNumber}</p>
        </div>
        <div className="text-right">
          <p className="font-semibold">{order.school?.name}</p>
          <p>Maestro: {order.teacher?.user?.name ?? '—'}</p>
          {order.deliveryDate && <p>Entrega: {new Date(order.deliveryDate).toLocaleDateString('es-GT', { timeZone: 'UTC' })}{order.deliveryTime ? ` ${order.deliveryTime}` : ''}</p>}
        </div>
      </div>

      {kit ? (
        <>
          <h2 className="text-base font-bold mb-2">Kit de cada alumno</h2>
          <table className="w-full border-collapse mb-5">
            <thead><tr className="border-b border-black"><th className="text-left py-1">Producto</th><th className="text-right py-1 w-28">Por kit</th></tr></thead>
            <tbody>
              {items.map(it => (
                <tr key={it.id} className="border-b border-gray-300"><td className="py-1.5">{it.productName}</td><td className="text-right py-1.5 font-semibold">{Number(it.qtyPerStudent ?? 0)}</td></tr>
              ))}
            </tbody>
          </table>

          <h2 className="text-base font-bold mb-2">Kits a preparar: {order.studentCount ?? 0}</h2>
          <table className="w-full border-collapse mb-5">
            <thead><tr className="border-b border-black"><th className="text-left py-1">Grado</th><th className="text-right py-1 w-28">Kits</th><th className="w-20 text-center py-1">Listo</th></tr></thead>
            <tbody>
              {grades.map((g, i) => (
                <tr key={g.id ?? i} className="border-b border-gray-300"><td className="py-1.5">{g.gradeName}</td><td className="text-right py-1.5 font-semibold">{g.studentCount}</td><td className="text-center">{box}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="mb-3">Grados: {gradeText(order)}{order.studentCount ? ` · ${order.studentCount} alumnos` : ''}</p>
      )}

      <h2 className="text-base font-bold mb-2">{kit ? 'Total a despachar' : 'Productos a despachar'}</h2>
      <table className="w-full border-collapse mb-6">
        <thead><tr className="border-b border-black"><th className="text-left py-1">Producto</th><th className="text-right py-1 w-28">Cantidad</th><th className="w-20 text-center py-1">Listo</th></tr></thead>
        <tbody>
          {items.map(it => (
            <tr key={it.id} className="border-b border-gray-300"><td className="py-1.5">{it.productName}</td><td className="text-right py-1.5 font-semibold">{Number(it.quantity)}</td><td className="text-center">{box}</td></tr>
          ))}
        </tbody>
      </table>

      {order.notes && <p className="mb-6"><strong>Notas del maestro:</strong> {order.notes}</p>}
      <div className="grid grid-cols-2 gap-10 mt-10">
        <p className="border-t border-black pt-1">Preparado por</p>
        <p className="border-t border-black pt-1">Revisado por</p>
      </div>
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
