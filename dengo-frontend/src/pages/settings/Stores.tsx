import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Store as StoreIcon, Plus, Edit, Trash2, X, MapPin, Phone, Clock, Save, Building2 } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import type { Store } from '../../types'

const mockStores: Store[] = [
  {
    id: '1',
    name: 'Tienda Central',
    code: 'TC001',
    type: 'main',
    address: 'Av. Principal 123, Zona 10',
    city: 'Ciudad de Guatemala',
    phone: '+502 2345-6789',
    email: 'central@dengo.com',
    manager: 'Juan Pérez',
    status: 'active',
    openTime: '08:00',
    closeTime: '20:00',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z'
  },
  {
    id: '2',
    name: 'Sucursal Norte',
    code: 'SN001',
    type: 'branch',
    address: 'Calle Norte 456, Zona 17',
    city: 'Ciudad de Guatemala',
    phone: '+502 2345-6790',
    email: 'norte@dengo.com',
    manager: 'María García',
    status: 'active',
    openTime: '09:00',
    closeTime: '19:00',
    createdAt: '2024-01-15T00:00:00Z',
    updatedAt: '2024-01-15T00:00:00Z'
  }
]

export default function Stores() {
  const navigate = useNavigate()
  const [stores, setStores] = useState<Store[]>(mockStores)
  const [showModal, setShowModal] = useState(false)
  const [editingStore, setEditingStore] = useState<Store | null>(null)
  const [formData, setFormData] = useState<Partial<Store>>({
    name: '',
    code: '',
    type: 'branch',
    address: '',
    city: '',
    phone: '',
    email: '',
    manager: '',
    status: 'active',
    openTime: '08:00',
    closeTime: '20:00'
  })

  const handleOpenModal = (store?: Store) => {
    if (store) {
      setEditingStore(store)
      setFormData(store)
    } else {
      setEditingStore(null)
      setFormData({
        name: '',
        code: '',
        type: 'branch',
        address: '',
        city: '',
        phone: '',
        email: '',
        manager: '',
        status: 'active',
        openTime: '08:00',
        closeTime: '20:00'
      })
    }
    setShowModal(true)
  }

  const handleSave = () => {
    if (!formData.name || !formData.code || !formData.address) {
      toast.error('Por favor completa los campos requeridos')
      return
    }

    if (editingStore) {
      setStores(stores.map(s => s.id === editingStore.id ? { ...editingStore, ...formData, updatedAt: new Date().toISOString() } : s))
      toast.success('Tienda actualizada exitosamente')
    } else {
      const newStore: Store = {
        ...formData as Store,
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      setStores([...stores, newStore])
      toast.success('Tienda creada exitosamente')
    }

    setShowModal(false)
  }

  const handleDelete = (id: string) => {
    if (confirm('¿Estás seguro de eliminar esta tienda?')) {
      setStores(stores.filter(s => s.id !== id))
      toast.success('Tienda eliminada exitosamente')
    }
  }

  const getStatusBadge = (status: string) => {
    const badges = {
      active: 'bg-green-100 text-green-700',
      inactive: 'bg-gray-100 text-gray-700',
      maintenance: 'bg-yellow-100 text-yellow-700'
    }
    const labels = {
      active: 'Activa',
      inactive: 'Inactiva',
      maintenance: 'Mantenimiento'
    }
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${badges[status as keyof typeof badges]}`}>
        {labels[status as keyof typeof labels]}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => navigate('/settings')}
            className="text-sm text-gray-600 hover:text-gray-800 mb-2 flex items-center gap-1"
          >
            ← Volver a Configuración
          </button>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <StoreIcon size={28} />
            Tiendas y Sucursales
          </h1>
          <p className="text-gray-600 text-sm mt-1">
            Administrar tiendas, sucursales y sus configuraciones
          </p>
        </div>

        <button
          onClick={() => handleOpenModal()}
          className="btn-primary btn-md flex items-center gap-2"
        >
          <Plus size={18} />
          Nueva Tienda
        </button>
      </div>

      {/* Lista de tiendas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {stores.map((store, index) => (
          <motion.div
            key={store.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white rounded-lg shadow-sm p-6"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-lg ${
                  store.type === 'main' ? 'bg-primary-100' : 'bg-gray-100'
                }`}>
                  <Building2 className={
                    store.type === 'main' ? 'text-primary-600' : 'text-gray-600'
                  } size={24} />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">{store.name}</h3>
                  <p className="text-sm text-gray-500">{store.code}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getStatusBadge(store.status)}
              </div>
            </div>

            <div className="space-y-2 mb-4">
              <div className="flex items-start gap-2 text-sm">
                <MapPin size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />
                <span className="text-gray-600">{store.address}, {store.city}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Phone size={16} className="text-gray-400" />
                <span className="text-gray-600">{store.phone}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock size={16} className="text-gray-400" />
                <span className="text-gray-600">{store.openTime} - {store.closeTime}</span>
              </div>
            </div>

            <div className="pt-4 border-t flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Encargado</p>
                <p className="text-sm font-medium text-gray-700">{store.manager}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleOpenModal(store)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Editar"
                >
                  <Edit size={16} className="text-gray-600" />
                </button>
                {store.type !== 'main' && (
                  <button
                    onClick={() => handleDelete(store.id)}
                    className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 size={16} className="text-red-600" />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-800">
                  {editingStore ? 'Editar Tienda' : 'Nueva Tienda'}
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Nombre *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="input w-full"
                      placeholder="Tienda Central"
                    />
                  </div>

                  <div>
                    <label className="label">Código *</label>
                    <input
                      type="text"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                      className="input w-full"
                      placeholder="TC001"
                    />
                  </div>

                  <div>
                    <label className="label">Tipo *</label>
                    <select
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value as 'main' | 'branch' })}
                      className="input w-full"
                    >
                      <option value="main">Principal</option>
                      <option value="branch">Sucursal</option>
                    </select>
                  </div>

                  <div>
                    <label className="label">Estado *</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                      className="input w-full"
                    >
                      <option value="active">Activa</option>
                      <option value="inactive">Inactiva</option>
                      <option value="maintenance">Mantenimiento</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="label">Dirección *</label>
                    <input
                      type="text"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className="input w-full"
                      placeholder="Av. Principal 123, Zona 10"
                    />
                  </div>

                  <div>
                    <label className="label">Ciudad *</label>
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      className="input w-full"
                      placeholder="Ciudad de Guatemala"
                    />
                  </div>

                  <div>
                    <label className="label">Teléfono *</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="input w-full"
                      placeholder="+502 2345-6789"
                    />
                  </div>

                  <div>
                    <label className="label">Email *</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="input w-full"
                      placeholder="tienda@dengo.com"
                    />
                  </div>

                  <div>
                    <label className="label">Encargado *</label>
                    <input
                      type="text"
                      value={formData.manager}
                      onChange={(e) => setFormData({ ...formData, manager: e.target.value })}
                      className="input w-full"
                      placeholder="Juan Pérez"
                    />
                  </div>

                  <div>
                    <label className="label">Hora de Apertura *</label>
                    <input
                      type="time"
                      value={formData.openTime}
                      onChange={(e) => setFormData({ ...formData, openTime: e.target.value })}
                      className="input w-full"
                    />
                  </div>

                  <div>
                    <label className="label">Hora de Cierre *</label>
                    <input
                      type="time"
                      value={formData.closeTime}
                      onChange={(e) => setFormData({ ...formData, closeTime: e.target.value })}
                      className="input w-full"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 btn-outline btn-md"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  className="flex-1 btn-primary btn-md flex items-center justify-center gap-2"
                >
                  <Save size={18} />
                  {editingStore ? 'Actualizar' : 'Crear'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
