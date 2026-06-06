import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Trash2, Plus, Minus, X, DollarSign, CreditCard,
  UserPlus, User, Barcode, ShoppingCart, Printer, Tag,
  Calendar, AlertCircle, Receipt, ArrowLeftRight, Edit2, History, ExternalLink
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useCartStore } from '../store'
import { useAuthStore } from '../store'
import { api } from '../lib/api'
import { toast } from 'sonner'
import { useStore } from '../contexts/StoreContext'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProductVariation {
  id: string
  productId: string
  name: string
  conversionFactor: number
  price: number
  barcode?: string
  isDefault?: boolean
}

interface ProductRecord {
  id: string
  barcode?: string
  sku?: string
  name: string
  basePrice: number
  cost?: number
  minStock?: number
  salesCount?: number
  imageUrl?: string
  isActive?: boolean
  category?: { id: string; name: string }
  categoryName?: string
  variations?: ProductVariation[]
  createdAt?: string
  updatedAt?: string
}

interface CustomerRecord {
  id: string
  nit?: string
  fullName?: string
  name?: string
  email?: string
  phone?: string
  creditLimit?: number
  creditUsed?: number
  creditAvailable?: number
}

type PaymentMethodType = 'CASH' | 'CARD' | 'TRANSFER' | 'MIXED' | 'CREDIT'
type SaleTypeValue = 'CASH' | 'CREDIT'

interface CartItem {
  product: ProductRecord
  variation?: ProductVariation
  quantity: number
}

interface CompletedSaleItem {
  id: string
  productName: string
  variationName?: string
  quantity: number
  unitPrice: number
  discount: number
  total: number
}

interface CompletedSale {
  id: string
  invoiceNumber: string
  branchName: string
  items: CompletedSaleItem[]
  subtotal: number
  total: number
  paymentMethod: PaymentMethodType
  saleType: SaleTypeValue
  customerName?: string
  customerNit?: string
  createdAt: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCustomerName(c: CustomerRecord): string {
  return c.fullName ?? c.name ?? 'Cliente'
}

function getCustomerNit(c: CustomerRecord): string {
  return c.nit ?? 'CF'
}

function normaliseProduct(p: ProductRecord): ProductRecord {
  return {
    ...p,
    basePrice: Number(p.basePrice ?? 0),
    variations: (p.variations ?? []).map(v => ({
      ...v,
      price: Number(v.price ?? 0),
      conversionFactor: Number(v.conversionFactor ?? 1),
    })),
  }
}

function buildDefaultVariation(product: ProductRecord): ProductVariation {
  return {
    id: `${product.id}-default`,
    productId: product.id,
    name: 'Pieza',
    conversionFactor: 1,
    price: Number(product.basePrice ?? 0),
    isDefault: true,
  }
}

function getVariations(product: ProductRecord): ProductVariation[] {
  if (product.variations && product.variations.length > 0) return product.variations
  return [buildDefaultVariation(product)]
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function POS() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { currentStore } = useStore()
  const BRANCH_ID = currentStore?.id ?? user?.branchId ?? ''

  // Active cash register (persisted in localStorage per branch)
  const [openRegisters, setOpenRegisters] = useState<{ id: string; name: string; registerNumber: string }[]>([])
  const [selectedRegisterId, setSelectedRegisterId] = useState<string>(() => {
    return localStorage.getItem(`pos-register-${BRANCH_ID}`) ?? ''
  })

  useEffect(() => {
    if (!BRANCH_ID) return
    api.get<any[]>(`/api/cash-registers/current?branchId=${BRANCH_ID}`)
      .then(d => {
        const list = (Array.isArray(d) ? d : (d ? [d] : [])).filter(Boolean)
        setOpenRegisters(list.map(r => ({ id: r.id, name: r.name ?? 'Caja', registerNumber: r.registerNumber ?? '?' })))
        // Auto-select if only one open or restore saved
        const saved = localStorage.getItem(`pos-register-${BRANCH_ID}`)
        if (list.length === 1 && !saved) {
          setSelectedRegisterId(list[0].id)
          localStorage.setItem(`pos-register-${BRANCH_ID}`, list[0].id)
        } else if (saved && list.some((r: any) => r.id === saved)) {
          setSelectedRegisterId(saved)
        } else if (list.length > 0 && !list.some((r: any) => r.id === saved)) {
          setSelectedRegisterId(list[0].id)
          localStorage.setItem(`pos-register-${BRANCH_ID}`, list[0].id)
        }
      })
      .catch(() => {})
  }, [BRANCH_ID])

  const handleRegisterChange = (id: string) => {
    setSelectedRegisterId(id)
    localStorage.setItem(`pos-register-${BRANCH_ID}`, id)
  }

  // Search
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<ProductRecord[]>([])
  const [showSearchResults, setShowSearchResults] = useState(false)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Customers
  const [customers, setCustomers] = useState<CustomerRecord[]>([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [showCustomerModal, setShowCustomerModal] = useState(false) // keep for backwards compat
  const [loadingCustomers, setLoadingCustomers] = useState(false)
  const [showCustomerHistory, setShowCustomerHistory] = useState(false)
  const [customerSales, setCustomerSales] = useState<any[]>([])
  const [loadingCustomerSales, setLoadingCustomerSales] = useState(false)

  // Cart
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecord | null>(null)
  const [saleType, setSaleType] = useState<SaleTypeValue>('CASH')
  const [itemDiscounts, setItemDiscounts] = useState<Record<string, number>>({})

  // Variation modal — used both for initial add and for changing variation of cart item
  const [showVariationModal, setShowVariationModal] = useState(false)
  const [selectedProductForVariation, setSelectedProductForVariation] = useState<ProductRecord | null>(null)
  const [variationQuantities, setVariationQuantities] = useState<Record<string, number>>({})
  const [changingVariationItem, setChangingVariationItem] = useState<CartItem | null>(null) // non-null = changing existing item

  // Payment
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>('CASH')
  const [cashReceived, setCashReceived] = useState('')
  const [transferAmount, setTransferAmount] = useState('')
  const [transferDocumentNumber, setTransferDocumentNumber] = useState('')
  const [mixedCashAmount, setMixedCashAmount] = useState('')
  const [mixedTransferAmount, setMixedTransferAmount] = useState('')
  const [mixedTransferDoc, setMixedTransferDoc] = useState('')

  // Quantity string display — allows free-text editing (cleared on commit/blur)
  const [itemQtyStrings, setItemQtyStrings] = useState<Record<string, string>>({})

  // Receipt
  const [showReceiptModal, setShowReceiptModal] = useState(false)
  const [completedSale, setCompletedSale] = useState<CompletedSale | null>(null)
  const [lastCashReceived, setLastCashReceived] = useState('')

  // Saving
  const [saving, setSaving] = useState(false)

  // Stock warning
  const [stockIssues, setStockIssues] = useState<{ name: string; available: number; requested: number }[]>([])
  const [showStockWarning, setShowStockWarning] = useState(false)

  // ── Fetch customers on mount ───────────────────────────────────────────────
  useEffect(() => {
    fetchCustomers()
  }, [])

  async function fetchCustomers() {
    setLoadingCustomers(true)
    try {
      const data = await api.get<CustomerRecord[]>('/api/customers')
      setCustomers(data ?? [])
    } catch {
      // Non-critical; customer search will just show empty
    } finally {
      setLoadingCustomers(false)
    }
  }

  // ── Live product search (debounced) ───────────────────────────────────────
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    if (!searchTerm.trim()) {
      setSearchResults([])
      setShowSearchResults(false)
      return
    }
    searchDebounceRef.current = setTimeout(() => {
      performSearch(searchTerm.trim())
    }, 250)
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    }
  }, [searchTerm])

  async function performSearch(query: string) {
    try {
      const data = await api.get<ProductRecord[]>(
        `/api/products?search=${encodeURIComponent(query)}&isActive=true`
      )
      const results = (data ?? []).filter(p => p.isActive !== false).slice(0, 8).map(normaliseProduct)
      setSearchResults(results)
      setShowSearchResults(results.length > 0 || query.length > 0)
    } catch {
      setSearchResults([])
      setShowSearchResults(false)
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const getItemKey = (productId: string, variationId?: string) =>
    `${productId}-${variationId || 'default'}`

  const getLineTotal = (item: CartItem) => {
    const price = item.variation ? item.variation.price : item.product.basePrice
    const disc = itemDiscounts[getItemKey(item.product.id, item.variation?.id)] || 0
    return price * item.quantity * (1 - disc / 100)
  }

  const subtotal = cartItems.reduce((s, item) => s + getLineTotal(item), 0)
  const total = subtotal
  const itemCount = cartItems.reduce((s, item) => s + item.quantity, 0)

  const canSellOnCredit = selectedCustomer &&
    (selectedCustomer.creditAvailable ?? 0) > 0

  const canComplete = cartItems.length > 0 && !saving && (
    saleType === 'CREDIT' ||
    paymentMethod === 'CARD' ||
    paymentMethod === 'TRANSFER' ||
    (paymentMethod === 'CASH' && cashReceived !== '' && parseFloat(cashReceived) >= total) ||
    (paymentMethod === 'MIXED' && parseFloat(mixedCashAmount || '0') + parseFloat(mixedTransferAmount || '0') >= total)
  )

  const change = cashReceived && parseFloat(cashReceived) >= total
    ? parseFloat(cashReceived) - total
    : null

  const filteredCustomers = customers.filter(c => {
    const q = customerSearch.toLowerCase()
    return (
      getCustomerName(c).toLowerCase().includes(q) ||
      (c.nit ?? '').toLowerCase().includes(q)
    )
  })

  // ── Cart helpers ──────────────────────────────────────────────────────────
  function addToCart(product: ProductRecord, variation: ProductVariation, quantity: number) {
    setCartItems(prev => {
      const key = getItemKey(product.id, variation.id)
      const existing = prev.find(i => getItemKey(i.product.id, i.variation?.id) === key)
      if (existing) {
        return prev.map(i =>
          getItemKey(i.product.id, i.variation?.id) === key
            ? { ...i, quantity: i.quantity + quantity }
            : i
        )
      }
      return [...prev, { product, variation, quantity }]
    })
  }

  function updateQuantity(productId: string, variationId: string | undefined, qty: number) {
    const key = getItemKey(productId, variationId)
    setCartItems(prev =>
      prev.map(i =>
        getItemKey(i.product.id, i.variation?.id) === key ? { ...i, quantity: qty } : i
      )
    )
  }

  function removeItem(productId: string, variationId?: string) {
    const key = getItemKey(productId, variationId)
    setCartItems(prev => prev.filter(i => getItemKey(i.product.id, i.variation?.id) !== key))
    setItemDiscounts(prev => { const next = { ...prev }; delete next[key]; return next })
    setItemQtyStrings(prev => { const next = { ...prev }; delete next[key]; return next })
  }

  function clearCart() {
    setCartItems([])
    setItemDiscounts({})
    setItemQtyStrings({})
  }

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleAddProduct = (product: ProductRecord) => {
    setSearchTerm('')
    setShowSearchResults(false)
    const variations = getVariations(product)
    // Always auto-add with the default variation; user can change from the cart line
    const defaultVar = variations.find(v => v.isDefault) ?? variations[0]
    addToCart(product, defaultVar, 1)
    toast.success(`${product.name} agregado`)
  }

  const handleChangeVariation = (item: CartItem) => {
    const variations = getVariations(item.product)
    if (variations.length <= 1) return
    setChangingVariationItem(item)
    setSelectedProductForVariation(item.product)
    const initialQtys: Record<string, number> = {}
    variations.forEach(v => { initialQtys[v.id] = v.id === item.variation?.id ? item.quantity : 1 })
    setVariationQuantities(initialQtys)
    setShowVariationModal(true)
  }

  const handleBarcodeScan = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || !searchTerm) return
    const barcode = searchTerm.trim()

    // First check already-fetched results
    const exactProduct = searchResults.find(
      p => p.barcode === barcode || getVariations(p).some(v => v.barcode === barcode)
    )
    if (exactProduct) {
      const matchedVariation = getVariations(exactProduct).find(v => v.barcode === barcode)
      if (matchedVariation) {
        addToCart(exactProduct, matchedVariation, 1)
        setSearchTerm('')
        setShowSearchResults(false)
        toast.success(`${exactProduct.name} (${matchedVariation.name}) agregado`)
      } else {
        handleAddProduct(exactProduct)
      }
      return
    }

    // Try fetching by barcode directly
    try {
      const data = await api.get<{ product: ProductRecord; variation?: ProductVariation }>(
        `/api/products/barcode/${encodeURIComponent(barcode)}`
      )
      if (data?.product) {
        const product = normaliseProduct(data.product)
        const variation = data.variation
          ? { ...data.variation, price: Number(data.variation.price ?? 0), conversionFactor: Number(data.variation.conversionFactor ?? 1) }
          : undefined
        if (variation) {
          addToCart(product, variation, 1)
          setSearchTerm('')
          setShowSearchResults(false)
          toast.success(`${product.name} (${variation.name}) agregado`)
        } else {
          handleAddProduct(product)
        }
      } else {
        toast.error('Producto no encontrado')
      }
    } catch {
      toast.error('Producto no encontrado')
    }
  }

  const handleSelectCustomer = (customer: CustomerRecord) => {
    setSelectedCustomer(customer)
    setShowCustomerModal(false)
    setShowCustomerDropdown(false)
    setCustomerSearch('')
    if (!customer.creditAvailable || customer.creditAvailable <= 0) {
      setSaleType('CASH')
    }
  }

  const openCustomerHistory = async (customer: CustomerRecord) => {
    setShowCustomerHistory(true)
    setLoadingCustomerSales(true)
    try {
      const data = await api.get<any[]>(`/api/sales?customerId=${customer.id}`)
      setCustomerSales(data ?? [])
    } catch { setCustomerSales([]) } finally { setLoadingCustomerSales(false) }
  }

  const handleAddVariationToCart = (variation: ProductVariation, qty: number) => {
    if (!selectedProductForVariation) return
    if (changingVariationItem) {
      // Replace existing item's variation
      const oldKey = getItemKey(changingVariationItem.product.id, changingVariationItem.variation?.id)
      const oldDiscount = itemDiscounts[oldKey] ?? 0
      setCartItems(prev => prev.map(i =>
        getItemKey(i.product.id, i.variation?.id) === oldKey
          ? { ...i, variation, quantity: qty }
          : i
      ))
      setItemDiscounts(prev => {
        const next = { ...prev }
        delete next[oldKey]
        return { ...next, [getItemKey(changingVariationItem.product.id, variation.id)]: oldDiscount }
      })
      toast.success(`Variación cambiada a ${variation.name}`)
    } else {
      addToCart(selectedProductForVariation, variation, qty)
      toast.success(`${selectedProductForVariation.name} (${variation.name}) agregado`)
    }
    setShowVariationModal(false)
    setSelectedProductForVariation(null)
    setChangingVariationItem(null)
    setVariationQuantities({})
  }

  const completeSaleRequest = async () => {
    setSaving(true)
    try {
      const payload: any = {
        branchId: BRANCH_ID,
        customerId: selectedCustomer?.id,
        cashRegisterId: selectedRegisterId || undefined,
        saleType,
        paymentMethod,
        items: cartItems.map(item => {
          const key = getItemKey(item.product.id, item.variation?.id)
          const unitPrice = item.variation ? item.variation.price : item.product.basePrice
          const discPct = itemDiscounts[key] || 0
          const isRealVariation = item.variation && !item.variation.id.endsWith('-default')
          return {
            productId: item.product.id,
            variationId: isRealVariation ? item.variation!.id : undefined,
            quantity: item.quantity,
            unitPrice,
            discount: discPct / 100,
            total: unitPrice * item.quantity * (1 - discPct / 100),
          }
        }),
        subtotal,
        tax: 0,
        discount: 0,
        total,
      }

      // Add payment breakdown
      if (paymentMethod === 'CASH') {
        payload.cashAmount = total
      } else if (paymentMethod === 'TRANSFER') {
        payload.transferAmount = total
        if (transferDocumentNumber) payload.transferDocumentNumber = transferDocumentNumber
      } else if (paymentMethod === 'MIXED') {
        const ca = parseFloat(mixedCashAmount || '0')
        const ta = parseFloat(mixedTransferAmount || '0')
        payload.cashAmount = ca
        payload.transferAmount = ta
        if (mixedTransferDoc) payload.transferDocumentNumber = mixedTransferDoc
      }

      const created = await api.post<any>('/api/sales', payload)

      // Build a local receipt from the response (or from local state as fallback)
      const now = new Date().toISOString()
      const receipt: CompletedSale = {
        id: created?.id ?? Date.now().toString(),
        invoiceNumber: created?.invoiceNumber ?? created?.receiptNumber ?? `FAC-${Date.now()}`,
        branchName: created?.branch?.name ?? 'Tienda',
        items: cartItems.map(item => {
          const unitPrice = item.variation ? item.variation.price : item.product.basePrice
          const disc = itemDiscounts[getItemKey(item.product.id, item.variation?.id)] || 0
          return {
            id: getItemKey(item.product.id, item.variation?.id),
            productName: item.product.name,
            variationName: item.variation?.name,
            quantity: item.quantity,
            unitPrice,
            discount: disc,
            total: unitPrice * item.quantity * (1 - disc / 100),
          }
        }),
        subtotal,
        total,
        paymentMethod,
        saleType,
        customerName: selectedCustomer ? getCustomerName(selectedCustomer) : undefined,
        customerNit: selectedCustomer ? getCustomerNit(selectedCustomer) : undefined,
        createdAt: created?.createdAt ?? now,
      }

      setLastCashReceived(cashReceived)
      setCompletedSale(receipt)
      setShowReceiptModal(true)
      clearCart()
      setCashReceived('')
      setTransferAmount('')
      setTransferDocumentNumber('')
      setMixedCashAmount('')
      setMixedTransferAmount('')
      setMixedTransferDoc('')
      toast.success('¡Venta completada!')
    } catch (err: any) {
      toast.error(err?.message ?? 'Error al procesar la venta')
    } finally {
      setSaving(false)
    }
  }

  const handleCompleteSale = async () => {
    if (cartItems.length === 0) { toast.error('El carrito está vacío'); return }
    if (saleType === 'CREDIT' && !selectedCustomer) { toast.error('Selecciona un cliente para venta a crédito'); return }
    if (paymentMethod === 'CASH' && saleType !== 'CREDIT') {
      if (!cashReceived || parseFloat(cashReceived) < total) { toast.error('Ingresa el efectivo recibido'); return }
    }
    if (paymentMethod === 'MIXED' && saleType !== 'CREDIT') {
      const sum = parseFloat(mixedCashAmount || '0') + parseFloat(mixedTransferAmount || '0')
      if (sum < total - 0.01) { toast.error('El monto mixto no cubre el total'); return }
    }

    // Check inventory availability
    if (BRANCH_ID) {
      const issues: { name: string; available: number; requested: number }[] = []
      await Promise.all(cartItems.map(async (item) => {
        try {
          const productId = item.variation && !item.variation.id.endsWith('-default')
            ? item.variation.productId
            : item.product.id
          const inv = await api.get<{ quantity: number }>(`/api/inventory/${productId}/${BRANCH_ID}`)
          const available = Number(inv?.quantity ?? 0)
          if (available < item.quantity) {
            const name = item.product.name + (item.variation && !item.variation.id.endsWith('-default') ? ` (${item.variation.name})` : '')
            issues.push({ name, available, requested: item.quantity })
          }
        } catch { /* no inventory record = allow sale */ }
      }))

      if (issues.length > 0) {
        setStockIssues(issues)
        setShowStockWarning(true)
        return
      }
    }

    await completeSaleRequest()
  }

  const paymentMethodLabel: Record<PaymentMethodType, string> = {
    CASH: 'Efectivo',
    CARD: 'Tarjeta',
    TRANSFER: 'Transferencia',
    MIXED: 'Mixto',
    CREDIT: 'Crédito',
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3 md:h-[calc(100vh-7rem)]">

      {/* ── Register selector ── */}
      {openRegisters.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm px-4 py-2 flex items-center gap-3">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">Caja activa:</span>
          {openRegisters.length === 1 ? (
            <span className="text-sm font-medium text-primary-700">{openRegisters[0].name} #{openRegisters[0].registerNumber}</span>
          ) : (
            <select
              value={selectedRegisterId}
              onChange={e => handleRegisterChange(e.target.value)}
              className="input text-sm py-1 flex-1 max-w-xs"
            >
              <option value="">Sin caja seleccionada</option>
              {openRegisters.map(r => (
                <option key={r.id} value={r.id}>{r.name} #{r.registerNumber}</option>
              ))}
            </select>
          )}
          {!selectedRegisterId && openRegisters.length > 0 && (
            <span className="text-xs text-orange-500">Selecciona una caja para registrar las ventas</span>
          )}
        </div>
      )}

      {/* ── Search bar ── */}
      <div className="bg-white rounded-lg shadow-sm px-4 py-3 flex items-center gap-3 relative">
        <Barcode size={20} className="text-gray-400 flex-shrink-0" />
        <div className="relative flex-1">
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            onKeyDown={handleBarcodeScan}
            onBlur={() => setTimeout(() => setShowSearchResults(false), 150)}
            onFocus={() => searchTerm.length > 0 && setShowSearchResults(true)}
            placeholder="Escanear código de barras o buscar producto por nombre..."
            className="input w-full pr-8"
            autoFocus
          />
          {searchTerm && (
            <button onClick={() => { setSearchTerm(''); setShowSearchResults(false) }}
              className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          )}
          {/* Dropdown results */}
          {showSearchResults && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-30 overflow-hidden">
              {searchResults.map(product => {
                const variations = getVariations(product)
                return (
                  <button
                    key={product.id}
                    onMouseDown={() => handleAddProduct(product)}
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-primary-50 text-left border-b border-gray-50 last:border-0 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-800">{product.name}</p>
                      <p className="text-xs text-gray-400">
                        {product.barcode ?? product.sku ?? ''} · {product.category?.name ?? product.categoryName ?? ''}
                      </p>
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-sm font-bold text-primary-600">Q{Number(product.basePrice).toFixed(2)}</p>
                      {variations.length > 1 && (
                        <p className="text-xs text-gray-400">{variations.length} variantes</p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
          {showSearchResults && searchTerm.length > 0 && searchResults.length === 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-30 px-4 py-3">
              <p className="text-sm text-gray-400 text-center">Sin resultados para "{searchTerm}"</p>
            </div>
          )}
        </div>
        {cartItems.length > 0 && (
          <button onClick={clearCart}
            className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 px-3 py-2 rounded-lg hover:bg-red-50 transition-colors flex-shrink-0">
            <Trash2 size={16} /> Limpiar
          </button>
        )}
      </div>

      {/* ── Main split layout ── */}
      <div className="flex flex-col md:flex-row gap-3 flex-1 overflow-auto md:overflow-hidden md:min-h-0">

        {/* Left: Cart items table */}
        <div className="flex-1 bg-white rounded-lg shadow-sm flex flex-col overflow-hidden min-h-[280px] md:min-h-0">
          {/* Table header */}
          <div className="grid gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide select-none min-w-[540px]"
            style={{ gridTemplateColumns: '24px 1fr 90px 140px 110px 90px 28px' }}>
            <span>#</span>
            <span>Artículo</span>
            <span className="text-right">Precio</span>
            <span className="text-center">Cantidad</span>
            <span className="text-center">% Desc.</span>
            <span className="text-right">Total</span>
            <span></span>
          </div>

          {/* Items */}
          <div className="flex-1 overflow-y-auto overflow-x-auto">
            {cartItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-300">
                <ShoppingCart size={52} />
                <p className="text-sm">Busca o escanea un producto para comenzar</p>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {cartItems.map((item, idx) => {
                  const key = getItemKey(item.product.id, item.variation?.id)
                  const price = item.variation ? item.variation.price : item.product.basePrice
                  const disc = itemDiscounts[key] || 0
                  const lineTotal = getLineTotal(item)
                  return (
                    <motion.div
                      key={key}
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                      className="grid gap-2 px-4 py-2.5 items-center border-b border-gray-50 hover:bg-gray-50 transition-colors min-w-[540px]"
                      style={{ gridTemplateColumns: '24px 1fr 90px 140px 110px 90px 28px' }}
                    >
                      <span className="text-xs text-gray-400">{idx + 1}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{item.product.name}</p>
                        <div className="flex items-center gap-1">
                          {item.variation && (
                            <p className="text-xs text-gray-400">{item.variation.name}</p>
                          )}
                          {getVariations(item.product).length > 1 && (
                            <button
                              onClick={() => handleChangeVariation(item)}
                              title="Cambiar variación"
                              className="text-primary-400 hover:text-primary-600 transition-colors">
                              <ArrowLeftRight size={11} />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-right text-sm text-gray-600">Q{Number(price).toFixed(2)}</p>
                      {/* Quantity control */}
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => {
                            const newQty = Math.max(0.001, item.quantity - 1)
                            updateQuantity(item.product.id, item.variation?.id, newQty)
                            setItemQtyStrings(prev => { const n = { ...prev }; delete n[key]; return n })
                          }}
                          className="w-6 h-6 flex items-center justify-center hover:bg-gray-200 rounded transition-colors">
                          <Minus size={13} />
                        </button>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={itemQtyStrings[key] ?? String(item.quantity)}
                          onChange={e => setItemQtyStrings(prev => ({ ...prev, [key]: e.target.value }))}
                          onBlur={() => {
                            const str = itemQtyStrings[key]
                            if (str !== undefined) {
                              const n = parseFloat(str)
                              if (!isNaN(n) && n > 0) updateQuantity(item.product.id, item.variation?.id, n)
                              setItemQtyStrings(prev => { const next = { ...prev }; delete next[key]; return next })
                            }
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                          }}
                          className="w-14 text-center text-sm border border-gray-200 rounded py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                        <button
                          onClick={() => {
                            updateQuantity(item.product.id, item.variation?.id, item.quantity + 1)
                            setItemQtyStrings(prev => { const n = { ...prev }; delete n[key]; return n })
                          }}
                          className="w-6 h-6 flex items-center justify-center hover:bg-gray-200 rounded transition-colors">
                          <Plus size={13} />
                        </button>
                      </div>
                      {/* Discount */}
                      <div className="flex items-center justify-center gap-1">
                        <input
                          type="number"
                          value={disc || ''}
                          onChange={e => setItemDiscounts(prev => ({
                            ...prev,
                            [key]: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0))
                          }))}
                          placeholder="0"
                          className="w-14 text-center text-sm border border-gray-200 rounded py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-500"
                          min="0" max="100"
                        />
                        <span className="text-gray-400 text-xs">%</span>
                      </div>
                      <p className="text-right text-sm font-semibold text-gray-800">Q{lineTotal.toFixed(2)}</p>
                      <button
                        onClick={() => removeItem(item.product.id, item.variation?.id)}
                        className="text-gray-300 hover:text-red-500 transition-colors">
                        <X size={16} />
                      </button>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            )}
          </div>

          {/* Footer total row */}
          {cartItems.length > 0 && (
            <div className="border-t border-gray-200 px-4 py-2.5 flex justify-between items-center bg-gray-50">
              <span className="text-sm text-gray-500">{itemCount} artículo(s)</span>
              <span className="text-sm font-semibold text-gray-700">
                Subtotal: <span className="text-primary-600">Q{subtotal.toFixed(2)}</span>
              </span>
            </div>
          )}
        </div>

        {/* Right: Checkout panel */}
        <div className="w-full md:w-72 flex flex-col gap-3 overflow-y-auto">

          {/* Customer */}
          <div className="bg-white rounded-lg shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Cliente</p>
            {selectedCustomer ? (
              <div className="bg-primary-50 border border-primary-200 rounded-lg px-3 py-2">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 truncate">{getCustomerName(selectedCustomer)}</p>
                    <p className="text-xs text-gray-500">NIT: {getCustomerNit(selectedCustomer)}</p>
                    {(selectedCustomer.creditLimit ?? 0) > 0 && (
                      <p className="text-xs text-green-600">Crédito: Q{(selectedCustomer.creditAvailable ?? 0).toFixed(2)}</p>
                    )}
                  </div>
                  <div className="flex gap-1 ml-2 flex-shrink-0">
                    <button onClick={() => openCustomerHistory(selectedCustomer)} title="Ver historial" className="p-1 text-gray-400 hover:text-blue-600 transition-colors">
                      <History size={13} />
                    </button>
                    <button onClick={() => { setSelectedCustomer(null); setSaleType('CASH') }} title="Quitar cliente" className="p-1 text-gray-400 hover:text-red-500 transition-colors">
                      <X size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={customerSearch}
                  onChange={e => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true) }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 150)}
                  placeholder="Buscar cliente por nombre o NIT..."
                  className="input w-full pl-8 text-sm py-2"
                />
                {showCustomerDropdown && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-52 overflow-y-auto">
                    {filteredCustomers.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-gray-400">{customerSearch ? 'Sin resultados' : 'Escribe para buscar...'}</p>
                    ) : (
                      filteredCustomers.slice(0, 8).map(customer => (
                        <button key={customer.id} onMouseDown={() => handleSelectCustomer(customer)}
                          className="w-full text-left px-3 py-2 hover:bg-primary-50 transition-colors border-b border-gray-50 last:border-0">
                          <p className="text-sm font-medium text-gray-800">{getCustomerName(customer)}</p>
                          <p className="text-xs text-gray-400">NIT: {getCustomerNit(customer)}{(customer.creditLimit ?? 0) > 0 ? ` · Créd: Q${(customer.creditAvailable ?? 0).toFixed(2)}` : ''}</p>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sale type + Payment method */}
          <div className="bg-white rounded-lg shadow-sm p-4 space-y-3">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Tipo de venta</p>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => setSaleType('CASH')}
                  className={`py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                    saleType === 'CASH' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>
                  <DollarSign size={14} /> Contado
                </button>
                <button
                  onClick={() => canSellOnCredit && setSaleType('CREDIT')}
                  disabled={!canSellOnCredit}
                  className={`py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                    saleType === 'CREDIT' ? 'bg-blue-600 text-white'
                    : canSellOnCredit ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    : 'bg-gray-50 text-gray-300 cursor-not-allowed'
                  }`}>
                  <Calendar size={14} /> Crédito
                </button>
              </div>
            </div>

            {saleType === 'CASH' && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Método de pago</p>
                <div className="grid grid-cols-2 gap-1">
                  {([
                    { m: 'CASH' as PaymentMethodType, label: 'Efectivo', Icon: DollarSign },
                    { m: 'CARD' as PaymentMethodType, label: 'Tarjeta', Icon: CreditCard },
                    { m: 'TRANSFER' as PaymentMethodType, label: 'Transfer.', Icon: Receipt },
                    { m: 'MIXED' as PaymentMethodType, label: 'Mixto', Icon: ArrowLeftRight },
                  ] as const).map(({ m, label, Icon }) => (
                    <button
                      key={m}
                      onClick={() => setPaymentMethod(m)}
                      className={`py-2.5 rounded-lg text-xs font-medium flex flex-col items-center gap-0.5 transition-all ${
                        paymentMethod === m ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}>
                      <Icon size={15} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Totals */}
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>Subtotal</span>
              <span>Q{subtotal.toFixed(2)}</span>
            </div>
            <div className="border-t border-gray-100 mt-2 pt-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700">Total</span>
                <span className="text-2xl font-bold text-primary-600">Q{total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Cash received */}
          {saleType === 'CASH' && paymentMethod === 'CASH' && (
            <div className="bg-white rounded-lg shadow-sm p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Efectivo recibido</p>
              <input
                type="number"
                value={cashReceived}
                onChange={e => setCashReceived(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && canComplete && handleCompleteSale()}
                placeholder="Q 0.00"
                className="input w-full text-center text-lg font-bold"
                min="0"
                step="0.01"
              />
              {change !== null && (
                <div className="mt-2 flex justify-between text-sm">
                  <span className="text-gray-500">Cambio:</span>
                  <span className="font-bold text-green-600">Q{change.toFixed(2)}</span>
                </div>
              )}
            </div>
          )}

          {/* Transfer document number */}
          {saleType === 'CASH' && paymentMethod === 'TRANSFER' && (
            <div className="bg-white rounded-lg shadow-sm p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Referencia transferencia</p>
              <input
                type="text"
                value={transferDocumentNumber}
                onChange={e => setTransferDocumentNumber(e.target.value)}
                placeholder="No. de documento / referencia"
                className="input w-full text-sm"
              />
            </div>
          )}

          {/* Mixed payment amounts */}
          {saleType === 'CASH' && paymentMethod === 'MIXED' && (
            <div className="bg-white rounded-lg shadow-sm p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Pago mixto</p>
              <div className="flex items-center gap-2">
                <DollarSign size={14} className="text-gray-400" />
                <input type="number" value={mixedCashAmount} onChange={e => setMixedCashAmount(e.target.value)} placeholder="Efectivo" className="input flex-1 text-sm" min="0" step="0.01" />
              </div>
              <div className="flex items-center gap-2">
                <Receipt size={14} className="text-gray-400" />
                <input type="number" value={mixedTransferAmount} onChange={e => setMixedTransferAmount(e.target.value)} placeholder="Transferencia" className="input flex-1 text-sm" min="0" step="0.01" />
              </div>
              <input type="text" value={mixedTransferDoc} onChange={e => setMixedTransferDoc(e.target.value)} placeholder="Referencia transferencia" className="input w-full text-sm" />
              {(() => {
                const sum = parseFloat(mixedCashAmount || '0') + parseFloat(mixedTransferAmount || '0')
                const rem = sum - total
                return sum > 0 ? (
                  <div className={`flex justify-between text-xs font-medium ${rem >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    <span>{rem >= 0 ? 'Cambio:' : 'Faltante:'}</span>
                    <span>Q{Math.abs(rem).toFixed(2)}</span>
                  </div>
                ) : null
              })()}
            </div>
          )}

          {/* Credit info */}
          {saleType === 'CREDIT' && selectedCustomer && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-blue-700 mb-1">Venta a crédito</p>
              <div className="flex justify-between text-xs text-blue-600">
                <span>Crédito disponible:</span>
                <span className="font-bold">Q{(selectedCustomer.creditAvailable ?? 0).toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Cobrar button */}
          <button
            onClick={handleCompleteSale}
            disabled={!canComplete}
            className={`w-full py-4 rounded-xl text-white font-bold text-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm flex items-center justify-center gap-2 ${
              saleType === 'CREDIT' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-primary-600 hover:bg-primary-700'
            }`}
          >
            {saving && <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />}
            {saving ? 'Procesando...' : saleType === 'CREDIT' ? 'Vender a Crédito' : `Cobrar Q${total.toFixed(2)}`}
          </button>

          <button
            onClick={() => window.print()}
            className="w-full btn-outline btn-md flex items-center justify-center gap-2"
          >
            <Printer size={16} /> Imprimir última venta
          </button>
        </div>
      </div>

      {/* ── Variation modal ── */}
      <AnimatePresence>
        {showVariationModal && selectedProductForVariation && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={() => { setShowVariationModal(false); setSelectedProductForVariation(null) }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-lg p-6 max-w-md w-full"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-800">Seleccionar presentación</h3>
                  <p className="text-sm text-gray-500">{selectedProductForVariation.name}</p>
                </div>
                <button onClick={() => { setShowVariationModal(false); setSelectedProductForVariation(null) }}
                  className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
              </div>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {getVariations(selectedProductForVariation).map(variation => {
                  const qty = variationQuantities[variation.id] || 1
                  return (
                    <div key={variation.id}
                      className="p-3 border border-gray-200 rounded-lg hover:border-primary-400 hover:bg-primary-50 transition-all">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-gray-800 text-sm">{variation.name}</p>
                            {variation.isDefault && (
                              <span className="text-xs bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded">Default</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500">Factor: ×{variation.conversionFactor}</p>
                        </div>
                        <p className="text-lg font-bold text-primary-600">Q{variation.price.toFixed(2)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center border border-gray-300 rounded-lg">
                          <button onClick={() => setVariationQuantities(p => ({ ...p, [variation.id]: Math.max(1, qty - 1) }))}
                            className="px-2 py-1 hover:bg-gray-100"><Minus size={14} /></button>
                          <input type="number" value={qty}
                            onChange={e => setVariationQuantities(p => ({ ...p, [variation.id]: Math.max(1, parseInt(e.target.value) || 1) }))}
                            className="w-12 text-center border-x border-gray-300 py-1 focus:outline-none text-sm" min="1" />
                          <button onClick={() => setVariationQuantities(p => ({ ...p, [variation.id]: qty + 1 }))}
                            className="px-2 py-1 hover:bg-gray-100"><Plus size={14} /></button>
                        </div>
                        <button
                          onClick={() => handleAddVariationToCart(variation, qty)}
                          className="flex-1 btn-primary btn-sm flex items-center justify-center gap-1">
                          <ShoppingCart size={14} />
                          Agregar Q{(variation.price * qty).toFixed(2)}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Customer modal ── */}
      <AnimatePresence>
        {showCustomerModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={() => setShowCustomerModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-lg p-6 max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <User size={20} /> Seleccionar Cliente
                </h3>
                <button onClick={() => setShowCustomerModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={20} />
                </button>
              </div>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
                <input
                  type="text"
                  value={customerSearch}
                  onChange={e => setCustomerSearch(e.target.value)}
                  placeholder="Buscar por nombre o NIT..."
                  className="input pl-10 w-full"
                  autoFocus
                />
              </div>
              {loadingCustomers ? (
                <div className="flex justify-center py-6">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto space-y-2">
                  {filteredCustomers.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">Sin clientes encontrados</p>
                  ) : (
                    filteredCustomers.map(customer => (
                      <button key={customer.id} onClick={() => handleSelectCustomer(customer)}
                        className="w-full p-3 bg-gray-50 hover:bg-primary-50 hover:border-primary-300 border border-transparent rounded-lg transition-colors text-left">
                        <div className="flex justify-between items-start">
                          <p className="font-medium text-gray-800 text-sm">{getCustomerName(customer)}</p>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">NIT: {getCustomerNit(customer)}</p>
                        {(customer.creditLimit ?? 0) > 0 && (
                          <p className="text-xs text-green-600 mt-0.5">
                            Crédito disponible: Q{(customer.creditAvailable ?? 0).toFixed(2)}
                          </p>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
              <button onClick={() => setShowCustomerModal(false)} className="btn-outline btn-md w-full mt-4">
                Cancelar
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Customer history modal ── */}
      {showCustomerHistory && selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCustomerHistory(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0">
              <div>
                <h3 className="font-semibold text-gray-800">{getCustomerName(selectedCustomer)}</h3>
                <p className="text-xs text-gray-400">NIT: {getCustomerNit(selectedCustomer)}</p>
              </div>
              <button onClick={() => setShowCustomerHistory(false)} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {loadingCustomerSales ? (
                <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>
              ) : customerSales.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">Sin compras registradas</p>
              ) : (
                <div className="space-y-2">
                  {customerSales.map((sale: any) => {
                    const PM: Record<string, string> = { CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia', CREDIT: 'Crédito', MIXED: 'Mixto' }
                    const label = sale.saleType === 'CREDIT' ? 'Crédito' : (PM[sale.paymentMethod] ?? sale.paymentMethod)
                    return (
                      <div
                        key={sale.id}
                        onClick={() => { setShowCustomerHistory(false); navigate(`/reports/sales/${sale.id}`) }}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${sale.isVoided ? 'opacity-50 border-red-200 bg-red-50 hover:bg-red-100' : 'border-gray-100 bg-gray-50 hover:bg-primary-50 hover:border-primary-200'}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-mono text-xs text-gray-600">{sale.invoiceNumber}</p>
                            <p className="text-xs text-gray-400">{format(new Date(sale.createdAt), 'dd/MM/yyyy HH:mm', { locale: es })}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <div className="text-right">
                              <p className="font-bold text-gray-800">Q{Number(sale.total).toFixed(2)}</p>
                              <p className="text-xs text-gray-400">{label}</p>
                            </div>
                            <ExternalLink size={14} className="text-primary-400" />
                          </div>
                        </div>
                        {sale.isVoided && <p className="text-xs text-red-500 mt-1">ANULADA</p>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Stock Warning Modal ── */}
      <AnimatePresence>
        {showStockWarning && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-lg p-6 max-w-md w-full"
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="p-2 bg-orange-100 rounded-lg flex-shrink-0">
                  <AlertCircle size={24} className="text-orange-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-800">Stock insuficiente</h3>
                  <p className="text-sm text-gray-600 mt-1">Los siguientes productos no tienen suficiente stock en esta sucursal:</p>
                </div>
              </div>
              <div className="space-y-2 mb-6">
                {stockIssues.map((issue, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-orange-50 rounded-lg text-sm">
                    <span className="font-medium text-gray-800 truncate flex-1">{issue.name}</span>
                    <div className="text-right ml-3 flex-shrink-0">
                      <span className="text-orange-700 font-semibold">Disponible: {issue.available}</span>
                      <span className="text-gray-500 ml-2">/ Pedido: {issue.requested}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowStockWarning(false)}
                  className="btn-outline btn-md flex-1"
                >
                  Revisar carrito
                </button>
                <button
                  onClick={() => { setShowStockWarning(false); completeSaleRequest() }}
                  className="btn-primary btn-md flex-1"
                >
                  Vender de todas formas
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Receipt modal ── */}
      <AnimatePresence>
        {showReceiptModal && completedSale && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-lg p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div id="receipt-content">
                <div className="text-center mb-4 pb-4 border-b-2 border-gray-200">
                  <h2 className="text-2xl font-bold text-gray-800">DENGO POS</h2>
                  <p className="text-sm text-gray-500">{completedSale.branchName}</p>
                  {selectedRegisterId && openRegisters.length > 0 && (() => {
                    const reg = openRegisters.find(r => r.id === selectedRegisterId)
                    return reg ? <p className="text-xs text-gray-400">{reg.name} #{reg.registerNumber}</p> : null
                  })()}
                </div>
                <div className="mb-4 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-gray-500">Factura:</p>
                    <p className="font-bold">{completedSale.invoiceNumber}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-500">Fecha:</p>
                    <p className="font-medium text-xs">
                      {new Date(completedSale.createdAt).toLocaleString('es-GT', { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  </div>
                </div>
                {completedSale.customerName && (
                  <div className="mb-3 p-2 bg-gray-50 rounded text-sm">
                    <p className="font-medium">{completedSale.customerName}</p>
                    <p className="text-gray-500 text-xs">NIT: {completedSale.customerNit}</p>
                  </div>
                )}
                <table className="w-full text-sm mb-4">
                  <thead className="border-b-2 border-gray-200">
                    <tr className="text-left text-xs text-gray-500">
                      <th className="py-2">Producto</th>
                      <th className="py-2 text-center">Cant.</th>
                      <th className="py-2 text-right">Precio</th>
                      <th className="py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completedSale.items.map(item => (
                      <tr key={item.id} className="border-b border-gray-100">
                        <td className="py-2">
                          <p className="font-medium">{item.productName}</p>
                          {item.variationName && item.variationName !== 'Pieza' && (
                            <p className="text-xs text-gray-400">({item.variationName})</p>
                          )}
                          {item.discount > 0 && (
                            <p className="text-xs text-orange-500">-{item.discount}% desc.</p>
                          )}
                        </td>
                        <td className="py-2 text-center">{item.quantity}</td>
                        <td className="py-2 text-right">Q{item.unitPrice.toFixed(2)}</td>
                        <td className="py-2 text-right font-medium">Q{item.total.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="pt-3 border-t-2 border-gray-200 space-y-1.5 mb-4">
                  <div className="flex justify-between font-bold text-lg">
                    <span>TOTAL:</span>
                    <span className="text-primary-600">Q{completedSale.total.toFixed(2)}</span>
                  </div>
                  <div className="text-xs text-gray-500 space-y-1">
                    <div className="flex justify-between">
                      <span>Método:</span>
                      <span className="font-medium">{paymentMethodLabel[completedSale.paymentMethod]}</span>
                    </div>
                    {completedSale.paymentMethod === 'CASH' && lastCashReceived && (
                      <>
                        <div className="flex justify-between">
                          <span>Efectivo:</span>
                          <span>Q{parseFloat(lastCashReceived).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between font-bold text-green-600">
                          <span>Cambio:</span>
                          <span>Q{(parseFloat(lastCashReceived) - completedSale.total).toFixed(2)}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <p className="text-center text-xs text-gray-400">¡Gracias por su compra!</p>
              </div>
              <div className="flex gap-3 mt-5 pt-4 border-t">
                <button
                  onClick={() => { setShowReceiptModal(false); setCompletedSale(null); setLastCashReceived('') }}
                  className="flex-1 btn-outline btn-md">
                  Nueva Venta
                </button>
                <button onClick={() => window.print()} className="flex-1 btn-primary btn-md flex items-center justify-center gap-2">
                  <Printer size={16} /> Imprimir
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
