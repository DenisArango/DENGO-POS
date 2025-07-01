import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Plus, Search, Edit, Trash2, Store,
  MapPin, Phone, Mail, Clock, Users, Package,
  DollarSign, CheckCircle, XCircle, Settings,
  Building2, Calendar, TrendingUp, AlertTriangle
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface Store {
  id: string
  name: string
  code: string
  type: 'main' | 'branch'
  address: string
  city: string
  phone: string
  email: string
  manager: string
  employees: number
  status: 'active' | 'inactive' | 'maintenance'
  openTime: string
  closeTime: string
  workDays: string[]
  createdAt: string
  lastInventory: string
  stats: {
    dailySales: number
    monthSales: number
    inventory: number
    lowStock: number
  }
}

interface StoreFormData {
  name: string
  code: string
  type: 'main' | 'branch'
  address: string
  city: string
  phone: string
  email: string
  manager: string
  openTime: string
  closeTime: string
  workDays: string[]
  status: 'active' | 'inactive'
}

// Datos de ejemplo
const stores: Store[] = [
  {
    id: '1',
    name: 'Tienda Central',
    code: 'TC001',
    type: 'main',
    address: 'Av. Principal #123, Zona 1',
    city: 'Ciudad de Guatemala',
    phone: '+502 2222-3333',
    email: 'central@empresa.com',
    manager: 'Juan Pérez',
    employees: 8,
    status: 'active',
    openTime: '07:00',
    closeTime: '21:00',
    workDays: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
    createdAt: '2023-01-15',
    lastInventory: '2024-01-15',
    stats: {
      dailySales: 4500,
      monthSales: 125000,
      inventory: 45000,
      lowStock: 12
    }
  },
  {
    id: '2',
    name: 'Sucursal Norte',
    code: 'SN001',
    type: 'branch',
    address: 'Centro Comercial Norte, Local 45',
    city: 'Mixco',
    phone: '+502 2222-4444',
    email: 'norte@empresa.com',
    manager: 'María García',
    employees: 5,
    status: 'active',
    openTime: '08:00',
    closeTime: '20:00',
    workDays: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
    createdAt: '2023-03-20',
    lastInventory: '2024-01-10',
    stats: {
      dailySales: 2800,
      monthSales: 78000,
      inventory: 28000,
      lowStock: 8
    }
  },
  {
    id: '3',
    name: 'Sucursal Sur',
    code: 'SS001',
    type: 'branch',
    address: 'Plaza del Sur, Km 14.5',
    city: 'Villa Nueva',
    phone: '+502 2222-5555',
    email: 'sur@empresa.com',
    manager: 'Carlos López',
    employees: 4,
    status: 'maintenance',
    openTime: '08:00',
    closeTime: '19:00',
    workDays: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
    createdAt: '2023-06-10',
    lastInventory: '2024-01-05',
    stats: {
      dailySales: 0,
      monthSales: 45000,
      inventory: 22000,
      lowStock: 15
    }
  }
]

const daysOfWeek = [
  { id: 'Lun', name: 'Lunes' },
  { id: 'Mar', name: 'Martes' },
  { id: 'Mié', name: 'Miércoles' },
  { id: 'Jue', name: 'Jueves' },
  { id: 'Vie', name: 'Viernes' },
  { id: 'Sáb', name: 'Sábado' },
  { id: 'Dom', name: 'Domingo' }
]

export default function StoresManagement() {
  const navigate = useNavigate()
  const [searchTerm, setSearchTerm] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedStore, setSelectedStore] = useState<Store | null>(null)
  
  const [formData, setFormData] = useState<StoreFormData>({
    name: '',
    code: '',
    type: 'branch',
    address: '',
    city: '',
    phone: '',
    email: '',
    manager: '',
    openTime: '08:00',
    closeTime: '20:00',
    workDays: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
    status: 'active'
  })

  const handleCreateStore = () => {
    setFormData({
      name: '',
      code: '',
      type: 'branch',
      address: '',
      city: '',
      phone: '',
      email: '',
      manager: '',
      openTime: '08:00',
      closeTime: '20:00',
      workDays: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
      status: 'active'
    })
    setShowCreateModal(true)
  }

  const handleEditStore = (store: Store) => {
    setSelectedStore(store)
    setFormData({
      name: store.name,
      code: store.code,
      type: store.type,
      address: store.address,
      city: store.city,
      phone: store.phone,
      email: store.email,
      manager: store.manager,
      openTime: store.openTime,
      closeTime: store.closeTime,
      workDays: store.workDays,
      status: store.status === 'maintenance' ? 'inactive' : store.status
    })
    setShowEditModal(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    console.log('Guardar tienda:', formData)
    setShowCreateModal(false)
    setShowEditModal(false)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-600 bg-green-100'
      case 'inactive': return 'text-gray-600 bg-gray-100'
      case 'maintenance': return 'text-yellow-600 bg-yellow-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <CheckCircle size={16} />
      case 'inactive': return <XCircle size={16} />
      case 'maintenance': return <Settings size={16} />
      default: return null
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active': return 'Activa'
      case 'inactive': return 'Inactiva'
      case 'maintenance': return 'Mantenimiento'
      default: return status
    }
  }

  const filteredStores = stores.filter(store =>
    store.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    store.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    store.city.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const totalStats = {
    dailySales: stores.reduce((sum, store) => sum + store.stats.dailySales, 0),
    monthSales: stores.reduce((sum, store) => sum + store.stats.monthSales, 0),
    inventory: stores.reduce((sum, store) => sum + store.stats.inventory, 0),
    employees: stores.reduce((sum, store) => sum + store.employees, 0)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/settings')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Gestión de Tiendas</h1>
            <p className="text-gray-600 text-sm mt-1">
              Administrar tiendas y sucursales
            </p>
          </div>
        </div>
        
        <button 
          onClick={handleCreateStore}
          className="btn-primary btn-md flex items-center gap-2"
        >
          <Plus size={18} />
          Nueva Tienda
        </button>
      </div>

      {/* Estadísticas generales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Tiendas Totales</span>
            <Store className="text-blue-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">{stores.length}</p>
          <p className="text-xs text-gray-500 mt-1">
            {stores.filter(s => s.status === 'active').length} activas
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Ventas Diarias</span>
            <DollarSign className="text-green-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">
            ${totalStats.dailySales.toLocaleString()}
          </p>
          <p className="text-xs text-green-600 mt-1">Total todas las tiendas</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Valor Inventario</span>
            <Package className="text-purple-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">
            ${totalStats.inventory.toLocaleString()}
          </p>
          <p className="text-xs text-purple-600 mt-1">En todas las tiendas</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Empleados</span>
            <Users className="text-orange-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">{totalStats.employees}</p>
          <p className="text-xs text-orange-600 mt-1">Total en operación</p>
        </motion.div>
      </div>

      {/* Búsqueda */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Buscar por nombre, código o ciudad..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input pl-10 w-full"
          />
        </div>
      </div>

      {/* Lista de tiendas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredStores.map((store, index) => (
          <motion.div
            key={store.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white rounded-lg shadow-sm hover:shadow-lg transition-all"
          >
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-lg ${
                    store.type === 'main' ? 'bg-blue-100' : 'bg-gray-100'
                  }`}>
                    <Building2 size={24} className={
                      store.type === 'main' ? 'text-blue-600' : 'text-gray-600'
                    } />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800">{store.name}</h3>
                    <p className="text-sm text-gray-500">{store.code}</p>
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(store.status)}`}>
                  {getStatusIcon(store.status)}
                  {getStatusLabel(store.status)}
                </span>
              </div>

              <div className="space-y-3 mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <MapPin size={16} />
                  <span>{store.address}, {store.city}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Phone size={16} />
                  <span>{store.phone}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Clock size={16} />
                  <span>{store.openTime} - {store.closeTime}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Users size={16} />
                  <span>Gerente: {store.manager}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 py-3 border-t border-b">
                <div>
                  <p className="text-xs text-gray-500">Ventas del día</p>
                  <p className="font-semibold text-gray-800">
                    ${store.stats.dailySales.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Productos bajos</p>
                  <p className="font-semibold text-red-600">
                    {store.stats.lowStock} items
                  </p>
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <button
                  onClick={() => navigate(`/stores/${store.id}`)}
                  className="btn-outline btn-sm flex-1"
                >
                  Ver Detalles
                </button>
                <button
                  onClick={() => handleEditStore(store)}
                  className="btn-primary btn-sm flex-1"
                >
                  Editar
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Modal de crear/editar tienda */}
      {(showCreateModal || showEditModal) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
          >
            <h2 className="text-xl font-bold text-gray-800 mb-4">
              {showCreateModal ? 'Crear Nueva Tienda' : 'Editar Tienda'}
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre de la tienda
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="input w-full"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Código
                  </label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="input w-full"
                    placeholder="TC001"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tipo de tienda
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as 'main' | 'branch' })}
                    className="input w-full"
                  >
                    <option value="main">Tienda Principal</option>
                    <option value="branch">Sucursal</option>
                  </select>
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
                
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Dirección
                  </label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
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
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
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
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="input w-full"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Gerente
                  </label>
                  <input
                    type="text"
                    value={formData.manager}
                    onChange={(e) => setFormData({ ...formData, manager: e.target.value })}
                    className="input w-full"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Estado
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' })}
                    className="input w-full"
                  >
                    <option value="active">Activa</option>
                    <option value="inactive">Inactiva</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Hora de apertura
                  </label>
                  <input
                    type="time"
                    value={formData.openTime}
                    onChange={(e) => setFormData({ ...formData, openTime: e.target.value })}
                    className="input w-full"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Hora de cierre
                  </label>
                  <input
                    type="time"
                    value={formData.closeTime}
                    onChange={(e) => setFormData({ ...formData, closeTime: e.target.value })}
                    className="input w-full"
                    required
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Días de operación
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {daysOfWeek.map(day => (
                    <label key={day.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData.workDays.includes(day.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({ 
                              ...formData, 
                              workDays: [...formData.workDays, day.id]
                            })
                          } else {
                            setFormData({ 
                              ...formData, 
                              workDays: formData.workDays.filter(d => d !== day.id)
                            })
                          }
                        }}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-700">{day.name}</span>
                    </label>
                  ))}
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
                  {showCreateModal ? 'Crear Tienda' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  )
}