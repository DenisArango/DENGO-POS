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
import { usePermissions } from '../hooks/usePermissions'
import { useAuthStore } from '../store'

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
  const { hasPermission } = usePermissions()
  const isAdmin = useAuthStore(s => s.user?.role === 'ADMIN')
  const canCreate = hasPermission('inventory.create')
  const canEdit = hasPermission('inventory.edit')
  const canDelete = hasPermission('inventory.delete')
  const canEditPrice = hasPermission('inventory.editPrice')
  const canViewMoneyTotals = hasPermission('settings.system')
  const PAGE_SIZE = 50
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [units, setUnits] = useState<{ id: string; name: string; abbreviation: string; type: string }[]>([])
  const [loading, setLoading] = useState(true)
  // See Customers.tsx for why this exists — only the first load blocks with
  // a full-page spinner; later fetches (search/pagination/filters) must not
  // unmount the search input or it loses focus mid-type.
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [showProductModal, setShowProductModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<any>(null)
  // Bulk category reassignment — select several products (list view) and
  // move them all to one category at once, instead of opening each one.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkCategoryId, setBulkCategoryId] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'duplicate'>('create')
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [stats, setStats] = useState({ total: 0, lowStock: 0, outOfStock: 0, totalValue: 0 })

  // Búsqueda con pequeño retraso para no disparar una llamada al backend en
  // cada tecla — vuelve a la página 1 cada vez que cambia lo que se busca.
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(searchTerm); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [searchTerm])

  useEffect(() => { setPage(1) }, [selectedCategory])

  const fetchProducts = () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) })
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (selectedCategory) params.set('categoryId', selectedCategory)
    Promise.all([
      api.get<{ data: Product[]; total: number; stats: { total: number; lowStock: number; outOfStock: number; totalValue: number } }>(`/api/products?${params}`),
      api.get<Category[]>('/api/categories'),
      api.get<{ id: string; name: string; abbreviation: string; type: string }[]>('/api/units'),
    ])
      .then(([res, cats, unitList]) => {
        // Normalise backend shape → UI shape
        const normalised = res.data.map(p => ({
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
        setTotalCount(res.total)
        setStats(res.stats)
        setCategories(cats)
        setUnits(unitList)
      })
      .catch(e => toast.error(e.message))
      .finally(() => { setLoading(false); setHasLoadedOnce(true) })
  }

  useEffect(() => { fetchProducts() }, [page, debouncedSearch, selectedCategory])

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

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
      imageUrl: product.imageUrl,
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

  const handleDeleteProduct = async (product: any) => {
    const name = product.fullName ?? product.name
    if (!confirm(`¿Está seguro de eliminar el producto "${name}"? Se desactivará y ya no aparecerá en ventas ni búsquedas.`)) return

    // Deleting only deactivates the product — it never touches Inventory on
    // its own, so stock stays sitting there (correct for audit history, but
    // easy to forget about). If this product actually has stock somewhere,
    // ask explicitly whether to also zero it out everywhere, rather than
    // silently leaving it or silently clearing it.
    let clearInventory = false
    try {
      const stockByBranch = await api.get<{ branchName: string; quantity: number }[]>(`/api/inventory/${product.id}/all-branches`)
      const withStock = (stockByBranch ?? []).filter(b => b.quantity > 0)
      if (withStock.length > 0) {
        const total = withStock.reduce((s, b) => s + b.quantity, 0)
        const detail = withStock.map(b => `${b.branchName}: ${b.quantity}`).join(', ')
        clearInventory = confirm(
          `Este producto tiene ${total} unidades en inventario (${detail}).\n\n` +
          `¿También quieres poner el inventario en 0 en todas las sucursales?\n\n` +
          `Aceptar = sí, poner en 0. Cancelar = dejar el inventario como está (solo referencia, ya no se podrá vender).`
        )
      }
    } catch {
      // Couldn't check stock — proceed with a plain deactivation rather than blocking the delete entirely.
    }

    api.delete(`/api/products/${product.id}${clearInventory ? '?clearInventory=true' : ''}`)
      .then(() => {
        toast.success('Producto eliminado exitosamente')
        fetchProducts()
      })
      .catch(e => toast.error(e.message))
  }

  function toggleSelected(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelectedIds(prev => prev.size === products.length ? new Set() : new Set(products.map(p => p.id)))
  }

  async function handleBulkReassign() {
    if (!bulkCategoryId || selectedIds.size === 0) return
    setBulkSaving(true)
    try {
      const res = await api.put<{ count: number }>('/api/products/bulk-category', {
        productIds: Array.from(selectedIds),
        categoryId: bulkCategoryId,
      })
      toast.success(`${res.count} producto(s) reasignado(s)`)
      setSelectedIds(new Set())
      setBulkCategoryId('')
      fetchProducts()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al reasignar categoría')
    } finally {
      setBulkSaving(false)
    }
  }

  async function handleCreateCategoryInline() {
    if (!newCategoryName.trim()) return
    setCreatingCategory(true)
    try {
      const created = await api.post<Category>('/api/categories', { name: newCategoryName.trim() })
      setCategories(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      setBulkCategoryId(created.id)
      setShowNewCategoryInput(false)
      setNewCategoryName('')
      toast.success('Categoría creada')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al crear categoría')
    } finally {
      setCreatingCategory(false)
    }
  }

  if (loading && !hasLoadedOnce) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className={`space-y-6 transition-opacity ${loading ? 'opacity-60' : ''}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Package size={28} />
          Gestión de Productos
        </h1>
        {canCreate && (
          <button
            onClick={handleCreateProduct}
            className="btn-primary btn-md flex items-center gap-2"
          >
            <Plus size={20} />
            Nuevo Producto
          </button>
        )}
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Total Productos</span>
            <Package className="text-primary-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
        </div>
        {canViewMoneyTotals && (
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600 text-sm">Valor Inventario</span>
              <DollarSign className="text-green-600" size={20} />
            </div>
            <p className="text-2xl font-bold text-gray-800">
              Q{stats.totalValue.toFixed(2)}
            </p>
          </div>
        )}
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Stock Bajo</span>
            <AlertTriangle className="text-yellow-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">
            {stats.lowStock}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Sin Stock</span>
            <Archive className="text-red-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">
            {stats.outOfStock}
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
                    onClick={() => setSelectedCategory(category.id)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                      selectedCategory === category.id
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

      {/* Barra de reasignación masiva de categoría — solo aplica a la vista de lista, donde hay checkboxes por fila */}
      {canEdit && viewMode === 'list' && selectedIds.size > 0 && (
        <div className="bg-primary-50 border border-primary-200 rounded-lg p-3 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-primary-800">{selectedIds.size} producto(s) seleccionado(s)</span>
          {showNewCategoryInput ? (
            <>
              <input
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateCategoryInline()}
                placeholder="Nombre de la nueva categoría"
                className="input text-sm py-1.5"
                autoFocus
              />
              <button onClick={handleCreateCategoryInline} disabled={!newCategoryName.trim() || creatingCategory} className="btn-primary btn-sm disabled:opacity-50">
                {creatingCategory ? 'Creando...' : 'Crear'}
              </button>
              <button onClick={() => { setShowNewCategoryInput(false); setNewCategoryName('') }} className="text-sm text-gray-500 hover:text-gray-700">Cancelar</button>
            </>
          ) : (
            <>
              <select
                value={bulkCategoryId}
                onChange={e => e.target.value === '__new__' ? setShowNewCategoryInput(true) : setBulkCategoryId(e.target.value)}
                className="input text-sm py-1.5"
              >
                <option value="">Reasignar a categoría...</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                {isAdmin && <option value="__new__">+ Crear nueva categoría...</option>}
              </select>
              <button onClick={handleBulkReassign} disabled={!bulkCategoryId || bulkSaving} className="btn-primary btn-sm disabled:opacity-50">
                {bulkSaving ? 'Reasignando...' : 'Reasignar'}
              </button>
              <button onClick={() => setSelectedIds(new Set())} className="text-sm text-gray-500 hover:text-gray-700">Cancelar selección</button>
            </>
          )}
        </div>
      )}

      {/* Lista de productos */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {products.map((product) => (
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
                    {canEdit && (
                      <button
                        onClick={() => handleEditProduct(product)}
                        className="p-1 hover:bg-gray-100 rounded transition-colors"
                        title="Editar producto"
                      >
                        <Edit size={16} className="text-gray-600" />
                      </button>
                    )}
                    {canCreate && (
                      <button
                        onClick={() => handleDuplicateProduct(product)}
                        className="p-1 hover:bg-gray-100 rounded transition-colors"
                        title="Duplicar producto"
                      >
                        <Copy size={16} className="text-gray-600" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Precio base:</span>
                    <span className="font-medium">Q{product.basePrice.toFixed(2)}/{product.baseUnit}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Stock:</span>
                    <span className={`font-medium ${
                      (product.stock ?? 0) <= (product.minStock ?? 0) ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {product.stock ?? 0} {product.baseUnit}
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
                  {canEdit && (
                    <th className="w-10 py-3 px-4">
                      <input type="checkbox" checked={selectedIds.size > 0 && selectedIds.size === products.length}
                        onChange={toggleSelectAll} className="rounded border-gray-300" />
                    </th>
                  )}
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
                {products.map((product) => (
                  <tr key={product.id} className={`border-b hover:bg-gray-50 ${selectedIds.has(product.id) ? 'bg-primary-50/40' : ''}`}>
                    {canEdit && (
                      <td className="py-3 px-4">
                        <input type="checkbox" checked={selectedIds.has(product.id)}
                          onChange={() => toggleSelected(product.id)} className="rounded border-gray-300" />
                      </td>
                    )}
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
                      Q{product.basePrice.toFixed(2)}/{product.baseUnit}
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
                        {canEdit && (
                          <button
                            onClick={() => handleEditProduct(product)}
                            className="p-1 hover:bg-gray-100 rounded transition-colors"
                            title="Editar producto"
                          >
                            <Edit size={16} className="text-gray-600" />
                          </button>
                        )}
                        {canCreate && (
                          <button
                            onClick={() => handleDuplicateProduct(product)}
                            className="p-1 hover:bg-gray-100 rounded transition-colors"
                            title="Duplicar producto"
                          >
                            <Copy size={16} className="text-gray-600" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => handleDeleteProduct(product)}
                            className="p-1 hover:bg-gray-100 rounded transition-colors"
                            title="Eliminar producto"
                          >
                            <Trash2 size={16} className="text-red-600" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && products.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            {debouncedSearch || selectedCategory ? 'No se encontraron productos' : 'No hay productos registrados'}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 mt-4 border-t">
            <p className="text-sm text-gray-600">
              Página {page} de {totalPages} · {totalCount} productos
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="btn-outline btn-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="btn-outline btn-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Siguiente
              </button>
            </div>
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
        canEditPrice={canEditPrice}
      />
    </div>
  )
}
