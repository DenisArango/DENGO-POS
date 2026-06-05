import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Plus, Search, Edit2, Trash2, Eye, AlertCircle,
  User, Mail, Phone, MapPin, CreditCard, CheckCircle,
  XCircle, DollarSign, TrendingUp, Clock
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { api } from '../lib/api'

interface Customer {
  id: string
  nit: string
  name: string
  email?: string
  phone?: string
  address?: string
  creditLimit?: number
  creditUsed?: number
  creditAvailable?: number
  isActive?: boolean
  totalPurchases?: number
  purchasesCount?: number
  lastPurchase?: string
}

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [showModal, setShowModal] = useState(false)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)

  const [formData, setFormData] = useState({
    nit: '',
    name: '',
    email: '',
    phone: '',
    address: '',
    creditLimit: 0,
    isActive: true,
  })

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
    setFormData({ nit: '', name: '', email: '', phone: '', address: '', creditLimit: 0, isActive: true })
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

  const creditPct = (c: Customer) => {
    const limit = Number(c.creditLimit)
    if (!limit) return 0
    return Math.round((Number(c.creditUsed ?? 0) / limit) * 100)
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
        <button onClick={openCreate} className="btn-primary btn-md flex items-center gap-2">
          <Plus size={20} /> Nuevo Cliente
        </button>
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
          {!searchTerm && (
            <button onClick={openCreate} className="btn-primary btn-md mt-4">Agregar Primer Cliente</button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
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
                      <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center font-semibold text-primary-600 text-sm flex-shrink-0">
                        {customer.name.charAt(0).toUpperCase()}
                      </div>
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
                    {(customer.creditLimit ?? 0) > 0 ? (
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
                      <span className="text-xs text-gray-400">Sin crédito</span>
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
                      <button onClick={() => { setSelectedCustomer(customer); setShowDetailsModal(true) }}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="Ver">
                        <Eye size={16} />
                      </button>
                      <button onClick={() => openEdit(customer)}
                        className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg" title="Editar">
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => setShowDeleteConfirm(customer.id)}
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
                <div>
                  <label className="label">Límite de Crédito (Q)</label>
                  <input type="number" min={0} step={0.01} value={formData.creditLimit}
                    onChange={e => setFormData({ ...formData, creditLimit: Number(e.target.value) })}
                    className="input" />
                </div>
                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={formData.isActive}
                      onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                      className="w-4 h-4 text-primary-600 rounded" />
                    <span className="text-sm text-gray-700">Cliente Activo</span>
                  </label>
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

      {/* ── Details Modal ── */}
      {showDetailsModal && selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-800">Detalle del Cliente</h2>
              <button onClick={() => setShowDetailsModal(false)} className="p-1 hover:bg-gray-100 rounded">
                <AlertCircle size={18} />
              </button>
            </div>
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

              {(selectedCustomer.creditLimit ?? 0) > 0 && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <CreditCard size={16} /> Estado de Crédito
                  </p>
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
            <div className="p-6 border-t flex gap-3 justify-end">
              <button onClick={() => setShowDetailsModal(false)} className="btn-secondary btn-md">Cerrar</button>
              <button onClick={() => { setShowDetailsModal(false); openEdit(selectedCustomer) }}
                className="btn-primary btn-md">Editar</button>
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
