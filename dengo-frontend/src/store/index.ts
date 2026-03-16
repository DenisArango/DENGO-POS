import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { CartItem, User, Store, Customer, Product, Supplier, PurchaseOrder, Quotation } from '../types'

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
  removeItem: (productId: string, variationId?: string) => void
  updateQuantity: (productId: string, variationId: string | undefined, quantity: number) => void
  clearCart: () => void
  setCustomer: (customer: Customer | null) => void
  setSaleType: (type: 'CASH' | 'CREDIT') => void
  getTotal: () => number
  getItemCount: () => number
}

interface AppState {
  // currentBranch movido a StoreContext - ver ARCHITECTURE_NOTES.md
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
    // Buscar si existe el mismo producto con la misma variación
    const existingItem = state.items.find(i =>
      i.product.id === item.product.id &&
      i.variation?.id === item.variation?.id
    )
    if (existingItem) {
      return {
        items: state.items.map(i =>
          i.product.id === item.product.id && i.variation?.id === item.variation?.id
            ? { ...i, quantity: i.quantity + item.quantity }
            : i
        ),
      }
    }
    return { items: [...state.items, item] }
  }),
  removeItem: (productId, variationId) => set((state) => ({
    items: state.items.filter(i =>
      !(i.product.id === productId && i.variation?.id === variationId)
    ),
  })),
  updateQuantity: (productId, variationId, quantity) => set((state) => ({
    items: state.items.map(i =>
      i.product.id === productId && i.variation?.id === variationId
        ? { ...i, quantity }
        : i
    ),
  })),
  clearCart: () => set({ items: [], selectedCustomer: null, saleType: 'CASH' }),
  setCustomer: (customer) => set({ selectedCustomer: customer }),
  setSaleType: (type) => set({ saleType: type }),
  getTotal: () => {
    const items = get().items
    return items.reduce((total, item) => {
      // Usar el precio de la variación si existe, sino el precio base del producto
      const price = item.variation ? item.variation.price : item.product.basePrice
      return total + (price * item.quantity)
    }, 0)
  },
  getItemCount: () => {
    const items = get().items
    return items.reduce((count, item) => count + item.quantity, 0)
  },
}))

// Store de proveedores
interface SupplierState {
  suppliers: Supplier[]
  setSuppliers: (suppliers: Supplier[]) => void
  addSupplier: (supplier: Supplier) => void
  updateSupplier: (id: string, supplier: Partial<Supplier>) => void
  deleteSupplier: (id: string) => void
  getSupplierById: (id: string) => Supplier | undefined
}

export const useSupplierStore = create<SupplierState>()(
  persist(
    (set, get) => ({
      suppliers: [],
      setSuppliers: (suppliers) => set({ suppliers }),
      addSupplier: (supplier) => set((state) => ({ suppliers: [...state.suppliers, supplier] })),
      updateSupplier: (id, updates) => set((state) => ({
        suppliers: state.suppliers.map(s => s.id === id ? { ...s, ...updates } : s)
      })),
      deleteSupplier: (id) => set((state) => ({
        suppliers: state.suppliers.filter(s => s.id !== id)
      })),
      getSupplierById: (id) => get().suppliers.find(s => s.id === id),
    }),
    {
      name: 'supplier-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
)

// Store de órdenes de compra
interface PurchaseOrderState {
  purchaseOrders: PurchaseOrder[]
  setPurchaseOrders: (orders: PurchaseOrder[]) => void
  addPurchaseOrder: (order: PurchaseOrder) => void
  updatePurchaseOrder: (id: string, order: Partial<PurchaseOrder>) => void
  deletePurchaseOrder: (id: string) => void
  getPurchaseOrderById: (id: string) => PurchaseOrder | undefined
}

export const usePurchaseOrderStore = create<PurchaseOrderState>()(
  persist(
    (set, get) => ({
      purchaseOrders: [],
      setPurchaseOrders: (orders) => set({ purchaseOrders: orders }),
      addPurchaseOrder: (order) => set((state) => ({
        purchaseOrders: [...state.purchaseOrders, order]
      })),
      updatePurchaseOrder: (id, updates) => set((state) => ({
        purchaseOrders: state.purchaseOrders.map(o => o.id === id ? { ...o, ...updates } : o)
      })),
      deletePurchaseOrder: (id) => set((state) => ({
        purchaseOrders: state.purchaseOrders.filter(o => o.id !== id)
      })),
      getPurchaseOrderById: (id) => get().purchaseOrders.find(o => o.id === id),
    }),
    {
      name: 'purchase-order-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
)

// Store de cotizaciones
interface QuotationState {
  quotations: Quotation[]
  setQuotations: (quotations: Quotation[]) => void
  addQuotation: (quotation: Quotation) => void
  updateQuotation: (id: string, quotation: Partial<Quotation>) => void
  deleteQuotation: (id: string) => void
  getQuotationById: (id: string) => Quotation | undefined
}

export const useQuotationStore = create<QuotationState>()(
  persist(
    (set, get) => ({
      quotations: [],
      setQuotations: (quotations) => set({ quotations }),
      addQuotation: (quotation) => set((state) => ({
        quotations: [...state.quotations, quotation]
      })),
      updateQuotation: (id, updates) => set((state) => ({
        quotations: state.quotations.map(q => q.id === id ? { ...q, ...updates } : q)
      })),
      deleteQuotation: (id) => set((state) => ({
        quotations: state.quotations.filter(q => q.id !== id)
      })),
      getQuotationById: (id) => get().quotations.find(q => q.id === id),
    }),
    {
      name: 'quotation-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
)

// Store de clientes
interface CustomerState {
  customers: Customer[]
  setCustomers: (customers: Customer[]) => void
  addCustomer: (customer: Customer) => void
  updateCustomer: (id: string, customer: Partial<Customer>) => void
  deleteCustomer: (id: string) => void
  getCustomerById: (id: string) => Customer | undefined
}

export const useCustomerStore = create<CustomerState>()(
  persist(
    (set, get) => ({
      customers: [],
      setCustomers: (customers) => set({ customers }),
      addCustomer: (customer) => set((state) => ({
        customers: [...state.customers, customer]
      })),
      updateCustomer: (id, updates) => set((state) => ({
        customers: state.customers.map(c => c.id === id ? { ...c, ...updates } : c)
      })),
      deleteCustomer: (id) => set((state) => ({
        customers: state.customers.filter(c => c.id !== id)
      })),
      getCustomerById: (id) => get().customers.find(c => c.id === id),
    }),
    {
      name: 'customer-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
)

// ─── Store de inventario (stock por producto/sucursal) ────────────────────────
interface StockEntry {
  productId: string
  branchId: string
  quantity: number
  lastUpdated: string
}

interface InventoryState {
  stock: StockEntry[]
  initStock: (entries: StockEntry[]) => void
  updateStock: (productId: string, branchId: string, delta: number) => void
  setStock: (productId: string, branchId: string, quantity: number) => void
  getQuantity: (productId: string, branchId: string) => number
}

export const useInventoryStore = create<InventoryState>()(
  persist(
    (set, get) => ({
      stock: [],
      initStock: (entries) => set((state) => {
        const newEntries = entries.filter(
          e => !state.stock.find(s => s.productId === e.productId && s.branchId === e.branchId)
        )
        return { stock: [...state.stock, ...newEntries] }
      }),
      updateStock: (productId, branchId, delta) => set((state) => {
        const now = new Date().toISOString()
        const exists = state.stock.find(s => s.productId === productId && s.branchId === branchId)
        if (exists) {
          return {
            stock: state.stock.map(s =>
              s.productId === productId && s.branchId === branchId
                ? { ...s, quantity: Math.max(0, s.quantity + delta), lastUpdated: now }
                : s
            )
          }
        }
        return { stock: [...state.stock, { productId, branchId, quantity: Math.max(0, delta), lastUpdated: now }] }
      }),
      setStock: (productId, branchId, quantity) => set((state) => {
        const now = new Date().toISOString()
        const exists = state.stock.find(s => s.productId === productId && s.branchId === branchId)
        if (exists) {
          return {
            stock: state.stock.map(s =>
              s.productId === productId && s.branchId === branchId
                ? { ...s, quantity: Math.max(0, quantity), lastUpdated: now }
                : s
            )
          }
        }
        return { stock: [...state.stock, { productId, branchId, quantity: Math.max(0, quantity), lastUpdated: now }] }
      }),
      getQuantity: (productId, branchId) => {
        const entry = get().stock.find(s => s.productId === productId && s.branchId === branchId)
        return entry?.quantity ?? 0
      }
    }),
    {
      name: 'inventory-stock',
      storage: createJSONStorage(() => localStorage),
    }
  )
)

// Store de la aplicación (solo UI state)
// Para datos de negocio como tienda actual, usar StoreContext
export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      isSidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
    }),
    {
      name: 'app-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
)