import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import type { Store } from '../types'
import { useAuthStore } from '../store'

interface StoreContextType {
  currentStore: Store | null
  availableStores: Store[]
  setCurrentStore: (store: Store) => void
  switchStore: (storeId: string) => void
  canSwitchStore: boolean
  isLoading: boolean
}

const StoreContext = createContext<StoreContextType | undefined>(undefined)

export const useStore = () => {
  const context = useContext(StoreContext)
  if (!context) throw new Error('useStore debe ser usado dentro de StoreProvider')
  return context
}

function branchToStore(b: any): Store {
  const rawStatus = (b.status ?? 'active').toLowerCase()
  const status: Store['status'] =
    rawStatus === 'inactive' ? 'inactive' :
    rawStatus === 'maintenance' ? 'maintenance' : 'active'

  return {
    id: b.id,
    name: b.name,
    code: b.code ?? b.id.slice(0, 8).toUpperCase(),
    type: b.type === 'main' ? 'main' : 'branch',
    address: b.address ?? '',
    city: b.city ?? b.name,
    phone: b.phone ?? '',
    email: b.email ?? '',
    manager: b.manager ?? '',
    status,
    openTime: b.openTime ?? '08:00',
    closeTime: b.closeTime ?? '20:00',
    config: {
      currency: b.currency ?? 'GTQ',
      timezone: b.timezone ?? 'America/Guatemala',
      taxRate: Number(b.taxRate ?? 0.12) * (Number(b.taxRate ?? 0.12) <= 1 ? 100 : 1),
      printerEnabled: b.printerEnabled ?? true,
    },
    createdAt: b.createdAt ?? new Date().toISOString(),
    updatedAt: b.updatedAt ?? new Date().toISOString(),
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuthStore()
  const [currentStore, setCurrentStore] = useState<Store | null>(null)
  const [availableStores, setAvailableStores] = useState<Store[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [canSwitchStore, setCanSwitchStore] = useState(true)

  // Load branches whenever the token changes (login/logout)
  useEffect(() => {
    if (!token) {
      setAvailableStores([])
      setCurrentStore(null)
      setIsLoading(false)
      return
    }
    loadStores(token)
  }, [token])

  // All authenticated users can switch stores (backend enforces data-level restrictions)
  useEffect(() => {
    setCanSwitchStore(true)
  }, [user?.role])

  const loadStores = async (authToken: string) => {
    setIsLoading(true)
    try {
      const apiUrl = import.meta.env.VITE_API_URL as string
      const res = await fetch(`${apiUrl}/api/branches`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })

      if (!res.ok) {
        // If unauthorized, the global api handler will redirect to login
        setIsLoading(false)
        return
      }

      const branches: any[] = await res.json()
      if (!Array.isArray(branches) || branches.length === 0) {
        setIsLoading(false)
        return
      }

      const stores: Store[] = branches.map(branchToStore)
      setAvailableStores(stores)

      // Restore last selected branch or default to first
      const savedId = localStorage.getItem('selectedStoreId')
      const saved = stores.find(s => s.id === savedId && s.status === 'active')
      if (saved) {
        setCurrentStore(saved)
      } else if (stores.length > 0) {
        setCurrentStore(stores[0])
        localStorage.setItem('selectedStoreId', stores[0].id)
      }
    } catch (err) {
      console.error('Error al cargar sucursales:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSetCurrentStore = (store: Store) => {
    setCurrentStore(store)
    localStorage.setItem('selectedStoreId', store.id)
    window.dispatchEvent(new CustomEvent('storeChanged', { detail: store }))
  }

  const switchStore = (storeId: string) => {
    const store = availableStores.find(s => s.id === storeId)
    if (store && store.status === 'active' && canSwitchStore) {
      handleSetCurrentStore(store)
    }
  }

  return (
    <StoreContext.Provider value={{
      currentStore,
      availableStores,
      setCurrentStore: handleSetCurrentStore,
      switchStore,
      canSwitchStore,
      isLoading,
    }}>
      {children}
    </StoreContext.Provider>
  )
}

export const useStorePermissions = () => {
  const { currentStore } = useStore()
  const hasPermission = (permission: string): boolean => {
    if (!currentStore) return false
    if (permission === 'manage_all_stores' && currentStore.type !== 'main') return false
    if (currentStore.status !== 'active') {
      return ['view_inventory', 'view_reports', 'view_sales'].includes(permission)
    }
    return true
  }
  return { hasPermission }
}

export const useStoreConfig = () => {
  const { currentStore } = useStore()
  return {
    currency: currentStore?.config?.currency || 'GTQ',
    currencySymbol: 'Q',
    timezone: currentStore?.config?.timezone || 'America/Guatemala',
    taxRate: currentStore?.config?.taxRate || 12,
    printerEnabled: currentStore?.config?.printerEnabled || false,
    formatCurrency: (amount: number) => `Q${amount.toFixed(2)}`,
  }
}
