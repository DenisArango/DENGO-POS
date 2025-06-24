import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Package, Plus, Search, Edit, Trash2, 
  Grid, List, Filter, ChevronDown,
  AlertTriangle, Copy, DollarSign, Archive
} from 'lucide-react'
import { toast } from 'sonner'
import ProductModal from '../components/products/ProductModal'

// Datos de ejemplo
const mockCategories = [
  { id: '1', name: 'Bebidas', color: '#3B82F6' },
  { id: '2', name: 'Snacks', color: '#F59E0B' },
  { id: '3', name: 'Papelería', color: '#8B5CF6' },
  { id: '4', name: 'Telas y Mercería', color: '#06B6D4' },
]

const mockProducts = [
  {
    id: '1',
    barcode: '7501234567890',
    sku: 'BEB-001',
    fullName: 'Coca Cola Original 600ml',
    brand: 'Coca Cola',
    productName: 'Original',
    attributes: { Capacidad: '600ml', Sabor: 'Original' },
    category: 'Bebidas',
    baseUnit: 'Pieza',
    basePrice: 15.00,
    cost: 10.00,
    stock: 150,
    minStock: 20,
    variations: [
      { name: 'Pieza', conversionFactor: 1, price: 15.00, isDefault: true },
      { name: 'Six Pack', conversionFactor: 6, price: 85.00, barcode: '7501234567891' },
      { name: 'Caja (24u)', conversionFactor: 24, price: 320.00, barcode: '7501234567892' },
    ]
  },
  {
    id: '2',
    barcode: '7501234567893',
    sku: 'PAP-001',
    fullName: 'Cuaderno Arimany Doble Línea 80 Hojas',
    brand: 'Arimany',
    productName: 'Cuaderno Doble Línea',
    attributes: { Hojas: '80', Tipo: 'Doble Línea' },
    category: 'Papelería',
    baseUnit: 'Pieza',
    basePrice: 25.00,
    cost: 15.00,
    stock: 75,
    minStock: 10,
    variations: [
      { name: 'Pieza', conversionFactor: 1, price: 25.00, isDefault: true },
      { name: 'Docena', conversionFactor: 12, price: 280.00, barcode: '7501234567894' },
    ]
  },
  {
    id: '3',
    barcode: '7501234567895',
    sku: 'TEL-001',
    fullName: 'Hilo Omega Azul Marino',
    brand: 'Omega',
    productName: 'Hilo',
    attributes: { Material: 'Algodón', Color: 'Azul Marino', Ancho: '2mm' },
    category: 'Telas y Mercería',
    baseUnit: 'Metro',
    basePrice: 5.00,
    cost: 3.00,
    stock: 200,
    minStock: 50,
    variations: [
      { name: 'Metro', conversionFactor: 1, price: 5.00, isDefault: true },
      { name: 'Yarda', conversionFactor: 0.9144, price: 4.50 },
      { name: 'Rollo (50m)', conversionFactor: 50, price: 220.00, barcode: '7501234567896' },
    ]
  }
]

export default function Products() {
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [showProductModal, setShowProductModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<any>(null)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'duplicate'>('create')
  const [showFilters, setShowFilters] = useState(false)

  const categories = Array.from(new Set(mockProducts.map(p => p.category)))

  const filteredProducts = mockProducts.filter(product => {
    const matchesSearch = 
      product.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.barcode.includes(searchTerm) ||
      product.sku.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = !selectedCategory || product.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  const handleCreateProduct = () => {
    setEditingProduct(null)
    setModalMode('create')
    setShowProductModal(true)
  }

  const handleEditProduct = (product: any) => {
    setEditingProduct(product)
    setModalMode('edit')
    setShowProductModal(true)
  }

  const handleDuplicateProduct = (product: any) => {
    setEditingProduct(product)
    setModalMode('duplicate')
    setShowProductModal(true)
  }

  const handleSaveProduct = (product: any) => {
    if (modalMode === 'create') {
      toast.success('Producto creado exitosamente')
    } else if (modalMode === 'edit') {
      toast.success('Producto actualizado exitosamente')
    } else {
      toast.success('Producto duplicado exitosamente')
    }
    setShowProductModal(false)
    setEditingProduct(null)
  }

  const handleDeleteProduct = (product: any) => {
    if (confirm(`¿Está seguro de eliminar el producto "${product.fullName}"?`)) {
      toast.success('Producto eliminado exitosamente')
      // TODO: Implementar eliminación real
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Package size={28} />
          Gestión de Productos
        </h1>
        <button
          onClick={handleCreateProduct}
          className="btn-primary btn-md flex items-center gap-2"
        >
          <Plus size={20} />
          Nuevo Producto
        </button>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Total Productos</span>
            <Package className="text-primary-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">{mockProducts.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Valor Inventario</span>
            <DollarSign className="text-green-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">$12,450.00</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Stock Bajo</span>
            <AlertTriangle className="text-yellow-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">5</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Sin Stock</span>
            <Archive className="text-red-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">2</p>
        </div>
      </div>

      {/* Controles */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Búsqueda */}
          <div className="flex-1 relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nombre, código o SKU..."
              className="input pl-10 w-full"
            />
            <Search className="absolute left-3 top-2.5 text-gray-400" size={20} />
          </div>

          {/* Filtros */}
          <div className="flex gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="btn-outline btn-md flex items-center gap-2"
            >
              <Filter size={18} />
              Filtros
              <ChevronDown size={16} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>

            <div className="flex border border-gray-300 rounded-lg">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 ${viewMode === 'grid' ? 'bg-primary-100 text-primary-600' : 'text-gray-600'}`}
              >
                <Grid size={20} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 ${viewMode === 'list' ? 'bg-primary-100 text-primary-600' : 'text-gray-600'}`}
              >
                <List size={20} />
              </button>
            </div>
          </div>
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
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    !selectedCategory
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Todas las categorías
                </button>
                {mockCategories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => setSelectedCategory(category.name)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                      selectedCategory === category.name
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: category.color }} />
                    {category.name}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Lista de productos */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredProducts.map((product) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-all"
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-800 text-sm line-clamp-2">
                      {product.fullName}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">SKU: {product.sku}</p>
                  </div>
                  <div className="flex gap-1">
                    <button 
                      onClick={() => handleEditProduct(product)}
                      className="p-1 hover:bg-gray-100 rounded transition-colors"
                      title="Editar producto"
                    >
                      <Edit size={16} className="text-gray-600" />
                    </button>
                    <button 
                      onClick={() => handleDuplicateProduct(product)}
                      className="p-1 hover:bg-gray-100 rounded transition-colors"
                      title="Duplicar producto"
                    >
                      <Copy size={16} className="text-gray-600" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Precio base:</span>
                    <span className="font-medium">${product.basePrice.toFixed(2)}/{product.baseUnit}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Stock:</span>
                    <span className={`font-medium ${
                      product.stock <= product.minStock ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {product.stock} {product.baseUnit}s
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Variaciones:</span>
                    <span className="font-medium">{product.variations.length}</span>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600">{product.category}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Producto</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">SKU</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Categoría</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-700">Precio Base</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-700">Stock</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-700">Variaciones</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-700">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-medium text-gray-800">{product.fullName}</p>
                        <p className="text-xs text-gray-500">{product.barcode}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{product.sku}</td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-gray-600">{product.category}</span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      ${product.basePrice.toFixed(2)}/{product.baseUnit}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className={`font-medium ${
                        product.stock <= product.minStock ? 'text-red-600' : 'text-green-600'
                      }`}>
                        {product.stock}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">{product.variations.length}</td>
                    <td className="py-3 px-4">
                      <div className="flex justify-center gap-2">
                        <button 
                          onClick={() => handleEditProduct(product)}
                          className="p-1 hover:bg-gray-100 rounded transition-colors"
                          title="Editar producto"
                        >
                          <Edit size={16} className="text-gray-600" />
                        </button>
                        <button 
                          onClick={() => handleDuplicateProduct(product)}
                          className="p-1 hover:bg-gray-100 rounded transition-colors"
                          title="Duplicar producto"
                        >
                          <Copy size={16} className="text-gray-600" />
                        </button>
                        <button 
                          onClick={() => handleDeleteProduct(product)}
                          className="p-1 hover:bg-gray-100 rounded transition-colors"
                          title="Eliminar producto"
                        >
                          <Trash2 size={16} className="text-red-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Producto */}
      <ProductModal
        isOpen={showProductModal}
        onClose={() => {
          setShowProductModal(false)
          setEditingProduct(null)
        }}
        onSave={handleSaveProduct}
        editingProduct={editingProduct}
        mode={modalMode}
      />
    </div>
  )
}