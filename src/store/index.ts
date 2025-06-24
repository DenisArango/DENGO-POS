import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { CartItem, User, Branch, Customer, Product } from '../types'

interface CartItem {
  product: Product
  variation?: { name: string; conversionFactor: number; price: number }
  quantity: number
  discount?: number
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  login: (user: User, token: string) => void
  logout: () => void
}

interface CartState {
  items: CartItem[]
  selectedCustomer: Customer | null
  saleType: 'CASH' | 'CREDIT'
  addItem: (item: CartItem) => void
  removeItem: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  clearCart: () => void
  setCustomer: (customer: Customer | null) => void
  setSaleType: (type: 'CASH' | 'CREDIT') => void
  getTotal: () => number
  getItemCount: () => number
}

interface AppState {
  currentBranch: Branch | null
  setCurrentBranch: (branch: Branch) => void
  isSidebarCollapsed: boolean
  toggleSidebar: () => void
}

// Store de autenticación
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      login: (user, token) => set({ user, token, isAuthenticated: true }),
      logout: () => set({ user: null, token: null, isAuthenticated: false }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
)

// Store del carrito de compras
export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  selectedCustomer: null,
  saleType: 'CASH',
  addItem: (item) => set((state) => {
    const existingItem = state.items.find(i => i.product.id === item.product.id)
    if (existingItem) {
      return {
        items: state.items.map(i =>
          i.product.id === item.product.id
            ? { ...i, quantity: i.quantity + item.quantity }
            : i
        ),
      }
    }
    return { items: [...state.items, item] }
  }),
  removeItem: (productId) => set((state) => ({
    items: state.items.filter(i => i.product.id !== productId),
  })),
  updateQuantity: (productId, quantity) => set((state) => ({
    items: state.items.map(i =>
      i.product.id === productId ? { ...i, quantity } : i
    ),
  })),
  clearCart: () => set({ items: [], selectedCustomer: null, saleType: 'CASH' }),
  setCustomer: (customer) => set({ selectedCustomer: customer }),
  setSaleType: (type) => set({ saleType: type }),
  getTotal: () => {
    const items = get().items
    return items.reduce((total, item) => total + (item.product.price * item.quantity), 0)
  },
  getItemCount: () => {
    const items = get().items
    return items.reduce((count, item) => count + item.quantity, 0)
  },
}))

// Store de la aplicación
export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentBranch: null,
      setCurrentBranch: (branch) => set({ currentBranch: branch }),
      isSidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
    }),
    {
      name: 'app-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
)