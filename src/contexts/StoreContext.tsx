import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface Store {
  id: string
  name: string
  code: string
  type: 'main' | 'branch'
  address: string
  city: string
  phone: string
  email: string
  manager: string
  status: 'active' | 'inactive' | 'maintenance'
  openTime: string
  closeTime: string
  config?: {
    currency: string
    timezone: string
    taxRate: number
    printerEnabled: boolean
  }
}

interface StoreContextType {
  currentStore: Store | null
  availableStores: Store[]
  setCurrentStore: (store: Store) => void
  switchStore: (storeId: string) => void
  canSwitchStore: boolean
  isLoading: boolean
}

const StoreContext = createContext<StoreContextType | undefined>(undefined)

// Hook personalizado para usar el contexto
export const useStore = () => {
  const context = useContext(StoreContext)
  if (!context) {
    throw new Error('useStore debe ser usado dentro de StoreProvider')
  }
  return context
}

interface StoreProviderProps {
  children: ReactNode
}

// Datos de ejemplo - En producción vendrían de la API
const mockStores: Store[] = [
  {
    id: '1',
    name: 'Tienda Central',
    code: 'TC001',
    type: 'main',
    address: 'Av. Principal #123, Zona 1',
    city: 'Ciudad de Guatemala',
    phone: '+502 2222-3333',
    email: 'central@empresa.com',
    manager: 'Juan Pérez',
    status: 'active',
    openTime: '07:00',
    closeTime: '21:00',
    config: {
      currency: 'GTQ',
      timezone: 'America/Guatemala',
      taxRate: 12,
      printerEnabled: true
    }
  },
  {
    id: '2',
    name: 'Sucursal Norte',
    code: 'SN001',
    type: 'branch',
    address: 'Centro Comercial Norte, Local 45',
    city: 'Mixco',
    phone: '+502 2222-4444',
    email: 'norte@empresa.com',
    manager: 'María García',
    status: 'active',
    openTime: '08:00',
    closeTime: '20:00',
    config: {
      currency: 'GTQ',
      timezone: 'America/Guatemala',
      taxRate: 12,
      printerEnabled: true
    }
  }
]

export function StoreProvider({ children }: StoreProviderProps) {
  const [currentStore, setCurrentStore] = useState<Store | null>(null)
  const [availableStores, setAvailableStores] = useState<Store[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [canSwitchStore, setCanSwitchStore] = useState(true)

  // Cargar tiendas disponibles al iniciar
  useEffect(() => {
    loadStores()
  }, [])

  const loadStores = async () => {
    try {
      setIsLoading(true)
      // Simular carga desde API
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // En producción, esto vendría de la API basado en el usuario autenticado
      setAvailableStores(mockStores)
      
      // Verificar si hay una tienda guardada en localStorage
      const savedStoreId = localStorage.getItem('selectedStoreId')
      if (savedStoreId) {
        const savedStore = mockStores.find(s => s.id === savedStoreId)
        if (savedStore && savedStore.status === 'active') {
          setCurrentStore(savedStore)
        }
      }
    } catch (error) {
      console.error('Error al cargar tiendas:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSetCurrentStore = (store: Store) => {
    setCurrentStore(store)
    localStorage.setItem('selectedStoreId', store.id)
    
    // Aquí se podría emitir un evento para notificar el cambio
    window.dispatchEvent(new CustomEvent('storeChanged', { detail: store }))
  }

  const switchStore = (storeId: string) => {
    const store = availableStores.find(s => s.id === storeId)
    if (store && store.status === 'active' && canSwitchStore) {
      handleSetCurrentStore(store)
    }
  }

  // Determinar si el usuario puede cambiar de tienda basado en su rol
  // En producción esto vendría del contexto de autenticación
  useEffect(() => {
    const userRole = 'admin'
    setCanSwitchStore(['admin', 'manager'].includes(userRole))
  }, [])

  return (
    <StoreContext.Provider 
      value={{
        currentStore,
        availableStores,
        setCurrentStore: handleSetCurrentStore,
        switchStore,
        canSwitchStore,
        isLoading
      }}
    >
      {children}
    </StoreContext.Provider>
  )
}

// Hook para verificar permisos basados en la tienda
export const useStorePermissions = () => {
  const { currentStore } = useStore()
  
  const hasPermission = (permission: string): boolean => {
    // Lógica de permisos basada en la tienda
    if (!currentStore) return false
    
    // Por ejemplo, algunas funciones solo están disponibles en la tienda principal
    if (permission === 'manage_all_stores' && currentStore.type !== 'main') {
      return false
    }
    
    // Verificar si la tienda está activa
    if (currentStore.status !== 'active') {
      // Limitar permisos en tiendas inactivas o en mantenimiento
      const readOnlyPermissions = ['view_inventory', 'view_reports', 'view_sales']
      return readOnlyPermissions.includes(permission)
    }
    
    return true
  }
  
  return { hasPermission }
}

// Hook para obtener configuración específica de la tienda
export const useStoreConfig = () => {
  const { currentStore } = useStore()
  
  return {
    currency: currentStore?.config?.currency || 'GTQ',
    currencySymbol: currentStore?.config?.currency === 'GTQ' ? 'Q' : '$',
    timezone: currentStore?.config?.timezone || 'America/Guatemala',
    taxRate: currentStore?.config?.taxRate || 12,
    printerEnabled: currentStore?.config?.printerEnabled || false,
    formatCurrency: (amount: number) => {
      const symbol = currentStore?.config?.currency === 'GTQ' ? 'Q' : '$'
      return `${symbol}${amount.toFixed(2)}`
    }
  }
}