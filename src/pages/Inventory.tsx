import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Warehouse, Search, Edit2, AlertTriangle, Package,
  TrendingDown, TrendingUp, FileText, Download,
  Filter, ChevronDown, Plus, Minus, RotateCcw,
  History, CheckCircle, XCircle, AlertCircle,
  BarChart3, ArrowUpDown, Calendar, User
} from 'lucide-react'
import { toast } from 'sonner'
import ProductModal from '../components/products/ProductModal'

// Tipos locales
interface InventoryItem {
  id: string
  product: {
    id: string
    sku: string
    barcode: string
    fullName: string
    brand: string
    productName: string
    category: string
    baseUnit: string
    minStock: number
    attributes?: any
    basePrice: number
    cost: number
    variations?: any[]
  }
  branchId: string
  quantity: number
  lastRestockDate: string
  lastSaleDate: string
  status: 'normal' | 'low' | 'critical' | 'overstock'
}

interface StockAdjustment {
  productId: string
  currentStock: number
  newStock: number
  reason: string
  notes?: string
}

// Datos de ejemplo
const mockInventory: InventoryItem[] = [
  {
    id: '1',
    product: {
      id: '1',
      sku: 'BEB-001',
      barcode: '7501234567890',
      fullName: 'Coca Cola Original 600ml',
      brand: 'Coca Cola',
      productName: 'Original',
      category: 'Bebidas',
      baseUnit: 'Pieza',
      minStock: 20,
      attributes: { Capacidad: '600ml', Sabor: 'Original' },
      basePrice: 15.00,
      cost: 10.00,
      variations: [
        { name: 'Six Pack', conversionFactor: 6, price: 85.00 },
        { name: 'Caja (24u)', conversionFactor: 24, price: 320.00 },
      ]
    },
    branchId: '1',
    quantity: 15,
    lastRestockDate: '2024-01-15',
    lastSaleDate: '2024-01-20',
    status: 'low'
  },
  {
    id: '2',
    product: {
      id: '2',
      sku: 'PAP-001',
      barcode: '7501234567893',
      fullName: 'Cuaderno Arimany Doble Línea 80 Hojas',
      brand: 'Arimany',
      productName: 'Cuaderno Doble Línea',
      category: 'Papelería',
      baseUnit: 'Pieza',
      minStock: 10,
      attributes: { Hojas: '80', Tipo: 'Doble Línea' },
      basePrice: 25.00,
      cost: 15.00,
      variations: [
        { name: 'Docena', conversionFactor: 12, price: 280.00 },
      ]
    },
    branchId: '1',
    quantity: 75,
    lastRestockDate: '2024-01-10',
    lastSaleDate: '2024-01-19',
    status: 'normal'
  },
  {
    id: '3',
    product: {
      id: '3',
      sku: 'TEL-001',
      barcode: '7501234567895',
      fullName: 'Hilo Omega Azul Marino',
      brand: 'Omega',
      productName: 'Hilo',
      category: 'Telas y Mercería',
      baseUnit: 'Metro',
      minStock: 50,
      attributes: { Material: 'Algodón', Color: 'Azul Marino', Ancho: '2mm' },
      basePrice: 5.00,
      cost: 3.00,
      variations: [
        { name: 'Yarda', conversionFactor: 0.9144, price: 4.50 },
        { name: 'Rollo (50m)', conversionFactor: 50, price: 220.00 },
      ]
    },
    branchId: '1',
    quantity: 200,
    lastRestockDate: '2024-01-12',
    lastSaleDate: '2024-01-18',
    status: 'overstock'
  },
  {
    id: '4',
    product: {
      id: '4',
      sku: 'SNK-001',
      barcode: '7501234567896',
      fullName: 'Sabritas Original 45g',
      brand: 'Sabritas',
      productName: 'Original',
      category: 'Snacks',
      baseUnit: 'Pieza',
      minStock: 30,
      attributes: { Peso: '45g', Sabor: 'Original' },
      basePrice: 18.50,
      cost: 12.00,
      variations: []
    },
    branchId: '1',
    quantity: 5,
    lastRestockDate: '2024-01-08',
    lastSaleDate: '2024-01-20',
    status: 'critical'
  }
]

const adjustmentReasons = [
  'Rotura/Daño',
  'Vencimiento',
  'Error de conteo',
  'Pérdida/Robo',
  'Devolución de cliente',
  'Ajuste inicial',
  'Transferencia entre sucursales',
  'Otro'
]

export default function Inventory() {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false)
  const [showProductModal, setShowProductModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<any>(null)
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
  
  // Estado del ajuste
  const [adjustment, setAdjustment] = useState<StockAdjustment>({
    productId: '',
    currentStock: 0,
    newStock: 0,
    reason: '',
    notes: ''
  })

  const categories = ['Bebidas', 'Snacks', 'Papelería', 'Telas y Mercería']

  const filteredInventory = mockInventory.filter(item => {
    const matchesSearch = 
      item.product.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.product.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.product.barcode.includes(searchTerm)
    const matchesCategory = !selectedCategory || item.product.category === selectedCategory
    const matchesStatus = !selectedStatus || item.status === selectedStatus
    return matchesSearch && matchesCategory && matchesStatus
  })

  const stats = {
    totalProducts: mockInventory.length,
    totalValue: mockInventory.reduce((acc, item) => acc + (item.quantity * item.product.cost), 0),
    lowStock: mockInventory.filter(item => item.status === 'low' || item.status === 'critical').length,
    overstock: mockInventory.filter(item => item.status === 'overstock').length
  }

  const handleAdjustStock = (item: InventoryItem) => {
    setSelectedItem(item)
    setAdjustment({
      productId: item.product.id,
      currentStock: item.quantity,
      newStock: item.quantity,
      reason: '',
      notes: ''
    })
    setShowAdjustmentModal(true)
  }

  const handleEditProduct = (product: any) => {
    setEditingProduct(product)
    setShowProductModal(true)
  }

  const saveAdjustment = () => {
    if (!adjustment.reason) {
      toast.error('Seleccione una razón para el ajuste')
      return
    }

    if (adjustment.newStock === adjustment.currentStock) {
      toast.error('El nuevo stock debe ser diferente al actual')
      return
    }

    const difference = adjustment.newStock - adjustment.currentStock
    const action = difference > 0 ? 'incrementado' : 'reducido'
    
    toast.success(`Stock ${action} exitosamente. Diferencia: ${Math.abs(difference)} unidades`)
    setShowAdjustmentModal(false)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'normal':
        return 'text-green-600 bg-green-50'
      case 'low':
        return 'text-yellow-600 bg-yellow-50'
      case 'critical':
        return 'text-red-600 bg-red-50'
      case 'overstock':
        return 'text-blue-600 bg-blue-50'
      default:
        return 'text-gray-600 bg-gray-50'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'normal':
        return <CheckCircle size={16} />
      case 'low':
        return <AlertCircle size={16} />
      case 'critical':
        return <XCircle size={16} />
      case 'overstock':
        return <TrendingUp size={16} />
      default:
        return null
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'normal':
        return 'Normal'
      case 'low':
        return 'Stock Bajo'
      case 'critical':
        return 'Crítico'
      case 'overstock':
        return 'Sobrestock'
      default:
        return status
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
          <button className="btn-outline btn-md flex items-center gap-2">
            <History size={18} />
            Historial
          </button>
          <button className="btn-outline btn-md flex items-center gap-2">
            <Download size={18} />
            Exportar
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
            <span className="text-gray-600 text-sm">Total Productos</span>
            <Package className="text-primary-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.totalProducts}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Valor Total</span>
            <BarChart3 className="text-green-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">${stats.totalValue.toFixed(2)}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Stock Bajo</span>
            <TrendingDown className="text-yellow-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.lowStock}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Sobrestock</span>
            <TrendingUp className="text-blue-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.overstock}</p>
        </motion.div>
      </div>

      {/* Controles */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nombre, SKU o código..."
              className="input pl-10 w-full"
            />
            <Search className="absolute left-3 top-2.5 text-gray-400" size={20} />
          </div>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className="btn-outline btn-md flex items-center gap-2"
          >
            <Filter size={18} />
            Filtros
            <ChevronDown size={16} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Filtros expandibles */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-4 pt-4 border-t overflow-hidden"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Filtro por categoría */}
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">Categoría</label>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => setSelectedCategory(null)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        !selectedCategory
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Todas
                    </button>
                    {categories.map((category) => (
                      <button
                        key={category}
                        onClick={() => setSelectedCategory(category)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                          selectedCategory === category
                            ? 'bg-primary-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {category}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Filtro por estado */}
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">Estado</label>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => setSelectedStatus(null)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        !selectedStatus
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Todos
                    </button>
                    {['normal', 'low', 'critical', 'overstock'].map((status) => (
                      <button
                        key={status}
                        onClick={() => setSelectedStatus(status)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                          selectedStatus === status
                            ? 'bg-primary-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
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

      {/* Tabla de inventario */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-3 px-4 font-medium text-gray-700">SKU</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700">Producto</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700">Categoría</th>
                <th className="text-center py-3 px-4 font-medium text-gray-700">Stock Actual</th>
                <th className="text-center py-3 px-4 font-medium text-gray-700">Stock Mínimo</th>
                <th className="text-center py-3 px-4 font-medium text-gray-700">Estado</th>
                <th className="text-right py-3 px-4 font-medium text-gray-700">Valor</th>
                <th className="text-center py-3 px-4 font-medium text-gray-700">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredInventory.map((item) => (
                <motion.tr
                  key={item.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="border-b hover:bg-gray-50 transition-colors"
                >
                  <td className="py-3 px-4">
                    <p className="font-medium text-gray-800">{item.product.sku}</p>
                    <p className="text-xs text-gray-500">{item.product.barcode}</p>
                  </td>
                  <td className="py-3 px-4">
                    <p className="font-medium text-gray-800">{item.product.fullName}</p>
                    <p className="text-xs text-gray-500">
                      Última venta: {new Date(item.lastSaleDate).toLocaleDateString()}
                    </p>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-sm text-gray-600">{item.product.category}</span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`font-medium ${
                      item.status === 'critical' ? 'text-red-600' : 
                      item.status === 'low' ? 'text-yellow-600' : 'text-gray-800'
                    }`}>
                      {item.quantity} {item.product.baseUnit}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center text-gray-600">
                    {item.product.minStock} {item.product.baseUnit}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(item.status)}`}>
                      {getStatusIcon(item.status)}
                      {getStatusLabel(item.status)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-medium text-gray-800">
                    ${(item.quantity * item.product.cost).toFixed(2)}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex justify-center gap-2">
                      <button
                        onClick={() => handleAdjustStock(item)}
                        className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                        title="Ajustar inventario"
                      >
                        <ArrowUpDown size={16} className="text-gray-600" />
                      </button>
                      <button
                        onClick={() => handleEditProduct(item.product)}
                        className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                        title="Editar producto"
                      >
                        <Edit2 size={16} className="text-gray-600" />
                      </button>
                      <button
                        className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                        title="Ver historial"
                      >
                        <History size={16} className="text-gray-600" />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Ajuste de Inventario */}
      <AnimatePresence>
        {showAdjustmentModal && selectedItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={() => setShowAdjustmentModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-lg p-6 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <ArrowUpDown size={24} />
                Ajustar Inventario
              </h2>

              <div className="space-y-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="font-medium text-gray-800 mb-2">{selectedItem.product.fullName}</h3>
                  <p className="text-sm text-gray-600">SKU: {selectedItem.product.sku}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Stock Actual</label>
                    <div className="bg-gray-100 p-3 rounded-lg text-center">
                      <p className="text-2xl font-bold text-gray-800">
                        {adjustment.currentStock}
                      </p>
                      <p className="text-sm text-gray-600">{selectedItem.product.baseUnit}</p>
                    </div>
                  </div>

                  <div>
                    <label className="label">Nuevo Stock</label>
                    <input
                      type="number"
                      value={adjustment.newStock}
                      onChange={(e) => setAdjustment(prev => ({ 
                        ...prev, 
                        newStock: parseInt(e.target.value) || 0 
                      }))}
                      className="input text-center text-2xl font-bold"
                      min="0"
                    />
                  </div>
                </div>

                {adjustment.newStock !== adjustment.currentStock && (
                  <div className={`p-3 rounded-lg flex items-center gap-2 ${
                    adjustment.newStock > adjustment.currentStock 
                      ? 'bg-green-50 text-green-700' 
                      : 'bg-red-50 text-red-700'
                  }`}>
                    {adjustment.newStock > adjustment.currentStock ? (
                      <Plus size={20} />
                    ) : (
                      <Minus size={20} />
                    )}
                    <span className="font-medium">
                      Diferencia: {Math.abs(adjustment.newStock - adjustment.currentStock)} {selectedItem.product.baseUnit}
                    </span>
                  </div>
                )}

                <div>
                  <label className="label">Razón del Ajuste *</label>
                  <select
                    value={adjustment.reason}
                    onChange={(e) => setAdjustment(prev => ({ ...prev, reason: e.target.value }))}
                    className="input"
                  >
                    <option value="">Seleccionar razón</option>
                    {adjustmentReasons.map(reason => (
                      <option key={reason} value={reason}>{reason}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label">Notas (opcional)</label>
                  <textarea
                    value={adjustment.notes}
                    onChange={(e) => setAdjustment(prev => ({ ...prev, notes: e.target.value }))}
                    className="input"
                    rows={3}
                    placeholder="Detalles adicionales del ajuste..."
                  />
                </div>

                <div className="bg-yellow-50 p-3 rounded-lg flex items-start gap-2">
                  <AlertCircle size={20} className="text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-yellow-800">
                    <p className="font-medium mb-1">Importante:</p>
                    <p>Este ajuste quedará registrado en el historial con su nombre de usuario y la fecha/hora actual.</p>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setShowAdjustmentModal(false)}
                  className="btn-outline btn-md"
                >
                  Cancelar
                </button>
                <button
                  onClick={saveAdjustment}
                  className="btn-primary btn-md flex items-center gap-2"
                >
                  <CheckCircle size={18} />
                  Confirmar Ajuste
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de Producto */}
      <ProductModal
        isOpen={showProductModal}
        onClose={() => {
          setShowProductModal(false)
          setEditingProduct(null)
        }}
        onSave={(product) => {
          console.log('Producto guardado:', product)
          toast.success('Producto actualizado exitosamente')
          setShowProductModal(false)
          setEditingProduct(null)
        }}
        editingProduct={editingProduct}
        mode="edit"
      />
    </div>
  )
}