import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Package, X, Save, Upload, Tag, DollarSign, 
  Barcode, Ruler, Plus, Trash2, CheckCircle
} from 'lucide-react'
import { toast } from 'sonner'

interface ProductModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (product: any) => void
  editingProduct?: any
  mode?: 'create' | 'edit' | 'duplicate'
}

interface ProductFormData {
  barcode: string
  sku: string
  brand: string
  productName: string
  attributes: { name: string; value: string }[]
  category: string
  baseUnit: string
  basePrice: number
  cost: number
  minStock: number
  variations: {
    name: string
    barcode: string
    conversionFactor: number
    price: number
    isDefault: boolean
  }[]
}

// Datos de ejemplo - en producción vendrían de la API
const mockUnits = [
  { id: '1', name: 'Pieza', abbreviation: 'pza', type: 'DISCRETE' },
  { id: '2', name: 'Caja', abbreviation: 'cja', type: 'DISCRETE' },
  { id: '3', name: 'Docena', abbreviation: 'doc', type: 'DISCRETE' },
  { id: '4', name: 'Mililitro', abbreviation: 'ml', type: 'CONTINUOUS' },
  { id: '5', name: 'Litro', abbreviation: 'L', type: 'CONTINUOUS' },
  { id: '6', name: 'Metro', abbreviation: 'm', type: 'CONTINUOUS' },
  { id: '7', name: 'Yarda', abbreviation: 'yd', type: 'CONTINUOUS' },
]

const mockCategories = [
  { id: '1', name: 'Bebidas', color: '#3B82F6' },
  { id: '2', name: 'Snacks', color: '#F59E0B' },
  { id: '3', name: 'Papelería', color: '#8B5CF6' },
  { id: '4', name: 'Telas y Mercería', color: '#06B6D4' },
]

const productTemplates: { [key: string]: string[] } = {
  'Bebidas': ['Capacidad', 'Sabor'],
  'Snacks': ['Peso', 'Sabor'],
  'Papelería': ['Hojas', 'Tipo'],
  'Telas y Mercería': ['Material', 'Color', 'Ancho'],
}

export default function ProductModal({ 
  isOpen, 
  onClose, 
  onSave, 
  editingProduct, 
  mode = 'create' 
}: ProductModalProps) {
  const [formData, setFormData] = useState<ProductFormData>({
    barcode: '',
    sku: '',
    brand: '',
    productName: '',
    attributes: [],
    category: '',
    baseUnit: '',
    basePrice: 0,
    cost: 0,
    minStock: 10,
    variations: []
  })
  const [productImage, setProductImage] = useState<string | null>(null)

  useEffect(() => {
    if (editingProduct && (mode === 'edit' || mode === 'duplicate')) {
      setFormData({
        barcode: mode === 'duplicate' ? '' : editingProduct.barcode,
        sku: mode === 'duplicate' ? '' : editingProduct.sku,
        brand: editingProduct.brand,
        productName: mode === 'duplicate' ? editingProduct.productName + ' (Copia)' : editingProduct.productName,
        attributes: Object.entries(editingProduct.attributes || {}).map(([name, value]) => ({ 
          name, 
          value: value as string 
        })),
        category: editingProduct.category,
        baseUnit: editingProduct.baseUnit,
        basePrice: editingProduct.basePrice,
        cost: editingProduct.cost,
        minStock: editingProduct.minStock,
        variations: (editingProduct.variations || [])
          .filter((v: any) => !v.isDefault)
          .map((v: any) => ({
            name: v.name,
            barcode: mode === 'duplicate' ? '' : (v.barcode || ''),
            conversionFactor: v.conversionFactor,
            price: v.price,
            isDefault: false
          }))
      })
      setProductImage(editingProduct.imageUrl || null)
    }
  }, [editingProduct, mode])

  const handleCategoryChange = (category: string) => {
    setFormData(prev => ({
      ...prev,
      category,
      attributes: productTemplates[category]?.map(name => ({ name, value: '' })) || []
    }))
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('La imagen no debe superar 5MB')
        return
      }
      const reader = new FileReader()
      reader.onloadend = () => {
        setProductImage(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleAddVariation = () => {
    setFormData(prev => ({
      ...prev,
      variations: [
        ...prev.variations,
        { name: '', barcode: '', conversionFactor: 1, price: 0, isDefault: false }
      ]
    }))
  }

  const handleSave = () => {
    if (!formData.barcode || !formData.productName || !formData.category) {
      toast.error('Complete los campos obligatorios')
      return
    }

    const fullName = [
      formData.brand,
      formData.productName,
      ...formData.attributes.map(attr => attr.value).filter(Boolean)
    ].filter(Boolean).join(' ')

    const productData = {
      ...formData,
      fullName,
      imageUrl: productImage,
      id: editingProduct?.id || Date.now().toString()
    }

    onSave(productData)
    handleClose()
  }

  const handleClose = () => {
    setFormData({
      barcode: '',
      sku: '',
      brand: '',
      productName: '',
      attributes: [],
      category: '',
      baseUnit: '',
      basePrice: 0,
      cost: 0,
      minStock: 10,
      variations: []
    })
    setProductImage(null)
    onClose()
  }

  const getModalTitle = () => {
    switch (mode) {
      case 'edit':
        return 'Editar Producto'
      case 'duplicate':
        return 'Duplicar Producto'
      default:
        return 'Nuevo Producto'
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <Package size={24} />
                {getModalTitle()}
              </h2>
              <button
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left column - Basic info */}
                <div className="lg:col-span-2 space-y-6">
                  <div>
                    <h3 className="font-medium text-gray-700 flex items-center gap-2 mb-4">
                      <Tag size={18} />
                      Información Básica
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="label">Código de Barras *</label>
                        <div className="relative">
                          <input
                            type="text"
                            value={formData.barcode}
                            onChange={(e) => setFormData(prev => ({ ...prev, barcode: e.target.value }))}
                            className="input pl-10"
                            placeholder="7501234567890"
                          />
                          <Barcode className="absolute left-3 top-2.5 text-gray-400" size={20} />
                        </div>
                      </div>

                      <div>
                        <label className="label">SKU (Código Interno)</label>
                        <input
                          type="text"
                          value={formData.sku}
                          onChange={(e) => setFormData(prev => ({ ...prev, sku: e.target.value }))}
                          className="input"
                          placeholder="BEB-001"
                        />
                      </div>

                      <div>
                        <label className="label">Categoría *</label>
                        <select
                          value={formData.category}
                          onChange={(e) => handleCategoryChange(e.target.value)}
                          className="input"
                        >
                          <option value="">Seleccionar categoría</option>
                          {mockCategories.map(cat => (
                            <option key={cat.id} value={cat.name}>{cat.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="label">Marca</label>
                        <input
                          type="text"
                          value={formData.brand}
                          onChange={(e) => setFormData(prev => ({ ...prev, brand: e.target.value }))}
                          className="input"
                          placeholder="Coca Cola"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="label">Nombre del Producto *</label>
                        <input
                          type="text"
                          value={formData.productName}
                          onChange={(e) => setFormData(prev => ({ ...prev, productName: e.target.value }))}
                          className="input"
                          placeholder="Original"
                        />
                      </div>
                    </div>

                    {/* Dynamic attributes */}
                    {formData.attributes.length > 0 && (
                      <div className="mt-4">
                        <h4 className="text-sm font-medium text-gray-700 mb-3">Atributos</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {formData.attributes.map((attr, index) => (
                            <div key={attr.name}>
                              <label className="label">{attr.name}</label>
                              <input
                                type="text"
                                value={attr.value}
                                onChange={(e) => {
                                  const newAttrs = [...formData.attributes]
                                  newAttrs[index].value = e.target.value
                                  setFormData(prev => ({ ...prev, attributes: newAttrs }))
                                }}
                                className="input"
                                placeholder={`Ingrese ${attr.name.toLowerCase()}`}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Name preview */}
                    <div className="bg-blue-50 p-3 rounded-lg mt-4">
                      <p className="text-xs text-blue-600 mb-1">Vista previa del nombre:</p>
                      <p className="font-medium text-blue-900">
                        {[
                          formData.brand,
                          formData.productName,
                          ...formData.attributes.map(attr => attr.value).filter(Boolean)
                        ].filter(Boolean).join(' ') || 'Nombre del producto...'}
                      </p>
                    </div>
                  </div>

                  {/* Prices and units */}
                  <div>
                    <h3 className="font-medium text-gray-700 flex items-center gap-2 mb-4">
                      <DollarSign size={18} />
                      Precios y Unidades
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="label">Unidad Base *</label>
                        <select
                          value={formData.baseUnit}
                          onChange={(e) => setFormData(prev => ({ ...prev, baseUnit: e.target.value }))}
                          className="input"
                        >
                          <option value="">Seleccionar unidad</option>
                          {mockUnits.map(unit => (
                            <option key={unit.id} value={unit.name}>
                              {unit.name} ({unit.abbreviation})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="label">Stock Mínimo</label>
                        <input
                          type="number"
                          value={formData.minStock}
                          onChange={(e) => setFormData(prev => ({ ...prev, minStock: parseInt(e.target.value) || 0 }))}
                          className="input"
                          placeholder="10"
                        />
                      </div>

                      <div>
                        <label className="label">Precio Base *</label>
                        <input
                          type="number"
                          value={formData.basePrice}
                          onChange={(e) => setFormData(prev => ({ ...prev, basePrice: parseFloat(e.target.value) || 0 }))}
                          className="input"
                          placeholder="0.00"
                          step="0.01"
                        />
                      </div>

                      <div>
                        <label className="label">Costo *</label>
                        <input
                          type="number"
                          value={formData.cost}
                          onChange={(e) => setFormData(prev => ({ ...prev, cost: parseFloat(e.target.value) || 0 }))}
                          className="input"
                          placeholder="0.00"
                          step="0.01"
                        />
                      </div>
                    </div>

                    {/* Profit margin */}
                    {formData.basePrice > 0 && formData.cost > 0 && (
                      <div className="bg-green-50 p-3 rounded-lg mt-4">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-xs text-green-600">Margen de ganancia:</p>
                            <p className="font-medium text-green-900">
                              {((formData.basePrice - formData.cost) / formData.cost * 100).toFixed(2)}%
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-green-600">Ganancia por unidad:</p>
                            <p className="font-medium text-green-900">
                              ${(formData.basePrice - formData.cost).toFixed(2)}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right column - Image */}
                <div>
                  <h3 className="font-medium text-gray-700 flex items-center gap-2 mb-4">
                    <Upload size={18} />
                    Imagen del Producto
                  </h3>

                  <div className="space-y-4">
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                      {productImage ? (
                        <div className="relative">
                          <img
                            src={productImage}
                            alt="Producto"
                            className="w-full h-48 object-cover rounded-lg"
                          />
                          <button
                            onClick={() => setProductImage(null)}
                            className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full hover:bg-red-600"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <label className="cursor-pointer block">
                          <div className="flex flex-col items-center justify-center h-48">
                            <Upload size={48} className="text-gray-400 mb-2" />
                            <p className="text-sm text-gray-600">Click para subir imagen</p>
                            <p className="text-xs text-gray-500 mt-1">JPG, PNG hasta 5MB</p>
                          </div>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleImageUpload}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>

                    <div className="text-xs text-gray-500 space-y-1">
                      <p>• Imagen cuadrada recomendada</p>
                      <p>• Mínimo 500x500 píxeles</p>
                      <p>• Fondo blanco preferible</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Variations */}
              <div className="mt-6 pt-6 border-t">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium text-gray-700 flex items-center gap-2">
                    <Ruler size={18} />
                    Variaciones y Presentaciones
                  </h3>
                  <button
                    onClick={handleAddVariation}
                    className="btn-outline btn-sm flex items-center gap-2"
                  >
                    <Plus size={16} />
                    Agregar Variación
                  </button>
                </div>

                <div className="space-y-3">
                  {/* Base variation */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium text-gray-700 flex items-center gap-2">
                        <CheckCircle size={16} className="text-green-600" />
                        Unidad Base
                      </h4>
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">Por defecto</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div>
                        <label className="text-xs text-gray-600">Nombre</label>
                        <p className="font-medium">{formData.baseUnit || 'Seleccione unidad'}</p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">Factor</label>
                        <p className="font-medium">1.00</p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">Precio</label>
                        <p className="font-medium">${formData.basePrice.toFixed(2)}</p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">Código</label>
                        <p className="font-medium">{formData.barcode || '-'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Additional variations */}
                  {formData.variations.map((variation, index) => (
                    <div key={index} className="bg-white border border-gray-200 p-4 rounded-lg">
                      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                        <div>
                          <label className="label text-xs">Nombre</label>
                          <input
                            type="text"
                            value={variation.name}
                            onChange={(e) => {
                              const newVars = [...formData.variations]
                              newVars[index].name = e.target.value
                              setFormData(prev => ({ ...prev, variations: newVars }))
                            }}
                            className="input input-sm"
                            placeholder="Ej: Caja"
                          />
                        </div>
                        <div>
                          <label className="label text-xs">Factor conversión</label>
                          <input
                            type="number"
                            value={variation.conversionFactor}
                            onChange={(e) => {
                              const newVars = [...formData.variations]
                              newVars[index].conversionFactor = parseFloat(e.target.value) || 0
                              newVars[index].price = formData.basePrice * newVars[index].conversionFactor
                              setFormData(prev => ({ ...prev, variations: newVars }))
                            }}
                            className="input input-sm"
                            placeholder="24"
                            step="0.0001"
                          />
                        </div>
                        <div>
                          <label className="label text-xs">Precio</label>
                          <input
                            type="number"
                            value={variation.price}
                            onChange={(e) => {
                              const newVars = [...formData.variations]
                              newVars[index].price = parseFloat(e.target.value) || 0
                              setFormData(prev => ({ ...prev, variations: newVars }))
                            }}
                            className="input input-sm"
                            placeholder="0.00"
                            step="0.01"
                          />
                        </div>
                        <div>
                          <label className="label text-xs">Código (opcional)</label>
                          <input
                            type="text"
                            value={variation.barcode}
                            onChange={(e) => {
                              const newVars = [...formData.variations]
                              newVars[index].barcode = e.target.value
                              setFormData(prev => ({ ...prev, variations: newVars }))
                            }}
                            className="input input-sm"
                            placeholder="Código único"
                          />
                        </div>
                        <div className="flex items-end">
                          <button
                            onClick={() => {
                              const newVars = formData.variations.filter((_, i) => i !== index)
                              setFormData(prev => ({ ...prev, variations: newVars }))
                            }}
                            className="btn-outline btn-sm text-red-600 hover:bg-red-50"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      {variation.conversionFactor > 0 && (
                        <p className="text-xs text-gray-500 mt-2">
                          1 {variation.name} = {variation.conversionFactor} {formData.baseUnit}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-6 pt-6 border-t flex justify-end gap-3">
              <button
                onClick={handleClose}
                className="btn-outline btn-md"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                className="btn-primary btn-md flex items-center gap-2"
              >
                <Save size={18} />
                Guardar Producto
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}