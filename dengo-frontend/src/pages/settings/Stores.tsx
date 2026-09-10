import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Store as StoreIcon, Plus, Edit, Trash2, X, MapPin, Phone, Clock, Save, Building2, Upload, Image } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { usePermissions } from '../../hooks/usePermissions'
import { useStore } from '../../contexts/StoreContext'

interface BranchData {
  id?: string
  name: string
  code: string
  type: string
  address: string
  city: string
  phone: string
  email: string
  manager: string
  status: string
  openTime: string
  closeTime: string
  logo?: string
  companyName?: string
  companyTaxId?: string
  companyTagline?: string
  companyWebsite?: string
  socialMediaName?: string
  defaultCustomerId?: string
  receiptWidthMm?: number
  invoiceSeries?: string
  salesReconciliationEnabled?: boolean
  createdAt?: string
  updatedAt?: string
}

interface CustomerOption {
  id: string
  name?: string
  fullName?: string
  nit?: string
}

const EMPTY_FORM: BranchData = {
  name: '', code: '', type: 'branch', address: '', city: '', phone: '',
  email: '', manager: '', status: 'active', openTime: '08:00', closeTime: '20:00',
  logo: '', companyName: '', companyTaxId: '', companyTagline: '', companyWebsite: '',
  socialMediaName: '',
  defaultCustomerId: '', receiptWidthMm: 55, invoiceSeries: 'A',
  salesReconciliationEnabled: false,
}

interface RegisterDefinition {
  id: string
  name: string
  registerNumber: string
  isActive: boolean
}

export default function Stores() {
  const navigate = useNavigate()
  const { hasPermission } = usePermissions()
  const { refreshStores } = useStore()
  const canManageStores = hasPermission('settings.stores')
  const canManageRegisters = hasPermission('settings.cashRegisters')
  const [stores, setStores] = useState<BranchData[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingStore, setEditingStore] = useState<BranchData | null>(null)
  const [formData, setFormData] = useState<BranchData>({ ...EMPTY_FORM })
  const [customers, setCustomers] = useState<CustomerOption[]>([])

  // Cash register definitions for the store being edited
  const [registerDefs, setRegisterDefs] = useState<RegisterDefinition[]>([])
  const [loadingRegisterDefs, setLoadingRegisterDefs] = useState(false)
  const [newRegisterName, setNewRegisterName] = useState('')
  const [newRegisterNumber, setNewRegisterNumber] = useState('')
  const [savingRegisterDef, setSavingRegisterDef] = useState(false)
  const [editingRegisterDefId, setEditingRegisterDefId] = useState<string | null>(null)
  const [editRegisterDefName, setEditRegisterDefName] = useState('')

  useEffect(() => {
    api.get<BranchData[]>('/api/branches')
      .then(d => setStores(d ?? []))
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
    api.get<CustomerOption[]>('/api/customers')
      .then(d => setCustomers(d ?? []))
      .catch(() => {})
  }, [])

  const fetchRegisterDefs = (branchId: string) => {
    setLoadingRegisterDefs(true)
    api.get<RegisterDefinition[]>(`/api/cash-registers/register-definitions?branchId=${branchId}`)
      .then(d => setRegisterDefs(d ?? []))
      .catch(() => setRegisterDefs([]))
      .finally(() => setLoadingRegisterDefs(false))
  }

  const handleAddRegisterDef = async () => {
    if (!editingStore?.id) return
    if (!newRegisterName.trim() || !newRegisterNumber.trim()) {
      toast.error('Ingresa nombre y número de caja'); return
    }
    setSavingRegisterDef(true)
    try {
      const def = await api.post<RegisterDefinition>('/api/cash-registers/register-definitions', {
        branchId: editingStore.id, name: newRegisterName.trim(), registerNumber: newRegisterNumber.trim(),
      })
      setRegisterDefs(prev => [...prev, def])
      setNewRegisterName('')
      setNewRegisterNumber(String(Number(newRegisterNumber) + 1 || ''))
      toast.success('Caja agregada')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al agregar caja')
    } finally { setSavingRegisterDef(false) }
  }

  const handleRemoveRegisterDef = async (id: string) => {
    if (!confirm('¿Eliminar esta caja de la configuración de la tienda?')) return
    try {
      await api.delete(`/api/cash-registers/register-definitions/${id}`)
      setRegisterDefs(prev => prev.filter(d => d.id !== id))
      toast.success('Caja eliminada')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error al eliminar') }
  }

  const startEditRegisterDef = (def: RegisterDefinition) => {
    setEditingRegisterDefId(def.id)
    setEditRegisterDefName(def.name)
  }

  const handleSaveRegisterDefName = async (id: string) => {
    if (!editRegisterDefName.trim()) { toast.error('El nombre no puede estar vacío'); return }
    try {
      const updated = await api.put<RegisterDefinition>(`/api/cash-registers/register-definitions/${id}`, { name: editRegisterDefName.trim() })
      setRegisterDefs(prev => prev.map(d => d.id === id ? updated : d))
      setEditingRegisterDefId(null)
      toast.success('Caja actualizada')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error al actualizar') }
  }

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { toast.error('Logo no debe superar 2MB'); return }
    const reader = new FileReader()
    reader.onloadend = () => setFormData(prev => ({ ...prev, logo: reader.result as string }))
    reader.readAsDataURL(file)
  }

  const handleOpenModal = (store?: BranchData) => {
    if (store) {
      setEditingStore(store)
      setFormData({ ...EMPTY_FORM, ...store })
      if (store.id) fetchRegisterDefs(store.id)
    } else {
      setEditingStore(null)
      setFormData({ ...EMPTY_FORM })
      setRegisterDefs([])
    }
    setNewRegisterName('')
    setNewRegisterNumber('')
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!formData.name || !formData.code || !formData.address) {
      toast.error('Por favor completa los campos requeridos')
      return
    }
    setSaving(true)
    try {
      if (editingStore?.id) {
        const updated = await api.put<BranchData>(`/api/branches/${editingStore.id}`, formData)
        setStores(stores.map(s => s.id === editingStore.id ? { ...s, ...updated } : s))
        toast.success('Sucursal actualizada')
      } else {
        const created = await api.post<BranchData>('/api/branches', formData)
        setStores([...stores, created])
        toast.success('Sucursal creada')
      }
      setShowModal(false)
      // Refresh the app-wide StoreContext too — otherwise POS/recibos keep
      // using the logo/receiptWidthMm/etc. that was cached before this edit,
      // until a full page reload.
      refreshStores()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar')
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de desactivar esta sucursal?')) return
    try {
      await api.delete(`/api/branches/${id}`)
      setStores(stores.filter(s => s.id !== id))
      toast.success('Sucursal desactivada')
      refreshStores()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error') }
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
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/settings')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <StoreIcon size={28} />
              Tiendas y Sucursales
            </h1>
            <p className="text-gray-600 text-sm mt-1">
              Administrar tiendas, sucursales y sus configuraciones
            </p>
          </div>
        </div>

        {canManageStores && (
          <button
            onClick={() => handleOpenModal()}
            className="btn-primary btn-md flex items-center gap-2"
          >
            <Plus size={18} />
            Nueva Tienda
          </button>
        )}
      </div>

      {loading && <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>}

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
                {store.logo ? (
                  <img src={store.logo} alt="Logo" className="h-12 w-12 object-contain border border-gray-100 rounded-lg" />
                ) : (
                  <div className={`p-3 rounded-lg ${store.type === 'main' ? 'bg-primary-100' : 'bg-gray-100'}`}>
                    <Building2 className={store.type === 'main' ? 'text-primary-600' : 'text-gray-600'} size={24} />
                  </div>
                )}
                <div>
                  <h3 className="font-semibold text-gray-800">{store.companyName ?? store.name}</h3>
                  <p className="text-sm text-gray-500">{store.name} · {store.code}</p>
                  {store.companyTaxId && <p className="text-xs text-gray-400">NIT: {store.companyTaxId}</p>}
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
                {canManageStores && (
                  <button
                    onClick={() => handleOpenModal(store)}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Editar"
                  >
                    <Edit size={16} className="text-gray-600" />
                  </button>
                )}
                {canManageStores && store.type !== 'main' && (
                  <button
                    onClick={() => store.id && handleDelete(store.id)}
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

              {/* Company branding */}
              <div className="border-t pt-5 mt-5">
                <h4 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                  <Building2 size={16} /> Información de Empresa / Recibo
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Nombre en recibo (opcional)</label>
                    <input type="text" value={formData.companyName ?? ''} onChange={e => setFormData({ ...formData, companyName: e.target.value })} className="input w-full" placeholder="Ej: DENGO Distribuciones" />
                  </div>
                  <div>
                    <label className="label">NIT / RTN empresa</label>
                    <input type="text" value={formData.companyTaxId ?? ''} onChange={e => setFormData({ ...formData, companyTaxId: e.target.value })} className="input w-full" placeholder="1234567-8" />
                  </div>
                  <div>
                    <label className="label">Slogan / Tagline</label>
                    <input type="text" value={formData.companyTagline ?? ''} onChange={e => setFormData({ ...formData, companyTagline: e.target.value })} className="input w-full" placeholder="Ej: La mejor calidad" />
                  </div>
                  <div>
                    <label className="label">Sitio web</label>
                    <input type="text" value={formData.companyWebsite ?? ''} onChange={e => setFormData({ ...formData, companyWebsite: e.target.value })} className="input w-full" placeholder="www.empresa.com" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="label">Nombre en redes sociales (se imprime en el recibo con los íconos de Facebook, Instagram y TikTok)</label>
                    <input type="text" value={formData.socialMediaName ?? ''} onChange={e => setFormData({ ...formData, socialMediaName: e.target.value })} className="input w-full" placeholder="Ej: @variedadesdayana" />
                  </div>
                </div>
                {/* Logo */}
                <div className="mt-4">
                  <label className="label">Logo de sucursal</label>
                  <div className="flex items-center gap-4">
                    {formData.logo ? (
                      <div className="relative">
                        <img src={formData.logo} alt="Logo" className="h-16 w-16 object-contain border border-gray-200 rounded-lg" />
                        <button onClick={() => setFormData({ ...formData, logo: '' })} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5">
                          <X size={10} />
                        </button>
                      </div>
                    ) : (
                      <div className="h-16 w-16 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
                        <Image size={20} className="text-gray-300" />
                      </div>
                    )}
                    <label className="btn-outline btn-sm cursor-pointer flex items-center gap-1">
                      <Upload size={14} /> Subir logo
                      <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                    </label>
                    <span className="text-xs text-gray-400">Máx. 2MB. PNG/JPG recomendado.</span>
                  </div>
                </div>
              </div>

              {/* Printing + invoicing */}
              <div className="border-t pt-5 mt-5">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Impresión y facturación</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Ancho de papel de la impresora</label>
                    <div className="flex gap-1.5 mb-2">
                      {[55, 58, 80].map(w => (
                        <button key={w} type="button"
                          onClick={() => setFormData({ ...formData, receiptWidthMm: w })}
                          className={`btn-sm flex-1 ${formData.receiptWidthMm === w ? 'btn-primary' : 'btn-outline'}`}>
                          {w}mm
                        </button>
                      ))}
                    </div>
                    <input type="number" min={30} max={120} value={formData.receiptWidthMm ?? 55}
                      onChange={e => setFormData({ ...formData, receiptWidthMm: Number(e.target.value) })}
                      className="input w-full" placeholder="Otro ancho en mm" />
                    <p className="text-xs text-gray-500 mt-1">3nStar RPT001 y similares miden 55mm. Ajusta este valor si usas otra impresora térmica.</p>
                  </div>
                  <div>
                    <label className="label">Serie de factura</label>
                    <input type="text" maxLength={10} value={formData.invoiceSeries ?? 'A'}
                      onChange={e => setFormData({ ...formData, invoiceSeries: e.target.value.toUpperCase() })}
                      className="input w-full" placeholder="A" />
                    <p className="text-xs text-gray-500 mt-1">El número de factura sube solo, en orden, dentro de esta serie — no se puede editar directamente.</p>
                  </div>
                </div>
              </div>

              {/* Default customer */}
              <div className="border-t pt-5 mt-5">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Cliente por defecto en Punto de Venta</h4>
                <p className="text-xs text-gray-500 mb-3">Se selecciona automáticamente al iniciar una venta en esta sucursal (ej. "Consumidor Final"). El cajero puede cambiarlo, pero toda venta requiere un cliente.</p>
                <select
                  value={formData.defaultCustomerId ?? ''}
                  onChange={e => setFormData({ ...formData, defaultCustomerId: e.target.value })}
                  className="input w-full"
                >
                  <option value="">Sin cliente por defecto</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.fullName ?? c.name}{c.nit ? ` · NIT ${c.nit}` : ''}</option>
                  ))}
                </select>
              </div>

              {/* Cash register definitions — fixed per-store config, required before a sale can register a register */}
              <div className="border-t pt-5 mt-5">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Cajas registradoras</h4>
                <p className="text-xs text-gray-500 mb-3">Configuración fija de cajas disponibles en esta sucursal. El cajero elige una al abrir turno; una venta no puede registrarse sin caja seleccionada.</p>
                {!editingStore?.id ? (
                  <p className="text-xs text-gray-400 italic">Guarda la tienda primero para poder agregar cajas.</p>
                ) : (
                  <div className="space-y-3">
                    {loadingRegisterDefs ? (
                      <div className="flex justify-center py-3"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600" /></div>
                    ) : registerDefs.length === 0 ? (
                      <p className="text-xs text-gray-400">Aún no hay cajas configuradas.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {registerDefs.map(def => (
                          <div key={def.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 gap-2">
                            {editingRegisterDefId === def.id ? (
                              <>
                                <input
                                  type="text" value={editRegisterDefName} autoFocus
                                  onChange={e => setEditRegisterDefName(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') handleSaveRegisterDefName(def.id); if (e.key === 'Escape') setEditingRegisterDefId(null) }}
                                  className="input input-sm flex-1"
                                />
                                <span className="text-gray-400 text-sm">#{def.registerNumber}</span>
                                <button onClick={() => handleSaveRegisterDefName(def.id)} className="p-1 text-green-600 hover:bg-green-50 rounded transition-colors" title="Guardar">
                                  <Save size={14} />
                                </button>
                                <button onClick={() => setEditingRegisterDefId(null)} className="p-1 text-gray-400 hover:text-gray-600 transition-colors" title="Cancelar">
                                  <X size={14} />
                                </button>
                              </>
                            ) : (
                              <>
                                <span className="text-sm text-gray-700">{def.name} <span className="text-gray-400">#{def.registerNumber}</span></span>
                                {canManageRegisters && (
                                  <div className="flex items-center gap-1">
                                    <button onClick={() => startEditRegisterDef(def)} className="p-1 text-gray-400 hover:text-primary-600 transition-colors" title="Editar nombre">
                                      <Edit size={14} />
                                    </button>
                                    <button onClick={() => handleRemoveRegisterDef(def.id)} className="p-1 text-gray-400 hover:text-red-500 transition-colors" title="Eliminar">
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {canManageRegisters && (
                      <div className="flex gap-2">
                        <input type="text" value={newRegisterName} onChange={e => setNewRegisterName(e.target.value)} placeholder="Nombre (ej. Caja 1)" className="input flex-1 text-sm" />
                        <input type="text" value={newRegisterNumber} onChange={e => setNewRegisterNumber(e.target.value)} placeholder="Número" className="input w-24 text-sm" />
                        <button onClick={handleAddRegisterDef} disabled={savingRegisterDef} className="btn-outline btn-sm flex items-center gap-1 whitespace-nowrap">
                          <Plus size={14} /> Agregar
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Onboarding sales reconciliation — parallel-run check against an external report */}
              <div className="border-t pt-5 mt-5">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Conciliación de ventas (implementación)</h4>
                <p className="text-xs text-gray-500 mb-3">
                  Mientras el cliente corre DENGO en paralelo con su Excel u otro reporte externo, activa esto para
                  poder ingresar ese total al cerrar caja — se imprime un comprobante aparte con Total Programa,
                  Total Excel y la diferencia. Apágalo una vez que confíen en el sistema.
                </p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.salesReconciliationEnabled ?? false}
                    onChange={e => setFormData({ ...formData, salesReconciliationEnabled: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700">Activar campo de conciliación al cerrar caja</span>
                </label>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 btn-outline btn-md"
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 btn-primary btn-md flex items-center justify-center gap-2"
                >
                  {saving ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <Save size={18} />}
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
