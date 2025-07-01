import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Store, Building2, MapPin, Clock, Users,
  ChevronRight, LogIn, AlertCircle, Check
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface StoreOption {
  id: string
  name: string
  code: string
  type: 'main' | 'branch'
  address: string
  city: string
  status: 'active' | 'inactive' | 'maintenance'
  openTime: string
  closeTime: string
  manager: string
  employees: number
  lastAccess?: string
}

interface User {
  id: string
  name: string
  email: string
  role: string
  avatar?: string
}

// Datos de ejemplo
const availableStores: StoreOption[] = [
  {
    id: '1',
    name: 'Tienda Central',
    code: 'TC001',
    type: 'main',
    address: 'Av. Principal #123',
    city: 'Ciudad de Guatemala',
    status: 'active',
    openTime: '07:00',
    closeTime: '21:00',
    manager: 'Juan Pérez',
    employees: 8,
    lastAccess: '2024-01-19'
  },
  {
    id: '2',
    name: 'Sucursal Norte',
    code: 'SN001',
    type: 'branch',
    address: 'Centro Comercial Norte',
    city: 'Mixco',
    status: 'active',
    openTime: '08:00',
    closeTime: '20:00',
    manager: 'María García',
    employees: 5
  },
  {
    id: '3',
    name: 'Sucursal Sur',
    code: 'SS001',
    type: 'branch',
    address: 'Plaza del Sur',
    city: 'Villa Nueva',
    status: 'maintenance',
    openTime: '08:00',
    closeTime: '19:00',
    manager: 'Carlos López',
    employees: 4
  }
]

const currentUser: User = {
  id: '1',
  name: 'Ana Martínez',
  email: 'ana.martinez@empresa.com',
  role: 'Gerente'
}

export default function StoreSelectionLogin() {
  const navigate = useNavigate()
  const [selectedStore, setSelectedStore] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleStoreSelect = (storeId: string) => {
    const store = availableStores.find(s => s.id === storeId)
    if (store?.status === 'inactive') return
    setSelectedStore(storeId)
  }

  const handleContinue = () => {
    if (!selectedStore) return
    
    setLoading(true)
    // Simular proceso de carga
    setTimeout(() => {
      // Aquí se guardaría la tienda seleccionada en el contexto/store
      navigate('/dashboard')
    }, 1000)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'border-green-200 bg-green-50'
      case 'inactive': return 'border-gray-200 bg-gray-50 opacity-50'
      case 'maintenance': return 'border-yellow-200 bg-yellow-50'
      default: return 'border-gray-200'
    }
  }

  const isStoreOpen = (store: StoreOption) => {
    const now = new Date()
    const currentTime = format(now, 'HH:mm')
    return currentTime >= store.openTime && currentTime <= store.closeTime
  }

  // Ordenar tiendas: última accedida primero, luego activas, luego el resto
  const sortedStores = [...availableStores].sort((a, b) => {
    if (a.lastAccess && !b.lastAccess) return -1
    if (!a.lastAccess && b.lastAccess) return 1
    if (a.status === 'active' && b.status !== 'active') return -1
    if (a.status !== 'active' && b.status === 'active') return 1
    return 0
  })

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-4xl"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="p-4 bg-white rounded-full shadow-lg">
              <Store size={32} className="text-primary-600" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            Selecciona tu Tienda
          </h1>
          <p className="text-gray-600">
            Hola <span className="font-medium">{currentUser.name}</span>, 
            elige la tienda en la que trabajarás hoy
          </p>
        </div>

        {/* Store Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {sortedStores.map((store, index) => (
            <motion.div
              key={store.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
              onClick={() => handleStoreSelect(store.id)}
              className={`relative rounded-lg border-2 p-6 cursor-pointer transition-all ${
                selectedStore === store.id
                  ? 'border-primary-500 bg-primary-50 shadow-lg'
                  : getStatusColor(store.status)
              } ${
                store.status === 'inactive' ? 'cursor-not-allowed' : 'hover:shadow-md'
              }`}
            >
              {/* Indicador de última tienda accedida */}
              {store.lastAccess && (
                <div className="absolute top-2 right-2">
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                    Último acceso
                  </span>
                </div>
              )}

              {/* Checkbox de selección */}
              {selectedStore === store.id && (
                <div className="absolute top-2 left-2">
                  <div className="w-6 h-6 bg-primary-600 rounded-full flex items-center justify-center">
                    <Check size={16} className="text-white" />
                  </div>
                </div>
              )}

              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-lg ${
                  store.type === 'main' ? 'bg-blue-100' : 'bg-gray-100'
                }`}>
                  <Building2 size={24} className={
                    store.type === 'main' ? 'text-blue-600' : 'text-gray-600'
                  } />
                </div>
                
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-800 mb-1">
                    {store.name}
                  </h3>
                  <p className="text-sm text-gray-500 mb-3">{store.code}</p>
                  
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-gray-600">
                      <MapPin size={14} />
                      <span className="truncate">{store.city}</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <Clock size={14} />
                      <span>{store.openTime} - {store.closeTime}</span>
                      {isStoreOpen(store) ? (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                          Abierto
                        </span>
                      ) : (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                          Cerrado
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <Users size={14} />
                      <span>{store.employees} empleados</span>
                    </div>
                  </div>

                  {/* Estados especiales */}
                  {store.status === 'maintenance' && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-yellow-700">
                      <AlertCircle size={14} />
                      <span>En mantenimiento</span>
                    </div>
                  )}
                  
                  {store.status === 'inactive' && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
                      <AlertCircle size={14} />
                      <span>Temporalmente inactiva</span>
                    </div>
                  )}

                  {store.lastAccess && (
                    <div className="mt-3 text-xs text-gray-500">
                      Último acceso: {format(new Date(store.lastAccess), "d 'de' MMMM", { locale: es })}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Botón de continuar */}
        <div className="flex justify-center">
          <button
            onClick={handleContinue}
            disabled={!selectedStore || loading}
            className={`px-8 py-3 rounded-lg font-medium transition-all flex items-center gap-2 ${
              selectedStore && !loading
                ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-lg'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Ingresando...
              </>
            ) : (
              <>
                Continuar
                <ChevronRight size={20} />
              </>
            )}
          </button>
        </div>

        {/* Información adicional */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500">
            ¿No ves la tienda que buscas?{' '}
            <button className="text-primary-600 hover:underline">
              Contacta al administrador
            </button>
          </p>
        </div>
      </motion.div>
    </div>
  )
}