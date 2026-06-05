import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Users, Plus, Search, Edit, Trash2,
  Phone, Mail, MapPin, Calendar, Package,
  DollarSign, Clock, Building2, FileText,
  TrendingUp, AlertCircle, CheckCircle, ChevronDown,
  Star, MoreVertical, Download, Eye, XCircle
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { api } from '../lib/api'

interface Supplier {
  id: string
  code: string
  name: string
  contactName: string
  email: string
  phone: string
  address: string
  city: string
  taxId: string
  paymentTerms: string
  creditLimit: number
  notes?: string
  rating?: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null)

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    contactName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    taxId: '',
    paymentTerms: '30 días',
    creditLimit: 0,
    notes: '',
    rating: 5,
    isActive: true
  })

  const fetchSuppliers = () => {
    setLoading(true)
    api.get<Supplier[]>('/api/suppliers')
      .then(setSuppliers)
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchSuppliers() }, [])

  const handleCreateSupplier = () => {
    setFormData({
      code: `SUP-${Date.now().toString().slice(-6)}`,
      name: '',
      contactName: '',
      email: '',
      phone: '',
      address: '',
      city: '',
      taxId: '',
      paymentTerms: '30 días',
      creditLimit: 0,
      notes: '',
      rating: 5,
      isActive: true
    })
    setShowCreateModal(true)
  }

  const handleEditSupplier = (supplier: Supplier) => {
    setSelectedSupplier(supplier)
    setFormData({
      code: supplier.code,
      name: supplier.name,
      contactName: supplier.contactName,
      email: supplier.email,
      phone: supplier.phone,
      address: supplier.address,
      city: supplier.city,
      taxId: supplier.taxId,
      paymentTerms: supplier.paymentTerms,
      creditLimit: supplier.creditLimit || 0,
      notes: supplier.notes || '',
      rating: supplier.rating || 5,
      isActive: supplier.isActive
    })
    setShowEditModal(true)
  }

  const handleViewDetails = (supplier: Supplier) => {
    setSelectedSupplier(supplier)
    setShowDetailsModal(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name || !formData.contactName || !formData.email || !formData.phone) {
      toast.error('Por favor completa todos los campos requeridos')
      return
    }

    if (showEditModal && selectedSupplier) {
      api.put(`/api/suppliers/${selectedSupplier.id}`, formData)
        .then(() => {
          toast.success('Proveedor actualizado correctamente')
          setShowEditModal(false)
          fetchSuppliers()
        })
        .catch(e => toast.error(e.message))
    } else {
      api.post('/api/suppliers', formData)
        .then(() => {
          toast.success('Proveedor creado correctamente')
          setShowCreateModal(false)
          fetchSuppliers()
        })
        .catch(e => toast.error(e.message))
    }
  }

  const handleDelete = (id: string) => {
    api.delete(`/api/suppliers/${id}`)
      .then(() => {
        toast.success('Proveedor eliminado correctamente')
        setShowDeleteConfirm(null)
        fetchSuppliers()
      })
      .catch(e => toast.error(e.message))
  }

  const getStatusColor = (isActive: boolean) => {
    return isActive ? 'text-green-600 bg-green-100' : 'text-gray-600 bg-gray-100'
  }

  const filteredSuppliers = suppliers.filter(supplier => {
    const matchesSearch = supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         supplier.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         supplier.taxId.includes(searchTerm)
    const matchesStatus = selectedStatus === 'all' ||
                         (selectedStatus === 'active' && supplier.isActive) ||
                         (selectedStatus === 'inactive' && !supplier.isActive)

    return matchesSearch && matchesStatus
  })

  const stats = {
    total: suppliers.length,
    active: suppliers.filter(s => s.isActive).length,
    averageRating: suppliers.length > 0 ? suppliers.reduce((sum, s) => sum + (s.rating || 0), 0) / suppliers.length : 0
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Users size={28} />
            Proveedores
          </h1>
          <p className="text-gray-600 text-sm mt-1">
            Gestión de proveedores y términos comerciales
          </p>
        </div>

        <div className="flex gap-3">
          <button className="btn-outline btn-md flex items-center gap-2">
            <Download size={18} />
            Exportar
          </button>
          <button
            onClick={handleCreateSupplier}
            className="btn-primary btn-md flex items-center gap-2"
          >
            <Plus size={18} />
            Nuevo Proveedor
          </button>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Total Proveedores</span>
            <Building2 className="text-blue-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
          <p className="text-xs text-gray-500 mt-1">{stats.active} activos</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Proveedores Activos</span>
            <CheckCircle className="text-green-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.active}</p>
          <p className="text-xs text-green-600 mt-1">{((stats.active / stats.total) * 100 || 0).toFixed(0)}% del total</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Calificación Promedio</span>
            <Star className="text-yellow-600" size={20} />
          </div>
          <div className="flex items-baseline gap-1">
            <p className="text-2xl font-bold text-gray-800">{stats.averageRating.toFixed(1)}</p>
            <span className="text-sm text-gray-500">/5</span>
          </div>
          <div className="flex gap-0.5 mt-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                size={12}
                className={star <= stats.averageRating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}
              />
            ))}
          </div>
        </motion.div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Buscar por nombre, código o NIT..."
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
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
        </div>
      </div>

      {/* Lista de proveedores */}
      {filteredSuppliers.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <AlertCircle size={48} className="mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600">
            {searchTerm ? 'No se encontraron proveedores' : 'No hay proveedores registrados'}
          </p>
          {!searchTerm && (
            <button onClick={handleCreateSupplier} className="btn-primary mt-4">
              Agregar Primer Proveedor
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSuppliers.map((supplier, index) => (
            <motion.div
              key={supplier.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.05 }}
              className="bg-white rounded-lg shadow-sm hover:shadow-lg transition-all"
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-gray-800">{supplier.name}</h3>
                    <p className="text-sm text-gray-500">{supplier.code} • NIT: {supplier.taxId}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(supplier.isActive)}`}>
                    {supplier.isActive ? <CheckCircle size={12} /> : <XCircle size={12} />}
                    {supplier.isActive ? 'Activo' : 'Inactivo'}
                  </span>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Users size={16} />
                    <span>{supplier.contactName}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Phone size={16} />
                    <span>{supplier.phone}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Mail size={16} />
                    <span className="truncate">{supplier.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <MapPin size={16} />
                    <span>{supplier.city}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-4">
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        size={16}
                        className={star <= (supplier.rating || 0) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}
                      />
                    ))}
                  </div>
                  <span className="text-sm text-gray-600">({supplier.rating || 0})</span>
                </div>

                <div className="pt-3 border-t">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-gray-600">Términos de pago:</span>
                    <span className="font-medium">{supplier.paymentTerms}</span>
                  </div>
                  {supplier.creditLimit > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Límite de crédito:</span>
                      <span className="font-medium">${supplier.creditLimit.toLocaleString()}</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 pt-3 mt-3 border-t">
                  <button
                    onClick={() => handleViewDetails(supplier)}
                    className="btn-outline btn-sm flex-1 flex items-center justify-center gap-2"
                  >
                    <Eye size={16} />
                    Ver
                  </button>
                  <button
                    onClick={() => handleEditSupplier(supplier)}
                    className="btn-primary btn-sm flex-1 flex items-center justify-center gap-2"
                  >
                    <Edit size={16} />
                    Editar
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(supplier.id)}
                    className="btn-sm p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Modal de crear/editar proveedor */}
      {(showCreateModal || showEditModal) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
          >
            <h2 className="text-xl font-bold text-gray-800 mb-4">
              {showCreateModal ? 'Nuevo Proveedor' : 'Editar Proveedor'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Información Básica */}
              <div>
                <h3 className="font-medium text-gray-700 mb-3">Información Básica</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Código *</label>
                    <input
                      type="text"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                      className="input"
                      required
                    />
                  </div>

                  <div>
                    <label className="label">Nombre del Proveedor *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="input"
                      required
                    />
                  </div>

                  <div>
                    <label className="label">Persona de Contacto *</label>
                    <input
                      type="text"
                      value={formData.contactName}
                      onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                      className="input"
                      required
                    />
                  </div>

                  <div>
                    <label className="label">NIT / RFC *</label>
                    <input
                      type="text"
                      value={formData.taxId}
                      onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
                      className="input"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Contacto */}
              <div>
                <h3 className="font-medium text-gray-700 mb-3">Contacto</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Email *</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="input"
                      required
                    />
                  </div>

                  <div>
                    <label className="label">Teléfono *</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="input"
                      required
                    />
                  </div>

                  <div>
                    <label className="label">Ciudad</label>
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      className="input"
                    />
                  </div>

                  <div>
                    <label className="label">Dirección</label>
                    <input
                      type="text"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className="input"
                    />
                  </div>
                </div>
              </div>

              {/* Términos Comerciales */}
              <div>
                <h3 className="font-medium text-gray-700 mb-3">Términos Comerciales</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Términos de Pago</label>
                    <select
                      value={formData.paymentTerms}
                      onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                      className="input"
                    >
                      <option value="Contado">Contado</option>
                      <option value="15 días">15 días</option>
                      <option value="30 días">30 días</option>
                      <option value="45 días">45 días</option>
                      <option value="60 días">60 días</option>
                      <option value="90 días">90 días</option>
                    </select>
                  </div>

                  <div>
                    <label className="label">Límite de Crédito</label>
                    <input
                      type="number"
                      value={formData.creditLimit}
                      onChange={(e) => setFormData({ ...formData, creditLimit: Number(e.target.value) })}
                      className="input"
                      min="0"
                      step="0.01"
                    />
                  </div>

                  <div>
                    <label className="label">Rating</label>
                    <select
                      value={formData.rating}
                      onChange={(e) => setFormData({ ...formData, rating: Number(e.target.value) })}
                      className="input"
                    >
                      <option value={5}>5 estrellas - Excelente</option>
                      <option value={4}>4 estrellas - Muy bueno</option>
                      <option value={3}>3 estrellas - Bueno</option>
                      <option value={2}>2 estrellas - Regular</option>
                      <option value={1}>1 estrella - Malo</option>
                    </select>
                  </div>

                  <div className="flex items-center">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.isActive}
                        onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                        className="w-4 h-4 text-primary-600 rounded focus:ring-2 focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-700">Proveedor Activo</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Notas */}
              <div>
                <label className="label">Notas Adicionales</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="input min-h-[100px]"
                  placeholder="Observaciones, condiciones especiales, etc."
                />
              </div>

              {/* Botones */}
              <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false)
                    setShowEditModal(false)
                  }}
                  className="btn-outline btn-md"
                >
                  Cancelar
                </button>
                <button type="submit" className="btn-primary btn-md">
                  {showCreateModal ? 'Crear' : 'Actualizar'} Proveedor
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Modal de detalles */}
      {showDetailsModal && selectedSupplier && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-800">
                Detalles del Proveedor
              </h2>
              <button
                onClick={() => setShowDetailsModal(false)}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
              >
                <AlertCircle size={20} />
              </button>
            </div>

            <div className="space-y-6">
              {/* Encabezado */}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">{selectedSupplier.name}</h3>
                  <p className="text-sm text-gray-500">{selectedSupplier.code} • NIT: {selectedSupplier.taxId}</p>
                </div>
                <span className={`inline-flex items-center gap-1 px-3 py-1 text-sm font-medium rounded-full ${getStatusColor(selectedSupplier.isActive)}`}>
                  {selectedSupplier.isActive ? <CheckCircle size={14} /> : <XCircle size={14} />}
                  {selectedSupplier.isActive ? 'Activo' : 'Inactivo'}
                </span>
              </div>

              {/* Calificación */}
              <div className="flex items-center gap-3">
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      size={20}
                      className={star <= (selectedSupplier.rating || 0) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}
                    />
                  ))}
                </div>
                <span className="text-lg font-medium">{selectedSupplier.rating || 0}/5</span>
              </div>

              {/* Información de contacto */}
              <div>
                <h4 className="font-medium text-gray-700 mb-3">Información de Contacto</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-start gap-3">
                    <Users className="text-gray-400 mt-1" size={20} />
                    <div>
                      <p className="font-medium">{selectedSupplier.contactName}</p>
                      <p className="text-sm text-gray-600">Persona de contacto</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Phone className="text-gray-400 mt-1" size={20} />
                    <div>
                      <p className="font-medium">{selectedSupplier.phone}</p>
                      <p className="text-sm text-gray-600">Teléfono principal</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Mail className="text-gray-400 mt-1" size={20} />
                    <div>
                      <p className="font-medium">{selectedSupplier.email}</p>
                      <p className="text-sm text-gray-600">Correo electrónico</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <MapPin className="text-gray-400 mt-1" size={20} />
                    <div>
                      <p className="font-medium">{selectedSupplier.city}</p>
                      <p className="text-sm text-gray-600">{selectedSupplier.address}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Información comercial */}
              <div>
                <h4 className="font-medium text-gray-700 mb-3">Términos Comerciales</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-sm text-gray-600">Términos de pago</p>
                    <p className="font-medium">{selectedSupplier.paymentTerms}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-sm text-gray-600">Límite de crédito</p>
                    <p className="font-medium">${(selectedSupplier.creditLimit || 0).toLocaleString()}</p>
                  </div>
                </div>
              </div>

              {/* Información Adicional */}
              <div>
                <h4 className="font-medium text-gray-700 mb-3">Información Adicional</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Fecha de registro:</span>
                    <span className="font-medium">
                      {format(new Date(selectedSupplier.createdAt), "d 'de' MMMM, yyyy", { locale: es })}
                    </span>
                  </div>
                </div>
              </div>

              {selectedSupplier.notes && (
                <div className="p-4 bg-yellow-50 rounded-lg">
                  <p className="text-sm font-medium text-yellow-900 mb-1">Notas</p>
                  <p className="text-sm text-yellow-800">{selectedSupplier.notes}</p>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-4 mt-4 border-t">
              <button
                onClick={() => setShowDetailsModal(false)}
                className="btn-outline btn-md flex-1"
              >
                Cerrar
              </button>
              <button
                onClick={() => {
                  setShowDetailsModal(false)
                  handleEditSupplier(selectedSupplier)
                }}
                className="btn-primary btn-md flex-1"
              >
                Editar Proveedor
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full"
          >
            <div className="flex items-start gap-4">
              <div className="p-3 bg-red-100 rounded-full">
                <AlertCircle className="text-red-600" size={24} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-800 mb-2">Eliminar Proveedor</h3>
                <p className="text-gray-600 mb-6">
                  ¿Estás seguro de que deseas eliminar este proveedor? Esta acción no se puede deshacer.
                </p>
                <div className="flex gap-3 justify-end">
                  <button onClick={() => setShowDeleteConfirm(null)} className="btn-outline btn-md">
                    Cancelar
                  </button>
                  <button onClick={() => handleDelete(showDeleteConfirm)} className="btn-danger btn-md">
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
