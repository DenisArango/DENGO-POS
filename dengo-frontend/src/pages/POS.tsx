import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Trash2, Plus, Minus, X, DollarSign, CreditCard,
  UserPlus, User, Barcode, ShoppingCart, Printer,
  Calendar, AlertCircle, Receipt, ArrowLeftRight, Edit2, History, ExternalLink, Wallet
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useAuthStore } from '../store'
import { api, ApiError } from '../lib/api'
import { toast } from 'sonner'
import { useStore } from '../contexts/StoreContext'
import { usePermissions } from '../hooks/usePermissions'
import ThermalReceipt from '../components/print/ThermalReceipt'
import SalesGoalWidget from '../components/SalesGoalWidget'
import { queuePendingSale, setCache, getCache, addSaleToRegisterTally } from '../lib/offlineDb'
import { trySync, refreshPendingCount, getLocallyClosingRegisterIds } from '../lib/offlineSync'
import { getAdjustmentReasons, type AdjustmentReason } from '../lib/inventoryReasons'

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
  comments?: string
  creditEnabled?: boolean
  creditLimitEnabled?: boolean
  creditLimit?: number
  creditUsed?: number
  creditAvailable?: number | null // null = crédito sin límite
  creditUsedPercent?: number
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
  requiresInvoice?: boolean
  invoiceSeries?: string | null
  invoiceSeqNumber?: number | null
  buyerNit?: string | null
  buyerName?: string | null
  felStatus?: string | null
  pendingSync?: boolean
  cardReference?: string | null
  transferReference?: string | null
  // Set only on the offline-queued path — the same clientRequestId the sale
  // is queued and later synced under, so a receipt printed before syncing
  // can still be traced to its real correlativo (search sales by this ref).
  offlineRef?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCustomerName(c: CustomerRecord): string {
  return c.fullName ?? c.name ?? 'Cliente'
}

function getCustomerNit(c: CustomerRecord): string {
  return c.nit ?? 'CF'
}

function creditHint(c: CustomerRecord): string {
  if (!c.creditEnabled) return ''
  return ` · Créd: ${c.creditAvailable === null ? 'Ilimitado' : `Q${(c.creditAvailable ?? 0).toFixed(2)}`}`
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
  const { hasPermission } = usePermissions()
  const canCreateCustomer = hasPermission('customers.create')
  const canEditCustomer = hasPermission('customers.edit')

  // Active cash register — the choice is required before any sale and is
  // remembered only for the current calendar day (a new day always forces a
  // fresh pick), scoped per branch since a cashier can switch stores.
  const todayKey = new Date().toISOString().slice(0, 10)
  const registerStorageKey = `pos-register-${BRANCH_ID}-${todayKey}`

  const [openRegisters, setOpenRegisters] = useState<{ id: string; name: string; registerNumber: string }[]>([])
  const [selectedRegisterId, setSelectedRegisterId] = useState<string>('')
  const [showRegisterPanel, setShowRegisterPanel] = useState(false)
  const [registersLoaded, setRegistersLoaded] = useState(false)

  useEffect(() => {
    if (!BRANCH_ID) return
    setRegistersLoaded(false)
    const registerCacheKey = `registers-${BRANCH_ID}`
    api.get<any[]>(`/api/cash-registers/current?branchId=${BRANCH_ID}`)
      .then(async d => {
        // The server doesn't know about a close still sitting in the offline
        // queue (see CashRegister.tsx) — drop it here too, so a register
        // closed offline doesn't stay selectable for new sales.
        const closingIds = await getLocallyClosingRegisterIds()
        const rawOpens = (Array.isArray(d) ? d : (d ? [d] : [])).filter(Boolean)
        const list = rawOpens.filter(r => !closingIds.has(r.id))
          .map(r => ({ id: r.id, name: r.name ?? 'Caja', registerNumber: r.registerNumber ?? '?' }))
        setOpenRegisters(list)
        setCache(registerCacheKey, list)
        // Also feed CashRegister.tsx's own cache (it needs the full record —
        // initialAmount, movements, sales — not just this page's id/name/
        // registerNumber) under the SAME key it writes on its own successful
        // fetches. POS.tsx is visited far more than Caja, so without this,
        // a cashier who goes offline having never happened to open Caja
        // this session finds it empty there even though it was open the
        // whole time — exactly what "ya estaba en esa pantalla" was
        // masking: it only worked because Caja itself had already fetched.
        setCache(`registers-full-${BRANCH_ID}`, rawOpens)
        const saved = localStorage.getItem(registerStorageKey)
        if (saved && list.some(r => r.id === saved)) {
          setSelectedRegisterId(saved)
        } else {
          setSelectedRegisterId('')
          if (list.length > 0) setShowRegisterPanel(true)
        }
      })
      .catch(async () => {
        // Server unreachable — reuse whatever register list was last seen so
        // a shift already in progress isn't blocked from selling.
        const closingIds = await getLocallyClosingRegisterIds()
        const cachedAll = await getCache<{ id: string; name: string; registerNumber: string }[]>(registerCacheKey)
        const cached = cachedAll?.filter(r => !closingIds.has(r.id))
        if (cached) {
          setOpenRegisters(cached)
          const saved = localStorage.getItem(registerStorageKey)
          if (saved && cached.some(r => r.id === saved)) setSelectedRegisterId(saved)
        }
      })
      .finally(() => setRegistersLoaded(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [BRANCH_ID])

  const handleRegisterChange = (id: string) => {
    setSelectedRegisterId(id)
    localStorage.setItem(registerStorageKey, id)
    setShowRegisterPanel(false)
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

  // Quick add/edit customer (inline, without leaving the sale)
  const [showQuickCustomerModal, setShowQuickCustomerModal] = useState(false)
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null)
  const [quickCustomerForm, setQuickCustomerForm] = useState({ name: '', nit: '', phone: '', email: '', creditEnabled: false, creditLimitEnabled: true, creditLimit: '' })
  const [savingQuickCustomer, setSavingQuickCustomer] = useState(false)
  const [loadingCustomerSales, setLoadingCustomerSales] = useState(false)

  // Cart
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecord | null>(null)
  const [saleType, setSaleType] = useState<SaleTypeValue>('CASH')
  const [itemDiscounts, setItemDiscounts] = useState<Record<string, number>>({})
  const [bulkDiscountInput, setBulkDiscountInput] = useState('')

  // Variation modal — used both for initial add and for changing variation of cart item
  const [showVariationModal, setShowVariationModal] = useState(false)
  const [selectedProductForVariation, setSelectedProductForVariation] = useState<ProductRecord | null>(null)
  const [variationQuantities, setVariationQuantities] = useState<Record<string, number>>({})
  const [changingVariationItem, setChangingVariationItem] = useState<CartItem | null>(null) // non-null = changing existing item

  // Out-of-stock gate at add time — see ensureStockAvailable(). Non-null
  // while the "adjust inventory now?" prompt is open for a cashier with
  // inventory.adjust; resolve(true/false) unblocks whichever add() is waiting.
  const [stockPrompt, setStockPrompt] = useState<{
    product: ProductRecord; variation: ProductVariation; requestedQty: number; available: number
    resolve: (proceed: boolean) => void
  } | null>(null)
  const [stockPromptNewStock, setStockPromptNewStock] = useState('')
  const [stockPromptReason, setStockPromptReason] = useState('')
  const [savingStockPrompt, setSavingStockPrompt] = useState(false)
  // This prompt only ever fires to cover a shortfall — always an increase —
  // so only UP-direction reasons ever apply here (see lib/inventoryReasons.ts).
  const [stockPromptReasonOptions, setStockPromptReasonOptions] = useState<AdjustmentReason[]>([])
  useEffect(() => { getAdjustmentReasons('UP').then(setStockPromptReasonOptions) }, [])

  // Payment
  const [enabledPaymentMethods, setEnabledPaymentMethods] = useState<Set<string>>(new Set(['CASH', 'CARD', 'TRANSFER']))
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>('CASH')
  const [cashReceived, setCashReceived] = useState('')
  const [transferDocumentNumber, setTransferDocumentNumber] = useState('')
  const [cardReference, setCardReference] = useState('')
  const [mixedCashAmount, setMixedCashAmount] = useState('')
  const [mixedTransferAmount, setMixedTransferAmount] = useState('')
  const [mixedTransferDoc, setMixedTransferDoc] = useState('')

  // Factura — discrecional, apagado por defecto (solo recibo)
  const [wantsInvoice, setWantsInvoice] = useState(false)
  const [invoiceBuyerNit, setInvoiceBuyerNit] = useState('')
  const [invoiceBuyerName, setInvoiceBuyerName] = useState('')

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
    fetchEnabledPaymentMethods()
    loadProductCatalogCache()
  }, [])

  // Full active-product snapshot, refreshed whenever it's reachable — the
  // fallback performSearch/handleBarcodeScan read from when the live search
  // endpoint can't be reached.
  async function loadProductCatalogCache() {
    try {
      const data = await api.get<ProductRecord[]>('/api/products?isActive=true')
      await setCache('products', data ?? [])
    } catch {
      // No network yet — whatever was cached from a previous session stays in place
    }
  }

  // Auto-select the branch's default customer so a sale never starts with no
  // customer chosen. Only applies while nothing has been picked yet — it
  // never overrides a customer the cashier already selected.
  useEffect(() => {
    if (selectedCustomer || !currentStore?.defaultCustomerId || customers.length === 0) return
    const defaultCustomer = customers.find(c => c.id === currentStore.defaultCustomerId)
    if (defaultCustomer) setSelectedCustomer(defaultCustomer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, currentStore?.defaultCustomerId])

  async function fetchEnabledPaymentMethods() {
    try {
      const data = await api.get<{ method: string; enabled: boolean }[]>('/api/settings/payment-methods')
      setEnabledPaymentMethods(new Set(data.filter(m => m.enabled).map(m => m.method)))
    } catch {
      // Non-critical; keep the CASH/CARD/TRANSFER default so checkout still works
    }
  }

  async function fetchCustomers() {
    setLoadingCustomers(true)
    try {
      const data = await api.get<CustomerRecord[]>('/api/customers')
      setCustomers(data ?? [])
      setCache('customers', data ?? [])
    } catch {
      // Offline or server down — fall back to the last successful load so
      // checkout can still pick a customer.
      const cached = await getCache<CustomerRecord[]>('customers')
      if (cached) setCustomers(cached)
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
      // Server unreachable — search the last cached catalog snapshot instead
      const cached = await getCache<ProductRecord[]>('products')
      const q = query.toLowerCase()
      const results = (cached ?? [])
        .filter(p => p.isActive !== false && (
          p.name?.toLowerCase().includes(q) ||
          p.barcode?.toLowerCase().includes(q) ||
          p.sku?.toLowerCase().includes(q)
        ))
        .slice(0, 8)
        .map(normaliseProduct)
      setSearchResults(results)
      setShowSearchResults(results.length > 0 || query.length > 0)
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

  const canSellOnCredit = !!selectedCustomer && !!selectedCustomer.creditEnabled &&
    (selectedCustomer.creditAvailable === null || (selectedCustomer.creditAvailable ?? 0) > 0)

  const canComplete = cartItems.length > 0 && !saving &&
    !!selectedCustomer &&
    !!selectedRegisterId &&
    (!wantsInvoice || invoiceBuyerNit.trim().length > 0) &&
    (
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

  // Same stock gate as adding a new item, but for raising the quantity of a
  // line already in the cart (the "+" stepper and typing a quantity by
  // hand) — lowering never needs a check. ensureStockAvailable adds
  // `additionalQty` on top of whatever's already in the cart for this line,
  // so passing (newQty - item.quantity) makes it evaluate the same absolute
  // target this call is trying to reach.
  async function changeQuantity(item: CartItem, newQty: number) {
    if (newQty <= item.quantity || !item.variation) {
      updateQuantity(item.product.id, item.variation?.id, newQty)
      return
    }
    if (!(await ensureStockAvailable(item.product, item.variation, newQty - item.quantity))) return
    updateQuantity(item.product.id, item.variation.id, newQty)
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

  // Applies one % to every current cart line's own discount field instead of
  // subtracting from the grand total — the client sells some seasonal items
  // already priced with a discount baked in, and those need to stay excluded.
  // Applying it here (same field the per-line % input writes to) means the
  // cashier can bulk-apply, then clear it back to 0 on just the excluded rows.
  function applyDiscountToAll() {
    const pct = Math.min(100, Math.max(0, parseFloat(bulkDiscountInput) || 0))
    if (cartItems.length === 0) return
    setItemDiscounts(prev => {
      const next = { ...prev }
      cartItems.forEach(item => { next[getItemKey(item.product.id, item.variation?.id)] = pct })
      return next
    })
    toast.success(`${pct}% aplicado a ${cartItems.length} artículo(s) — puedes quitarlo de uno en particular en su fila`)
  }

  function clearCart() {
    setCartItems([])
    setItemDiscounts({})
    setItemQtyStrings({})
    setBulkDiscountInput('')
  }

  // Gate on stock BEFORE adding, not just at final checkout — additionalQty
  // is on top of whatever's already in the cart for this exact product+
  // variation. Resolves true when it's fine to add (enough stock, no
  // inventory record, or the stock check itself couldn't run — e.g. offline,
  // matching the same "allow the sale" fallback the final checkout check
  // already used). Resolves false when blocked: either the cashier has no
  // inventory.adjust and just gets told no, or they do and either cancel or
  // finish the inline adjustment (in which case this resolves true instead).
  async function ensureStockAvailable(product: ProductRecord, variation: ProductVariation, additionalQty: number): Promise<boolean> {
    if (!BRANCH_ID) return true
    const key = getItemKey(product.id, variation.id)
    const existing = cartItems.find(i => getItemKey(i.product.id, i.variation?.id) === key)
    const totalRequested = (existing?.quantity ?? 0) + additionalQty
    const isRealVariation = !variation.id.endsWith('-default')
    const productId = isRealVariation ? variation.productId : product.id

    let available: number
    try {
      const inv = await api.get<{ quantity: number }>(`/api/inventory/${productId}/${BRANCH_ID}`)
      available = Number(inv?.quantity ?? 0)
    } catch {
      return true
    }
    if (available >= totalRequested) return true

    if (!hasPermission('inventory.adjust')) {
      toast.error(`Stock insuficiente — disponible: ${available}, necesitas: ${totalRequested}`)
      return false
    }

    return new Promise<boolean>(resolve => {
      setStockPromptNewStock(String(totalRequested))
      setStockPromptReason('')
      setStockPrompt({ product, variation, requestedQty: totalRequested, available, resolve })
    })
  }

  async function confirmStockAdjustment() {
    if (!stockPrompt) return
    if (!stockPromptReason) { toast.error('Selecciona una razón para el ajuste'); return }
    const newStock = parseInt(stockPromptNewStock, 10)
    if (isNaN(newStock) || newStock < stockPrompt.requestedQty) {
      toast.error(`El nuevo stock debe ser al menos ${stockPrompt.requestedQty}`); return
    }
    const isRealVariation = !stockPrompt.variation.id.endsWith('-default')
    const productId = isRealVariation ? stockPrompt.variation.productId : stockPrompt.product.id
    setSavingStockPrompt(true)
    try {
      await api.put(`/api/inventory/${productId}/${BRANCH_ID}`, { quantity: newStock, reason: stockPromptReason })
      toast.success('Inventario ajustado')
      stockPrompt.resolve(true)
      setStockPrompt(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al ajustar inventario')
    } finally {
      setSavingStockPrompt(false)
    }
  }

  function cancelStockAdjustment() {
    stockPrompt?.resolve(false)
    setStockPrompt(null)
  }

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleAddProduct = async (product: ProductRecord) => {
    setSearchTerm('')
    setShowSearchResults(false)
    const variations = getVariations(product)
    // A product with real presentations (ej. Coca-Cola 600ml/1L/3L) opens the
    // picker so the cashier can choose — and can add more than one
    // presentation of the same product without it just bumping the quantity
    // of whichever one was added first. Only a single-presentation product
    // skips straight to the cart. Stock is checked per-variation once one's
    // actually chosen (see handleAddVariationToCart), not here.
    if (variations.length > 1) {
      setChangingVariationItem(null)
      setSelectedProductForVariation(product)
      const initialQtys: Record<string, number> = {}
      variations.forEach(v => { initialQtys[v.id] = 1 })
      setVariationQuantities(initialQtys)
      setShowVariationModal(true)
      return
    }
    const variation = variations[0]!
    if (!(await ensureStockAvailable(product, variation, 1))) return
    addToCart(product, variation, 1)
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
        if (!(await ensureStockAvailable(exactProduct, matchedVariation, 1))) return
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
          if (!(await ensureStockAvailable(product, variation, 1))) return
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
      // Server unreachable — try to resolve the barcode from the cached catalog
      const cached = await getCache<ProductRecord[]>('products')
      const match = (cached ?? []).find(p =>
        p.barcode === barcode || getVariations(p).some(v => v.barcode === barcode)
      )
      if (match) {
        const product = normaliseProduct(match)
        const matchedVariation = getVariations(match).find(v => v.barcode === barcode)
        // Already confirmed unreachable above — skip the stock check here
        // instead of firing another doomed request; matches ensureStockAvailable's
        // own fallback of allowing the add when the check itself can't run.
        if (matchedVariation) {
          addToCart(product, matchedVariation, 1)
          setSearchTerm('')
          setShowSearchResults(false)
          toast.success(`${product.name} (${matchedVariation.name}) agregado`)
        } else {
          handleAddProduct(product)
        }
      } else {
        toast.error('Producto no encontrado')
      }
    }
  }

  const handleSelectCustomer = (customer: CustomerRecord) => {
    setSelectedCustomer(customer)
    setShowCustomerModal(false)
    setShowCustomerDropdown(false)
    setCustomerSearch('')
    const hasCredit = customer.creditEnabled && (customer.creditAvailable === null || (customer.creditAvailable ?? 0) > 0)
    if (!hasCredit) {
      setSaleType('CASH')
    }
  }

  const openQuickAddCustomer = () => {
    setEditingCustomerId(null)
    setQuickCustomerForm({ name: customerSearch, nit: '', phone: '', email: '', creditEnabled: false, creditLimitEnabled: true, creditLimit: '' })
    setShowCustomerModal(false)
    setShowCustomerDropdown(false)
    setShowQuickCustomerModal(true)
  }

  const openQuickEditCustomer = (customer: CustomerRecord) => {
    setEditingCustomerId(customer.id)
    setQuickCustomerForm({
      name: getCustomerName(customer),
      nit: customer.nit ?? '',
      phone: customer.phone ?? '',
      email: customer.email ?? '',
      creditEnabled: !!customer.creditEnabled,
      creditLimitEnabled: customer.creditLimitEnabled ?? true,
      creditLimit: customer.creditLimit ? String(customer.creditLimit) : '',
    })
    setShowQuickCustomerModal(true)
  }

  const handleSaveQuickCustomer = async () => {
    if (!quickCustomerForm.name.trim() || !quickCustomerForm.nit.trim()) {
      toast.error('Nombre y NIT son requeridos'); return
    }
    setSavingQuickCustomer(true)
    try {
      const payload: any = {
        name: quickCustomerForm.name.trim(),
        nit: quickCustomerForm.nit.trim(),
        phone: quickCustomerForm.phone.trim() || undefined,
        email: quickCustomerForm.email.trim() || undefined,
        creditEnabled: quickCustomerForm.creditEnabled,
        creditLimitEnabled: quickCustomerForm.creditLimitEnabled,
      }
      if (quickCustomerForm.creditEnabled && quickCustomerForm.creditLimitEnabled) {
        payload.creditLimit = parseFloat(quickCustomerForm.creditLimit) || 0
      }
      const saved = editingCustomerId
        ? await api.put<CustomerRecord>(`/api/customers/${editingCustomerId}`, payload)
        : await api.post<CustomerRecord>('/api/customers', payload)
      if (editingCustomerId) {
        setCustomers(prev => prev.map(c => c.id === saved.id ? saved : c))
        if (selectedCustomer?.id === saved.id) setSelectedCustomer(saved)
        toast.success('Cliente actualizado')
      } else {
        setCustomers(prev => [...prev, saved])
        handleSelectCustomer(saved)
        toast.success('Cliente agregado')
      }
      setShowQuickCustomerModal(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar cliente')
    } finally {
      setSavingQuickCustomer(false)
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

  const closeVariationModal = () => {
    setShowVariationModal(false)
    setSelectedProductForVariation(null)
    setChangingVariationItem(null)
    setVariationQuantities({})
  }

  const handleAddVariationToCart = async (variation: ProductVariation, qty: number) => {
    if (!selectedProductForVariation) return
    if (changingVariationItem) {
      // Replace existing item's variation — this is the one-line "switch
      // presentation" action, so it does close the modal afterward.
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
      closeVariationModal()
    } else {
      // Adding fresh — keep the modal open so the cashier can add another
      // presentation of the same product right after (ej. 600ml y luego 3L)
      // instead of it just bumping the quantity of whichever was added first.
      if (!(await ensureStockAvailable(selectedProductForVariation, variation, qty))) return
      addToCart(selectedProductForVariation, variation, qty)
      toast.success(`${selectedProductForVariation.name} (${variation.name}) agregado`)
      setVariationQuantities(prev => ({ ...prev, [variation.id]: 1 }))
    }
  }

  const completeSaleRequest = async () => {
    setSaving(true)
    try {
      // A credit sale still carries whatever paymentMethod was last clicked
      // in the CASH/CARD/TRANSFER/MIXED selector (that selector is about
      // how a *paid-now* sale was paid, and isn't reset for credit) — sent
      // as-is, that leftover value both prints wrong on the receipt AND
      // (worse) makes computeSales() in cash-registers.ts bucket the sale as
      // real cash/card/transfer, inflating the expected cash at register
      // close for money that was never actually received.
      const effectivePaymentMethod: PaymentMethodType = saleType === 'CREDIT' ? 'CREDIT' : paymentMethod
      const payload: any = {
        branchId: BRANCH_ID,
        customerId: selectedCustomer?.id,
        cashRegisterId: selectedRegisterId || undefined,
        saleType,
        paymentMethod: effectivePaymentMethod,
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
        requiresInvoice: wantsInvoice,
      }
      if (wantsInvoice) {
        if (invoiceBuyerNit.trim()) payload.buyerNit = invoiceBuyerNit.trim()
        if (invoiceBuyerName.trim()) payload.buyerName = invoiceBuyerName.trim()
      }

      // Add payment breakdown — none of this applies to a credit sale (no
      // money changed hands yet), so it's skipped entirely rather than
      // reflecting whatever the CASH/CARD/etc. selector happened to show.
      if (saleType !== 'CREDIT') {
        if (paymentMethod === 'CASH') {
          payload.cashAmount = total
        } else if (paymentMethod === 'CARD') {
          if (cardReference.trim()) payload.cardReference = cardReference.trim()
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
      }

      // Build the receipt shown on-screen from either the server's response
      // (normal path) or purely from local cart state (offline-queued path,
      // where there is no server response yet).
      const buildReceipt = (created: any, pendingSync: boolean, offlineRequestId?: string): CompletedSale => {
        const now = new Date().toISOString()
        // Short, easy-to-read-and-copy form of the clientRequestId — 8 hex
        // chars is still effectively unique at this volume of sales, and the
        // backend search matches on a substring, so this short form alone
        // is enough to find the real sale later. Printing the full 36-char
        // UUID would work too, but nobody's copying that by hand correctly.
        const offlineRef = offlineRequestId ? offlineRequestId.slice(0, 8).toUpperCase() : undefined
        return {
          id: created?.id ?? Date.now().toString(),
          invoiceNumber: created?.invoiceNumber ?? created?.receiptNumber ?? (offlineRef ? `REF-${offlineRef}` : `FAC-${Date.now()}`),
          branchName: created?.branch?.name ?? currentStore?.name ?? 'Tienda',
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
          paymentMethod: created?.paymentMethod ?? effectivePaymentMethod,
          saleType,
          customerName: selectedCustomer ? getCustomerName(selectedCustomer) : undefined,
          customerNit: selectedCustomer ? getCustomerNit(selectedCustomer) : undefined,
          createdAt: created?.createdAt ?? now,
          requiresInvoice: created?.requiresInvoice ?? wantsInvoice,
          invoiceSeries: created?.invoiceSeries,
          invoiceSeqNumber: created?.invoiceSeqNumber,
          buyerNit: created?.buyerNit,
          buyerName: created?.buyerName,
          felStatus: pendingSync ? 'NONE' : created?.felStatus,
          pendingSync,
          // Gated on saleType !== 'CREDIT' too, not just the raw paymentMethod
          // selector — that selector isn't reset for a credit sale, so on
          // its own it could leak a reference typed for an earlier non-credit
          // sale this session onto a credit sale's receipt.
          cardReference: created?.cardReference ?? (saleType !== 'CREDIT' && paymentMethod === 'CARD' ? cardReference.trim() || undefined : undefined),
          transferReference: created?.transferDocumentNumber ??
            (saleType === 'CREDIT' ? undefined
              : paymentMethod === 'TRANSFER' ? transferDocumentNumber.trim() || undefined
              : paymentMethod === 'MIXED' ? mixedTransferDoc.trim() || undefined
              : undefined),
          offlineRef,
        }
      }

      const finishLocally = (created: any, pendingSync: boolean, successMessage: string, offlineRef?: string) => {
        // Updates CashRegister.tsx's live reconciliation tally the instant
        // this sale completes — online or queued offline, it doesn't
        // matter, since neither page re-fetches the register's sales total
        // on its own (see offlineDb.ts's addSaleToRegisterTally). Without
        // this, a cashier who doesn't happen to revisit Caja between sales
        // sees a stale "efectivo esperado" at close time.
        if (selectedRegisterId) {
          const contribution: { total: number; cash?: number; card?: number; transfer?: number; credit?: number } = { total }
          if (payload.paymentMethod === 'CASH') contribution.cash = total
          else if (payload.paymentMethod === 'CARD') contribution.card = total
          else if (payload.paymentMethod === 'TRANSFER') contribution.transfer = total
          else if (payload.paymentMethod === 'CREDIT') contribution.credit = total
          else if (payload.paymentMethod === 'MIXED') {
            contribution.cash = payload.cashAmount ?? 0
            contribution.transfer = payload.transferAmount ?? 0
          }
          addSaleToRegisterTally(selectedRegisterId, contribution)
        }
        setLastCashReceived(cashReceived)
        setCompletedSale(buildReceipt(created, pendingSync, offlineRef))
        setShowReceiptModal(true)
        clearCart()
        setCashReceived('')
        setCardReference('')
        setTransferDocumentNumber('')
        setMixedCashAmount('')
        setMixedTransferAmount('')
        setMixedTransferDoc('')
        setWantsInvoice(false)
        setInvoiceBuyerNit('')
        setInvoiceBuyerName('')
        toast.success(successMessage)
      }

      try {
        const created = await api.post<any>('/api/sales', payload)
        finishLocally(created, false, '¡Venta completada!')
      } catch (err) {
        // A raw fetch() failure (server unreachable) throws a TypeError, and
        // a 5xx (ApiError.status >= 500) means the server itself broke —
        // neither is the cashier's fault and neither means the sale data is
        // bad, so both get queued locally the same way a dropped connection
        // does. A 4xx is a genuine rejection (insufficient stock, invalid
        // NIT, etc.) the cashier needs to see and fix, so that still just
        // surfaces as an error instead of silently queuing a sale that will
        // only fail again on sync.
        const isRetryable = err instanceof TypeError || (err instanceof ApiError && err.status >= 500)
        if (isRetryable) {
          const queued = await queuePendingSale(payload)
          await refreshPendingCount()
          finishLocally(null, true, 'Sin conexión con el servidor — venta guardada, se sincronizará automáticamente', queued.localId)
          trySync()
        } else {
          toast.error(err instanceof Error ? err.message : 'Error al procesar la venta')
        }
      }
    } finally {
      setSaving(false)
    }
  }

  const handleCompleteSale = async () => {
    if (cartItems.length === 0) { toast.error('El carrito está vacío'); return }
    if (!selectedCustomer) { toast.error('Selecciona un cliente antes de cobrar'); return }
    if (!selectedRegisterId) {
      toast.error(openRegisters.length === 0 ? 'No hay caja abierta — abre una caja antes de vender' : 'Selecciona una caja antes de cobrar')
      if (openRegisters.length > 0) setShowRegisterPanel(true)
      return
    }
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
    <>
    <div className="flex flex-col gap-3 md:h-[calc(100vh-7rem)] print:hidden">

      {/* ── Register indicator / alert ── */}
      {registersLoaded && openRegisters.length === 0 ? (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 flex items-center justify-between gap-3">
          <span className="text-sm text-red-700 font-medium flex items-center gap-2">
            <AlertCircle size={16} /> No hay ninguna caja abierta en esta sucursal. No se puede vender sin caja.
          </span>
          <button onClick={() => navigate('/cash-register')} className="btn-primary btn-sm whitespace-nowrap">
            Abrir caja
          </button>
        </div>
      ) : openRegisters.length > 0 ? (
        <button
          onClick={() => setShowRegisterPanel(true)}
          className={`self-start flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium shadow-sm transition-colors ${
            selectedRegisterId ? 'bg-white text-primary-700 hover:bg-gray-50' : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
          }`}
        >
          <Wallet size={15} />
          {selectedRegisterId
            ? (() => {
                const reg = openRegisters.find(r => r.id === selectedRegisterId)
                return reg ? `Caja: ${reg.name} #${reg.registerNumber}` : 'Cambiar caja'
              })()
            : 'Selecciona una caja para vender'}
        </button>
      ) : null}

      {BRANCH_ID && <SalesGoalWidget branchId={BRANCH_ID} compact />}

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
                          onBlur={async () => {
                            const str = itemQtyStrings[key]
                            if (str !== undefined) {
                              const n = parseFloat(str)
                              if (!isNaN(n) && n > 0) await changeQuantity(item, n)
                              setItemQtyStrings(prev => { const next = { ...prev }; delete next[key]; return next })
                            }
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                          }}
                          className="w-14 text-center text-sm border border-gray-200 rounded py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                        <button
                          onClick={async () => {
                            await changeQuantity(item, item.quantity + 1)
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
          <div className={`bg-white rounded-lg shadow-sm p-4 ${!selectedCustomer ? 'ring-1 ring-orange-300' : ''}`}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Cliente <span className="text-red-500">*</span>
              {!selectedCustomer && <span className="text-orange-500 normal-case font-normal ml-1">requerido para vender</span>}
            </p>
            {selectedCustomer ? (
              <div className="bg-primary-50 border border-primary-200 rounded-lg px-3 py-2">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 truncate">{getCustomerName(selectedCustomer)}</p>
                    <p className="text-xs text-gray-500">NIT: {getCustomerNit(selectedCustomer)}</p>
                    {selectedCustomer.creditEnabled && (
                      <p className="text-xs text-green-600">
                        Crédito: {selectedCustomer.creditAvailable === null ? 'Ilimitado' : `Q${(selectedCustomer.creditAvailable ?? 0).toFixed(2)}`}
                      </p>
                    )}
                    {(selectedCustomer.creditUsedPercent ?? 0) >= 75 && (
                      <p className="text-xs text-orange-600 font-medium flex items-center gap-1 mt-0.5">
                        <AlertCircle size={11} /> {selectedCustomer.creditUsedPercent!.toFixed(0)}% del crédito usado
                      </p>
                    )}
                    {selectedCustomer.comments && (
                      <p className="text-xs text-gray-500 italic mt-1 border-t border-primary-100 pt-1">"{selectedCustomer.comments}"</p>
                    )}
                  </div>
                  <div className="flex gap-1 ml-2 flex-shrink-0">
                    <button onClick={() => openCustomerHistory(selectedCustomer)} title="Ver historial" className="p-1 text-gray-400 hover:text-blue-600 transition-colors">
                      <History size={13} />
                    </button>
                    {canEditCustomer && (
                      <button onClick={() => openQuickEditCustomer(selectedCustomer)} title="Editar cliente" className="p-1 text-gray-400 hover:text-primary-600 transition-colors">
                        <Edit2 size={13} />
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setSelectedCustomer(null)
                        setSaleType('CASH')
                      }}
                      title="Quitar cliente"
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors">
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
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                    {filteredCustomers.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-gray-400">{customerSearch ? 'Sin resultados' : 'Escribe para buscar...'}</p>
                    ) : (
                      filteredCustomers.slice(0, 8).map(customer => (
                        <button key={customer.id} onMouseDown={() => handleSelectCustomer(customer)}
                          className="w-full text-left px-3 py-2 hover:bg-primary-50 transition-colors border-b border-gray-50 last:border-0">
                          <p className="text-sm font-medium text-gray-800">{getCustomerName(customer)}</p>
                          <p className="text-xs text-gray-400">NIT: {getCustomerNit(customer)}{creditHint(customer)}</p>
                        </button>
                      ))
                    )}
                    {canCreateCustomer && (
                      <button onMouseDown={openQuickAddCustomer}
                        className="w-full text-left px-3 py-2 hover:bg-primary-50 transition-colors flex items-center gap-1.5 text-primary-600 font-medium text-sm">
                        <UserPlus size={14} /> Nuevo cliente{customerSearch ? ` "${customerSearch}"` : ''}
                      </button>
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
                    // 'Mixto' (efectivo + transferencia) está deshabilitado por defecto en
                    // Configuración → Métodos de Pago porque rara vez se usa en la práctica —
                    // actívalo ahí, no aquí, si un negocio lo necesita.
                    { m: 'MIXED' as PaymentMethodType, label: 'Mixto', Icon: ArrowLeftRight },
                  ] as const).filter(({ m }) => enabledPaymentMethods.has(m)).map(({ m, label, Icon }) => (
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
          <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
            <div className="flex justify-between text-sm text-gray-500 mb-2">
              <span>Subtotal</span>
              <span>Q{subtotal.toFixed(2)}</span>
            </div>
            {cartItems.length > 0 && (
              <div className="flex justify-between items-center text-sm text-gray-500 mb-2">
                <span>Descuento general</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={bulkDiscountInput}
                    onChange={e => setBulkDiscountInput(e.target.value)}
                    onBlur={applyDiscountToAll}
                    onKeyDown={e => e.key === 'Enter' && ((e.target as HTMLInputElement).blur())}
                    placeholder="0"
                    min="0" max="100"
                    className="w-14 text-center text-sm border border-gray-200 rounded py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                  <span>%</span>
                </div>
              </div>
            )}
            <div className="border-t border-gray-100 pt-3">
              <div className="flex justify-between items-center">
                <span className="text-base font-semibold text-gray-700">Total</span>
                <span className="text-4xl font-extrabold text-primary-600 tracking-tight">Q{total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Factura — discrecional, apagado por defecto */}
          <div className="bg-white rounded-lg shadow-sm p-4">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm font-medium text-gray-700">¿Generar factura?</span>
              <input type="checkbox" checked={wantsInvoice}
                onChange={e => {
                  const checked = e.target.checked
                  setWantsInvoice(checked)
                  if (checked) {
                    setInvoiceBuyerNit(selectedCustomer?.nit && selectedCustomer.nit !== 'C/F' && selectedCustomer.nit !== 'CF' ? selectedCustomer.nit : '')
                    setInvoiceBuyerName(selectedCustomer ? getCustomerName(selectedCustomer) : '')
                  }
                }}
                className="w-5 h-5 text-primary-600 rounded" />
            </label>
            {!wantsInvoice && <p className="text-xs text-gray-400 mt-1">Por defecto se imprime solo el recibo.</p>}
            {wantsInvoice && (
              <div className="mt-3 space-y-2">
                <input type="text" value={invoiceBuyerNit} onChange={e => setInvoiceBuyerNit(e.target.value)}
                  placeholder="NIT del cliente" className="input w-full text-sm" />
                <input type="text" value={invoiceBuyerName} onChange={e => setInvoiceBuyerName(e.target.value)}
                  placeholder="Nombre para la factura" className="input w-full text-sm" />
                {!invoiceBuyerNit.trim() && (
                  <p className="text-xs text-orange-500">Se necesita un NIT válido — este cliente no tiene uno registrado.</p>
                )}
              </div>
            )}
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

          {/* Card reference — the charge itself runs on the bank's own datáfono,
              outside DENGO; this is just the voucher's authorization number, kept
              for reconciling against the bank's settlement report at cash close. */}
          {saleType === 'CASH' && paymentMethod === 'CARD' && (
            <div className="bg-white rounded-lg shadow-sm p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Referencia de tarjeta (opcional)</p>
              <input
                type="text"
                value={cardReference}
                onChange={e => setCardReference(e.target.value)}
                placeholder="No. de autorización / voucher"
                className="input w-full text-sm"
              />
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
                <span className="font-bold">{selectedCustomer.creditAvailable === null ? 'Ilimitado' : `Q${(selectedCustomer.creditAvailable ?? 0).toFixed(2)}`}</span>
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
            onClick={closeVariationModal}
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
                  {!changingVariationItem && (
                    <p className="text-xs text-gray-400 mt-0.5">Puedes agregar más de una presentación antes de cerrar</p>
                  )}
                </div>
                <button onClick={closeVariationModal}
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
              {!changingVariationItem && (
                <button onClick={closeVariationModal} className="btn-outline btn-md w-full mt-4">
                  Listo
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Stock-adjustment prompt — appears when adding a product without
          enough stock and the cashier has inventory.adjust. Resolving it
          (or cancelling) is what unblocks ensureStockAvailable()'s promise. ── */}
      <AnimatePresence>
        {stockPrompt && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={cancelStockAdjustment}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-lg p-6 max-w-md w-full"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle size={22} className="text-orange-600" />
                <h3 className="text-lg font-bold text-gray-800">Stock insuficiente</h3>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                <span className="font-medium">{stockPrompt.product.name}{stockPrompt.variation.name !== 'Pieza' ? ` (${stockPrompt.variation.name})` : ''}</span>
                {' '}— disponible: {stockPrompt.available}, necesitas: {stockPrompt.requestedQty}.
                Tienes permiso para ajustar el inventario; hazlo aquí para continuar con la venta.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="label">Nuevo stock *</label>
                  <input type="number" min={stockPrompt.requestedQty} value={stockPromptNewStock}
                    onChange={e => setStockPromptNewStock(e.target.value)} className="input w-full" />
                </div>
                <div>
                  <label className="label">Razón del ajuste *</label>
                  <select value={stockPromptReason} onChange={e => setStockPromptReason(e.target.value)} className="input w-full">
                    <option value="">Seleccionar razón</option>
                    {stockPromptReasonOptions.map(r => <option key={r.id} value={r.label}>{r.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="mt-5 flex gap-3">
                <button onClick={cancelStockAdjustment} disabled={savingStockPrompt} className="flex-1 btn-outline btn-md">
                  Cancelar
                </button>
                <button onClick={confirmStockAdjustment} disabled={savingStockPrompt} className="flex-1 btn-primary btn-md">
                  {savingStockPrompt ? 'Guardando...' : 'Ajustar y continuar'}
                </button>
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
                        {customer.creditEnabled && (
                          <p className="text-xs text-green-600 mt-0.5">
                            Crédito disponible: {customer.creditAvailable === null ? 'Ilimitado' : `Q${(customer.creditAvailable ?? 0).toFixed(2)}`}
                          </p>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
              <div className="flex gap-2 mt-4">
                <button onClick={() => setShowCustomerModal(false)} className={`btn-outline btn-md ${canCreateCustomer ? 'flex-1' : 'w-full'}`}>
                  Cancelar
                </button>
                {canCreateCustomer && (
                  <button onClick={openQuickAddCustomer} className="btn-primary btn-md flex-1 flex items-center justify-center gap-1.5">
                    <UserPlus size={16} /> Nuevo
                  </button>
                )}
              </div>
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

      {/* ── Quick add/edit customer modal ── */}
      <AnimatePresence>
        {showQuickCustomerModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={() => setShowQuickCustomerModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-lg p-6 max-w-sm w-full"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <UserPlus size={20} className="text-primary-600" /> {editingCustomerId ? 'Editar cliente' : 'Nuevo cliente'}
                </h3>
                <button onClick={() => setShowQuickCustomerModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={20} />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="label">Nombre *</label>
                  <input type="text" value={quickCustomerForm.name}
                    onChange={e => setQuickCustomerForm(f => ({ ...f, name: e.target.value }))}
                    className="input w-full" placeholder="Nombre completo" autoFocus />
                </div>
                <div>
                  <label className="label">NIT *</label>
                  <input type="text" value={quickCustomerForm.nit}
                    onChange={e => setQuickCustomerForm(f => ({ ...f, nit: e.target.value }))}
                    className="input w-full" placeholder="CF o número de NIT" />
                </div>
                <div>
                  <label className="label">Teléfono</label>
                  <input type="tel" value={quickCustomerForm.phone}
                    onChange={e => setQuickCustomerForm(f => ({ ...f, phone: e.target.value }))}
                    className="input w-full" />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input type="email" value={quickCustomerForm.email}
                    onChange={e => setQuickCustomerForm(f => ({ ...f, email: e.target.value }))}
                    className="input w-full" />
                </div>
                <div className="border-t pt-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={quickCustomerForm.creditEnabled}
                      onChange={e => setQuickCustomerForm(f => ({ ...f, creditEnabled: e.target.checked }))}
                      className="w-4 h-4 text-primary-600 rounded" />
                    <span className="text-sm text-gray-700">Permite ventas a crédito</span>
                  </label>
                  {quickCustomerForm.creditEnabled && (
                    <div className="mt-2 pl-6 space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={quickCustomerForm.creditLimitEnabled}
                          onChange={e => setQuickCustomerForm(f => ({ ...f, creditLimitEnabled: e.target.checked }))}
                          className="w-4 h-4 text-primary-600 rounded" />
                        <span className="text-sm text-gray-700">Con límite</span>
                      </label>
                      {quickCustomerForm.creditLimitEnabled ? (
                        <input type="number" min="0" step="0.01" value={quickCustomerForm.creditLimit}
                          onChange={e => setQuickCustomerForm(f => ({ ...f, creditLimit: e.target.value }))}
                          className="input w-full" placeholder="Límite de crédito, Q0.00" />
                      ) : (
                        <p className="text-xs text-gray-400">Sin límite — puede vender a crédito cualquier monto.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowQuickCustomerModal(false)} className="flex-1 btn-outline btn-md" disabled={savingQuickCustomer}>
                  Cancelar
                </button>
                <button onClick={handleSaveQuickCustomer} disabled={savingQuickCustomer} className="flex-1 btn-primary btn-md flex items-center justify-center gap-2">
                  {savingQuickCustomer && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
                  {editingCustomerId ? 'Guardar' : 'Agregar y seleccionar'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Register selection panel ── */}
      <AnimatePresence>
        {showRegisterPanel && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={() => selectedRegisterId && setShowRegisterPanel(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-lg p-6 max-w-sm w-full"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <Wallet size={20} className="text-primary-600" /> Selecciona una caja
                </h3>
                {selectedRegisterId && (
                  <button onClick={() => setShowRegisterPanel(false)} className="text-gray-400 hover:text-gray-600">
                    <X size={20} />
                  </button>
                )}
              </div>
              <p className="text-sm text-gray-500 mb-4">Esta caja quedará asociada a tus ventas por el resto del día.</p>
              <div className="space-y-2">
                {openRegisters.map(reg => (
                  <button
                    key={reg.id}
                    onClick={() => handleRegisterChange(reg.id)}
                    className={`w-full text-left px-4 py-3 rounded-lg border transition-colors flex items-center justify-between ${
                      selectedRegisterId === reg.id
                        ? 'bg-primary-50 border-primary-300 text-primary-700'
                        : 'bg-white border-gray-200 hover:border-primary-300 hover:bg-primary-50'
                    }`}
                  >
                    <span className="font-medium">{reg.name} #{reg.registerNumber}</span>
                    {selectedRegisterId === reg.id && <span className="text-xs font-semibold">Actual</span>}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 print:hidden"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-lg p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div id="receipt-content">
                <div className="text-center mb-4 pb-4 border-b-2 border-gray-200">
                  {currentStore?.logo && (
                    <img src={currentStore.logo} alt="Logo" className="h-14 mx-auto mb-2 object-contain" />
                  )}
                  <h2 className="text-2xl font-bold text-gray-800">{currentStore?.companyName ?? 'DENGO POS'}</h2>
                  <p className="text-sm text-gray-500">{completedSale.branchName}</p>
                  {selectedRegisterId && openRegisters.length > 0 && (() => {
                    const reg = openRegisters.find(r => r.id === selectedRegisterId)
                    return reg ? <p className="text-xs text-gray-400">{reg.name} #{reg.registerNumber}</p> : null
                  })()}
                </div>
                {completedSale.pendingSync && (
                  <div className="mb-3 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 text-center font-medium">
                    Pendiente de sincronizar — se enviará automáticamente al recuperar la conexión
                  </div>
                )}
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
                    {completedSale.items.map(item => {
                      const originalTotal = item.unitPrice * item.quantity
                      return (
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
                          <td className="py-2 text-right">
                            {item.discount > 0 && (
                              <p className="text-xs text-gray-400 line-through">Q{originalTotal.toFixed(2)}</p>
                            )}
                            <p className="font-medium">Q{item.total.toFixed(2)}</p>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <div className="pt-3 border-t-2 border-gray-200 space-y-1.5 mb-4">
                  {(() => {
                    const originalSubtotal = completedSale.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
                    const totalDiscount = originalSubtotal - completedSale.subtotal
                    return totalDiscount > 0.005 ? (
                      <>
                        <div className="flex justify-between text-sm text-gray-500">
                          <span>Precio original:</span>
                          <span className="line-through">Q{originalSubtotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm text-orange-500 font-medium">
                          <span>Descuento:</span>
                          <span>-Q{totalDiscount.toFixed(2)}</span>
                        </div>
                      </>
                    ) : null
                  })()}
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

    {completedSale && (
      <ThermalReceipt
          widthMm={currentStore?.receiptWidthMm ?? 55}
          data={{
            invoiceNumber: completedSale.invoiceNumber,
            branchName: completedSale.branchName,
            branchAddress: currentStore?.address,
            branchPhone: currentStore?.phone,
            logo: currentStore?.logo,
            companyName: currentStore?.companyName,
            companyTaxId: currentStore?.companyTaxId,
            companyTagline: currentStore?.companyTagline,
            socialMediaName: currentStore?.socialMediaName,
            registerLabel: (() => {
              const reg = openRegisters.find(r => r.id === selectedRegisterId)
              return reg ? `${reg.name} #${reg.registerNumber}` : undefined
            })(),
            createdAt: completedSale.createdAt,
            items: completedSale.items,
            subtotal: completedSale.subtotal,
            total: completedSale.total,
            paymentMethodLabel: paymentMethodLabel[completedSale.paymentMethod],
            cashReceived: completedSale.paymentMethod === 'CASH' && lastCashReceived ? parseFloat(lastCashReceived) : undefined,
            change: completedSale.paymentMethod === 'CASH' && lastCashReceived ? parseFloat(lastCashReceived) - completedSale.total : undefined,
            customerName: completedSale.customerName,
            customerNit: completedSale.customerNit,
            requiresInvoice: completedSale.requiresInvoice,
            invoiceSeries: completedSale.invoiceSeries,
            invoiceSeqNumber: completedSale.invoiceSeqNumber,
            buyerNit: completedSale.buyerNit,
            buyerName: completedSale.buyerName,
            felStatus: completedSale.felStatus,
            pendingSync: completedSale.pendingSync,
            offlineRef: completedSale.offlineRef,
            cardReference: completedSale.cardReference,
            transferReference: completedSale.transferReference,
          }}
        />
    )}
    </>
  )
}
