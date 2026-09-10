import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Search, User, Mail, Shield, Building2,
  Edit, Trash2, CheckCircle, XCircle, UserPlus
} from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../lib/api'

interface Branch {
  id: string
  name: string
}

interface CustomRole {
  id: string
  name: string
  isSystem: boolean
}

interface UserRecord {
  id: string
  name: string
  email: string
  role: string
  customRoleId: string | null
  branchId: string
  branch?: Branch
  additionalBranches?: { branchId: string; branch?: Branch }[]
  avatarUrl?: string | null
  isActive: boolean
  createdAt?: string
}

interface UserFormData {
  name: string
  email: string
  password: string
  role: string
  customRoleId: string
  branchId: string
  additionalBranchIds: string[]
  avatarUrl: string
  isActive: boolean
}

// The 4 legacy roles are always available as a coarse base role, matching User.role in the backend.
const BASE_ROLES = [
  { id: 'ADMIN', name: 'Administrador' },
  { id: 'AUDITOR', name: 'Auditor' },
  { id: 'INVENTORY_CONTROL', name: 'Control de Inventario' },
  { id: 'OPERATOR', name: 'Operador (Cajero)' },
]

const emptyForm: UserFormData = {
  name: '',
  email: '',
  password: '',
  role: 'OPERATOR',
  customRoleId: '',
  branchId: '',
  additionalBranchIds: [],
  avatarUrl: '',
  isActive: true,
}

export default function UsersManagement() {
  const navigate = useNavigate()
  const [users, setUsers] = useState<UserRecord[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedRole, setSelectedRole] = useState<string>('all')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null)

  const [formData, setFormData] = useState<UserFormData>(emptyForm)

  const fetchAll = () => {
    setLoading(true)
    Promise.all([
      api.get<UserRecord[]>('/api/users'),
      api.get<Branch[]>('/api/branches'),
      api.get<CustomRole[]>('/api/roles'),
    ])
      .then(([usersData, branchesData, rolesData]) => {
        setUsers(usersData)
        setBranches(branchesData)
        setCustomRoles(rolesData.filter(r => !r.isSystem))
      })
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchAll()
  }, [])

  const handleCreateUser = () => {
    setFormData({ ...emptyForm, branchId: branches[0]?.id ?? '' })
    setShowCreateModal(true)
  }

  const handleEditUser = (user: UserRecord) => {
    setSelectedUser(user)
    setFormData({
      name: user.name,
      email: user.email,
      password: '',
      role: user.role,
      customRoleId: user.customRoleId ?? '',
      branchId: user.branchId,
      additionalBranchIds: (user.additionalBranches ?? []).map(ab => ab.branchId),
      avatarUrl: user.avatarUrl ?? '',
      isActive: user.isActive,
    })
    setShowEditModal(true)
  }

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { toast.error('La imagen no debe superar 2MB'); return }
    const reader = new FileReader()
    reader.onloadend = () => setFormData(prev => ({ ...prev, avatarUrl: reader.result as string }))
    reader.readAsDataURL(file)
  }

  const toggleAdditionalBranch = (branchId: string) => {
    setFormData(prev => ({
      ...prev,
      additionalBranchIds: prev.additionalBranchIds.includes(branchId)
        ? prev.additionalBranchIds.filter(id => id !== branchId)
        : [...prev.additionalBranchIds, branchId],
    }))
  }

  const handleDeleteUser = (userId: string) => {
    if (!window.confirm('¿Desactivar este usuario? Podrá reactivarse después editándolo.')) return
    api.delete(`/api/users/${userId}`)
      .then(() => {
        toast.success('Usuario desactivado')
        fetchAll()
      })
      .catch(e => toast.error(e.message))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    const payload: Record<string, unknown> = {
      name: formData.name,
      email: formData.email,
      role: formData.role,
      customRoleId: formData.customRoleId || null,
      branchId: formData.branchId,
      additionalBranchIds: formData.additionalBranchIds,
      avatarUrl: formData.avatarUrl || undefined,
    }
    if (formData.password) payload.password = formData.password

    if (showCreateModal) {
      api.post('/api/users', payload)
        .then(() => {
          toast.success('Usuario creado exitosamente')
          setShowCreateModal(false)
          fetchAll()
        })
        .catch(e => toast.error(e.message))
        .finally(() => setSaving(false))
    } else if (selectedUser) {
      api.put(`/api/users/${selectedUser.id}`, payload)
        .then(() => {
          toast.success('Usuario actualizado exitosamente')
          setShowEditModal(false)
          fetchAll()
        })
        .catch(e => toast.error(e.message))
        .finally(() => setSaving(false))
    }
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'ADMIN': return 'bg-purple-100 text-purple-700'
      case 'AUDITOR': return 'bg-gray-100 text-gray-700'
      case 'INVENTORY_CONTROL': return 'bg-orange-100 text-orange-700'
      case 'OPERATOR': return 'bg-green-100 text-green-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  const roleLabel = (user: UserRecord) => {
    if (user.customRoleId) {
      return customRoles.find(r => r.id === user.customRoleId)?.name ?? 'Rol personalizado'
    }
    return BASE_ROLES.find(r => r.id === user.role)?.name ?? user.role
  }

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesRole = selectedRole === 'all' || user.role === selectedRole
    return matchesSearch && matchesRole
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
              Administrar usuarios y sus roles
            </p>
          </div>
        </div>

        <button
          onClick={handleCreateUser}
          className="btn-primary btn-md flex items-center gap-2"
        >
          <UserPlus size={18} />
          Nuevo Usuario
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
        </div>
      )}

      {/* Filtros */}
      {!loading && (
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
              {BASE_ROLES.map(role => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Estadísticas */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600 text-sm">Total Usuarios</span>
              <User className="text-blue-600" size={20} />
            </div>
            <p className="text-2xl font-bold text-gray-800">{users.length}</p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600 text-sm">Activos</span>
              <CheckCircle className="text-green-600" size={20} />
            </div>
            <p className="text-2xl font-bold text-gray-800">{users.filter(u => u.isActive).length}</p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600 text-sm">Administradores</span>
              <Shield className="text-purple-600" size={20} />
            </div>
            <p className="text-2xl font-bold text-gray-800">{users.filter(u => u.role === 'ADMIN').length}</p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600 text-sm">Sucursales con usuarios</span>
              <Building2 className="text-gray-600" size={20} />
            </div>
            <p className="text-2xl font-bold text-gray-800">{new Set(users.map(u => u.branchId)).size}</p>
          </motion.div>
        </div>
      )}

      {/* Lista de usuarios */}
      {!loading && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Usuario</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Rol</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Sucursal</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Estado</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        {user.avatarUrl ? (
                          <img src={user.avatarUrl} alt={user.name} className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                            <User size={20} className="text-gray-600" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-gray-800">{user.name}</p>
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <Mail size={12} />
                            {user.email}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getRoleBadgeColor(user.role)}`}>
                        {roleLabel(user)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-700">
                      {user.branch?.name ?? '—'}
                      {(user.additionalBranches?.length ?? 0) > 0 && (
                        <span className="ml-1.5 text-xs text-gray-400">+{user.additionalBranches!.length}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${user.isActive ? 'text-green-600 bg-green-100' : 'text-gray-600 bg-gray-100'}`}>
                        {user.isActive ? <CheckCircle size={16} /> : <XCircle size={16} />}
                        {user.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleEditUser(user)}
                          className="p-1 hover:bg-gray-100 rounded transition-colors"
                          title="Editar (incluye restablecer contraseña)"
                        >
                          <Edit size={18} className="text-gray-600" />
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user.id)}
                          className="p-1 hover:bg-gray-100 rounded transition-colors"
                          title="Desactivar"
                        >
                          <Trash2 size={18} className="text-red-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-gray-500">
                      No se encontraron usuarios
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input w-full"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
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
                  {showCreateModal ? 'Contraseña' : 'Nueva contraseña (dejar en blanco para no cambiar)'}
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="input w-full"
                  minLength={6}
                  required={showCreateModal}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rol base</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="input w-full"
                  required
                >
                  {BASE_ROLES.map(role => (
                    <option key={role.id} value={role.id}>{role.name}</option>
                  ))}
                </select>
              </div>

              {customRoles.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rol personalizado (opcional)</label>
                  <select
                    value={formData.customRoleId}
                    onChange={(e) => setFormData({ ...formData, customRoleId: e.target.value })}
                    className="input w-full"
                  >
                    <option value="">Usar los permisos por defecto del rol base</option>
                    {customRoles.map(role => (
                      <option key={role.id} value={role.id}>{role.name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Si eliges un rol personalizado, sus permisos (definidos en Roles y Permisos) reemplazan los del rol base.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sucursal</label>
                <select
                  value={formData.branchId}
                  onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
                  className="input w-full"
                  required
                >
                  <option value="" disabled>Selecciona una sucursal</option>
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </div>

              {branches.length > 1 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sucursales adicionales</label>
                  <p className="text-xs text-gray-500 mb-2">
                    El usuario podrá cambiar entre estas sucursales al vender, además de su sucursal principal.
                  </p>
                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-40 overflow-y-auto">
                    {branches.filter(b => b.id !== formData.branchId).map(branch => (
                      <label key={branch.id} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.additionalBranchIds.includes(branch.id)}
                          onChange={() => toggleAdditionalBranch(branch.id)}
                          className="rounded border-gray-300"
                        />
                        {branch.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false)
                    setShowEditModal(false)
                  }}
                  className="btn-outline btn-md flex-1"
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary btn-md flex-1 flex items-center justify-center gap-2"
                  disabled={saving}
                >
                  {saving && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
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
