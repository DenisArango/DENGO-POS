import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import type { Store } from '../types'
import { useAuthStore } from '../store'
import { setCache, getCache } from '../lib/offlineDb'

interface StoreContextType {
  currentStore: Store | null
  availableStores: Store[]
  setCurrentStore: (store: Store) => void
  switchStore: (storeId: string) => void
  canSwitchStore: boolean
  isLoading: boolean
  refreshStores: () => Promise<void>
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
    defaultCustomerId: b.defaultCustomerId ?? undefined,
    logo: b.logo ?? undefined,
    companyName: b.companyName ?? undefined,
    companyTaxId: b.companyTaxId ?? undefined,
    companyTagline: b.companyTagline ?? undefined,
    socialMediaName: b.socialMediaName ?? undefined,
    receiptWidthMm: b.receiptWidthMm ?? 55,
    invoiceSeries: b.invoiceSeries ?? undefined,
    salesReconciliationEnabled: b.salesReconciliationEnabled ?? false,
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

  // Shared between a fresh fetch and the offline-cache fallback below, so
  // both populate currentStore/availableStores the same way.
  const applyStores = (stores: Store[]) => {
    setAvailableStores(stores)
    // If a store is already selected, refresh it in place (e.g. after
    // editing its logo/receipt width in Sucursales) instead of re-picking
    // one — re-picking would also fight the user's active selection.
    setCurrentStore(prev => {
      if (prev) {
        const fresh = stores.find(s => s.id === prev.id)
        return fresh ?? prev
      }
      const savedId = localStorage.getItem('selectedStoreId')
      const saved = stores.find(s => s.id === savedId && s.status === 'active')
      if (saved) return saved
      if (stores.length > 0) {
        localStorage.setItem('selectedStoreId', stores[0]!.id)
        return stores[0]!
      }
      return null
    })
  }

  // Falls back to the last branch list synced while online instead of
  // leaving currentStore empty. Used for BOTH a thrown fetch() (no network
  // at all) AND a non-ok response like a 500 (server reachable but broken)
  // — a 500 doesn't throw, it's a normal resolved response with a bad status,
  // so relying on try/catch alone misses it. Without this, a store-derived
  // receipt field (logo, tagline, social media, even the branch name) prints
  // blank the moment the backend hiccups, not just during a real outage.
  const fallBackToCachedStores = async () => {
    const cached = await getCache<any[]>('branches')
    if (cached && cached.length > 0) applyStores(cached.map(branchToStore))
  }

  const loadStores = async (authToken: string) => {
    setIsLoading(true)
    try {
      const apiUrl = import.meta.env.VITE_API_URL as string
      const res = await fetch(`${apiUrl}/api/branches`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })

      if (res.status === 401) {
        // Invalid/expired token — this is a raw fetch(), not lib/api.ts's
        // apiFetch, so nothing else sends the user to /login for this
        // specific request; do it here instead of silently leaving them on
        // a page that can never load its stores. Falling back to cached
        // stores would be actively wrong for this case (they're not this
        // user's data to keep showing once their session is invalid).
        localStorage.removeItem('auth-storage')
        window.location.href = '/login'
        setIsLoading(false)
        return
      }
      if (!res.ok) {
        console.error(`Error al cargar sucursales (HTTP ${res.status}), usando caché local`)
        await fallBackToCachedStores()
        setIsLoading(false)
        return
      }

      const branches: any[] = await res.json()
      if (!Array.isArray(branches) || branches.length === 0) {
        setIsLoading(false)
        return
      }
      await setCache('branches', branches)
      applyStores(branches.map(branchToStore))
    } catch (err) {
      console.error('Error al cargar sucursales, usando caché local:', err)
      await fallBackToCachedStores()
    } finally {
      setIsLoading(false)
    }
  }

  const refreshStores = () => (token ? loadStores(token) : Promise.resolve())

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
      refreshStores,
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
