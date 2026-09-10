import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  ArrowLeft, Shield, Plus, Edit, Trash2, Save,
  CheckSquare, Square, Users, Lock, AlertTriangle,
  Package, DollarSign, Settings, BarChart3,
  ShoppingCart, Truck, FileText, ChevronDown, ChevronRight, type LucideIcon,
  UserCircle, Building2, Target
} from 'lucide-react'
import { api } from '../lib/api'

interface Role {
  id: string
  name: string
  description: string | null
  isSystem: boolean
  userCount: number
  permissions: string[]
  scheduleEnabled: boolean
  scheduleStart: string | null
  scheduleEnd: string | null
}

type Catalog = Record<string, string[]>

const MODULE_INFO: Record<string, { label: string; icon: LucideIcon }> = {
  sales: { label: 'Punto de Venta', icon: ShoppingCart },
  inventory: { label: 'Inventario', icon: Package },
  customers: { label: 'Clientes', icon: UserCircle },
  suppliers: { label: 'Proveedores', icon: Building2 },
  cash: { label: 'Caja', icon: DollarSign },
  purchases: { label: 'Compras', icon: Truck },
  transfers: { label: 'Traslados', icon: Truck },
  quotations: { label: 'Cotizaciones', icon: FileText },
  reports: { label: 'Reportes', icon: BarChart3 },
  settings: { label: 'Configuración', icon: Settings },
  goals: { label: 'Metas de Venta', icon: Target },
}

const PERMISSION_LABELS: Record<string, string> = {
  'sales.view': 'Ver ventas',
  'sales.create': 'Crear ventas',
  'sales.cancel': 'Anular ventas',
  'sales.edit': 'Editar ventas ya registradas',
  'sales.discount': 'Aplicar descuentos',
  'inventory.view': 'Ver inventario',
  'inventory.create': 'Crear productos',
  'inventory.edit': 'Editar productos',
  'inventory.delete': 'Eliminar productos',
  'inventory.editPrice': 'Editar precios y costos',
  'inventory.adjust': 'Ajustar stock manualmente',
  'inventory.transfer': 'Solicitar traslados de stock',
  'customers.view': 'Ver clientes',
  'customers.create': 'Crear clientes',
  'customers.edit': 'Editar clientes',
  'customers.delete': 'Eliminar clientes',
  'customers.editCredit': 'Editar límite de crédito y comentarios',
  'customers.registerPayment': 'Registrar abonos (pagos a crédito)',
  'suppliers.view': 'Ver proveedores',
  'suppliers.create': 'Crear proveedores',
  'suppliers.edit': 'Editar proveedores',
  'suppliers.delete': 'Eliminar proveedores',
  'cash.open': 'Abrir caja',
  'cash.close': 'Cerrar caja',
  'cash.movements': 'Registrar entradas/salidas de caja',
  'purchases.receive': 'Recibir mercadería (ingreso de compras a inventario)',
  'transfers.view': 'Ver traslados',
  'transfers.create': 'Crear traslados',
  'transfers.approve': 'Aprobar traslados',
  'transfers.receive': 'Recibir traslados',
  'transfers.reject': 'Rechazar traslados',
  'quotations.view': 'Ver cotizaciones',
  'quotations.create': 'Crear cotizaciones',
  'quotations.convert': 'Convertir cotización a venta',
  'reports.sales': 'Reportes de ventas',
  'reports.inventory': 'Reportes de inventario',
  'reports.financial': 'Reportes financieros y márgenes',
  'reports.audit': 'Auditoría y actividad de usuarios',
  'settings.users': 'Gestionar usuarios',
  'settings.roles': 'Gestionar roles y permisos',
  'settings.stores': 'Gestionar sucursales',
  'settings.system': 'Configuración general del sistema',
  'settings.cashRegisters': 'Configurar cajas registradoras fijas',
  'goals.manage': 'Configurar metas de venta',
}

const SYSTEM_ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  AUDITOR: 'Auditor',
  INVENTORY_CONTROL: 'Control de Inventario',
  OPERATOR: 'Operador (Cajero)',
}

export default function RolesPermissions() {
  const navigate = useNavigate()
  const [roles, setRoles] = useState<Role[]>([])
  const [catalog, setCatalog] = useState<Catalog>({})
  const [loading, setLoading] = useState(true)
  const [selectedRole, setSelectedRole] = useState<Role | null>(null)
  const [expandedModules, setExpandedModules] = useState<string[]>(['sales'])
  const [editMode, setEditMode] = useState(false)
  const [tempPermissions, setTempPermissions] = useState<string[]>([])
  const [tempScheduleEnabled, setTempScheduleEnabled] = useState(false)
  const [tempScheduleStart, setTempScheduleStart] = useState('07:00')
  const [tempScheduleEnd, setTempScheduleEnd] = useState('21:00')
  const [saving, setSaving] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newRoleName, setNewRoleName] = useState('')
  const [newRoleDescription, setNewRoleDescription] = useState('')

  const load = () => {
    setLoading(true)
    Promise.all([
      api.get<Role[]>('/api/roles'),
      api.get<Catalog>('/api/roles/catalog'),
    ])
      .then(([rolesData, catalogData]) => {
        setRoles(rolesData)
        setCatalog(catalogData)
        setSelectedRole(prev => rolesData.find(r => r.id === prev?.id) ?? rolesData[0] ?? null)
      })
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleRoleSelect = (role: Role) => {
    setSelectedRole(role)
    setEditMode(false)
  }

  const handleEditRole = () => {
    if (selectedRole) {
      setTempPermissions([...selectedRole.permissions])
      setTempScheduleEnabled(selectedRole.scheduleEnabled)
      setTempScheduleStart(selectedRole.scheduleStart ?? '07:00')
      setTempScheduleEnd(selectedRole.scheduleEnd ?? '21:00')
      setEditMode(true)
    }
  }

  const handleSaveRole = () => {
    if (!selectedRole) return
    if (selectedRole.name === 'ADMIN' && tempScheduleEnabled) {
      toast.error('El rol Administrador no puede tener horario — nunca se le aplica, para evitar quedar bloqueado del sistema')
      return
    }
    setSaving(true)
    api.put(`/api/roles/${selectedRole.id}`, {
      permissions: tempPermissions,
      scheduleEnabled: tempScheduleEnabled,
      scheduleStart: tempScheduleEnabled ? tempScheduleStart : null,
      scheduleEnd: tempScheduleEnabled ? tempScheduleEnd : null,
    })
      .then(() => {
        toast.success('Permisos actualizados')
        setEditMode(false)
        load()
      })
      .catch(e => toast.error(e.message))
      .finally(() => setSaving(false))
  }

  const handleCreateRole = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newRoleName.trim()) return
    setSaving(true)
    api.post<Role>('/api/roles', { name: newRoleName.trim(), description: newRoleDescription.trim() || undefined, permissions: [] })
      .then(role => {
        toast.success('Rol creado')
        setShowCreateModal(false)
        setNewRoleName('')
        setNewRoleDescription('')
        load()
        setSelectedRole(role)
      })
      .catch(e => toast.error(e.message))
      .finally(() => setSaving(false))
  }

  const handleDeleteRole = (role: Role) => {
    if (!window.confirm(`¿Eliminar el rol "${role.name}"? Esta acción no se puede deshacer.`)) return
    api.delete(`/api/roles/${role.id}`)
      .then(() => { toast.success('Rol eliminado'); load() })
      .catch(e => toast.error(e.message))
  }

  const handlePermissionToggle = (permissionKey: string) => {
    if (!editMode) return
    setTempPermissions(prev =>
      prev.includes(permissionKey) ? prev.filter(p => p !== permissionKey) : [...prev, permissionKey]
    )
  }

  const toggleModule = (moduleId: string) => {
    setExpandedModules(prev =>
      prev.includes(moduleId) ? prev.filter(m => m !== moduleId) : [...prev, moduleId]
    )
  }

  const currentPermissions = editMode ? tempPermissions : (selectedRole?.permissions ?? [])
  const roleLabel = (role: Role) => (role.isSystem ? SYSTEM_ROLE_LABELS[role.name] ?? role.name : role.name)

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/settings')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Roles y Permisos</h1>
            <p className="text-gray-600 text-sm mt-1">
              Crea roles personalizados y define exactamente qué puede ver y hacer cada uno
            </p>
          </div>
        </div>

        <button onClick={() => setShowCreateModal(true)} className="btn-primary btn-md flex items-center gap-2">
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
                    selectedRole?.id === role.id ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Shield size={16} className="text-primary-600" />
                        <h4 className="font-medium text-gray-800">{roleLabel(role)}</h4>
                        {role.isSystem && (
                          <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">Sistema</span>
                        )}
                      </div>
                      {role.description && <p className="text-sm text-gray-600 mb-2">{role.description}</p>}
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span className="flex items-center gap-1"><Users size={12} />{role.userCount} usuarios</span>
                        <span className="flex items-center gap-1"><Lock size={12} />{role.permissions.length} permisos</span>
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
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary-100 text-primary-700">
                    <Shield size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-800">{roleLabel(selectedRole)}</h3>
                    {selectedRole.description && <p className="text-sm text-gray-600">{selectedRole.description}</p>}
                  </div>
                </div>

                <div className="flex gap-2">
                  {editMode ? (
                    <>
                      <button onClick={() => setEditMode(false)} className="btn-outline btn-sm" disabled={saving}>Cancelar</button>
                      <button onClick={handleSaveRole} className="btn-primary btn-sm flex items-center gap-2" disabled={saving}>
                        <Save size={16} />
                        Guardar
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={handleEditRole} className="btn-outline btn-sm flex items-center gap-2">
                        <Edit size={16} />
                        Editar Permisos
                      </button>
                      {!selectedRole.isSystem && (
                        <button onClick={() => handleDeleteRole(selectedRole)} className="btn-outline btn-sm text-red-600 hover:bg-red-50">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {selectedRole.isSystem && editMode && (
                <div className="mb-4 p-4 bg-yellow-50 rounded-lg flex items-start gap-3">
                  <AlertTriangle className="text-yellow-600 mt-0.5" size={20} />
                  <div className="text-sm text-yellow-800">
                    <p className="font-medium">Rol del sistema</p>
                    <p>Este es un rol predefinido. Puedes ajustar sus permisos, pero no se puede renombrar ni eliminar.</p>
                  </div>
                </div>
              )}

              {selectedRole.name !== 'ADMIN' && (
                <div className="mb-4 p-4 border rounded-lg">
                  <h4 className="font-medium text-gray-800 mb-1">Horario de inicio de sesión</h4>
                  <p className="text-xs text-gray-500 mb-3">
                    Restringe a qué horas puede iniciar sesión alguien con este rol. Solo se revisa al entrar — una sesión ya abierta no se cierra sola si se pasa la hora.
                  </p>
                  {editMode ? (
                    <div className="space-y-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={tempScheduleEnabled}
                          onChange={e => setTempScheduleEnabled(e.target.checked)}
                          className="w-4 h-4 text-primary-600 rounded"
                        />
                        <span className="text-sm text-gray-700">Restringir horario para este rol</span>
                      </label>
                      {tempScheduleEnabled && (
                        <div className="flex items-center gap-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Desde</label>
                            <input type="time" value={tempScheduleStart} onChange={e => setTempScheduleStart(e.target.value)} className="input text-sm" />
                          </div>
                          <span className="text-gray-400 mt-4">—</span>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Hasta</label>
                            <input type="time" value={tempScheduleEnd} onChange={e => setTempScheduleEnd(e.target.value)} className="input text-sm" />
                          </div>
                        </div>
                      )}
                    </div>
                  ) : selectedRole.scheduleEnabled && selectedRole.scheduleStart && selectedRole.scheduleEnd ? (
                    <p className="text-sm text-gray-700">Puede iniciar sesión de <strong>{selectedRole.scheduleStart}</strong> a <strong>{selectedRole.scheduleEnd}</strong></p>
                  ) : (
                    <p className="text-sm text-gray-400">Sin restricción — puede iniciar sesión a cualquier hora</p>
                  )}
                </div>
              )}

              <div className="space-y-4">
                {Object.entries(catalog).map(([moduleId, keys]) => {
                  const info = MODULE_INFO[moduleId] ?? { label: moduleId, icon: Shield }
                  const Icon = info.icon
                  return (
                    <div key={moduleId} className="border rounded-lg">
                      <button
                        onClick={() => toggleModule(moduleId)}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <Icon size={20} className="text-gray-600" />
                          <span className="font-medium text-gray-800">{info.label}</span>
                          <span className="text-sm text-gray-500">
                            ({keys.filter(k => currentPermissions.includes(k)).length}/{keys.length})
                          </span>
                        </div>
                        {expandedModules.includes(moduleId) ? <ChevronDown size={20} className="text-gray-400" /> : <ChevronRight size={20} className="text-gray-400" />}
                      </button>

                      {expandedModules.includes(moduleId) && (
                        <div className="px-4 pb-3 space-y-2">
                          {keys.map((key) => (
                            <label
                              key={key}
                              className={`flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 ${editMode ? 'cursor-pointer' : 'cursor-default'}`}
                            >
                              <div className="mt-0.5">
                                {currentPermissions.includes(key) ? (
                                  <CheckSquare size={20} className={editMode ? 'text-primary-600' : 'text-gray-400'} />
                                ) : (
                                  <Square size={20} className="text-gray-400" />
                                )}
                              </div>
                              <div className="flex-1">
                                <p className="font-medium text-gray-800">{PERMISSION_LABELS[key] ?? key}</p>
                              </div>
                              {editMode && (
                                <input
                                  type="checkbox"
                                  checked={currentPermissions.includes(key)}
                                  onChange={() => handlePermissionToggle(key)}
                                  className="sr-only"
                                />
                              )}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
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

      {/* Modal crear rol */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Nuevo Rol</h2>
            <form onSubmit={handleCreateRole} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del rol</label>
                <input
                  type="text"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  className="input w-full"
                  placeholder="Ej. Supervisor de Turno"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción (opcional)</label>
                <input
                  type="text"
                  value={newRoleDescription}
                  onChange={(e) => setNewRoleDescription(e.target.value)}
                  className="input w-full"
                  placeholder="Para qué se usa este rol"
                />
              </div>
              <p className="text-xs text-gray-500">Podrás asignar los permisos después de crearlo, desde el panel de la derecha.</p>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreateModal(false)} className="btn-outline btn-md flex-1" disabled={saving}>Cancelar</button>
                <button type="submit" className="btn-primary btn-md flex-1" disabled={saving}>Crear Rol</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  )
}
