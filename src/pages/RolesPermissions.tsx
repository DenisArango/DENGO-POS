import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Shield, Plus, Edit, Trash2, Save,
  CheckSquare, Square, Users, Lock, AlertTriangle,
  FileText, Package, DollarSign, Settings, BarChart3,
  ShoppingCart, CreditCard, TrendingUp, ChevronDown,
  ChevronRight
} from 'lucide-react'

interface Permission {
  id: string
  name: string
  description: string
  module: string
  actions: string[]
}

interface Role {
  id: string
  name: string
  description: string
  permissions: string[]
  userCount: number
  isSystem: boolean
  color: string
}

interface PermissionModule {
  id: string
  name: string
  icon: React.ComponentType<any>
  permissions: Permission[]
}

// Datos de ejemplo
const permissionModules: PermissionModule[] = [
  {
    id: 'sales',
    name: 'Punto de Venta',
    icon: ShoppingCart,
    permissions: [
      {
        id: 'sales.view',
        name: 'Ver ventas',
        description: 'Consultar historial de ventas',
        module: 'sales',
        actions: ['view']
      },
      {
        id: 'sales.create',
        name: 'Crear ventas',
        description: 'Realizar nuevas ventas',
        module: 'sales',
        actions: ['create']
      },
      {
        id: 'sales.cancel',
        name: 'Cancelar ventas',
        description: 'Anular ventas realizadas',
        module: 'sales',
        actions: ['cancel']
      },
      {
        id: 'sales.discount',
        name: 'Aplicar descuentos',
        description: 'Otorgar descuentos en ventas',
        module: 'sales',
        actions: ['discount']
      }
    ]
  },
  {
    id: 'inventory',
    name: 'Inventario',
    icon: Package,
    permissions: [
      {
        id: 'inventory.view',
        name: 'Ver inventario',
        description: 'Consultar stock y productos',
        module: 'inventory',
        actions: ['view']
      },
      {
        id: 'inventory.manage',
        name: 'Gestionar inventario',
        description: 'Crear y editar productos',
        module: 'inventory',
        actions: ['create', 'edit']
      },
      {
        id: 'inventory.adjust',
        name: 'Ajustar inventario',
        description: 'Realizar ajustes de stock',
        module: 'inventory',
        actions: ['adjust']
      },
      {
        id: 'inventory.transfer',
        name: 'Transferir productos',
        description: 'Mover productos entre tiendas',
        module: 'inventory',
        actions: ['transfer']
      }
    ]
  },
  {
    id: 'cash',
    name: 'Caja',
    icon: DollarSign,
    permissions: [
      {
        id: 'cash.open',
        name: 'Abrir caja',
        description: 'Realizar apertura de caja',
        module: 'cash',
        actions: ['open']
      },
      {
        id: 'cash.close',
        name: 'Cerrar caja',
        description: 'Realizar cierre de caja',
        module: 'cash',
        actions: ['close']
      },
      {
        id: 'cash.movements',
        name: 'Movimientos de caja',
        description: 'Registrar entradas y salidas',
        module: 'cash',
        actions: ['create']
      }
    ]
  },
  {
    id: 'reports',
    name: 'Reportes',
    icon: BarChart3,
    permissions: [
      {
        id: 'reports.sales',
        name: 'Reportes de ventas',
        description: 'Ver reportes de ventas',
        module: 'reports',
        actions: ['view']
      },
      {
        id: 'reports.inventory',
        name: 'Reportes de inventario',
        description: 'Ver reportes de inventario',
        module: 'reports',
        actions: ['view']
      },
      {
        id: 'reports.financial',
        name: 'Reportes financieros',
        description: 'Ver reportes financieros',
        module: 'reports',
        actions: ['view']
      },
      {
        id: 'reports.audit',
        name: 'Reportes de auditoría',
        description: 'Ver logs y actividad',
        module: 'reports',
        actions: ['view']
      }
    ]
  },
  {
    id: 'settings',
    name: 'Configuración',
    icon: Settings,
    permissions: [
      {
        id: 'settings.users',
        name: 'Gestionar usuarios',
        description: 'Crear y editar usuarios',
        module: 'settings',
        actions: ['manage']
      },
      {
        id: 'settings.roles',
        name: 'Gestionar roles',
        description: 'Configurar roles y permisos',
        module: 'settings',
        actions: ['manage']
      },
      {
        id: 'settings.stores',
        name: 'Gestionar tiendas',
        description: 'Configurar tiendas y sucursales',
        module: 'settings',
        actions: ['manage']
      },
      {
        id: 'settings.system',
        name: 'Configuración del sistema',
        description: 'Modificar configuración general',
        module: 'settings',
        actions: ['manage']
      }
    ]
  }
]

const roles: Role[] = [
  {
    id: 'admin',
    name: 'Administrador',
    description: 'Acceso completo a todas las funciones del sistema',
    permissions: permissionModules.flatMap(m => m.permissions.map(p => p.id)),
    userCount: 2,
    isSystem: true,
    color: 'purple'
  },
  {
    id: 'manager',
    name: 'Gerente',
    description: 'Gestión de tienda, ventas y reportes',
    permissions: [
      'sales.view', 'sales.create', 'sales.cancel', 'sales.discount',
      'inventory.view', 'inventory.manage', 'inventory.adjust',
      'cash.open', 'cash.close', 'cash.movements',
      'reports.sales', 'reports.inventory', 'reports.financial'
    ],
    userCount: 3,
    isSystem: true,
    color: 'blue'
  },
  {
    id: 'cashier',
    name: 'Cajero',
    description: 'Operaciones de venta y caja',
    permissions: [
      'sales.view', 'sales.create',
      'inventory.view',
      'cash.open', 'cash.close',
      'reports.sales'
    ],
    userCount: 5,
    isSystem: true,
    color: 'green'
  },
  {
    id: 'inventory',
    name: 'Inventario',
    description: 'Control y gestión de inventario',
    permissions: [
      'inventory.view', 'inventory.manage', 'inventory.adjust', 'inventory.transfer',
      'reports.inventory'
    ],
    userCount: 2,
    isSystem: true,
    color: 'orange'
  },
  {
    id: 'auditor',
    name: 'Auditor',
    description: 'Solo lectura y generación de reportes',
    permissions: [
      'sales.view',
      'inventory.view',
      'reports.sales', 'reports.inventory', 'reports.financial', 'reports.audit'
    ],
    userCount: 1,
    isSystem: true,
    color: 'gray'
  }
]

export default function RolesPermissions() {
  const navigate = useNavigate()
  const [selectedRole, setSelectedRole] = useState<Role | null>(roles[0])
  const [expandedModules, setExpandedModules] = useState<string[]>(['sales'])
  const [editMode, setEditMode] = useState(false)
  const [tempPermissions, setTempPermissions] = useState<string[]>([])

  const handleRoleSelect = (role: Role) => {
    setSelectedRole(role)
    setEditMode(false)
  }

  const handleEditRole = () => {
    if (selectedRole) {
      setTempPermissions([...selectedRole.permissions])
      setEditMode(true)
    }
  }

  const handleSaveRole = () => {
    if (selectedRole) {
      // Aquí se guardarían los cambios
      console.log('Guardando permisos:', tempPermissions)
      setEditMode(false)
    }
  }

  const handlePermissionToggle = (permissionId: string) => {
    if (editMode) {
      setTempPermissions(prev => 
        prev.includes(permissionId)
          ? prev.filter(p => p !== permissionId)
          : [...prev, permissionId]
      )
    }
  }

  const toggleModule = (moduleId: string) => {
    setExpandedModules(prev =>
      prev.includes(moduleId)
        ? prev.filter(m => m !== moduleId)
        : [...prev, moduleId]
    )
  }

  const getRoleColor = (color: string) => {
    const colors: { [key: string]: string } = {
      purple: 'bg-purple-100 text-purple-700 border-purple-300',
      blue: 'bg-blue-100 text-blue-700 border-blue-300',
      green: 'bg-green-100 text-green-700 border-green-300',
      orange: 'bg-orange-100 text-orange-700 border-orange-300',
      gray: 'bg-gray-100 text-gray-700 border-gray-300'
    }
    return colors[color] || colors.gray
  }

  const currentPermissions = editMode ? tempPermissions : (selectedRole?.permissions || [])

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
            <h1 className="text-2xl font-bold text-gray-800">Roles y Permisos</h1>
            <p className="text-gray-600 text-sm mt-1">
              Configurar roles de usuario y sus permisos
            </p>
          </div>
        </div>
        
        <button className="btn-primary btn-md flex items-center gap-2">
          <Plus size={18} />
          Nuevo Rol
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lista de roles */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-sm p-4">
            <h3 className="font-semibold text-gray-800 mb-4">Roles del Sistema</h3>
            <div className="space-y-2">
              {roles.map((role) => (
                <motion.div
                  key={role.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  onClick={() => handleRoleSelect(role)}
                  className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    selectedRole?.id === role.id
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Shield size={16} className={getRoleColor(role.color).split(' ')[1]} />
                        <h4 className="font-medium text-gray-800">{role.name}</h4>
                        {role.isSystem && (
                          <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">
                            Sistema
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{role.description}</p>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Users size={12} />
                          {role.userCount} usuarios
                        </span>
                        <span className="flex items-center gap-1">
                          <Lock size={12} />
                          {role.permissions.length} permisos
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* Detalles del rol */}
        <div className="lg:col-span-2">
          {selectedRole ? (
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${getRoleColor(selectedRole.color)}`}>
                      <Shield size={24} />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-gray-800">{selectedRole.name}</h3>
                      <p className="text-sm text-gray-600">{selectedRole.description}</p>
                    </div>
                  </div>
                </div>
                
                {!selectedRole.isSystem && (
                  <div className="flex gap-2">
                    {editMode ? (
                      <>
                        <button
                          onClick={() => setEditMode(false)}
                          className="btn-outline btn-sm"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={handleSaveRole}
                          className="btn-primary btn-sm flex items-center gap-2"
                        >
                          <Save size={16} />
                          Guardar
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={handleEditRole}
                          className="btn-outline btn-sm flex items-center gap-2"
                        >
                          <Edit size={16} />
                          Editar
                        </button>
                        <button className="btn-outline btn-sm text-red-600 hover:bg-red-50">
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {selectedRole.isSystem && editMode && (
                <div className="mb-4 p-4 bg-yellow-50 rounded-lg flex items-start gap-3">
                  <AlertTriangle className="text-yellow-600 mt-0.5" size={20} />
                  <div className="text-sm text-yellow-800">
                    <p className="font-medium">Rol del sistema</p>
                    <p>Este es un rol predefinido del sistema. Solo puedes modificar los permisos asignados.</p>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {permissionModules.map((module) => (
                  <div key={module.id} className="border rounded-lg">
                    <button
                      onClick={() => toggleModule(module.id)}
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <module.icon size={20} className="text-gray-600" />
                        <span className="font-medium text-gray-800">{module.name}</span>
                        <span className="text-sm text-gray-500">
                          ({module.permissions.filter(p => currentPermissions.includes(p.id)).length}/
                          {module.permissions.length})
                        </span>
                      </div>
                      {expandedModules.includes(module.id) ? (
                        <ChevronDown size={20} className="text-gray-400" />
                      ) : (
                        <ChevronRight size={20} className="text-gray-400" />
                      )}
                    </button>
                    
                    {expandedModules.includes(module.id) && (
                      <div className="px-4 pb-3 space-y-2">
                        {module.permissions.map((permission) => (
                          <label
                            key={permission.id}
                            className={`flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 ${
                              editMode ? 'cursor-pointer' : 'cursor-default'
                            }`}
                          >
                            <div className="mt-0.5">
                              {currentPermissions.includes(permission.id) ? (
                                <CheckSquare 
                                  size={20} 
                                  className={editMode ? 'text-primary-600' : 'text-gray-400'}
                                />
                              ) : (
                                <Square 
                                  size={20} 
                                  className="text-gray-400"
                                />
                              )}
                            </div>
                            <div className="flex-1">
                              <p className="font-medium text-gray-800">{permission.name}</p>
                              <p className="text-sm text-gray-600">{permission.description}</p>
                            </div>
                            {editMode && (
                              <input
                                type="checkbox"
                                checked={currentPermissions.includes(permission.id)}
                                onChange={() => handlePermissionToggle(permission.id)}
                                className="sr-only"
                              />
                            )}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm p-12 text-center">
              <Shield size={48} className="text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Selecciona un rol para ver sus permisos</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}