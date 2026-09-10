import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Plus, Search, Edit2, Trash2, Eye, AlertCircle,
  User, Mail, Phone, MapPin, CreditCard, CheckCircle,
  XCircle, DollarSign, TrendingUp, Clock, ShoppingBag, ExternalLink
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { useAuthStore } from '../store'
import { useStore } from '../contexts/StoreContext'
import { usePermissions } from '../hooks/usePermissions'

interface AbonoSale {
  id: string
  invoiceNumber?: string
  total: number
  paidAmount?: number
  isPaid?: boolean
  isVoided?: boolean
}

interface OpenRegister {
  id: string
  name?: string
  registerNumber?: string
}

interface Customer {
  id: string
  nit: string
  name: string
  email?: string
  phone?: string
  address?: string
  avatarUrl?: string
  comments?: string
  creditEnabled?: boolean
  creditLimitEnabled?: boolean
  creditLimit?: number
  creditUsed?: number
  creditAvailable?: number | null // null = crédito sin límite
  isActive?: boolean
  totalPurchases?: number
  purchasesCount?: number
  lastPurchase?: string
}

export default function Customers() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { currentStore } = useStore()
  const BRANCH_ID = currentStore?.id ?? user?.branchId ?? ''
  const { hasPermission } = usePermissions()
  const canCreate = hasPermission('customers.create')
  const canEdit = hasPermission('customers.edit')
  const canDelete = hasPermission('customers.delete')
  const canRegisterPayment = hasPermission('customers.registerPayment')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [showModal, setShowModal] = useState(false)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [detailTab, setDetailTab] = useState<'info' | 'history'>('info')
  const [customerSales, setCustomerSales] = useState<any[]>([])
  const [loadingSales, setLoadingSales] = useState(false)

  // Abono (credit payment) modal
  const [showAbonoModal, setShowAbonoModal] = useState(false)
  const [abonoCustomer, setAbonoCustomer] = useState<Customer | null>(null)
  const [abonoSales, setAbonoSales] = useState<AbonoSale[]>([])
  const [loadingAbonoSales, setLoadingAbonoSales] = useState(false)
  const [abonoAmount, setAbonoAmount] = useState('')
  const [abonoMethod, setAbonoMethod] = useState<'CASH' | 'CARD' | 'TRANSFER'>('CASH')
  const [abonoRegisterId, setAbonoRegisterId] = useState('')
  const [openRegisters, setOpenRegisters] = useState<{ id: string; name: string; registerNumber: string }[]>([])
  const [savingAbono, setSavingAbono] = useState(false)

  const [formData, setFormData] = useState({
    nit: '',
    name: '',
    email: '',
    phone: '',
    address: '',
    avatarUrl: '',
    comments: '',
    creditEnabled: false,
    creditLimitEnabled: true,
    creditLimit: 0,
    isActive: true,
  })

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { toast.error('La imagen no debe superar 2MB'); return }
    const reader = new FileReader()
    reader.onloadend = () => setFormData(prev => ({ ...prev, avatarUrl: reader.result as string }))
    reader.readAsDataURL(file)
  }

  const openDetails = (customer: Customer) => {
    setSelectedCustomer(customer)
    setDetailTab('info')
    setShowDetailsModal(true)
  }

  const openHistoryTab = () => {
    if (!selectedCustomer) return
    setDetailTab('history')
    if (customerSales.length === 0 || customerSales[0]?.customerId !== selectedCustomer.id) {
      setLoadingSales(true)
      api.get<any[]>(`/api/sales?customerId=${selectedCustomer.id}&includeVoided=true`)
        .then(d => setCustomerSales(d ?? []))
        .catch(() => setCustomerSales([]))
        .finally(() => setLoadingSales(false))
    }
  }

  const fetchCustomers = () => {
    setLoading(true)
    api.get<Customer[]>('/api/customers')
      .then(setCustomers)
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchCustomers() }, [])

  const filtered = customers.filter(c => {
    const matchSearch =
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.nit.includes(searchTerm) ||
      (c.email ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.phone ?? '').includes(searchTerm)
    const matchStatus =
      filterStatus === 'all' ||
      (filterStatus === 'active' && c.isActive !== false) ||
      (filterStatus === 'inactive' && c.isActive === false) ||
      (filterStatus === 'credit' && (c.creditLimit ?? 0) > 0)
    return matchSearch && matchStatus
  })

  const stats = {
    total: customers.length,
    active: customers.filter(c => c.isActive !== false).length,
    withCredit: customers.filter(c => (c.creditLimit ?? 0) > 0).length,
    totalCreditUsed: customers.reduce((s, c) => s + Number(c.creditUsed ?? 0), 0),
  }

  const openCreate = () => {
    setEditingCustomer(null)
    setFormData({ nit: '', name: '', email: '', phone: '', address: '', avatarUrl: '', comments: '', creditEnabled: false, creditLimitEnabled: true, creditLimit: 0, isActive: true })
    setShowModal(true)
  }

  const openEdit = (customer: Customer) => {
    setEditingCustomer(customer)
    setFormData({
      nit: customer.nit,
      name: customer.name,
      email: customer.email ?? '',
      phone: customer.phone ?? '',
      address: customer.address ?? '',
      avatarUrl: customer.avatarUrl ?? '',
      comments: customer.comments ?? '',
      creditEnabled: !!customer.creditEnabled,
      creditLimitEnabled: customer.creditLimitEnabled ?? true,
      creditLimit: customer.creditLimit ?? 0,
      isActive: customer.isActive !== false,
    })
    setShowModal(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.nit || !formData.name) {
      toast.error('NIT y nombre son requeridos')
      return
    }

    if (editingCustomer) {
      api.put(`/api/customers/${editingCustomer.id}`, {
        ...formData,
      })
        .then(() => {
          toast.success('Cliente actualizado')
          setShowModal(false)
          fetchCustomers()
        })
        .catch(e => toast.error(e.message))
    } else {
      api.post('/api/customers', {
        ...formData,
        creditUsed: 0,
        creditAvailable: formData.creditLimit,
      })
        .then(() => {
          toast.success('Cliente creado correctamente')
          setShowModal(false)
          fetchCustomers()
        })
        .catch(e => toast.error(e.message))
    }
  }

  const handleDelete = (id: string) => {
    api.delete(`/api/customers/${id}`)
      .then(() => {
        toast.success('Cliente eliminado')
        setShowDeleteConfirm(null)
        fetchCustomers()
      })
      .catch(e => toast.error(e.message))
  }

  // ── Abonos (credit payments) ────────────────────────────────────────────
  // A single abono against the customer's overall balance — no need to pick
  // which invoice it pays. The backend applies it oldest-sale-first,
  // splitting across as many as needed; abonoSales here is read-only context
  // (how much is owed and across how many invoices), not a selection.
  const openAbonoModal = (customer: Customer) => {
    setAbonoCustomer(customer)
    setAbonoAmount('')
    setAbonoMethod('CASH')
    setAbonoRegisterId('')
    setShowAbonoModal(true)
    setLoadingAbonoSales(true)
    api.get<AbonoSale[]>(`/api/sales?customerId=${customer.id}&saleType=CREDIT`)
      .then(sales => {
        const outstanding = (sales ?? []).filter(s => !s.isVoided && !s.isPaid)
        setAbonoSales(outstanding)
      })
      .catch(() => setAbonoSales([]))
      .finally(() => setLoadingAbonoSales(false))
    if (BRANCH_ID) {
      api.get<OpenRegister[]>(`/api/cash-registers/current?branchId=${BRANCH_ID}`)
        .then(d => {
          const list = (Array.isArray(d) ? d : (d ? [d] : [])).filter(Boolean)
          setOpenRegisters(list.map(r => ({ id: r.id, name: r.name ?? 'Caja', registerNumber: r.registerNumber ?? '?' })))
        })
        .catch(() => setOpenRegisters([]))
    }
  }

  const abonoRemaining = (sale: AbonoSale) => Number(sale.total ?? 0) - Number(sale.paidAmount ?? 0)
  const abonoTotalOutstanding = abonoSales.reduce((s, sale) => s + abonoRemaining(sale), 0)

  const handleSaveAbono = () => {
    if (!abonoCustomer) return
    const amount = parseFloat(abonoAmount)
    if (!amount || amount <= 0) { toast.error('Ingresa un monto válido'); return }
    if (amount > abonoTotalOutstanding + 0.001) {
      toast.error(`El abono excede el saldo pendiente (Q${abonoTotalOutstanding.toFixed(2)})`); return
    }
    if (abonoMethod === 'CASH' && openRegisters.length > 0 && !abonoRegisterId) {
      toast.error('Selecciona la caja donde se recibe el abono'); return
    }
    setSavingAbono(true)
    api.post<{ salesAffected: number }>(`/api/customers/${abonoCustomer.id}/credit-payment`, {
      amount,
      paymentMethod: abonoMethod,
      cashRegisterId: abonoMethod === 'CASH' ? (abonoRegisterId || undefined) : undefined,
    })
      .then(res => {
        toast.success(`Abono registrado — aplicado a ${res.salesAffected} factura${res.salesAffected === 1 ? '' : 's'}`)
        setShowAbonoModal(false)
        fetchCustomers()
      })
      .catch(e => toast.error(e.message))
      .finally(() => setSavingAbono(false))
  }

  const creditPct = (c: Customer) => {
    if (!c.creditEnabled || !c.creditLimitEnabled) return 0
    const limit = Number(c.creditLimit)
    if (!limit) return 0
    return Math.round((Number(c.creditUsed ?? 0) / limit) * 100)
  }

  const creditLabel = (c: Customer) => {
    if (!c.creditEnabled) return 'Sin crédito'
    if (!c.creditLimitEnabled) return `Ilimitado · usado Q${Number(c.creditUsed ?? 0).toFixed(2)}`
    return `Q${Number(c.creditUsed ?? 0).toFixed(2)} / Q${Number(c.creditLimit ?? 0).toFixed(2)}`
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Clientes</h1>
          <p className="text-gray-600 mt-1">Gestiona tu cartera de clientes y créditos</p>
        </div>
        {canCreate && (
          <button onClick={openCreate} className="btn-primary btn-md flex items-center gap-2">
            <Plus size={20} /> Nuevo Cliente
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Clientes',    value: stats.total,                      Icon: User,       bg: 'bg-blue-100',    color: 'text-blue-600' },
          { label: 'Activos',           value: stats.active,                     Icon: CheckCircle,bg: 'bg-green-100',   color: 'text-green-600' },
          { label: 'Con Crédito',       value: stats.withCredit,                 Icon: CreditCard, bg: 'bg-purple-100',  color: 'text-purple-600' },
          { label: 'Crédito Utilizado', value: `Q${stats.totalCreditUsed.toLocaleString()}`, Icon: TrendingUp, bg: 'bg-orange-100', color: 'text-orange-600' },
        ].map(({ label, value, Icon, bg, color }) => (
          <motion.div key={label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">{label}</p>
                <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
              </div>
              <div className={`p-3 ${bg} rounded-lg`}><Icon className={color} size={24} /></div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm p-4 flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input type="text" placeholder="Buscar por nombre, NIT, email o teléfono…"
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className="input pl-10 w-full" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input">
          <option value="all">Todos</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
          <option value="credit">Con crédito</option>
        </select>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <User size={48} className="mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600">
            {searchTerm ? 'No se encontraron clientes' : 'No hay clientes registrados'}
          </p>
          {!searchTerm && canCreate && (
            <button onClick={openCreate} className="btn-primary btn-md mt-4">Agregar Primer Cliente</button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                {['Cliente', 'Contacto', 'Dirección', 'Crédito', 'Estado', 'Acciones'].map(h => (
                  <th key={h} className="text-left p-4 text-sm font-semibold text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filtered.map(customer => (
                <motion.tr key={customer.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="hover:bg-gray-50">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      {customer.avatarUrl ? (
                        <img src={customer.avatarUrl} alt={customer.name} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center font-semibold text-primary-600 text-sm flex-shrink-0">
                          {customer.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-gray-800">{customer.name}</p>
                        <p className="text-xs text-gray-500">NIT: {customer.nit}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="space-y-1">
                      {customer.email && (
                        <div className="flex items-center gap-1 text-xs text-gray-600">
                          <Mail size={12} />{customer.email}
                        </div>
                      )}
                      {customer.phone && (
                        <div className="flex items-center gap-1 text-xs text-gray-600">
                          <Phone size={12} />{customer.phone}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="p-4">
                    {customer.address ? (
                      <div className="flex items-center gap-1 text-xs text-gray-600">
                        <MapPin size={12} /><span className="max-w-[150px] truncate">{customer.address}</span>
                      </div>
                    ) : <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td className="p-4">
                    {customer.creditEnabled && customer.creditLimitEnabled ? (
                      <div className="w-32">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-600">Q{customer.creditUsed ?? 0} / Q{customer.creditLimit}</span>
                          <span className={`font-medium ${creditPct(customer) > 80 ? 'text-red-600' : 'text-gray-700'}`}>
                            {creditPct(customer)}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full ${creditPct(customer) > 80 ? 'bg-red-500' : 'bg-primary-500'}`}
                            style={{ width: `${creditPct(customer)}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">{creditLabel(customer)}</span>
                    )}
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${customer.isActive !== false ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {customer.isActive !== false ? <CheckCircle size={11} /> : <XCircle size={11} />}
                      {customer.isActive !== false ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex gap-1">
                      <button onClick={() => openDetails(customer)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="Ver">
                        <Eye size={16} />
                      </button>
                      {canRegisterPayment && (customer.creditUsed ?? 0) > 0 && (
                        <button onClick={() => openAbonoModal(customer)}
                          className="p-2 text-green-600 hover:bg-green-50 rounded-lg" title="Registrar abono">
                          <DollarSign size={16} />
                        </button>
                      )}
                      {canEdit && (
                        <button onClick={() => openEdit(customer)}
                          className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg" title="Editar">
                          <Edit2 size={16} />
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => setShowDeleteConfirm(customer.id)}
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
      )}

      {/* ── Create/Edit Modal ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-lg shadow-xl w-full max-w-lg">
            <div className="p-6 border-b">
              <h2 className="text-xl font-bold text-gray-800">
                {editingCustomer ? 'Editar Cliente' : 'Nuevo Cliente'}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="flex items-center gap-4">
                {formData.avatarUrl ? (
                  <div className="relative">
                    <img src={formData.avatarUrl} alt="Foto" className="h-16 w-16 rounded-full object-cover border border-gray-200" />
                    <button type="button" onClick={() => setFormData({ ...formData, avatarUrl: '' })}
                      className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5">
                      <XCircle size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="h-16 w-16 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center">
                    <User size={24} className="text-gray-300" />
                  </div>
                )}
                <label className="btn-outline btn-sm cursor-pointer">
                  Subir foto
                  <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">NIT *</label>
                  <input type="text" value={formData.nit}
                    onChange={e => setFormData({ ...formData, nit: e.target.value })}
                    className="input" required placeholder="CF / 12345678" />
                </div>
                <div>
                  <label className="label">Nombre completo *</label>
                  <input type="text" value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="input" required />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input type="email" value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    className="input" />
                </div>
                <div>
                  <label className="label">Teléfono</label>
                  <input type="tel" value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    className="input" />
                </div>
                <div className="col-span-2">
                  <label className="label">Dirección</label>
                  <input type="text" value={formData.address}
                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                    className="input" />
                </div>
                <div className="flex items-center">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={formData.isActive}
                      onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                      className="w-4 h-4 text-primary-600 rounded" />
                    <span className="text-sm text-gray-700">Cliente Activo</span>
                  </label>
                </div>
                <div className="col-span-2 border-t pt-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={formData.creditEnabled}
                      onChange={e => setFormData({ ...formData, creditEnabled: e.target.checked })}
                      className="w-4 h-4 text-primary-600 rounded" />
                    <span className="text-sm text-gray-700">Permite ventas a crédito</span>
                  </label>
                  {formData.creditEnabled && (
                    <div className="mt-2 pl-6 flex items-center gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={formData.creditLimitEnabled}
                          onChange={e => setFormData({ ...formData, creditLimitEnabled: e.target.checked })}
                          className="w-4 h-4 text-primary-600 rounded" />
                        <span className="text-sm text-gray-700">Con límite</span>
                      </label>
                      {formData.creditLimitEnabled ? (
                        <input type="number" min={0} step={0.01} value={formData.creditLimit === 0 ? '' : formData.creditLimit}
                          onChange={e => setFormData({ ...formData, creditLimit: Number(e.target.value) })}
                          className="input flex-1" placeholder="Límite de crédito, Q0.00" />
                      ) : (
                        <p className="text-xs text-gray-400">Sin límite — puede comprar a crédito cualquier monto.</p>
                      )}
                    </div>
                  )}
                </div>
                <div className="col-span-2">
                  <label className="label">Comentarios</label>
                  <textarea value={formData.comments}
                    onChange={e => setFormData({ ...formData, comments: e.target.value })}
                    className="input w-full resize-none" rows={2}
                    placeholder="Notas visibles al seleccionar este cliente en una venta" maxLength={2000} />
                </div>
              </div>
              <div className="flex gap-3 justify-end pt-4 border-t">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary btn-md">Cancelar</button>
                <button type="submit" className="btn-primary btn-md">
                  {editingCustomer ? 'Actualizar' : 'Crear'} Cliente
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* ── Abono (credit payment) Modal ── */}
      {showAbonoModal && abonoCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="p-6 border-b">
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <DollarSign size={20} className="text-green-600" /> Registrar Abono
              </h2>
              <p className="text-sm text-gray-500 mt-1">{abonoCustomer.name}</p>
            </div>
            <div className="p-6 space-y-4">
              {loadingAbonoSales ? (
                <div className="flex justify-center py-4"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" /></div>
              ) : abonoSales.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Este cliente no tiene ventas a crédito pendientes.</p>
              ) : (
                <>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
                    <p className="text-sm text-gray-600">
                      Saldo pendiente: <span className="font-semibold text-gray-800">Q{abonoTotalOutstanding.toFixed(2)}</span>
                      {' '}({abonoSales.length} factura{abonoSales.length === 1 ? '' : 's'})
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">El abono se aplica primero a la factura más antigua, luego a la siguiente, hasta agotar el monto.</p>
                  </div>
                  <div>
                    <label className="label">Monto del abono (Q) *</label>
                    <input type="number" min={0.01} max={abonoTotalOutstanding} step={0.01} value={abonoAmount}
                      onChange={e => setAbonoAmount(e.target.value)} className="input w-full" placeholder="0.00" />
                  </div>
                  <div>
                    <label className="label">Método de pago</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['CASH', 'CARD', 'TRANSFER'] as const).map(m => (
                        <button key={m} type="button" onClick={() => setAbonoMethod(m)}
                          className={`py-2 rounded-lg text-xs font-medium transition-colors ${abonoMethod === m ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                          {m === 'CASH' ? 'Efectivo' : m === 'CARD' ? 'Tarjeta' : 'Transferencia'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {abonoMethod === 'CASH' && openRegisters.length > 0 && (
                    <div>
                      <label className="label">Caja que recibe el efectivo *</label>
                      <select value={abonoRegisterId} onChange={e => setAbonoRegisterId(e.target.value)} className="input w-full">
                        <option value="" disabled>Selecciona una caja</option>
                        {openRegisters.map(r => (
                          <option key={r.id} value={r.id}>{r.name} #{r.registerNumber}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {abonoMethod === 'CASH' && openRegisters.length === 0 && (
                    <p className="text-xs text-orange-500">No hay caja abierta — el abono se registrará sin asociarlo a una caja.</p>
                  )}
                </>
              )}
            </div>
            <div className="flex gap-3 justify-end p-6 border-t">
              <button type="button" onClick={() => setShowAbonoModal(false)} className="btn-secondary btn-md">Cancelar</button>
              <button type="button" onClick={handleSaveAbono} disabled={savingAbono || abonoSales.length === 0}
                className="btn-primary btn-md flex items-center gap-2 disabled:opacity-50">
                {savingAbono && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
                Registrar Abono
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ── Details Modal ── */}
      {showDetailsModal && selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="p-6 border-b flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Detalle del Cliente</h2>
                <p className="text-sm text-gray-500">{selectedCustomer.name}</p>
              </div>
              <button onClick={() => setShowDetailsModal(false)} className="p-1 hover:bg-gray-100 rounded">
                <AlertCircle size={18} />
              </button>
            </div>
            {/* Tabs */}
            <div className="flex border-b px-6 flex-shrink-0">
              <button onClick={() => setDetailTab('info')} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${detailTab === 'info' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                <span className="flex items-center gap-1"><User size={14} /> Información</span>
              </button>
              <button onClick={openHistoryTab} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${detailTab === 'history' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                <span className="flex items-center gap-1"><ShoppingBag size={14} /> Historial de Compras</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
            {detailTab === 'info' && (
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-primary-100 flex items-center justify-center text-2xl font-bold text-primary-600">
                  {selectedCustomer.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-800">{selectedCustomer.name}</p>
                  <p className="text-sm text-gray-500">NIT: {selectedCustomer.nit}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                {selectedCustomer.email && (
                  <div className="flex items-center gap-2 text-gray-700">
                    <Mail size={15} className="text-gray-400" />{selectedCustomer.email}
                  </div>
                )}
                {selectedCustomer.phone && (
                  <div className="flex items-center gap-2 text-gray-700">
                    <Phone size={15} className="text-gray-400" />{selectedCustomer.phone}
                  </div>
                )}
                {selectedCustomer.address && (
                  <div className="col-span-2 flex items-center gap-2 text-gray-700">
                    <MapPin size={15} className="text-gray-400" />{selectedCustomer.address}
                  </div>
                )}
              </div>

              {selectedCustomer.creditEnabled && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <CreditCard size={16} /> Estado de Crédito
                  </p>
                  {selectedCustomer.creditLimitEnabled ? (
                    <>
                      <div className="grid grid-cols-3 gap-3 text-center text-sm mb-3">
                        <div>
                          <p className="text-gray-500 text-xs">Límite</p>
                          <p className="font-bold text-gray-800">Q{selectedCustomer.creditLimit?.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs">Utilizado</p>
                          <p className="font-bold text-orange-600">Q{(selectedCustomer.creditUsed ?? 0).toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs">Disponible</p>
                          <p className="font-bold text-green-600">Q{(selectedCustomer.creditAvailable ?? selectedCustomer.creditLimit ?? 0).toLocaleString()}</p>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${creditPct(selectedCustomer) > 80 ? 'bg-red-500' : 'bg-primary-500'}`}
                          style={{ width: `${creditPct(selectedCustomer)}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1 text-right">{creditPct(selectedCustomer)}% utilizado</p>
                    </>
                  ) : (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Límite</span>
                      <span className="font-bold text-green-600">Ilimitado</span>
                      <span className="text-gray-500">Utilizado</span>
                      <span className="font-bold text-orange-600">Q{(selectedCustomer.creditUsed ?? 0).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              )}

              {selectedCustomer.totalPurchases !== undefined && (
                <div className="grid grid-cols-3 gap-3 text-sm text-center">
                  <div className="bg-blue-50 rounded-lg p-3">
                    <DollarSign size={16} className="text-blue-500 mx-auto mb-1" />
                    <p className="text-gray-500 text-xs">Total Compras</p>
                    <p className="font-bold text-gray-800">Q{selectedCustomer.totalPurchases?.toLocaleString()}</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3">
                    <TrendingUp size={16} className="text-green-500 mx-auto mb-1" />
                    <p className="text-gray-500 text-xs">Transacciones</p>
                    <p className="font-bold text-gray-800">{selectedCustomer.purchasesCount ?? 0}</p>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-3">
                    <Clock size={16} className="text-purple-500 mx-auto mb-1" />
                    <p className="text-gray-500 text-xs">Última Compra</p>
                    <p className="font-bold text-gray-800">
                      {selectedCustomer.lastPurchase
                        ? format(new Date(selectedCustomer.lastPurchase), 'd MMM', { locale: es })
                        : '—'}
                    </p>
                  </div>
                </div>
              )}
            </div>
            )}
            {detailTab === 'history' && (
              <div className="p-4">
                {loadingSales ? (
                  <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>
                ) : customerSales.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">Sin compras registradas</p>
                ) : (
                  <div className="space-y-2">
                    {customerSales.map(sale => {
                      const PM_LABEL: Record<string, string> = { CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia', CREDIT: 'Crédito', MIXED: 'Mixto' }
                      return (
                        <div
                          key={sale.id}
                          onClick={() => { setShowDetailsModal(false); navigate(`/reports/sales/${sale.id}`) }}
                          className={`p-3 rounded-lg border cursor-pointer transition-colors ${sale.isVoided ? 'opacity-50 border-red-200 bg-red-50 hover:bg-red-100' : 'border-gray-100 bg-gray-50 hover:bg-primary-50 hover:border-primary-200'}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-mono text-xs text-gray-600">{sale.invoiceNumber}</p>
                              <p className="text-xs text-gray-400">{format(new Date(sale.createdAt), 'dd/MM/yyyy HH:mm', { locale: es })}</p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <div className="text-right">
                                <p className="font-bold text-gray-800">Q{Number(sale.total).toFixed(2)}</p>
                                <p className="text-xs text-gray-400">{PM_LABEL[sale.paymentMethod] ?? sale.paymentMethod}</p>
                              </div>
                              <ExternalLink size={14} className="text-primary-400 flex-shrink-0" />
                            </div>
                          </div>
                          {sale.isVoided && <p className="text-xs text-red-500 mt-1">ANULADA</p>}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
            </div>
            <div className="p-6 border-t flex gap-3 justify-end flex-shrink-0">
              <button onClick={() => setShowDetailsModal(false)} className="btn-secondary btn-md">Cerrar</button>
              {canEdit && (
                <button onClick={() => { setShowDetailsModal(false); openEdit(selectedCustomer) }}
                  className="btn-primary btn-md">Editar</button>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* ── Delete Confirm ── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-red-100 rounded-full">
                <AlertCircle className="text-red-600" size={24} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-800 mb-2">Eliminar Cliente</h3>
                <p className="text-gray-600 mb-6">¿Seguro? Esta acción no puede deshacerse.</p>
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
