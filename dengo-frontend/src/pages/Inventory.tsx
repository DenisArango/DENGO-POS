import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Warehouse, Search, Edit2, Package,
  TrendingDown, TrendingUp, Download,
  Filter, ChevronDown, Plus, Minus,
  History, CheckCircle, XCircle, AlertCircle,
  BarChart3, ArrowUpDown, X
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import ProductModal from '../components/products/ProductModal'
import { api } from '../lib/api'
import { useAuthStore } from '../store'
import { useStore } from '../contexts/StoreContext'
import { usePermissions } from '../hooks/usePermissions'
import { getAdjustmentReasons, type AdjustmentReason } from '../lib/inventoryReasons'

interface InventoryItem {
  productId: string
  branchId: string
  quantity: number
  product: {
    id: string
    name: string
    fullName?: string
    sku?: string
    barcode?: string
    brand?: string
    category?: string | { id: string; name: string; color?: string }
    baseUnit?: string | { id?: string; name?: string; abbreviation?: string }
    minStock?: number
    basePrice?: number
    cost?: number
    variations?: { id?: string; name: string; conversionFactor: number; price: number; isDefault?: boolean }[]
  }
}

interface InventoryItemWithStatus extends InventoryItem {
  status: 'normal' | 'low' | 'critical' | 'overstock'
  displayName: string
  categoryName: string
  sku: string
  barcode: string
  baseUnit: string
  minStock: number
  cost: number
  basePrice: number
}

interface StockAdjustment {
  productId: string
  branchId: string
  currentStock: number
  newStock: number
  reason: string
  notes?: string
}

interface StockMovement {
  id: string
  type: string
  quantity: number
  reason?: string
  referenceId?: string
  createdAt: string
  performedBy?: { id: string; name: string }
}

function computeStatus(quantity: number, minStock: number): InventoryItemWithStatus['status'] {
  if (quantity === 0) return 'critical'
  if (quantity <= minStock * 0.5) return 'critical'
  if (quantity <= minStock) return 'low'
  if (quantity > minStock * 3) return 'overstock'
  return 'normal'
}

function normaliseItem(item: InventoryItem): InventoryItemWithStatus {
  const p = item.product
  const quantity = Number(item.quantity ?? 0)
  const displayName = p.fullName ?? p.name ?? ''
  const categoryName = typeof p.category === 'object' ? (p.category as { name: string })?.name ?? '' : p.category ?? ''
  const sku = p.sku ?? ''
  const barcode = p.barcode ?? ''
  const baseUnit = typeof p.baseUnit === 'object'
    ? (p.baseUnit as { name?: string; abbreviation?: string })?.name ?? 'Pieza'
    : p.baseUnit ?? 'Pieza'
  const minStock = Number(p.minStock ?? 0)
  const cost = Number(p.cost ?? 0)
  const basePrice = Number(p.basePrice ?? 0)
  const status = computeStatus(quantity, minStock)
  return { ...item, quantity, status, displayName, categoryName, sku, barcode, baseUnit, minStock, cost, basePrice }
}

/** Client-side CSV export — no backend round-trip, includes cost/sale-price columns. */
function downloadInventoryCsv(items: InventoryItemWithStatus[]) {
  const columns = ['SKU', 'Código de barras', 'Producto', 'Categoría', 'Stock', 'Stock mínimo', 'Precio base', 'Costo unitario', 'Costo total', 'Valor de venta total']
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows = items.map(item => [
    item.sku, item.barcode, item.displayName, item.categoryName, item.quantity, item.minStock,
    item.basePrice.toFixed(2), item.cost.toFixed(2), (item.quantity * item.cost).toFixed(2), (item.quantity * item.basePrice).toFixed(2),
  ].map(escape).join(','))
  const csv = '﻿' + [columns.join(','), ...rows].join('\n') // BOM so Excel opens UTF-8 (tildes, Q) correctly
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `inventario_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function getMovementTypeLabel(type: string, reason?: string) {
  // The backend never emits 'TRANSFER_IN'/'TRANSFER_OUT' — a transfer's
  // deduction from the origin branch is logged as 'TRANSFER', and its
  // receipt at the destination branch is logged as a plain 'IN' (same type
  // as a purchase intake or a manual increase). The reason text is the only
  // way to tell those apart for display.
  if (type === 'IN' && reason?.startsWith('Recepción de transferencia')) {
    return { label: 'Traslado (entrada)', color: 'text-teal-700 bg-teal-50' }
  }
  switch (type) {
    case 'IN': return { label: 'Entrada', color: 'text-green-700 bg-green-50' }
    case 'OUT': return { label: 'Salida', color: 'text-red-700 bg-red-50' }
    case 'ADJUSTMENT': return { label: 'Ajuste', color: 'text-blue-700 bg-blue-50' }
    case 'RETURN': return { label: 'Devolución', color: 'text-purple-700 bg-purple-50' }
    case 'TRANSFER': return { label: 'Traslado (salida)', color: 'text-orange-700 bg-orange-50' }
    default: return { label: type, color: 'text-gray-700 bg-gray-50' }
  }
}

export default function Inventory() {
  const { user } = useAuthStore()
  const { currentStore } = useStore()
  const branchId = currentStore?.id ?? user?.branchId ?? ''
  const { hasPermission } = usePermissions()
  const canEditProducts = hasPermission('inventory.edit')
  const canAdjustStock = hasPermission('inventory.adjust')
  const canEditPrice = hasPermission('inventory.editPrice')

  const [inventory, setInventory] = useState<InventoryItemWithStatus[]>([])
  const [loading, setLoading] = useState(false)
  const [categories, setCategories] = useState<string[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)

  // Adjustment modal
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false)
  const [selectedItem, setSelectedItem] = useState<InventoryItemWithStatus | null>(null)
  const [savingAdjustment, setSavingAdjustment] = useState(false)
  const [adjustment, setAdjustment] = useState<StockAdjustment>({
    productId: '', branchId, currentStock: 0, newStock: 0, reason: '', notes: ''
  })
  // Reasons are direction-specific (Configuración → Motivos de Ajuste) — both
  // lists loaded once so switching between raising/lowering the number just
  // swaps which one the dropdown reads from, no re-fetch needed mid-edit.
  const [reasonsUp, setReasonsUp] = useState<AdjustmentReason[]>([])
  const [reasonsDown, setReasonsDown] = useState<AdjustmentReason[]>([])
  useEffect(() => {
    getAdjustmentReasons('UP').then(setReasonsUp)
    getAdjustmentReasons('DOWN').then(setReasonsDown)
  }, [])
  const adjustmentDirection: 'UP' | 'DOWN' = adjustment.newStock >= adjustment.currentStock ? 'UP' : 'DOWN'
  const adjustmentReasonOptions = adjustmentDirection === 'UP' ? reasonsUp : reasonsDown

  // Edit product modal
  const [showProductModal, setShowProductModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<any>(null)
  const [productCategories, setProductCategories] = useState<{ id: string; name: string; color?: string }[]>([])
  const [productUnits, setProductUnits] = useState<{ id: string; name: string; abbreviation: string; type: string }[]>([])

  // History modal
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [historyItem, setHistoryItem] = useState<InventoryItemWithStatus | null>(null)
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const fetchInventory = () => {
    setLoading(true)
    api.get<InventoryItem[]>(`/api/inventory?branchId=${branchId}`)
      .then(items => {
        const normalised = items.map(normaliseItem)
        setInventory(normalised)
        const cats = Array.from(new Set(normalised.map(i => i.categoryName).filter(Boolean)))
        setCategories(cats)
      })
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (branchId) fetchInventory()
  }, [branchId])

  useEffect(() => {
    api.get<{ id: string; name: string; color?: string }[]>('/api/categories')
      .then(setProductCategories).catch(() => {})
    api.get<{ id: string; name: string; abbreviation: string; type: string }[]>('/api/units')
      .then(setProductUnits).catch(() => {})
  }, [])

  const filteredInventory = inventory.filter(item => {
    const matchesSearch =
      item.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.barcode.includes(searchTerm)
    const matchesCategory = !selectedCategory || item.categoryName === selectedCategory
    const matchesStatus = !selectedStatus || item.status === selectedStatus
    return matchesSearch && matchesCategory && matchesStatus
  })

  const stats = {
    totalProducts: inventory.length,
    totalValue: inventory.reduce((acc, item) => acc + (item.quantity * item.cost), 0),
    totalSaleValue: inventory.reduce((acc, item) => acc + (item.quantity * item.basePrice), 0),
    lowStock: inventory.filter(item => item.status === 'low' || item.status === 'critical').length,
    overstock: inventory.filter(item => item.status === 'overstock').length
  }

  // ── Adjustment ────────────────────────────────────────────────────────────
  const handleAdjustStock = (item: InventoryItemWithStatus) => {
    setSelectedItem(item)
    setAdjustment({
      productId: item.productId,
      branchId: item.branchId,
      currentStock: item.quantity,
      newStock: item.quantity,
      reason: '',
      notes: ''
    })
    setShowAdjustmentModal(true)
  }

  const saveAdjustment = () => {
    if (!adjustment.reason) { toast.error('Seleccione una razón para el ajuste'); return }
    if (adjustment.newStock === adjustment.currentStock) { toast.error('El nuevo stock debe ser diferente al actual'); return }

    setSavingAdjustment(true)
    api.put(`/api/inventory/${adjustment.productId}/${adjustment.branchId}`, {
      quantity: adjustment.newStock,
      reason: adjustment.reason,
    })
      .then(() => {
        const diff = adjustment.newStock - adjustment.currentStock
        toast.success(`Stock ${diff > 0 ? 'incrementado' : 'reducido'} exitosamente (${diff > 0 ? '+' : ''}${diff})`)
        setShowAdjustmentModal(false)
        fetchInventory()
      })
      .catch(e => toast.error(e.message))
      .finally(() => setSavingAdjustment(false))
  }

  // ── Edit product ──────────────────────────────────────────────────────────
  const handleEditProduct = (item: InventoryItemWithStatus) => {
    const p = item.product
    const catName = typeof p.category === 'object' ? (p.category as any)?.name ?? '' : p.category ?? ''
    const unitName = typeof p.baseUnit === 'object' ? (p.baseUnit as any)?.name ?? '' : p.baseUnit ?? ''
    setEditingProduct({
      ...p,
      id: p.id,
      productName: p.fullName ?? p.name,
      category: catName,
      baseUnit: unitName,
    })
    setShowProductModal(true)
  }

  const handleProductSave = (productData: any) => {
    const id = editingProduct?.id
    if (!id) return

    api.put(`/api/products/${id}`, {
      name: productData.productName ?? productData.name ?? productData.fullName,
      barcode: productData.barcode,
      sku: productData.sku,
      brand: productData.brand || undefined,
      basePrice: Number(productData.basePrice ?? 0),
      cost: Number(productData.cost ?? 0),
      minStock: Number(productData.minStock ?? 0),
      imageUrl: productData.imageUrl || undefined,
      categoryId: productData.categoryId,
      baseUnitId: productData.baseUnitId,
      variations: (productData.variations ?? []).map((v: any) => ({
        id: v.id,
        name: v.name,
        barcode: v.barcode || undefined,
        conversionFactor: Number(v.conversionFactor ?? 1),
        price: Number(v.price ?? 0),
        isDefault: v.isDefault ?? false,
      })),
    })
      .then(() => {
        toast.success('Producto actualizado exitosamente')
        setShowProductModal(false)
        setEditingProduct(null)
        fetchInventory()
      })
      .catch(e => toast.error(e.message))
  }

  // ── History ───────────────────────────────────────────────────────────────
  const handleViewHistory = (item: InventoryItemWithStatus) => {
    setHistoryItem(item)
    setShowHistoryModal(true)
    setLoadingHistory(true)
    api.get<StockMovement[]>(`/api/inventory/movements?productId=${item.productId}&branchId=${item.branchId}`)
      .then(data => setMovements(data ?? []))
      .catch(e => { toast.error(e.message); setMovements([]) })
      .finally(() => setLoadingHistory(false))
  }

  // ── Status helpers ────────────────────────────────────────────────────────
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'normal': return 'text-green-600 bg-green-50'
      case 'low': return 'text-yellow-600 bg-yellow-50'
      case 'critical': return 'text-red-600 bg-red-50'
      case 'overstock': return 'text-blue-600 bg-blue-50'
      default: return 'text-gray-600 bg-gray-50'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'normal': return <CheckCircle size={16} />
      case 'low': return <AlertCircle size={16} />
      case 'critical': return <XCircle size={16} />
      case 'overstock': return <TrendingUp size={16} />
      default: return null
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'normal': return 'Normal'
      case 'low': return 'Stock Bajo'
      case 'critical': return 'Crítico'
      case 'overstock': return 'Sobrestock'
      default: return status
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Warehouse size={28} />
          Control de Inventario
        </h1>
        <div className="flex gap-3">
          <button
            onClick={() => downloadInventoryCsv(filteredInventory)}
            disabled={filteredInventory.length === 0}
            className="btn-outline btn-md flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={18} />
            Exportar
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
          {[
            { label: 'Total Productos', value: stats.totalProducts, Icon: Package, color: 'text-primary-600' },
            { label: 'Costo Total', value: `Q${stats.totalValue.toFixed(2)}`, Icon: BarChart3, color: 'text-green-600' },
            { label: 'Valor de Venta Total', value: `Q${stats.totalSaleValue.toFixed(2)}`, Icon: BarChart3, color: 'text-primary-600' },
            { label: 'Stock Bajo', value: stats.lowStock, Icon: TrendingDown, color: 'text-yellow-600' },
            { label: 'Sobrestock', value: stats.overstock, Icon: TrendingUp, color: 'text-blue-600' },
          ].map(({ label, value, Icon, color }, i) => (
            <motion.div key={label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }} className="bg-white rounded-lg shadow-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-600 text-sm">{label}</span>
                <Icon className={color} size={20} />
              </div>
              <p className="text-2xl font-bold text-gray-800">{value}</p>
            </motion.div>
          ))}
        </div>
      )}

      {/* Controles */}
      {!loading && (
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 relative">
              <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nombre, SKU o código..."
                className="input pl-10 w-full" />
              <Search className="absolute left-3 top-2.5 text-gray-400" size={20} />
            </div>
            <button onClick={() => setShowFilters(!showFilters)} className="btn-outline btn-md flex items-center gap-2">
              <Filter size={18} /> Filtros
              <ChevronDown size={16} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
          </div>

          <AnimatePresence>
            {showFilters && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }} className="mt-4 pt-4 border-t overflow-hidden">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">Categoría</label>
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={() => setSelectedCategory(null)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${!selectedCategory ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                        Todas
                      </button>
                      {categories.map(cat => (
                        <button key={cat} onClick={() => setSelectedCategory(cat)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${selectedCategory === cat ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">Estado</label>
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={() => setSelectedStatus(null)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${!selectedStatus ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                        Todos
                      </button>
                      {['normal', 'low', 'critical', 'overstock'].map(status => (
                        <button key={status} onClick={() => setSelectedStatus(status)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${selectedStatus === status ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                          {getStatusLabel(status)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Tabla */}
      {!loading && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">SKU / Código</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Producto</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Categoría</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-700">Stock Actual</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-700">Stock Mínimo</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-700">Estado</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-700">Precio Base</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-700">Costo Total</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-700">Valor Venta</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-700">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredInventory.map(item => (
                  <motion.tr key={`${item.productId}-${item.branchId}`}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="border-b hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4">
                      <p className="font-medium text-gray-800">{item.sku || '—'}</p>
                      <p className="text-xs text-gray-500">{item.barcode || '—'}</p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-medium text-gray-800">{item.displayName}</p>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-gray-600">{item.categoryName || '—'}</span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`font-medium ${item.status === 'critical' ? 'text-red-600' : item.status === 'low' ? 'text-yellow-600' : 'text-gray-800'}`}>
                        {item.quantity} {item.baseUnit}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center text-gray-600">
                      {item.minStock} {item.baseUnit}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(item.status)}`}>
                        {getStatusIcon(item.status)}
                        {getStatusLabel(item.status)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-gray-600">
                      Q{item.basePrice.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-gray-800">
                      Q{(item.quantity * item.cost).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-primary-700">
                      Q{(item.quantity * item.basePrice).toFixed(2)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex justify-center gap-2">
                        {canAdjustStock && (
                          <button onClick={() => handleAdjustStock(item)}
                            className="p-1.5 hover:bg-gray-100 rounded transition-colors" title="Ajustar stock">
                            <ArrowUpDown size={16} className="text-gray-600" />
                          </button>
                        )}
                        {canEditProducts && (
                          <button onClick={() => handleEditProduct(item)}
                            className="p-1.5 hover:bg-gray-100 rounded transition-colors" title="Editar producto">
                            <Edit2 size={16} className="text-gray-600" />
                          </button>
                        )}
                        <button onClick={() => handleViewHistory(item)}
                          className="p-1.5 hover:bg-gray-100 rounded transition-colors" title="Ver historial SKU">
                          <History size={16} className="text-gray-600" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
                {filteredInventory.length === 0 && (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-gray-500">
                      No se encontraron productos en inventario
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de Ajuste */}
      <AnimatePresence>
        {showAdjustmentModal && selectedItem && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={() => setShowAdjustmentModal(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-lg p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <ArrowUpDown size={24} /> Ajustar Inventario
              </h2>
              <div className="space-y-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="font-medium text-gray-800 mb-1">{selectedItem.displayName}</h3>
                  <p className="text-sm text-gray-600">SKU: {selectedItem.sku || '—'}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Stock Actual</label>
                    <div className="bg-gray-100 p-3 rounded-lg text-center">
                      <p className="text-2xl font-bold text-gray-800">{adjustment.currentStock}</p>
                      <p className="text-sm text-gray-600">{selectedItem.baseUnit}</p>
                    </div>
                  </div>
                  <div>
                    <label className="label">Nuevo Stock</label>
                    <input type="number" value={adjustment.newStock}
                      onChange={(e) => {
                        const newStock = parseInt(e.target.value) || 0
                        setAdjustment(prev => {
                          const oldDirection = prev.newStock >= prev.currentStock ? 'UP' : 'DOWN'
                          const newDirection = newStock >= prev.currentStock ? 'UP' : 'DOWN'
                          // A reason picked for one direction never applies to the
                          // other — clear it instead of letting a stale "Rotura/Daño"
                          // ride along onto what's now an increase.
                          return { ...prev, newStock, reason: oldDirection === newDirection ? prev.reason : '' }
                        })
                      }}
                      className="input text-center text-2xl font-bold" min="0" />
                  </div>
                </div>
                {adjustment.newStock !== adjustment.currentStock && (
                  <div className={`p-3 rounded-lg flex items-center gap-2 ${adjustment.newStock > adjustment.currentStock ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {adjustment.newStock > adjustment.currentStock ? <Plus size={20} /> : <Minus size={20} />}
                    <span className="font-medium">Diferencia: {Math.abs(adjustment.newStock - adjustment.currentStock)} {selectedItem.baseUnit}</span>
                  </div>
                )}
                <div>
                  <label className="label">Razón del Ajuste *</label>
                  <select value={adjustment.reason}
                    onChange={(e) => setAdjustment(prev => ({ ...prev, reason: e.target.value }))} className="input">
                    <option value="">Seleccionar razón</option>
                    {adjustmentReasonOptions.map(r => <option key={r.id} value={r.label}>{r.label}</option>)}
                  </select>
                  {adjustmentReasonOptions.length === 0 && (
                    <p className="text-xs text-gray-400 mt-1">
                      No hay motivos configurados para {adjustmentDirection === 'UP' ? 'aumentos' : 'disminuciones'} — agrégalos en Configuración → Motivos de Ajuste.
                    </p>
                  )}
                </div>
                <div>
                  <label className="label">Notas (opcional)</label>
                  <textarea value={adjustment.notes}
                    onChange={(e) => setAdjustment(prev => ({ ...prev, notes: e.target.value }))}
                    className="input" rows={2} placeholder="Detalles adicionales..." />
                </div>
                <div className="bg-yellow-50 p-3 rounded-lg flex items-start gap-2">
                  <AlertCircle size={18} className="text-yellow-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-yellow-800">Este ajuste quedará registrado en el historial con fecha y usuario.</p>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button onClick={() => setShowAdjustmentModal(false)} className="btn-outline btn-md" disabled={savingAdjustment}>Cancelar</button>
                <button onClick={saveAdjustment} className="btn-primary btn-md flex items-center gap-2" disabled={savingAdjustment}>
                  {savingAdjustment ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <CheckCircle size={18} />}
                  Confirmar Ajuste
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de Historial SKU */}
      <AnimatePresence>
        {showHistoryModal && historyItem && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={() => setShowHistoryModal(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}>

              <div className="flex items-center justify-between p-5 border-b">
                <div>
                  <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <History size={20} /> Historial de Movimientos
                  </h2>
                  <p className="text-sm text-gray-500 mt-0.5">{historyItem.displayName} · SKU: {historyItem.sku || '—'}</p>
                </div>
                <button onClick={() => setShowHistoryModal(false)} className="p-1 hover:bg-gray-100 rounded">
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5">
                {loadingHistory ? (
                  <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
                  </div>
                ) : movements.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <History size={40} className="mx-auto mb-3 opacity-30" />
                    <p>No hay movimientos registrados para este producto</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {movements.map(mv => {
                      const { label, color } = getMovementTypeLabel(mv.type, mv.reason)
                      const qty = Number(mv.quantity ?? 0)
                      return (
                        <div key={mv.id} className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50">
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full flex-shrink-0 mt-0.5 ${color}`}>{label}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800">{mv.reason || 'Sin descripción'}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {mv.performedBy?.name ?? 'Sistema'} · {format(new Date(mv.createdAt), "d MMM yyyy, HH:mm", { locale: es })}
                            </p>
                          </div>
                          <span className={`text-sm font-bold flex-shrink-0 ${qty >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {qty >= 0 ? '+' : ''}{qty}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="border-t p-4 flex justify-end">
                <button onClick={() => setShowHistoryModal(false)} className="btn-outline btn-md">Cerrar</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de Edición de Producto */}
      <ProductModal
        isOpen={showProductModal}
        onClose={() => { setShowProductModal(false); setEditingProduct(null) }}
        onSave={handleProductSave}
        editingProduct={editingProduct}
        mode="edit"
        categories={productCategories}
        units={productUnits}
        canEditPrice={canEditPrice}
      />
    </div>
  )
}
