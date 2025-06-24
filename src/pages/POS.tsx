import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Search, ShoppingCart, Trash2, Plus, Minus, CreditCard, 
  DollarSign, Printer, TrendingUp, UserPlus, X, Calendar,
  AlertCircle, User, Barcode
} from 'lucide-react'
import { useCartStore } from '../store'
import { toast } from 'sonner'
import type { Product, Customer } from '../types'

// Productos de ejemplo con datos de ventas
const mockProducts = [
  { id: '1', barcode: '7501234567890', name: 'Coca Cola 600ml', price: 15.00, salesCount: 150, imageUrl: '', category: { id: '1', name: 'Bebidas' }, cost: 10, unit: 'UNIDAD', minStock: 10, isActive: true, createdAt: '', updatedAt: '' },
  { id: '2', barcode: '7501234567891', name: 'Pepsi 600ml', price: 14.00, salesCount: 120, imageUrl: '', category: { id: '1', name: 'Bebidas' }, cost: 9, unit: 'UNIDAD', minStock: 10, isActive: true, createdAt: '', updatedAt: '' },
  { id: '3', barcode: '7501234567892', name: 'Sabritas Original', price: 18.50, salesCount: 200, imageUrl: '', category: { id: '2', name: 'Snacks' }, cost: 12, unit: 'UNIDAD', minStock: 10, isActive: true, createdAt: '', updatedAt: '' },
  { id: '4', barcode: '7501234567893', name: 'Doritos Nacho', price: 19.00, salesCount: 180, imageUrl: '', category: { id: '2', name: 'Snacks' }, cost: 13, unit: 'UNIDAD', minStock: 10, isActive: true, createdAt: '', updatedAt: '' },
  { id: '5', barcode: '7501234567894', name: 'Galletas Oreo', price: 16.50, salesCount: 90, imageUrl: '', category: { id: '3', name: 'Galletas' }, cost: 11, unit: 'UNIDAD', minStock: 10, isActive: true, createdAt: '', updatedAt: '' },
  { id: '6', barcode: '7501234567895', name: 'Chocolate Snickers', price: 22.00, salesCount: 110, imageUrl: '', category: { id: '4', name: 'Dulces' }, cost: 15, unit: 'UNIDAD', minStock: 10, isActive: true, createdAt: '', updatedAt: '' },
  { id: '7', barcode: '7501234567896', name: 'Agua Ciel 1L', price: 10.00, salesCount: 250, imageUrl: '', category: { id: '1', name: 'Bebidas' }, cost: 6, unit: 'UNIDAD', minStock: 10, isActive: true, createdAt: '', updatedAt: '' },
  { id: '8', barcode: '7501234567897', name: 'Papas Ruffles', price: 20.00, salesCount: 140, imageUrl: '', category: { id: '2', name: 'Snacks' }, cost: 14, unit: 'UNIDAD', minStock: 10, isActive: true, createdAt: '', updatedAt: '' },
  { id: '9', barcode: '7501234567898', name: 'Chicles Trident', price: 12.00, salesCount: 300, imageUrl: '', category: { id: '4', name: 'Dulces' }, cost: 8, unit: 'UNIDAD', minStock: 10, isActive: true, createdAt: '', updatedAt: '' },
  { id: '10', barcode: '7501234567899', name: 'Cacahuates Japoneses', price: 15.00, salesCount: 170, imageUrl: '', category: { id: '2', name: 'Snacks' }, cost: 10, unit: 'UNIDAD', minStock: 10, isActive: true, createdAt: '', updatedAt: '' },
  { id: '11', barcode: '7501234567900', name: 'Red Bull', price: 35.00, salesCount: 80, imageUrl: '', category: { id: '1', name: 'Bebidas' }, cost: 25, unit: 'UNIDAD', minStock: 10, isActive: true, createdAt: '', updatedAt: '' },
] as Product[]

// Clientes de ejemplo
const mockCustomers: Customer[] = [
  { id: '1', nit: '12345678-9', name: 'Juan Pérez', email: 'juan@email.com', phone: '5555-1234', creditLimit: 5000, creditUsed: 1200, creditAvailable: 3800 },
  { id: '2', nit: '98765432-1', name: 'María García', email: 'maria@email.com', phone: '5555-5678', creditLimit: 3000, creditUsed: 0, creditAvailable: 3000 },
  { id: '3', nit: 'CF', name: 'Consumidor Final', creditLimit: 0, creditUsed: 0, creditAvailable: 0 },
]

export default function POS() {
  const [searchTerm, setSearchTerm] = useState('')
  const [barcodeSearch, setBarcodeSearch] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  
  const { 
    items, 
    selectedCustomer, 
    saleType,
    addItem, 
    removeItem, 
    updateQuantity, 
    clearCart, 
    setCustomer,
    setSaleType,
    getTotal, 
    getItemCount 
  } = useCartStore()

  // Obtener top 10 productos más vendidos
  const topProducts = [...mockProducts]
    .sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0))
    .slice(0, 10)

  const categories = Array.from(new Set(mockProducts.map(p => p.category.name)))

  const filteredProducts = searchTerm || barcodeSearch
    ? mockProducts.filter(product => {
        const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                             product.barcode.includes(barcodeSearch)
        const matchesCategory = !selectedCategory || product.category.name === selectedCategory
        return matchesSearch && matchesCategory
      })
    : topProducts // Mostrar top 10 si no hay búsqueda

  const filteredCustomers = mockCustomers.filter(customer =>
    customer.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    customer.nit.includes(customerSearch)
  )

  const handleAddToCart = (product: Product) => {
    addItem({ product, quantity: 1 })
    toast.success(`${product.name} agregado al carrito`)
  }

  const handleBarcodeScan = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && barcodeSearch) {
      const product = mockProducts.find(p => p.barcode === barcodeSearch)
      if (product) {
        handleAddToCart(product)
        setBarcodeSearch('')
      } else {
        toast.error('Producto no encontrado')
      }
    }
  }

  const handleSelectCustomer = (customer: Customer) => {
    setCustomer(customer)
    setShowCustomerModal(false)
    setCustomerSearch('')
    
    // Si el cliente no tiene crédito disponible, mantener venta al contado
    if (!customer.creditAvailable || customer.creditAvailable <= 0) {
      setSaleType('CASH')
      toast.warning('Cliente sin crédito disponible. Venta al contado.')
    }
  }

  const handleCheckout = () => {
    if (items.length === 0) {
      toast.error('El carrito está vacío')
      return
    }

    if (saleType === 'CREDIT' && !selectedCustomer) {
      toast.error('Debe seleccionar un cliente para ventas al crédito')
      return
    }

    if (saleType === 'CREDIT' && selectedCustomer) {
      const total = getTotal()
      if (total > (selectedCustomer.creditAvailable || 0)) {
        toast.error('El cliente no tiene suficiente crédito disponible')
        return
      }
    }

    // TODO: Implementar proceso de pago
    toast.success(`Procesando venta ${saleType === 'CREDIT' ? 'al crédito' : 'al contado'}...`)
  }

  const canSellOnCredit = selectedCustomer && 
    selectedCustomer.id !== '3' && // No es consumidor final
    (selectedCustomer.creditAvailable || 0) > 0

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-8rem)]">
      {/* Productos */}
      <div className="lg:col-span-2 bg-white rounded-lg shadow-sm p-6 overflow-hidden flex flex-col">
        {/* Búsqueda y filtros */}
        <div className="mb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Búsqueda por código de barras */}
            <div className="relative">
              <input
                type="text"
                value={barcodeSearch}
                onChange={(e) => setBarcodeSearch(e.target.value)}
                onKeyDown={handleBarcodeScan}
                placeholder="Escanear código de barras..."
                className="input pl-10 w-full"
                autoFocus
              />
              <Barcode className="absolute left-3 top-2.5 text-gray-400" size={20} />
            </div>

            {/* Búsqueda por nombre */}
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nombre..."
                className="input pl-10 w-full"
              />
              <Search className="absolute left-3 top-2.5 text-gray-400" size={20} />
            </div>
          </div>

          {/* Indicador de productos más vendidos */}
          {!searchTerm && !barcodeSearch && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <TrendingUp size={16} className="text-green-600" />
              <span>Mostrando los 10 productos más vendidos</span>
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                !selectedCategory
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Todos
            </button>
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
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

        {/* Grid de productos */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredProducts.map((product) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ scale: 1.02 }}
                className="bg-gray-50 rounded-lg p-4 cursor-pointer hover:shadow-md transition-all relative"
                onClick={() => handleAddToCart(product)}
              >
                {product.salesCount && product.salesCount > 100 && (
                  <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                    <TrendingUp size={12} />
                    Top
                  </div>
                )}
                <div className="w-full h-24 bg-gray-200 rounded-lg mb-3 flex items-center justify-center">
                  <ShoppingCart className="text-gray-400" size={32} />
                </div>
                <h3 className="font-medium text-sm text-gray-800 mb-1 line-clamp-2">
                  {product.name}
                </h3>
                <p className="text-xs text-gray-500 mb-2">{product.barcode}</p>
                <p className="text-lg font-bold text-primary-600">
                  ${product.price.toFixed(2)}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Carrito */}
      <div className="bg-white rounded-lg shadow-sm p-6 flex flex-col">
        {/* Cliente y tipo de venta */}
        <div className="mb-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700">Cliente:</h3>
            <button
              onClick={() => setShowCustomerModal(true)}
              className="flex items-center gap-2 text-primary-600 hover:text-primary-700 text-sm"
            >
              <UserPlus size={16} />
              {selectedCustomer ? 'Cambiar' : 'Seleccionar'}
            </button>
          </div>
          
          {selectedCustomer ? (
            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-sm">{selectedCustomer.name}</span>
                <button
                  onClick={() => setCustomer(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={16} />
                </button>
              </div>
              <p className="text-xs text-gray-600">NIT: {selectedCustomer.nit}</p>
              {selectedCustomer.creditLimit && selectedCustomer.creditLimit > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-600">Crédito disponible:</span>
                    <span className="font-medium text-green-600">
                      ${selectedCustomer.creditAvailable?.toFixed(2)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div 
                      className="bg-green-500 h-1.5 rounded-full"
                      style={{ 
                        width: `${((selectedCustomer.creditAvailable || 0) / selectedCustomer.creditLimit) * 100}%` 
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-yellow-50 p-3 rounded-lg flex items-center gap-2">
              <AlertCircle size={16} className="text-yellow-600" />
              <span className="text-xs text-yellow-800">Venta a Consumidor Final</span>
            </div>
          )}

          {/* Tipo de venta */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setSaleType('CASH')}
              className={`py-2 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                saleType === 'CASH'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <DollarSign size={16} />
              Contado
            </button>
            <button
              onClick={() => canSellOnCredit && setSaleType('CREDIT')}
              disabled={!canSellOnCredit}
              className={`py-2 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                saleType === 'CREDIT'
                  ? 'bg-blue-600 text-white'
                  : canSellOnCredit
                    ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    : 'bg-gray-50 text-gray-400 cursor-not-allowed'
              }`}
            >
              <Calendar size={16} />
              Crédito
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-800 flex items-center">
            <ShoppingCart className="mr-2" size={24} />
            Carrito ({getItemCount()})
          </h2>
          {items.length > 0 && (
            <button
              onClick={clearCart}
              className="text-secondary-600 hover:text-secondary-700 transition-colors"
            >
              <Trash2 size={20} />
            </button>
          )}
        </div>

        {/* Items del carrito */}
        <div className="flex-1 overflow-y-auto mb-6">
          {items.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <ShoppingCart size={48} className="mx-auto mb-4" />
              <p>Carrito vacío</p>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <motion.div
                  key={item.product.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex-1">
                    <h4 className="font-medium text-sm text-gray-800">
                      {item.product.name}
                    </h4>
                    <p className="text-sm text-gray-500">
                      ${item.product.price.toFixed(2)} c/u
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateQuantity(item.product.id, Math.max(1, item.quantity - 1))}
                      className="p-1 hover:bg-gray-200 rounded transition-colors"
                    >
                      <Minus size={16} />
                    </button>
                    <span className="w-8 text-center font-medium">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                      className="p-1 hover:bg-gray-200 rounded transition-colors"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <p className="font-medium text-gray-800 w-20 text-right">
                    ${(item.product.price * item.quantity).toFixed(2)}
                  </p>
                  <button
                    onClick={() => removeItem(item.product.id)}
                    className="text-secondary-600 hover:text-secondary-700 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Total y acciones */}
        <div className="border-t pt-4 space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-lg font-medium text-gray-700">Total:</span>
            <span className="text-2xl font-bold text-primary-600">
              ${getTotal().toFixed(2)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button className="btn-outline btn-md flex items-center justify-center">
              <Printer size={18} className="mr-2" />
              Imprimir
            </button>
            <button 
              onClick={handleCheckout}
              className={`btn-md flex items-center justify-center ${
                saleType === 'CREDIT' 
                  ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                  : 'btn-primary'
              }`}
            >
              <CreditCard size={18} className="mr-2" />
              {saleType === 'CREDIT' ? 'Vender a Crédito' : 'Cobrar'}
            </button>
          </div>
        </div>
      </div>

      {/* Modal de selección de cliente */}
      <AnimatePresence>
        {showCustomerModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={() => setShowCustomerModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-lg p-6 max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <User size={20} />
                  Seleccionar Cliente
                </h3>
                <button
                  onClick={() => setShowCustomerModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="relative mb-4">
                <input
                  type="text"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Buscar por nombre o NIT..."
                  className="input pl-10 w-full"
                />
                <Search className="absolute left-3 top-2.5 text-gray-400" size={20} />
              </div>

              <div className="flex-1 overflow-y-auto space-y-2">
                {filteredCustomers.map((customer) => (
                  <button
                    key={customer.id}
                    onClick={() => handleSelectCustomer(customer)}
                    className="w-full p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors text-left"
                  >
                    <div className="flex justify-between items-start mb-1">
                      <h4 className="font-medium text-gray-800">{customer.name}</h4>
                      {customer.id === '3' && (
                        <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded">
                          Predeterminado
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mb-1">NIT: {customer.nit}</p>
                    {customer.creditLimit && customer.creditLimit > 0 && (
                      <div className="mt-2">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-600">Crédito disponible:</span>
                          <span className={`font-medium ${
                            (customer.creditAvailable || 0) > 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            ${customer.creditAvailable?.toFixed(2)} / ${customer.creditLimit.toFixed(2)}
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div 
                            className={`h-1.5 rounded-full ${
                              (customer.creditAvailable || 0) > 0 ? 'bg-green-500' : 'bg-red-500'
                            }`}
                            style={{ 
                              width: `${((customer.creditAvailable || 0) / customer.creditLimit) * 100}%` 
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </button>
                ))}
              </div>

              <div className="mt-4 pt-4 border-t">
                <button
                  onClick={() => setShowCustomerModal(false)}
                  className="btn-outline btn-md w-full"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}