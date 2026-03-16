import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowUpDown, Plus, Search, Filter, Package,
  Building2, Calendar, Truck, Clock, CheckCircle,
  XCircle, AlertCircle, ArrowRight, ChevronDown,
  FileText, Download, Eye, BarChart3
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { useAuthStore } from '../store'

interface Branch {
  id: string
  name: string
}

interface Product {
  id: string
  name: string
  fullName?: string
  sku?: string
  barcode?: string
  unitCost?: number
  cost?: number
}

interface TransferItem {
  productId: string
  productName: string
  productCode: string
  quantity: number
  unitCost: number
  totalCost: number
}

interface Transfer {
  id: string
  code?: string
  fromBranchId?: string
  toBranchId?: string
  fromStore?: string
  toStore?: string
  fromBranch?: Branch
  toBranch?: Branch
  status: 'pending' | 'in_transit' | 'approved' | 'completed' | 'cancelled' | 'rejected'
  createdAt: string
  createdBy?: string
  requestedBy?: { id: string; name: string }
  items: TransferItem[]
  totalItems?: number
  totalValue?: number
  notes?: string
  receivedAt?: string
  receivedBy?: string
}

export default function StoreTransfers() {
  const { user } = useAuthStore()
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [selectedTransfer, setSelectedTransfer] = useState<Transfer | null>(null)

  const [newTransfer, setNewTransfer] = useState({
    fromStore: '',
    toStore: '',
    items: [] as TransferItem[],
    notes: ''
  })

  const [productSearch, setProductSearch] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [quantity, setQuantity] = useState('')

  const fetchTransfers = () => {
    setLoading(true)
    api.get<Transfer[]>('/api/transfers')
      .then(setTransfers)
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchTransfers()
    api.get<Branch[]>('/api/branches').then(setBranches).catch(e => toast.error(e.message))
    api.get<Product[]>('/api/products').then(setProducts).catch(e => toast.error(e.message))
  }, [])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-yellow-600 bg-yellow-100'
      case 'in_transit':
      case 'approved': return 'text-blue-600 bg-blue-100'
      case 'completed': return 'text-green-600 bg-green-100'
      case 'cancelled':
      case 'rejected': return 'text-red-600 bg-red-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock size={16} />
      case 'in_transit':
      case 'approved': return <Truck size={16} />
      case 'completed': return <CheckCircle size={16} />
      case 'cancelled':
      case 'rejected': return <XCircle size={16} />
      default: return null
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return 'Pendiente'
      case 'in_transit': return 'En Tránsito'
      case 'approved': return 'Aprobada'
      case 'completed': return 'Completada'
      case 'cancelled': return 'Cancelada'
      case 'rejected': return 'Rechazada'
      default: return status
    }
  }

  const displayName = (t: Transfer, side: 'from' | 'to') => {
    if (side === 'from') return t.fromBranch?.name ?? t.fromStore ?? t.fromBranchId ?? '—'
    return t.toBranch?.name ?? t.toStore ?? t.toBranchId ?? '—'
  }

  const handleAddProduct = () => {
    if (!selectedProduct || !quantity) {
      toast.error('Selecciona un producto y cantidad')
      return
    }
    const quantityNum = parseInt(quantity)
    if (quantityNum <= 0) { toast.error('La cantidad debe ser mayor a 0'); return }

    const existingItem = newTransfer.items.find(item => item.productId === selectedProduct.id)
    if (existingItem) { toast.error('Este producto ya está en la transferencia'); return }

    const cost = selectedProduct.cost ?? selectedProduct.unitCost ?? 0
    const newItem: TransferItem = {
      productId: selectedProduct.id,
      productName: selectedProduct.fullName ?? selectedProduct.name,
      productCode: selectedProduct.sku ?? selectedProduct.barcode ?? selectedProduct.id,
      quantity: quantityNum,
      unitCost: cost,
      totalCost: quantityNum * cost
    }

    setNewTransfer({ ...newTransfer, items: [...newTransfer.items, newItem] })
    setSelectedProduct(null)
    setQuantity('')
    setProductSearch('')
    toast.success(`${newItem.productName} agregado a la transferencia`)
  }

  const handleRemoveProduct = (index: number) => {
    setNewTransfer({ ...newTransfer, items: newTransfer.items.filter((_, i) => i !== index) })
  }

  const handleCreateTransfer = () => {
    if (!newTransfer.fromStore || !newTransfer.toStore) {
      toast.error('Debes seleccionar tienda de origen y destino')
      return
    }
    if (newTransfer.fromStore === newTransfer.toStore) {
      toast.error('La tienda de origen y destino no pueden ser la misma')
      return
    }
    if (newTransfer.items.length === 0) {
      toast.error('Debes agregar al menos un producto')
      return
    }

    setSaving(true)
    api.post('/api/transfers', {
      fromBranchId: newTransfer.fromStore,
      toBranchId: newTransfer.toStore,
      items: newTransfer.items.map(i => ({ productId: i.productId, quantity: i.quantity })),
      notes: newTransfer.notes || undefined,
      requestedById: user?.id,
    })
      .then(() => {
        toast.success('Transferencia creada exitosamente')
        setShowCreateModal(false)
        setNewTransfer({ fromStore: '', toStore: '', items: [], notes: '' })
        fetchTransfers()
      })
      .catch(e => toast.error(e.message))
      .finally(() => setSaving(false))
  }

  const handleApproveTransfer = (transfer: Transfer) => {
    api.patch(`/api/transfers/${transfer.id}/approve`, {})
      .then(() => {
        toast.success('Transferencia aprobada.')
        fetchTransfers()
        if (selectedTransfer?.id === transfer.id) setShowDetailsModal(false)
      })
      .catch(e => toast.error(e.message))
  }

  const handleReceiveTransfer = (transfer: Transfer) => {
    api.patch(`/api/transfers/${transfer.id}/receive`, {})
      .then(() => {
        toast.success('Recepción confirmada. Inventario actualizado.')
        fetchTransfers()
        if (selectedTransfer?.id === transfer.id) setShowDetailsModal(false)
      })
      .catch(e => toast.error(e.message))
  }

  const handleRejectTransfer = (transfer: Transfer) => {
    api.patch(`/api/transfers/${transfer.id}/reject`, {})
      .then(() => {
        toast.success('Transferencia rechazada.')
        fetchTransfers()
        if (selectedTransfer?.id === transfer.id) setShowDetailsModal(false)
      })
      .catch(e => toast.error(e.message))
  }

  const handleViewDetails = (transfer: Transfer) => {
    setSelectedTransfer(transfer)
    setShowDetailsModal(true)
  }

  const filteredTransfers = transfers.filter(transfer => {
    const from = displayName(transfer, 'from').toLowerCase()
    const to = displayName(transfer, 'to').toLowerCase()
    const code = (transfer.code ?? transfer.id ?? '').toLowerCase()
    const matchesSearch =
      code.includes(searchTerm.toLowerCase()) ||
      from.includes(searchTerm.toLowerCase()) ||
      to.includes(searchTerm.toLowerCase())
    const matchesStatus = selectedStatus === 'all' || transfer.status === selectedStatus
    return matchesSearch && matchesStatus
  })

  const stats = {
    total: transfers.length,
    pending: transfers.filter(t => t.status === 'pending').length,
    inTransit: transfers.filter(t => t.status === 'in_transit' || t.status === 'approved').length,
    completed: transfers.filter(t => t.status === 'completed').length,
    totalValue: transfers.reduce((sum, t) => sum + (t.totalValue ?? t.items.reduce((s, i) => s + i.totalCost, 0)), 0)
  }

  const filteredProducts = products.filter(p =>
    (p.fullName ?? p.name ?? '').toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.sku ?? '').toLowerCase().includes(productSearch.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <ArrowUpDown size={28} />
            Transferencias entre Tiendas
          </h1>
          <p className="text-gray-600 text-sm mt-1">
            Gestión de movimientos de productos entre sucursales
          </p>
        </div>

        <div className="flex gap-3">
          <button className="btn-outline btn-md flex items-center gap-2">
            <BarChart3 size={18} />
            Reporte
          </button>
          <button className="btn-outline btn-md flex items-center gap-2">
            <Download size={18} />
            Exportar
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary btn-md flex items-center gap-2"
          >
            <Plus size={18} />
            Nueva Transferencia
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
        </div>
      )}

      {/* Estadísticas */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600 text-sm">Total Transferencias</span>
              <ArrowUpDown className="text-blue-600" size={20} />
            </div>
            <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
            <p className="text-xs text-gray-500 mt-1">Este mes</p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600 text-sm">Pendientes</span>
              <Clock className="text-yellow-600" size={20} />
            </div>
            <p className="text-2xl font-bold text-gray-800">{stats.pending}</p>
            <p className="text-xs text-yellow-600 mt-1">Por enviar</p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600 text-sm">En Tránsito</span>
              <Truck className="text-blue-600" size={20} />
            </div>
            <p className="text-2xl font-bold text-gray-800">{stats.inTransit}</p>
            <p className="text-xs text-blue-600 mt-1">En camino</p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600 text-sm">Completadas</span>
              <CheckCircle className="text-green-600" size={20} />
            </div>
            <p className="text-2xl font-bold text-gray-800">{stats.completed}</p>
            <p className="text-xs text-green-600 mt-1">Recibidas</p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600 text-sm">Valor Total</span>
              <Package className="text-purple-600" size={20} />
            </div>
            <p className="text-2xl font-bold text-gray-800">
              ${stats.totalValue.toLocaleString()}
            </p>
            <p className="text-xs text-purple-600 mt-1">En transferencias</p>
          </motion.div>
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
                placeholder="Buscar por código o tienda..."
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
              <option value="pending">Pendientes</option>
              <option value="approved">Aprobadas</option>
              <option value="in_transit">En tránsito</option>
              <option value="completed">Completadas</option>
              <option value="cancelled">Canceladas</option>
              <option value="rejected">Rechazadas</option>
            </select>

            <button className="btn-outline btn-md flex items-center gap-2">
              <Filter size={18} />
              Más filtros
              <ChevronDown size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Lista de transferencias */}
      {!loading && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Código</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Origen</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Destino</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Items</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Valor</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Estado</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Fecha</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransfers.map((transfer) => {
                  const itemTotal = transfer.items.reduce((s, i) => s + i.totalCost, 0)
                  const value = transfer.totalValue ?? itemTotal
                  return (
                    <tr key={transfer.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <p className="font-medium text-gray-800">{transfer.code ?? transfer.id.slice(0, 8)}</p>
                        <p className="text-xs text-gray-500">Por: {transfer.requestedBy?.name ?? transfer.createdBy ?? '—'}</p>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Building2 size={16} className="text-gray-400" />
                          <span className="text-sm">{displayName(transfer, 'from')}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Building2 size={16} className="text-gray-400" />
                          <span className="text-sm">{displayName(transfer, 'to')}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="font-medium">{transfer.totalItems ?? transfer.items.length}</span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="font-medium">${value.toFixed(2)}</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(transfer.status)}`}>
                          {getStatusIcon(transfer.status)}
                          {getStatusLabel(transfer.status)}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-sm">
                          {format(new Date(transfer.createdAt), "d MMM", { locale: es })}
                        </p>
                        <p className="text-xs text-gray-500">
                          {format(new Date(transfer.createdAt), "HH:mm", { locale: es })}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleViewDetails(transfer)}
                            className="p-1 hover:bg-gray-100 rounded transition-colors"
                            title="Ver detalles"
                          >
                            <Eye size={18} className="text-gray-600" />
                          </button>
                          {transfer.status === 'pending' && (
                            <button
                              onClick={() => handleApproveTransfer(transfer)}
                              className="p-1 hover:bg-blue-50 rounded transition-colors"
                              title="Aprobar"
                            >
                              <Truck size={18} className="text-blue-600" />
                            </button>
                          )}
                          {(transfer.status === 'in_transit' || transfer.status === 'approved') && (
                            <button
                              onClick={() => handleReceiveTransfer(transfer)}
                              className="p-1 hover:bg-green-50 rounded transition-colors"
                              title="Confirmar recepción"
                            >
                              <CheckCircle size={18} className="text-green-600" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {filteredTransfers.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-gray-500">
                      No se encontraron transferencias
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de crear transferencia */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-lg shadow-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto"
          >
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <ArrowUpDown size={24} />
              Nueva Transferencia
            </h2>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tienda de Origen
                  </label>
                  <select
                    value={newTransfer.fromStore}
                    onChange={(e) => setNewTransfer({ ...newTransfer, fromStore: e.target.value })}
                    className="input w-full"
                    required
                  >
                    <option value="">Seleccionar tienda...</option>
                    {branches.map(branch => (
                      <option key={branch.id} value={branch.id}>{branch.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tienda de Destino
                  </label>
                  <select
                    value={newTransfer.toStore}
                    onChange={(e) => setNewTransfer({ ...newTransfer, toStore: e.target.value })}
                    className="input w-full"
                    required
                  >
                    <option value="">Seleccionar tienda...</option>
                    {branches
                      .filter(branch => branch.id !== newTransfer.fromStore)
                      .map(branch => (
                        <option key={branch.id} value={branch.id}>{branch.name}</option>
                      ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notas (Opcional)
                </label>
                <textarea
                  value={newTransfer.notes}
                  onChange={(e) => setNewTransfer({ ...newTransfer, notes: e.target.value })}
                  className="input w-full"
                  rows={2}
                  placeholder="Ej: Urgente, stock bajo en destino..."
                />
              </div>

              <div className="border-t pt-4">
                <h3 className="font-medium text-gray-800 mb-3">Productos a Transferir</h3>

                <div className="flex gap-2 mb-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="text"
                      placeholder="Buscar producto..."
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      className="input pl-10 w-full"
                    />
                  </div>
                  <input
                    type="number"
                    placeholder="Cantidad"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="input w-32"
                    min="1"
                  />
                  <button
                    onClick={handleAddProduct}
                    disabled={!selectedProduct || !quantity}
                    className="btn-primary btn-md"
                  >
                    <Plus size={18} />
                  </button>
                </div>

                {/* Lista de productos buscados */}
                {productSearch && (
                  <div className="mb-4 max-h-32 overflow-y-auto border rounded-lg">
                    {filteredProducts.map(product => (
                      <div
                        key={product.id}
                        onClick={() => setSelectedProduct(product)}
                        className={`p-2 hover:bg-gray-50 cursor-pointer flex justify-between ${
                          selectedProduct?.id === product.id ? 'bg-primary-50' : ''
                        }`}
                      >
                        <div>
                          <p className="text-sm font-medium">{product.fullName ?? product.name}</p>
                          <p className="text-xs text-gray-500">{product.sku ?? product.barcode ?? product.id}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-500">${product.cost ?? product.unitCost ?? 0}</p>
                        </div>
                      </div>
                    ))}
                    {filteredProducts.length === 0 && (
                      <p className="p-3 text-sm text-gray-500 text-center">Sin resultados</p>
                    )}
                  </div>
                )}

                {/* Productos añadidos */}
                {newTransfer.items.length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left py-2 px-3 text-sm font-medium text-gray-700">Producto</th>
                          <th className="text-center py-2 px-3 text-sm font-medium text-gray-700">Cantidad</th>
                          <th className="text-right py-2 px-3 text-sm font-medium text-gray-700">Costo Unit.</th>
                          <th className="text-right py-2 px-3 text-sm font-medium text-gray-700">Total</th>
                          <th className="text-center py-2 px-3 text-sm font-medium text-gray-700"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {newTransfer.items.map((item, index) => (
                          <tr key={index} className="border-b">
                            <td className="py-2 px-3">
                              <p className="text-sm font-medium">{item.productName}</p>
                              <p className="text-xs text-gray-500">{item.productCode}</p>
                            </td>
                            <td className="py-2 px-3 text-center">{item.quantity}</td>
                            <td className="py-2 px-3 text-right">${item.unitCost.toFixed(2)}</td>
                            <td className="py-2 px-3 text-right font-medium">${item.totalCost.toFixed(2)}</td>
                            <td className="py-2 px-3 text-center">
                              <button
                                onClick={() => handleRemoveProduct(index)}
                                className="text-red-600 hover:bg-red-50 p-1 rounded"
                              >
                                <XCircle size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50">
                        <tr>
                          <td colSpan={3} className="py-2 px-3 text-right font-medium">Total:</td>
                          <td className="py-2 px-3 text-right font-bold">
                            ${newTransfer.items.reduce((sum, item) => sum + item.totalCost, 0).toFixed(2)}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}

                {newTransfer.items.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <Package size={48} className="mx-auto mb-2 opacity-50" />
                    <p>No hay productos añadidos</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 pt-6 mt-6 border-t">
              <button
                onClick={() => setShowCreateModal(false)}
                className="btn-outline btn-md flex-1"
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateTransfer}
                disabled={!newTransfer.fromStore || !newTransfer.toStore || newTransfer.items.length === 0 || saving}
                className="btn-primary btn-md flex-1 flex items-center justify-center gap-2"
              >
                {saving && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
                Crear Transferencia
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Modal de detalles */}
      {showDetailsModal && selectedTransfer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-800">
                Detalles de Transferencia
              </h2>
              <button
                onClick={() => setShowDetailsModal(false)}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
              >
                <XCircle size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm text-gray-600">Código</p>
                  <p className="font-bold text-lg">{selectedTransfer.code ?? selectedTransfer.id.slice(0, 8)}</p>
                </div>
                <span className={`inline-flex items-center gap-1 px-3 py-1 text-sm font-medium rounded-full ${getStatusColor(selectedTransfer.status)}`}>
                  {getStatusIcon(selectedTransfer.status)}
                  {getStatusLabel(selectedTransfer.status)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Origen</p>
                  <div className="flex items-center gap-2">
                    <Building2 size={18} className="text-gray-400" />
                    <span className="font-medium">{displayName(selectedTransfer, 'from')}</span>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Destino</p>
                  <div className="flex items-center gap-2">
                    <Building2 size={18} className="text-gray-400" />
                    <span className="font-medium">{displayName(selectedTransfer, 'to')}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Creado</p>
                  <p className="font-medium">{selectedTransfer.requestedBy?.name ?? selectedTransfer.createdBy ?? '—'}</p>
                  <p className="text-xs text-gray-500">
                    {format(new Date(selectedTransfer.createdAt), "d 'de' MMMM, HH:mm", { locale: es })}
                  </p>
                </div>
                {selectedTransfer.receivedBy && (
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Recibido por</p>
                    <p className="font-medium">{selectedTransfer.receivedBy}</p>
                    {selectedTransfer.receivedAt && (
                      <p className="text-xs text-gray-500">
                        {format(new Date(selectedTransfer.receivedAt), "d 'de' MMMM, HH:mm", { locale: es })}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {selectedTransfer.notes && (
                <div className="p-3 bg-yellow-50 rounded-lg">
                  <p className="text-sm font-medium text-yellow-900 mb-1">Notas</p>
                  <p className="text-sm text-yellow-800">{selectedTransfer.notes}</p>
                </div>
              )}

              <div>
                <h3 className="font-medium text-gray-800 mb-3">Productos Transferidos</h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left py-2 px-3 text-sm font-medium text-gray-700">Producto</th>
                        <th className="text-center py-2 px-3 text-sm font-medium text-gray-700">Cantidad</th>
                        <th className="text-right py-2 px-3 text-sm font-medium text-gray-700">Costo Unit.</th>
                        <th className="text-right py-2 px-3 text-sm font-medium text-gray-700">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTransfer.items.map((item, index) => (
                        <tr key={index} className="border-b">
                          <td className="py-2 px-3">
                            <p className="text-sm font-medium">{item.productName}</p>
                            <p className="text-xs text-gray-500">{item.productCode}</p>
                          </td>
                          <td className="py-2 px-3 text-center">{item.quantity}</td>
                          <td className="py-2 px-3 text-right">${item.unitCost.toFixed(2)}</td>
                          <td className="py-2 px-3 text-right font-medium">${item.totalCost.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td colSpan={3} className="py-2 px-3 text-right font-medium">Total:</td>
                        <td className="py-2 px-3 text-right font-bold">
                          ${(selectedTransfer.totalValue ?? selectedTransfer.items.reduce((s, i) => s + i.totalCost, 0)).toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-4 mt-4 border-t">
              <button
                onClick={() => setShowDetailsModal(false)}
                className="btn-outline btn-md flex-1"
              >
                Cerrar
              </button>
              {selectedTransfer.status === 'pending' && (
                <>
                  <button
                    onClick={() => handleRejectTransfer(selectedTransfer)}
                    className="btn-danger btn-md"
                  >
                    Rechazar
                  </button>
                  <button
                    onClick={() => handleApproveTransfer(selectedTransfer)}
                    className="btn-primary btn-md flex-1"
                  >
                    Aprobar Transferencia
                  </button>
                </>
              )}
              {(selectedTransfer.status === 'in_transit' || selectedTransfer.status === 'approved') && (
                <button
                  onClick={() => handleReceiveTransfer(selectedTransfer)}
                  className="btn-primary btn-md flex-1"
                >
                  Confirmar Recepción
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
