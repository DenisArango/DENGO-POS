import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Users, Plus, Search, Filter, Edit, Trash2,
  Phone, Mail, MapPin, Calendar, Package,
  DollarSign, Clock, Building2, FileText,
  TrendingUp, AlertCircle, CheckCircle, ChevronDown,
  Star, MoreVertical, Download, Eye
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface Supplier {
  id: string
  name: string
  code: string
  nit: string
  type: 'manufacturer' | 'distributor' | 'importer' | 'local'
  category: string[]
  contact: {
    name: string
    position: string
    phone: string
    email: string
  }
  address: {
    street: string
    city: string
    state: string
    zipCode: string
  }
  commercialInfo: {
    paymentTerms: string
    creditLimit: number
    discount: number
    deliveryDays: number
    minimumOrder: number
  }
  status: 'active' | 'inactive' | 'blocked'
  rating: number
  totalPurchases: number
  lastPurchase?: string
  notes?: string
  createdAt: string
}

// Datos de ejemplo
const suppliers: Supplier[] = [
  {
    id: '1',
    name: 'Distribuidora Central S.A.',
    code: 'PROV-001',
    nit: '123456-7',
    type: 'distributor',
    category: ['Bebidas', 'Snacks'],
    contact: {
      name: 'Carlos Méndez',
      position: 'Gerente de Ventas',
      phone: '+502 2345-6789',
      email: 'carlos.mendez@distcentral.com'
    },
    address: {
      street: 'Av. Reforma 12-45',
      city: 'Ciudad de Guatemala',
      state: 'Guatemala',
      zipCode: '01010'
    },
    commercialInfo: {
      paymentTerms: '30 días',
      creditLimit: 50000,
      discount: 5,
      deliveryDays: 2,
      minimumOrder: 1000
    },
    status: 'active',
    rating: 4.5,
    totalPurchases: 125000,
    lastPurchase: '2024-01-18',
    createdAt: '2023-01-15'
  },
  {
    id: '2',
    name: 'Importadora La Económica',
    code: 'PROV-002',
    nit: '789012-3',
    type: 'importer',
    category: ['Dulces', 'Chocolates'],
    contact: {
      name: 'Ana Lucía Flores',
      position: 'Ejecutiva de Cuentas',
      phone: '+502 2456-7890',
      email: 'ana.flores@economica.gt'
    },
    address: {
      street: 'Calzada Aguilar Batres 23-89',
      city: 'Villa Nueva',
      state: 'Guatemala',
      zipCode: '01064'
    },
    commercialInfo: {
      paymentTerms: '15 días',
      creditLimit: 25000,
      discount: 3,
      deliveryDays: 3,
      minimumOrder: 500
    },
    status: 'active',
    rating: 4.0,
    totalPurchases: 78500,
    lastPurchase: '2024-01-20',
    createdAt: '2023-03-20'
  },
  {
    id: '3',
    name: 'Productos Locales GT',
    code: 'PROV-003',
    nit: '456789-0',
    type: 'local',
    category: ['Papelería', 'Limpieza'],
    contact: {
      name: 'Roberto Castillo',
      position: 'Propietario',
      phone: '+502 2567-8901',
      email: 'roberto@productoslocales.com'
    },
    address: {
      street: 'Zona 4, 3ra Calle 8-45',
      city: 'Mixco',
      state: 'Guatemala',
      zipCode: '01057'
    },
    commercialInfo: {
      paymentTerms: 'Contado',
      creditLimit: 0,
      discount: 0,
      deliveryDays: 1,
      minimumOrder: 200
    },
    status: 'inactive',
    rating: 3.5,
    totalPurchases: 15000,
    lastPurchase: '2023-12-10',
    createdAt: '2023-06-10'
  }
]

const categories = [
  'Bebidas', 'Snacks', 'Dulces', 'Chocolates', 
  'Papelería', 'Limpieza', 'Lácteos', 'Enlatados'
]

const supplierTypes = [
  { id: 'manufacturer', name: 'Fabricante', color: 'blue' },
  { id: 'distributor', name: 'Distribuidor', color: 'green' },
  { id: 'importer', name: 'Importador', color: 'purple' },
  { id: 'local', name: 'Local', color: 'gray' }
]

export default function Suppliers() {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedType, setSelectedType] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null)
  
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    nit: '',
    type: 'distributor',
    categories: [] as string[],
    contactName: '',
    contactPosition: '',
    contactPhone: '',
    contactEmail: '',
    street: '',
    city: '',
    state: 'Guatemala',
    zipCode: '',
    paymentTerms: '30 días',
    creditLimit: 0,
    discount: 0,
    deliveryDays: 2,
    minimumOrder: 0,
    status: 'active',
    notes: ''
  })

  const handleCreateSupplier = () => {
    // Reset form
    setFormData({
      name: '',
      code: '',
      nit: '',
      type: 'distributor',
      categories: [],
      contactName: '',
      contactPosition: '',
      contactPhone: '',
      contactEmail: '',
      street: '',
      city: '',
      state: 'Guatemala',
      zipCode: '',
      paymentTerms: '30 días',
      creditLimit: 0,
      discount: 0,
      deliveryDays: 2,
      minimumOrder: 0,
      status: 'active',
      notes: ''
    })
    setShowCreateModal(true)
  }

  const handleEditSupplier = (supplier: Supplier) => {
    setSelectedSupplier(supplier)
    setFormData({
      name: supplier.name,
      code: supplier.code,
      nit: supplier.nit,
      type: supplier.type,
      categories: supplier.category,
      contactName: supplier.contact.name,
      contactPosition: supplier.contact.position,
      contactPhone: supplier.contact.phone,
      contactEmail: supplier.contact.email,
      street: supplier.address.street,
      city: supplier.address.city,
      state: supplier.address.state,
      zipCode: supplier.address.zipCode,
      paymentTerms: supplier.commercialInfo.paymentTerms,
      creditLimit: supplier.commercialInfo.creditLimit,
      discount: supplier.commercialInfo.discount,
      deliveryDays: supplier.commercialInfo.deliveryDays,
      minimumOrder: supplier.commercialInfo.minimumOrder,
      status: supplier.status === 'blocked' ? 'inactive' : supplier.status,
      notes: supplier.notes || ''
    })
    setShowEditModal(true)
  }

  const handleViewDetails = (supplier: Supplier) => {
    setSelectedSupplier(supplier)
    setShowDetailsModal(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    console.log('Guardar proveedor:', formData)
    setShowCreateModal(false)
    setShowEditModal(false)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-600 bg-green-100'
      case 'inactive': return 'text-gray-600 bg-gray-100'
      case 'blocked': return 'text-red-600 bg-red-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getTypeColor = (type: string) => {
    const typeConfig = supplierTypes.find(t => t.id === type)
    if (!typeConfig) return 'bg-gray-100 text-gray-700'
    
    const colors: { [key: string]: string } = {
      blue: 'bg-blue-100 text-blue-700',
      green: 'bg-green-100 text-green-700',
      purple: 'bg-purple-100 text-purple-700',
      gray: 'bg-gray-100 text-gray-700'
    }
    return colors[typeConfig.color]
  }

  const filteredSuppliers = suppliers.filter(supplier => {
    const matchesSearch = supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         supplier.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         supplier.nit.includes(searchTerm)
    const matchesType = selectedType === 'all' || supplier.type === selectedType
    const matchesStatus = selectedStatus === 'all' || supplier.status === selectedStatus
    
    return matchesSearch && matchesType && matchesStatus
  })

  const stats = {
    total: suppliers.length,
    active: suppliers.filter(s => s.status === 'active').length,
    totalPurchases: suppliers.reduce((sum, s) => sum + s.totalPurchases, 0),
    averageRating: suppliers.reduce((sum, s) => sum + s.rating, 0) / suppliers.length
  }

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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
            <span className="text-gray-600 text-sm">Compras Totales</span>
            <DollarSign className="text-green-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">
            ${stats.totalPurchases.toLocaleString()}
          </p>
          <p className="text-xs text-green-600 mt-1">Este año</p>
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

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Nuevos Este Mes</span>
            <TrendingUp className="text-purple-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">2</p>
          <p className="text-xs text-purple-600 mt-1">+20% vs mes anterior</p>
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
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="input"
          >
            <option value="all">Todos los tipos</option>
            {supplierTypes.map(type => (
              <option key={type.id} value={type.id}>{type.name}</option>
            ))}
          </select>
          
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="input"
          >
            <option value="all">Todos los estados</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
            <option value="blocked">Bloqueados</option>
          </select>
          
          <button className="btn-outline btn-md flex items-center gap-2">
            <Filter size={18} />
            Más filtros
            <ChevronDown size={16} />
          </button>
        </div>
      </div>

      {/* Lista de proveedores */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredSuppliers.map((supplier, index) => (
          <motion.div
            key={supplier.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white rounded-lg shadow-sm hover:shadow-lg transition-all"
          >
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-gray-800">{supplier.name}</h3>
                  <p className="text-sm text-gray-500">{supplier.code} • NIT: {supplier.nit}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(supplier.status)}`}>
                    {supplier.status === 'active' ? <CheckCircle size={12} /> : 
                     supplier.status === 'blocked' ? <AlertCircle size={12} /> : null}
                    {supplier.status === 'active' ? 'Activo' : 
                     supplier.status === 'inactive' ? 'Inactivo' : 'Bloqueado'}
                  </span>
                  <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getTypeColor(supplier.type)}`}>
                    {supplierTypes.find(t => t.id === supplier.type)?.name}
                  </span>
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Users size={16} />
                  <span>{supplier.contact.name} - {supplier.contact.position}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Phone size={16} />
                  <span>{supplier.contact.phone}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <MapPin size={16} />
                  <span>{supplier.address.city}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-4">
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      size={16}
                      className={star <= supplier.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}
                    />
                  ))}
                </div>
                <span className="text-sm text-gray-600">({supplier.rating})</span>
              </div>

              <div className="grid grid-cols-2 gap-3 py-3 border-t">
                <div>
                  <p className="text-xs text-gray-500">Compras totales</p>
                  <p className="font-semibold text-gray-800">
                    ${supplier.totalPurchases.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Última compra</p>
                  <p className="font-semibold text-gray-800">
                    {supplier.lastPurchase 
                      ? format(new Date(supplier.lastPurchase), "d MMM", { locale: es })
                      : 'N/A'}
                  </p>
                </div>
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  onClick={() => handleViewDetails(supplier)}
                  className="btn-outline btn-sm flex-1"
                >
                  <Eye size={16} />
                  Ver
                </button>
                <button
                  onClick={() => handleEditSupplier(supplier)}
                  className="btn-primary btn-sm flex-1"
                >
                  <Edit size={16} />
                  Editar
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Modal de crear/editar proveedor */}
      {(showCreateModal || showEditModal) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-lg shadow-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto"
          >
            <h2 className="text-xl font-bold text-gray-800 mb-4">
              {showCreateModal ? 'Nuevo Proveedor' : 'Editar Proveedor'}
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Información básica */}
              <div>
                <h3 className="font-medium text-gray-700 mb-3">Información Básica</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Código
                    </label>
                    <input
                      type="text"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                      className="input w-full"
                      placeholder="PROV-XXX"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      NIT
                    </label>
                    <input
                      type="text"
                      value={formData.nit}
                      onChange={(e) => setFormData({ ...formData, nit: e.target.value })}
                      className="input w-full"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tipo de proveedor
                    </label>
                    <select
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                      className="input w-full"
                    >
                      {supplierTypes.map(type => (
                        <option key={type.id} value={type.id}>{type.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Categorías que maneja
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {categories.map(category => (
                      <label key={category} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={formData.categories.includes(category)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormData({ 
                                ...formData, 
                                categories: [...formData.categories, category]
                              })
                            } else {
                              setFormData({ 
                                ...formData, 
                                categories: formData.categories.filter(c => c !== category)
                              })
                            }
                          }}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <span className="text-sm text-gray-700">{category}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              
              {/* Información de contacto */}
              <div>
                <h3 className="font-medium text-gray-700 mb-3">Información de Contacto</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nombre del contacto
                    </label>
                    <input
                      type="text"
                      value={formData.contactName}
                      onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                      className="input w-full"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Cargo
                    </label>
                    <input
                      type="text"
                      value={formData.contactPosition}
                      onChange={(e) => setFormData({ ...formData, contactPosition: e.target.value })}
                      className="input w-full"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Teléfono
                    </label>
                    <input
                      type="tel"
                      value={formData.contactPhone}
                      onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                      className="input w-full"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={formData.contactEmail}
                      onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                      className="input w-full"
                      required
                    />
                  </div>
                </div>
              </div>
              
              {/* Dirección */}
              <div>
                <h3 className="font-medium text-gray-700 mb-3">Dirección</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Dirección
                    </label>
                    <input
                      type="text"
                      value={formData.street}
                      onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                      className="input w-full"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Ciudad
                    </label>
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      className="input w-full"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Departamento
                    </label>
                    <input
                      type="text"
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      className="input w-full"
                      required
                    />
                  </div>
                </div>
              </div>
              
              {/* Información comercial */}
              <div>
                <h3 className="font-medium text-gray-700 mb-3">Información Comercial</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Términos de pago
                    </label>
                    <select
                      value={formData.paymentTerms}
                      onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                      className="input w-full"
                    >
                      <option value="Contado">Contado</option>
                      <option value="15 días">15 días</option>
                      <option value="30 días">30 días</option>
                      <option value="45 días">45 días</option>
                      <option value="60 días">60 días</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Límite de crédito
                    </label>
                    <input
                      type="number"
                      value={formData.creditLimit}
                      onChange={(e) => setFormData({ ...formData, creditLimit: parseInt(e.target.value) || 0 })}
                      className="input w-full"
                      min="0"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Descuento (%)
                    </label>
                    <input
                      type="number"
                      value={formData.discount}
                      onChange={(e) => setFormData({ ...formData, discount: parseInt(e.target.value) || 0 })}
                      className="input w-full"
                      min="0"
                      max="100"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Días de entrega
                    </label>
                    <input
                      type="number"
                      value={formData.deliveryDays}
                      onChange={(e) => setFormData({ ...formData, deliveryDays: parseInt(e.target.value) || 0 })}
                      className="input w-full"
                      min="0"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Pedido mínimo
                    </label>
                    <input
                      type="number"
                      value={formData.minimumOrder}
                      onChange={(e) => setFormData({ ...formData, minimumOrder: parseInt(e.target.value) || 0 })}
                      className="input w-full"
                      min="0"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Estado
                    </label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="input w-full"
                    >
                      <option value="active">Activo</option>
                      <option value="inactive">Inactivo</option>
                    </select>
                  </div>
                </div>
                
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notas adicionales
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="input w-full"
                    rows={3}
                    placeholder="Información adicional sobre el proveedor..."
                  />
                </div>
              </div>
              
              <div className="flex gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false)
                    setShowEditModal(false)
                  }}
                  className="btn-outline btn-md flex-1"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary btn-md flex-1"
                >
                  {showCreateModal ? 'Crear Proveedor' : 'Guardar Cambios'}
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
                  <p className="text-sm text-gray-500">{selectedSupplier.code} • NIT: {selectedSupplier.nit}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`inline-flex items-center gap-1 px-3 py-1 text-sm font-medium rounded-full ${getStatusColor(selectedSupplier.status)}`}>
                    {selectedSupplier.status === 'active' ? 'Activo' : 
                     selectedSupplier.status === 'inactive' ? 'Inactivo' : 'Bloqueado'}
                  </span>
                  <span className={`inline-flex px-3 py-1 text-sm font-medium rounded-full ${getTypeColor(selectedSupplier.type)}`}>
                    {supplierTypes.find(t => t.id === selectedSupplier.type)?.name}
                  </span>
                </div>
              </div>
              
              {/* Calificación */}
              <div className="flex items-center gap-3">
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      size={20}
                      className={star <= selectedSupplier.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}
                    />
                  ))}
                </div>
                <span className="text-lg font-medium">{selectedSupplier.rating}/5</span>
              </div>
              
              {/* Información de contacto */}
              <div>
                <h4 className="font-medium text-gray-700 mb-3">Información de Contacto</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-start gap-3">
                    <Users className="text-gray-400 mt-1" size={20} />
                    <div>
                      <p className="font-medium">{selectedSupplier.contact.name}</p>
                      <p className="text-sm text-gray-600">{selectedSupplier.contact.position}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Phone className="text-gray-400 mt-1" size={20} />
                    <div>
                      <p className="font-medium">{selectedSupplier.contact.phone}</p>
                      <p className="text-sm text-gray-600">Teléfono principal</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Mail className="text-gray-400 mt-1" size={20} />
                    <div>
                      <p className="font-medium">{selectedSupplier.contact.email}</p>
                      <p className="text-sm text-gray-600">Correo electrónico</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <MapPin className="text-gray-400 mt-1" size={20} />
                    <div>
                      <p className="font-medium">{selectedSupplier.address.street}</p>
                      <p className="text-sm text-gray-600">{selectedSupplier.address.city}, {selectedSupplier.address.state}</p>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Información comercial */}
              <div>
                <h4 className="font-medium text-gray-700 mb-3">Términos Comerciales</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-sm text-gray-600">Términos de pago</p>
                    <p className="font-medium">{selectedSupplier.commercialInfo.paymentTerms}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-sm text-gray-600">Límite de crédito</p>
                    <p className="font-medium">${selectedSupplier.commercialInfo.creditLimit.toLocaleString()}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-sm text-gray-600">Descuento</p>
                    <p className="font-medium">{selectedSupplier.commercialInfo.discount}%</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-sm text-gray-600">Días de entrega</p>
                    <p className="font-medium">{selectedSupplier.commercialInfo.deliveryDays} días</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-sm text-gray-600">Pedido mínimo</p>
                    <p className="font-medium">${selectedSupplier.commercialInfo.minimumOrder}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-sm text-gray-600">Compras totales</p>
                    <p className="font-medium">${selectedSupplier.totalPurchases.toLocaleString()}</p>
                  </div>
                </div>
              </div>
              
              {/* Categorías */}
              <div>
                <h4 className="font-medium text-gray-700 mb-3">Categorías que Maneja</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedSupplier.category.map((cat, index) => (
                    <span key={index} className="px-3 py-1 bg-primary-100 text-primary-700 rounded-full text-sm">
                      {cat}
                    </span>
                  ))}
                </div>
              </div>
              
              {/* Historial */}
              <div>
                <h4 className="font-medium text-gray-700 mb-3">Información Adicional</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Fecha de registro:</span>
                    <span className="font-medium">
                      {format(new Date(selectedSupplier.createdAt), "d 'de' MMMM, yyyy", { locale: es })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Última compra:</span>
                    <span className="font-medium">
                      {selectedSupplier.lastPurchase 
                        ? format(new Date(selectedSupplier.lastPurchase), "d 'de' MMMM, yyyy", { locale: es })
                        : 'Sin compras registradas'}
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
    </div>
  )
}