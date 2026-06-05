import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Package, Plus, Search, Edit, Trash2,
  Grid, List, Filter, ChevronDown,
  AlertTriangle, Copy, DollarSign, Archive
} from 'lucide-react'
import { toast } from 'sonner'
import ProductModal from '../components/products/ProductModal'
import { api } from '../lib/api'

interface Category {
  id: string
  name: string
  color?: string
}

interface ProductVariation {
  id?: string
  name: string
  conversionFactor: number
  price: number
  isDefault?: boolean
  barcode?: string
}

interface Product {
  id: string
  barcode: string
  sku?: string
  name?: string
  fullName?: string
  brand?: string
  productName?: string
  category?: Category | string
  categoryId?: string
  baseUnit?: string
  baseUnitId?: string
  basePrice: number
  cost?: number
  stock?: number
  minStock?: number
  isActive?: boolean
  variations: ProductVariation[]
  attributes?: Record<string, string>
}

export default function Products() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [units, setUnits] = useState<{ id: string; name: string; abbreviation: string; type: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [showProductModal, setShowProductModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<any>(null)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'duplicate'>('create')
  const [showFilters, setShowFilters] = useState(false)

  const fetchProducts = () => {
    setLoading(true)
    Promise.all([
      api.get<Product[]>('/api/products'),
      api.get<Category[]>('/api/categories'),
      api.get<{ id: string; name: string; abbreviation: string; type: string }[]>('/api/units'),
    ])
      .then(([prods, cats, unitList]) => {
        // Normalise backend shape → UI shape
        const normalised = prods.map(p => ({
          ...p,
          fullName: p.fullName ?? p.name ?? '',
          category: typeof p.category === 'object' ? (p.category as Category)?.name ?? '' : p.category ?? '',
          categoryId: typeof p.category === 'object' ? (p.category as Category)?.id : (p as any).categoryId,
          sku: p.sku ?? '',
          baseUnit: typeof p.baseUnit === 'object' ? (p.baseUnit as { name?: string })?.name ?? 'u' : p.baseUnit ?? 'u',
          baseUnitId: typeof p.baseUnit === 'object' ? (p.baseUnit as { id?: string })?.id : (p as any).baseUnitId,
          basePrice: Number(p.basePrice ?? 0),
          cost: Number(p.cost ?? 0),
          minStock: Number(p.minStock ?? 0),
          stock: Number(p.stock ?? 0),
          variations: (p.variations ?? []).map((v: ProductVariation) => ({
            ...v,
            price: Number(v.price ?? 0),
            conversionFactor: Number(v.conversionFactor ?? 1),
          })),
        }))
        setProducts(normalised)
        setCategories(cats)
        setUnits(unitList)
      })
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchProducts() }, [])

  const filteredProducts = products.filter(product => {
    const name = product.fullName ?? product.name ?? ''
    const matchesSearch =
      name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (product.barcode ?? '').includes(searchTerm) ||
      (product.sku ?? '').toLowerCase().includes(searchTerm.toLowerCase())
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
    const isEdit = modalMode === 'edit' && editingProduct?.id
    const isDuplicate = modalMode === 'duplicate'

    const resolvedCategoryId =
      product.categoryId ??
      (typeof product.category === 'object' ? (product.category as Category)?.id : undefined) ??
      categories.find(c => c.name === product.category)?.id

    const resolvedBaseUnitId =
      product.baseUnitId ??
      units.find(u => u.name === product.baseUnit || u.abbreviation === product.baseUnit)?.id

    const payload = {
      name: product.fullName ?? product.name,
      barcode: product.barcode,
      sku: product.sku,
      brand: product.brand,
      basePrice: product.basePrice,
      cost: product.cost,
      minStock: product.minStock,
      categoryId: resolvedCategoryId,
      baseUnitId: resolvedBaseUnitId,
      variations: product.variations,
      isActive: product.isActive !== false,
    }

    if (isEdit) {
      api.put(`/api/products/${editingProduct.id}`, payload)
        .then(() => {
          toast.success('Producto actualizado exitosamente')
          setShowProductModal(false)
          setEditingProduct(null)
          fetchProducts()
        })
        .catch(e => toast.error(e.message))
    } else {
      api.post('/api/products', payload)
        .then(() => {
          toast.success(isDuplicate ? 'Producto duplicado exitosamente' : 'Producto creado exitosamente')
          setShowProductModal(false)
          setEditingProduct(null)
          fetchProducts()
        })
        .catch(e => toast.error(e.message))
    }
  }

  const handleDeleteProduct = (product: any) => {
    if (confirm(`¿Está seguro de eliminar el producto "${product.fullName ?? product.name}"?`)) {
      api.delete(`/api/products/${product.id}`)
        .then(() => {
          toast.success('Producto eliminado exitosamente')
          fetchProducts()
        })
        .catch(e => toast.error(e.message))
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

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
          <p className="text-2xl font-bold text-gray-800">{products.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Valor Inventario</span>
            <DollarSign className="text-green-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">
            ${products.reduce((sum, p) => sum + (p.basePrice * (p.stock ?? 0)), 0).toFixed(2)}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Stock Bajo</span>
            <AlertTriangle className="text-yellow-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">
            {products.filter(p => (p.stock ?? 0) > 0 && (p.stock ?? 0) <= (p.minStock ?? 0)).length}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Sin Stock</span>
            <Archive className="text-red-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">
            {products.filter(p => (p.stock ?? 0) === 0).length}
          </p>
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
                {categories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => setSelectedCategory(category.name)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                      selectedCategory === category.name
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {category.color && (
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: category.color }} />
                    )}
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
                      {product.fullName ?? product.name}
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
                      (product.stock ?? 0) <= (product.minStock ?? 0) ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {product.stock ?? 0} {product.baseUnit}s
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Variaciones:</span>
                    <span className="font-medium">{product.variations.length}</span>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600">{product.category as string}</span>
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
                        <p className="font-medium text-gray-800">{product.fullName ?? product.name}</p>
                        <p className="text-xs text-gray-500">{product.barcode}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{product.sku}</td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-gray-600">{product.category as string}</span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      ${product.basePrice.toFixed(2)}/{product.baseUnit}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className={`font-medium ${
                        (product.stock ?? 0) <= (product.minStock ?? 0) ? 'text-red-600' : 'text-green-600'
                      }`}>
                        {product.stock ?? 0}
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
        categories={categories}
        units={units}
      />
    </div>
  )
}
