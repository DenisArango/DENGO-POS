import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Search, Eye, Copy, Edit, Trash2, DollarSign,
  ShoppingCart, TrendingUp, CreditCard, AlertCircle, X, Check
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { useAuthStore } from '../../store'
import { UserRole } from '../../types'

// ─── Mock types ──────────────────────────────────────────────────────────────
interface MockSaleItem {
  id: string
  productName: string
  quantity: number
  unitPrice: number
  total: number
}

interface MockSale {
  id: string
  invoiceNumber: string
  date: string
  customerName: string
  items: MockSaleItem[]
  subtotal: number
  tax: number
  total: number
  paymentMethod: 'CASH' | 'CARD' | 'TRANSFER'
  cashier: string
  notes?: string
}

// ─── Mock data ────────────────────────────────────────────────────────────────
const INITIAL_SALES: MockSale[] = [
  {
    id: '1', invoiceNumber: 'FAC-00001',
    date: '2026-03-15T08:15:00', customerName: 'Carlos Méndez',
    items: [
      { id: 'i1', productName: 'Coca Cola 600ml', quantity: 4, unitPrice: 8.50, total: 34.00 },
      { id: 'i2', productName: 'Sabritas Original', quantity: 2, unitPrice: 12.00, total: 24.00 },
    ],
    subtotal: 58.00, tax: 6.96, total: 64.96, paymentMethod: 'CASH', cashier: 'Ana López',
  },
  {
    id: '2', invoiceNumber: 'FAC-00002',
    date: '2026-03-15T09:30:00', customerName: 'María García',
    items: [
      { id: 'i3', productName: 'Galletas Oreo', quantity: 3, unitPrice: 15.50, total: 46.50 },
    ],
    subtotal: 46.50, tax: 5.58, total: 52.08, paymentMethod: 'CARD', cashier: 'Pedro Ruiz',
  },
  {
    id: '3', invoiceNumber: 'FAC-00003',
    date: '2026-03-15T10:00:00', customerName: 'José Hernández',
    items: [
      { id: 'i4', productName: 'Agua Ciel 1L', quantity: 6, unitPrice: 7.00, total: 42.00 },
      { id: 'i5', productName: 'Chocolate Snickers', quantity: 2, unitPrice: 18.00, total: 36.00 },
    ],
    subtotal: 78.00, tax: 9.36, total: 87.36, paymentMethod: 'TRANSFER', cashier: 'Ana López',
    notes: 'Entrega a domicilio',
  },
  {
    id: '4', invoiceNumber: 'FAC-00004',
    date: '2026-03-14T11:20:00', customerName: 'Sofía Martínez',
    items: [
      { id: 'i6', productName: 'Cuaderno espiral 100h', quantity: 5, unitPrice: 22.00, total: 110.00 },
    ],
    subtotal: 110.00, tax: 13.20, total: 123.20, paymentMethod: 'CASH', cashier: 'Pedro Ruiz',
  },
  {
    id: '5', invoiceNumber: 'FAC-00005',
    date: '2026-03-14T12:45:00', customerName: 'Luis Torres',
    items: [
      { id: 'i7', productName: 'Coca Cola 600ml', quantity: 2, unitPrice: 8.50, total: 17.00 },
      { id: 'i8', productName: 'Galletas Oreo', quantity: 1, unitPrice: 15.50, total: 15.50 },
      { id: 'i9', productName: 'Agua Ciel 1L', quantity: 3, unitPrice: 7.00, total: 21.00 },
    ],
    subtotal: 53.50, tax: 6.42, total: 59.92, paymentMethod: 'CARD', cashier: 'Ana López',
  },
  {
    id: '6', invoiceNumber: 'FAC-00006',
    date: '2026-03-14T14:10:00', customerName: 'Elena Ramírez',
    items: [
      { id: 'i10', productName: 'Sabritas Original', quantity: 4, unitPrice: 12.00, total: 48.00 },
      { id: 'i11', productName: 'Chocolate Snickers', quantity: 3, unitPrice: 18.00, total: 54.00 },
    ],
    subtotal: 102.00, tax: 12.24, total: 114.24, paymentMethod: 'CASH', cashier: 'Pedro Ruiz',
  },
  {
    id: '7', invoiceNumber: 'FAC-00007',
    date: '2026-03-13T08:55:00', customerName: 'Diego Flores',
    items: [
      { id: 'i12', productName: 'Agua Ciel 1L', quantity: 12, unitPrice: 7.00, total: 84.00 },
    ],
    subtotal: 84.00, tax: 10.08, total: 94.08, paymentMethod: 'TRANSFER', cashier: 'Ana López',
    notes: 'Pedido semanal',
  },
  {
    id: '8', invoiceNumber: 'FAC-00008',
    date: '2026-03-13T10:30:00', customerName: 'Valentina Cruz',
    items: [
      { id: 'i13', productName: 'Cuaderno espiral 100h', quantity: 2, unitPrice: 22.00, total: 44.00 },
      { id: 'i14', productName: 'Coca Cola 600ml', quantity: 3, unitPrice: 8.50, total: 25.50 },
    ],
    subtotal: 69.50, tax: 8.34, total: 77.84, paymentMethod: 'CARD', cashier: 'Pedro Ruiz',
  },
  {
    id: '9', invoiceNumber: 'FAC-00009',
    date: '2026-03-13T15:00:00', customerName: 'Roberto Soto',
    items: [
      { id: 'i15', productName: 'Sabritas Original', quantity: 6, unitPrice: 12.00, total: 72.00 },
      { id: 'i16', productName: 'Galletas Oreo', quantity: 4, unitPrice: 15.50, total: 62.00 },
    ],
    subtotal: 134.00, tax: 16.08, total: 150.08, paymentMethod: 'CASH', cashier: 'Ana López',
  },
  {
    id: '10', invoiceNumber: 'FAC-00010',
    date: '2026-03-12T09:00:00', customerName: 'Carmen Jiménez',
    items: [
      { id: 'i17', productName: 'Chocolate Snickers', quantity: 5, unitPrice: 18.00, total: 90.00 },
    ],
    subtotal: 90.00, tax: 10.80, total: 100.80, paymentMethod: 'CARD', cashier: 'Pedro Ruiz',
  },
  {
    id: '11', invoiceNumber: 'FAC-00011',
    date: '2026-03-12T11:45:00', customerName: 'Fernando López',
    items: [
      { id: 'i18', productName: 'Agua Ciel 1L', quantity: 8, unitPrice: 7.00, total: 56.00 },
      { id: 'i19', productName: 'Sabritas Original', quantity: 3, unitPrice: 12.00, total: 36.00 },
    ],
    subtotal: 92.00, tax: 11.04, total: 103.04, paymentMethod: 'TRANSFER', cashier: 'Ana López',
  },
  {
    id: '12', invoiceNumber: 'FAC-00012',
    date: '2026-03-11T13:20:00', customerName: 'Isabel Morales',
    items: [
      { id: 'i20', productName: 'Coca Cola 600ml', quantity: 10, unitPrice: 8.50, total: 85.00 },
    ],
    subtotal: 85.00, tax: 10.20, total: 95.20, paymentMethod: 'CASH', cashier: 'Pedro Ruiz',
    notes: 'Cliente frecuente',
  },
  {
    id: '13', invoiceNumber: 'FAC-00013',
    date: '2026-03-11T16:00:00', customerName: 'Miguel Vargas',
    items: [
      { id: 'i21', productName: 'Galletas Oreo', quantity: 6, unitPrice: 15.50, total: 93.00 },
      { id: 'i22', productName: 'Cuaderno espiral 100h', quantity: 1, unitPrice: 22.00, total: 22.00 },
    ],
    subtotal: 115.00, tax: 13.80, total: 128.80, paymentMethod: 'CARD', cashier: 'Ana López',
  },
  {
    id: '14', invoiceNumber: 'FAC-00014',
    date: '2026-03-10T10:15:00', customerName: 'Patricia Reyes',
    items: [
      { id: 'i23', productName: 'Chocolate Snickers', quantity: 8, unitPrice: 18.00, total: 144.00 },
    ],
    subtotal: 144.00, tax: 17.28, total: 161.28, paymentMethod: 'TRANSFER', cashier: 'Pedro Ruiz',
  },
  {
    id: '15', invoiceNumber: 'FAC-00015',
    date: '2026-03-10T14:30:00', customerName: 'Andrés Castro',
    items: [
      { id: 'i24', productName: 'Agua Ciel 1L', quantity: 5, unitPrice: 7.00, total: 35.00 },
      { id: 'i25', productName: 'Coca Cola 600ml', quantity: 5, unitPrice: 8.50, total: 42.50 },
      { id: 'i26', productName: 'Sabritas Original', quantity: 2, unitPrice: 12.00, total: 24.00 },
    ],
    subtotal: 101.50, tax: 12.18, total: 113.68, paymentMethod: 'CASH', cashier: 'Ana López',
  },
]

const PAYMENT_LABELS: Record<'CASH' | 'CARD' | 'TRANSFER', string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
}

const PAYMENT_COLORS: Record<'CASH' | 'CARD' | 'TRANSFER', string> = {
  CASH: 'bg-green-100 text-green-700',
  CARD: 'bg-blue-100 text-blue-700',
  TRANSFER: 'bg-purple-100 text-purple-700',
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function SalesHistoryReport() {
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const canEdit = user?.role === UserRole.ADMIN || user?.role === UserRole.AUDITOR

  const [sales, setSales] = useState<MockSale[]>(INITIAL_SALES)

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [filterPayment, setFilterPayment] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Modals
  const [viewSale, setViewSale] = useState<MockSale | null>(null)
  const [editSale, setEditSale] = useState<MockSale | null>(null)
  const [editCustomerName, setEditCustomerName] = useState('')
  const [editPaymentMethod, setEditPaymentMethod] = useState<'CASH' | 'CARD' | 'TRANSFER'>('CASH')
  const [editNotes, setEditNotes] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // ── Derived ───────────────────────────────────────────────────────────────
  const filteredSales = sales.filter(s => {
    const matchSearch =
      s.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.customerName.toLowerCase().includes(searchTerm.toLowerCase())
    const matchPayment = filterPayment === 'all' || s.paymentMethod === filterPayment
    const saleDate = new Date(s.date)
    const matchFrom = !dateFrom || saleDate >= new Date(dateFrom)
    const matchTo = !dateTo || saleDate <= new Date(dateTo + 'T23:59:59')
    return matchSearch && matchPayment && matchFrom && matchTo
  })

  const stats = {
    totalSales: filteredSales.length,
    totalAmount: filteredSales.reduce((s, sale) => s + sale.total, 0),
    averageTicket: filteredSales.length > 0
      ? filteredSales.reduce((s, sale) => s + sale.total, 0) / filteredSales.length
      : 0,
    byCash: filteredSales.filter(s => s.paymentMethod === 'CASH').reduce((a, s) => a + s.total, 0),
    byCard: filteredSales.filter(s => s.paymentMethod === 'CARD').reduce((a, s) => a + s.total, 0),
    byTransfer: filteredSales.filter(s => s.paymentMethod === 'TRANSFER').reduce((a, s) => a + s.total, 0),
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleDuplicate = (sale: MockSale) => {
    const duplicate: MockSale = {
      ...sale,
      id: crypto.randomUUID(),
      invoiceNumber: `FAC-${Date.now().toString().slice(-5)}`,
      date: new Date().toISOString(),
      items: sale.items.map(i => ({ ...i, id: crypto.randomUUID() })),
    }
    setSales(prev => [duplicate, ...prev])
    toast.success(`Venta duplicada como ${duplicate.invoiceNumber}`)
  }

  const handleOpenEdit = (sale: MockSale) => {
    setEditSale(sale)
    setEditCustomerName(sale.customerName)
    setEditPaymentMethod(sale.paymentMethod)
    setEditNotes(sale.notes ?? '')
  }

  const handleSaveEdit = () => {
    if (!editSale) return
    if (!editCustomerName.trim()) { toast.error('El nombre del cliente no puede estar vacío'); return }
    setSales(prev => prev.map(s =>
      s.id === editSale.id
        ? { ...s, customerName: editCustomerName.trim(), paymentMethod: editPaymentMethod, notes: editNotes || undefined }
        : s
    ))
    toast.success('Venta actualizada')
    setEditSale(null)
  }

  const handleDelete = (id: string) => {
    setSales(prev => prev.filter(s => s.id !== id))
    toast.success('Venta eliminada')
    setDeleteConfirm(null)
    if (viewSale?.id === id) setViewSale(null)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Historial de Ventas</h1>
            <p className="text-gray-600 text-sm mt-1">Consulta y gestiona el registro completo de ventas</p>
          </div>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          { label: 'Total Ventas', value: stats.totalSales, fmt: (v: number) => String(v), Icon: ShoppingCart, color: 'blue' },
          { label: 'Monto Total', value: stats.totalAmount, fmt: (v: number) => `Q${v.toFixed(2)}`, Icon: DollarSign, color: 'green' },
          { label: 'Ticket Promedio', value: stats.averageTicket, fmt: (v: number) => `Q${v.toFixed(2)}`, Icon: TrendingUp, color: 'purple' },
          { label: 'Efectivo', value: stats.byCash, fmt: (v: number) => `Q${v.toFixed(2)}`, Icon: DollarSign, color: 'emerald' },
          { label: 'Tarjeta', value: stats.byCard, fmt: (v: number) => `Q${v.toFixed(2)}`, Icon: CreditCard, color: 'blue' },
          { label: 'Transferencia', value: stats.byTransfer, fmt: (v: number) => `Q${v.toFixed(2)}`, Icon: CreditCard, color: 'violet' },
        ].map(({ label, value, fmt, Icon, color }, idx) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="bg-white rounded-lg shadow-sm p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600 text-sm">{label}</span>
              <Icon className={`text-${color}-600`} size={20} />
            </div>
            <p className="text-xl font-bold text-gray-800">{fmt(value)}</p>
          </motion.div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="bg-white rounded-lg shadow-sm p-4 flex flex-col md:flex-row gap-4 flex-wrap">
        <div className="flex-1 min-w-48 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text" placeholder="Buscar por factura o cliente…"
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className="input pl-10 w-full"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input" title="Desde" />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input" title="Hasta" />
          <select value={filterPayment} onChange={e => setFilterPayment(e.target.value)} className="input">
            <option value="all">Todos los pagos</option>
            <option value="CASH">Efectivo</option>
            <option value="CARD">Tarjeta</option>
            <option value="TRANSFER">Transferencia</option>
          </select>
        </div>
      </div>

      {/* ── Table ── */}
      {filteredSales.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <ShoppingCart size={48} className="mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600">No se encontraron ventas con los filtros aplicados</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                {['Factura', 'Fecha', 'Cliente', 'Items', 'Subtotal', 'IVA', 'Total', 'Pago', 'Cajero', ...(canEdit ? ['Acciones'] : [])].map(h => (
                  <th key={h} className="text-left p-4 text-sm font-semibold text-gray-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredSales.map(sale => (
                <motion.tr key={sale.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-gray-50">
                  <td className="p-4 font-mono text-sm text-gray-600">{sale.invoiceNumber}</td>
                  <td className="p-4 text-sm text-gray-700 whitespace-nowrap">
                    {format(new Date(sale.date), "d MMM yyyy, HH:mm", { locale: es })}
                  </td>
                  <td className="p-4 text-sm">{sale.customerName}</td>
                  <td className="p-4 text-sm text-gray-700">{sale.items.length}</td>
                  <td className="p-4 text-sm text-gray-700">Q{sale.subtotal.toFixed(2)}</td>
                  <td className="p-4 text-sm text-gray-700">Q{sale.tax.toFixed(2)}</td>
                  <td className="p-4 font-semibold text-gray-800">Q{sale.total.toFixed(2)}</td>
                  <td className="p-4">
                    <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${PAYMENT_COLORS[sale.paymentMethod]}`}>
                      {PAYMENT_LABELS[sale.paymentMethod]}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-gray-700">{sale.cashier}</td>
                  {canEdit && (
                    <td className="p-4">
                      <div className="flex gap-1">
                        <button
                          onClick={() => setViewSale(sale)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="Ver detalles">
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => handleDuplicate(sale)}
                          className="p-2 text-green-600 hover:bg-green-50 rounded-lg" title="Duplicar">
                          <Copy size={16} />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(sale)}
                          className="p-2 text-yellow-600 hover:bg-yellow-50 rounded-lg" title="Editar">
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(sale.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg" title="Eliminar">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  )}
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
          MODAL: VIEW DETAILS
      ═══════════════════════════════════════════════════ */}
      {viewSale && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

            <div className="p-6 border-b flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Venta {viewSale.invoiceNumber}</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {format(new Date(viewSale.date), "d 'de' MMMM, yyyy – HH:mm", { locale: es })}
                </p>
              </div>
              <button onClick={() => setViewSale(null)} className="p-1 hover:bg-gray-100 rounded">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded-lg p-4 text-sm">
                <div><p className="text-gray-500">Cliente</p><p className="font-medium">{viewSale.customerName}</p></div>
                <div><p className="text-gray-500">Cajero</p><p className="font-medium">{viewSale.cashier}</p></div>
                <div>
                  <p className="text-gray-500">Método de pago</p>
                  <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${PAYMENT_COLORS[viewSale.paymentMethod]}`}>
                    {PAYMENT_LABELS[viewSale.paymentMethod]}
                  </span>
                </div>
              </div>

              <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-3 font-medium text-gray-600">Producto</th>
                    <th className="text-right p-3 font-medium text-gray-600">Cant.</th>
                    <th className="text-right p-3 font-medium text-gray-600">Precio</th>
                    <th className="text-right p-3 font-medium text-gray-600">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {viewSale.items.map(item => (
                    <tr key={item.id}>
                      <td className="p-3">{item.productName}</td>
                      <td className="p-3 text-right">{item.quantity}</td>
                      <td className="p-3 text-right">Q{item.unitPrice.toFixed(2)}</td>
                      <td className="p-3 text-right font-semibold">Q{item.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-end">
                <div className="w-52 space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-gray-600">Subtotal:</span><span>Q{viewSale.subtotal.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">IVA (12%):</span><span>Q{viewSale.tax.toFixed(2)}</span></div>
                  <div className="flex justify-between font-bold text-base border-t pt-1"><span>Total:</span><span>Q{viewSale.total.toFixed(2)}</span></div>
                </div>
              </div>

              {viewSale.notes && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
                  <strong>Notas: </strong>{viewSale.notes}
                </div>
              )}
            </div>

            <div className="p-6 border-t flex justify-end">
              <button onClick={() => setViewSale(null)} className="btn-secondary btn-md">Cerrar</button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
          MODAL: EDIT
      ═══════════════════════════════════════════════════ */}
      {editSale && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-lg shadow-xl w-full max-w-md">

            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold text-gray-800">Editar {editSale.invoiceNumber}</h2>
              <button onClick={() => setEditSale(null)} className="p-1 hover:bg-gray-100 rounded"><X size={20} /></button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="label">Nombre del Cliente</label>
                <input
                  type="text" value={editCustomerName}
                  onChange={e => setEditCustomerName(e.target.value)}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="label">Método de Pago</label>
                <select
                  value={editPaymentMethod}
                  onChange={e => setEditPaymentMethod(e.target.value as 'CASH' | 'CARD' | 'TRANSFER')}
                  className="input w-full"
                >
                  <option value="CASH">Efectivo</option>
                  <option value="CARD">Tarjeta</option>
                  <option value="TRANSFER">Transferencia</option>
                </select>
              </div>
              <div>
                <label className="label">Notas</label>
                <textarea
                  value={editNotes} onChange={e => setEditNotes(e.target.value)}
                  className="input min-h-[80px] w-full" placeholder="Observaciones opcionales…"
                />
              </div>
            </div>

            <div className="p-6 border-t flex gap-3 justify-end">
              <button onClick={() => setEditSale(null)} className="btn-secondary btn-md">Cancelar</button>
              <button onClick={handleSaveEdit} className="btn-primary btn-md flex items-center gap-2">
                <Check size={16} /> Guardar Cambios
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ─── Delete Confirm ───────────────────────────────────────────────── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-red-100 rounded-full"><AlertCircle className="text-red-600" size={24} /></div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-800 mb-2">Eliminar Venta</h3>
                <p className="text-gray-600 mb-6">¿Eliminar esta venta? Esta acción no se puede deshacer.</p>
                <div className="flex gap-3 justify-end">
                  <button onClick={() => setDeleteConfirm(null)} className="btn-secondary btn-md">Cancelar</button>
                  <button onClick={() => handleDelete(deleteConfirm)} className="btn-danger btn-md">Eliminar</button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
