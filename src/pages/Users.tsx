import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Plus, Search, Filter, MoreVertical,
  User, Mail, Phone, Shield, Building2, Calendar,
  Edit, Trash2, Lock, CheckCircle, XCircle,
  Key, UserPlus, Download, ChevronDown
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface User {
  id: string
  name: string
  email: string
  phone: string
  role: string
  stores: string[]
  status: 'active' | 'inactive' | 'suspended'
  lastLogin: string
  createdAt: string
  avatar?: string
}

interface UserFormData {
  name: string
  email: string
  phone: string
  password?: string
  role: string
  stores: string[]
  status: 'active' | 'inactive'
}

// Datos de ejemplo
const users: User[] = [
  {
    id: '1',
    name: 'Juan Pérez',
    email: 'juan.perez@empresa.com',
    phone: '+502 5555-1234',
    role: 'admin',
    stores: ['all'],
    status: 'active',
    lastLogin: '2024-01-20 14:30:00',
    createdAt: '2023-06-15'
  },
  {
    id: '2',
    name: 'María García',
    email: 'maria.garcia@empresa.com',
    phone: '+502 5555-5678',
    role: 'manager',
    stores: ['store-1', 'store-2'],
    status: 'active',
    lastLogin: '2024-01-20 08:00:00',
    createdAt: '2023-08-20'
  },
  {
    id: '3',
    name: 'Carlos López',
    email: 'carlos.lopez@empresa.com',
    phone: '+502 5555-9012',
    role: 'cashier',
    stores: ['store-1'],
    status: 'active',
    lastLogin: '2024-01-19 16:00:00',
    createdAt: '2023-10-05'
  },
  {
    id: '4',
    name: 'Ana Martínez',
    email: 'ana.martinez@empresa.com',
    phone: '+502 5555-3456',
    role: 'inventory',
    stores: ['store-2'],
    status: 'inactive',
    lastLogin: '2024-01-15 12:00:00',
    createdAt: '2023-11-12'
  }
]

const roles = [
  { id: 'admin', name: 'Administrador', description: 'Acceso completo al sistema' },
  { id: 'manager', name: 'Gerente', description: 'Gestión de tienda y reportes' },
  { id: 'cashier', name: 'Cajero', description: 'Operaciones de venta' },
  { id: 'inventory', name: 'Inventario', description: 'Control de inventario' },
  { id: 'auditor', name: 'Auditor', description: 'Solo lectura y reportes' }
]

const stores = [
  { id: 'all', name: 'Todas las tiendas' },
  { id: 'store-1', name: 'Tienda Central' },
  { id: 'store-2', name: 'Sucursal Norte' },
  { id: 'store-3', name: 'Sucursal Sur' }
]

export default function UsersManagement() {
  const navigate = useNavigate()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedRole, setSelectedRole] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [showDropdown, setShowDropdown] = useState<string | null>(null)

  const [formData, setFormData] = useState<UserFormData>({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'cashier',
    stores: [],
    status: 'active'
  })

  const handleCreateUser = () => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      password: '',
      role: 'cashier',
      stores: [],
      status: 'active'
    })
    setShowCreateModal(true)
  }

  const handleEditUser = (user: User) => {
    setSelectedUser(user)
    setFormData({
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      stores: user.stores,
      status: user.status === 'suspended' ? 'inactive' : user.status
    })
    setShowEditModal(true)
  }

  const handleDeleteUser = (userId: string) => {
    if (window.confirm('¿Está seguro de eliminar este usuario?')) {
      console.log('Eliminar usuario:', userId)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    console.log('Guardar usuario:', formData)
    setShowCreateModal(false)
    setShowEditModal(false)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-600 bg-green-100'
      case 'inactive': return 'text-gray-600 bg-gray-100'
      case 'suspended': return 'text-red-600 bg-red-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <CheckCircle size={16} />
      case 'inactive': return <XCircle size={16} />
      case 'suspended': return <Lock size={16} />
      default: return null
    }
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-purple-100 text-purple-700'
      case 'manager': return 'bg-blue-100 text-blue-700'
      case 'cashier': return 'bg-green-100 text-green-700'
      case 'inventory': return 'bg-orange-100 text-orange-700'
      case 'auditor': return 'bg-gray-100 text-gray-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesRole = selectedRole === 'all' || user.role === selectedRole
    const matchesStatus = selectedStatus === 'all' || user.status === selectedStatus
    
    return matchesSearch && matchesRole && matchesStatus
  })

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
            <h1 className="text-2xl font-bold text-gray-800">Gestión de Usuarios</h1>
            <p className="text-gray-600 text-sm mt-1">
              Administrar usuarios y sus permisos
            </p>
          </div>
        </div>
        
        <div className="flex gap-3">
          <button className="btn-outline btn-md flex items-center gap-2">
            <Download size={18} />
            Exportar
          </button>
          <button 
            onClick={handleCreateUser}
            className="btn-primary btn-md flex items-center gap-2"
          >
            <UserPlus size={18} />
            Nuevo Usuario
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Buscar por nombre o email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input pl-10 w-full"
            />
          </div>
          
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="input"
          >
            <option value="all">Todos los roles</option>
            {roles.map(role => (
              <option key={role.id} value={role.id}>{role.name}</option>
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
            <option value="suspended">Suspendidos</option>
          </select>
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
            <span className="text-gray-600 text-sm">Total Usuarios</span>
            <User className="text-blue-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">{users.length}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Activos</span>
            <CheckCircle className="text-green-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">
            {users.filter(u => u.status === 'active').length}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Administradores</span>
            <Shield className="text-purple-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">
            {users.filter(u => u.role === 'admin').length}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">En línea ahora</span>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-800">3</p>
        </motion.div>
      </div>

      {/* Lista de usuarios */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Usuario</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Rol</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Tiendas</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Estado</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Último Acceso</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                        <User size={20} className="text-gray-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-800">{user.name}</p>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <Mail size={12} />
                            {user.email}
                          </span>
                          <span className="flex items-center gap-1">
                            <Phone size={12} />
                            {user.phone}
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getRoleBadgeColor(user.role)}`}>
                      {roles.find(r => r.id === user.role)?.name}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-1">
                      {user.stores.includes('all') ? (
                        <span className="text-sm text-gray-600">Todas las tiendas</span>
                      ) : (
                        user.stores.map(storeId => (
                          <span key={storeId} className="inline-flex px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
                            {stores.find(s => s.id === storeId)?.name}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(user.status)}`}>
                      {getStatusIcon(user.status)}
                      {user.status === 'active' ? 'Activo' : 
                       user.status === 'inactive' ? 'Inactivo' : 'Suspendido'}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <p className="text-sm text-gray-600">
                      {format(new Date(user.lastLogin), "d MMM yyyy", { locale: es })}
                    </p>
                    <p className="text-xs text-gray-500">
                      {format(new Date(user.lastLogin), "HH:mm", { locale: es })}
                    </p>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => handleEditUser(user)}
                        className="p-1 hover:bg-gray-100 rounded transition-colors"
                        title="Editar"
                      >
                        <Edit size={18} className="text-gray-600" />
                      </button>
                      <button
                        onClick={() => console.log('Reset password:', user.id)}
                        className="p-1 hover:bg-gray-100 rounded transition-colors"
                        title="Restablecer contraseña"
                      >
                        <Key size={18} className="text-gray-600" />
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user.id)}
                        className="p-1 hover:bg-gray-100 rounded transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 size={18} className="text-red-600" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de crear/editar usuario */}
      {(showCreateModal || showEditModal) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md"
          >
            <h2 className="text-xl font-bold text-gray-800 mb-4">
              {showCreateModal ? 'Crear Nuevo Usuario' : 'Editar Usuario'}
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre completo
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
              
              {showCreateModal && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Contraseña
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="input w-full"
                    required
                  />
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rol
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="input w-full"
                  required
                >
                  {roles.map(role => (
                    <option key={role.id} value={role.id}>{role.name}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tiendas asignadas
                </label>
                <div className="space-y-2">
                  {stores.map(store => (
                    <label key={store.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData.stores.includes(store.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            if (store.id === 'all') {
                              setFormData({ ...formData, stores: ['all'] })
                            } else {
                              setFormData({ 
                                ...formData, 
                                stores: formData.stores.filter(s => s !== 'all').concat(store.id)
                              })
                            }
                          } else {
                            setFormData({ 
                              ...formData, 
                              stores: formData.stores.filter(s => s !== store.id)
                            })
                          }
                        }}
                        disabled={store.id !== 'all' && formData.stores.includes('all')}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-700">{store.name}</span>
                    </label>
                  ))}
                </div>
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
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                </select>
              </div>
              
              <div className="flex gap-3 pt-4">
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
                  {showCreateModal ? 'Crear Usuario' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  )
}