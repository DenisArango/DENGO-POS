import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Store, ChevronDown, Check, Building2,
  MapPin, Users, DollarSign, AlertCircle
} from 'lucide-react'

interface StoreOption {
  id: string
  name: string
  code: string
  type: 'main' | 'branch'
  city: string
  status: 'active' | 'inactive' | 'maintenance'
  stats?: {
    dailySales: number
    employees: number
    lowStock: number
  }
}

interface StoreSelectorProps {
  stores: StoreOption[]
  currentStoreId: string
  onStoreChange: (storeId: string) => void
  canChangeStore?: boolean
}

export default function StoreSelector({ 
  stores, 
  currentStoreId, 
  onStoreChange,
  canChangeStore = true 
}: StoreSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  
  const currentStore = stores.find(store => store.id === currentStoreId)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Agregar manejo de teclas para accesibilidad
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen])

  const handleStoreSelect = (storeId: string) => {
    if (canChangeStore && storeId !== currentStoreId) {
      onStoreChange(storeId)
    }
    setIsOpen(false)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500'
      case 'inactive': return 'bg-gray-400'
      case 'maintenance': return 'bg-yellow-500'
      default: return 'bg-gray-400'
    }
  }

  // Manejo de error si no hay tienda actual
  if (!currentStore) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg">
        <AlertCircle size={20} />
        <span className="text-sm">No se encontró la tienda</span>
      </div>
    )
  }

  // Validar que haya tiendas disponibles
  if (stores.length === 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-600 rounded-lg">
        <Store size={20} />
        <span className="text-sm">Sin tiendas disponibles</span>
      </div>
    )
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => canChangeStore && setIsOpen(!isOpen)}
        className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-all ${
          canChangeStore 
            ? 'hover:bg-gray-100 cursor-pointer' 
            : 'cursor-default'
        }`}
        disabled={!canChangeStore}
        aria-label="Seleccionar tienda"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${
            currentStore.type === 'main' ? 'bg-blue-100' : 'bg-gray-100'
          }`}>
            <Building2 size={20} className={
              currentStore.type === 'main' ? 'text-blue-600' : 'text-gray-600'
            } />
          </div>
          <div className="text-left">
            <p className="font-medium text-gray-800">{currentStore.name}</p>
            <p className="text-xs text-gray-500">{currentStore.city}</p>
          </div>
        </div>
        {canChangeStore && (
          <ChevronDown 
            size={20} 
            className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} 
          />
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute top-full left-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50"
            role="listbox"
            aria-label="Lista de tiendas"
          >
            <div className="p-3 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                <Store size={18} />
                Seleccionar Tienda
              </h3>
            </div>
            
            <div className="max-h-96 overflow-y-auto">
              {stores.map((store) => (
                <div
                  key={store.id}
                  onClick={() => handleStoreSelect(store.id)}
                  className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                    store.id === currentStoreId ? 'bg-primary-50' : ''
                  } ${store.status === 'inactive' ? 'opacity-60' : ''}`}
                  role="option"
                  aria-selected={store.id === currentStoreId}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleStoreSelect(store.id)
                    }
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-gray-800">{store.name}</h4>
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                          {store.code}
                        </span>
                        {store.type === 'main' && (
                          <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded">
                            Principal
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-3 text-xs text-gray-500 mb-2">
                        <span className="flex items-center gap-1">
                          <MapPin size={12} />
                          {store.city}
                        </span>
                        <span className="flex items-center gap-1">
                          <div className={`w-2 h-2 rounded-full ${getStatusColor(store.status)}`} />
                          {store.status === 'active' ? 'Activa' : 
                           store.status === 'inactive' ? 'Inactiva' : 'Mantenimiento'}
                        </span>
                      </div>
                      
                      {store.stats && (
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="flex items-center gap-1">
                            <DollarSign size={12} className="text-green-600" />
                            <span className="text-gray-600">
                              ${(store.stats.dailySales / 1000).toFixed(1)}k
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Users size={12} className="text-blue-600" />
                            <span className="text-gray-600">
                              {store.stats.employees}
                            </span>
                          </div>
                          {store.stats.lowStock > 0 && (
                            <div className="flex items-center gap-1">
                              <AlertCircle size={12} className="text-red-600" />
                              <span className="text-red-600">
                                {store.stats.lowStock} bajos
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {store.id === currentStoreId && (
                      <Check size={20} className="text-primary-600 mt-1" />
                    )}
                  </div>
                  
                  {store.status === 'inactive' && (
                    <div className="mt-2 p-2 bg-gray-100 rounded text-xs text-gray-600">
                      Esta tienda está temporalmente inactiva
                    </div>
                  )}
                  
                  {store.status === 'maintenance' && (
                    <div className="mt-2 p-2 bg-yellow-50 rounded text-xs text-yellow-700">
                      Tienda en mantenimiento - Funcionalidad limitada
                    </div>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}