// Tipos de usuario y autenticación
export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  branchId: string
  branchIds?: string[]
  permissions?: string[]
  branch: Store
  createdAt: string
  updatedAt: string
}

export type UserRole = 'ADMIN' | 'AUDITOR' | 'INVENTORY_CONTROL' | 'OPERATOR'

// Tipos de sucursal/tienda
export interface Store {
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
  defaultCustomerId?: string
  logo?: string
  companyName?: string
  companyTaxId?: string
  companyTagline?: string
  socialMediaName?: string
  receiptWidthMm?: number
  invoiceSeries?: string
  salesReconciliationEnabled?: boolean
  config?: StoreConfig
  createdAt: string
  updatedAt: string
}

export interface StoreConfig {
  currency: string
  timezone: string
  taxRate: number
  printerEnabled: boolean
}

// Alias para compatibilidad - Deprecado, usar Store
/** @deprecated Use Store instead */
export type Branch = Store

// Tipos de productos
export interface Product {
  id: string
  barcode: string
  sku?: string // Código interno
  name: string
  brand?: string
  description?: string
  basePrice: number // Precio de la unidad base
  cost: number
  imageUrl?: string
  category: Category
  baseUnit: ProductUnit // Unidad base (ej: "pieza", "ml", "metro")
  variations: ProductVariation[] // Variaciones/presentaciones
  attributes?: ProductAttribute[] // Atributos adicionales
  minStock: number
  isActive: boolean
  createdAt: string
  updatedAt: string
  // Propiedades opcionales para tracking y reportes
  salesCount?: number // Contador de ventas para reportes
  stock?: number // Stock actual (usado en mocks, en producción viene de InventoryItem)
}

export interface ProductUnit {
  id: string
  name: string
  abbreviation: string
  type: UnitType // DISCRETE, CONTINUOUS
}

// DISCRETE = unidades enteras (piezas, cajas); CONTINUOUS = fraccionables (metros, litros, kilos)
export type UnitType = 'DISCRETE' | 'CONTINUOUS'

export interface ProductVariation {
  id: string
  productId: string
  name: string // ej: "Caja", "Docena", "Yarda"
  barcode?: string // Código de barras específico para esta variación
  conversionFactor: number // Factor de conversión respecto a la unidad base
  price: number // Precio de esta variación
  isDefault?: boolean // Si es la variación por defecto para venta
}

export interface ProductAttribute {
  name: string // ej: "Capacidad", "Hojas", "Sabor"
  value: string // ej: "600ml", "80", "Original"
}

export interface ProductTemplate {
  id: string
  name: string // ej: "Bebida carbonatada", "Cuaderno escolar"
  attributes: string[] // Atributos requeridos para este tipo de producto
  defaultUnit: ProductUnit
}

export interface Category {
  id: string
  name: string
  description?: string
  color?: string
}

// Tipos de inventario
export interface InventoryItem {
  id: string
  product: Product
  branch: Store
  quantity: number
  lastRestockDate?: string
  lastSaleDate?: string
}

export interface StockMovement {
  id: string
  product: Product
  branch: Store
  type: MovementType
  quantity: number
  reason?: string
  performedBy: User
  createdAt: string
}

export type MovementType = 'IN' | 'OUT' | 'ADJUSTMENT' | 'TRANSFER' | 'SALE' | 'RETURN'

// Tipos de ventas
export interface Sale {
  id: string
  invoiceNumber: string
  branch: Store
  items: SaleItem[]
  subtotal: number
  tax: number
  discount: number
  total: number
  paymentMethod: PaymentMethod
  saleType: SaleType
  cashier: User
  customer?: Customer
  dueDate?: string // Para ventas al crédito
  isPaid?: boolean // Para control de créditos
  paidAmount?: number // Monto pagado en ventas al crédito
  createdAt: string
}

export interface SaleItem {
  id: string
  product: Product
  variation?: ProductVariation // Variación vendida (si aplica)
  quantity: number
  unitPrice: number
  discount: number
  total: number
}

export interface CartItem {
  product: Product
  variation?: ProductVariation // Variación seleccionada para venta
  quantity: number
  discount?: number
}

export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'MIXED' | 'CREDIT'

export type SaleType = 'CASH' | 'CREDIT'

export interface Customer {
  id: string
  nit: string
  name: string
  email?: string
  phone?: string
  address?: string
  creditLimit?: number
  creditUsed?: number
  creditAvailable?: number
}

// Tipos de caja
export interface CashRegister {
  id: string
  branch: Store
  openedBy: User
  openedAt: string
  closedBy?: User
  closedAt?: string
  initialAmount: number
  finalAmount?: number
  expectedAmount?: number
  difference?: number
  sales: Sale[]
  movements: CashMovement[]
  status: CashRegisterStatus
}

export interface CashMovement {
  id: string
  type: CashMovementType
  amount: number
  description: string
  performedBy: User
  createdAt: string
}

export type CashMovementType = 'INCOME' | 'EXPENSE'

export type CashRegisterStatus = 'OPEN' | 'CLOSED'

// Tipos de transferencias
export interface Transfer {
  id: string
  fromBranch: Store
  toBranch: Store
  items: TransferItem[]
  status: TransferStatus
  requestedBy: User
  approvedBy?: User
  receivedBy?: User
  notes?: string
  createdAt: string
  approvedAt?: string
  receivedAt?: string
}

export interface TransferItem {
  product: Product
  quantity: number
}

export type TransferStatus = 'PENDING' | 'APPROVED' | 'IN_TRANSIT' | 'RECEIVED' | 'REJECTED'

// Tipos de proveedores
export interface Supplier {
  id: string
  code: string
  name: string
  contactName: string
  email: string
  phone: string
  address: string
  city: string
  taxId: string // NIT o RFC
  paymentTerms: string // Ej: "30 días", "15 días", "Contado"
  creditLimit?: number
  notes?: string
  isActive: boolean
  rating?: number // 1-5 estrellas
  createdAt: string
  updatedAt: string
}

// Tipos de compras/recepción
export interface PurchaseOrder {
  id: string
  orderNumber: string
  supplier: Supplier
  branch: Store
  items: PurchaseOrderItem[]
  subtotal: number
  tax: number
  total: number
  status: PurchaseOrderStatus
  expectedDate?: string
  receivedDate?: string
  notes?: string
  createdBy: User
  receivedBy?: User
  createdAt: string
  updatedAt: string
}

export interface PurchaseOrderItem {
  id: string
  product: Product
  quantity: number
  unitCost: number
  total: number
  receivedQuantity?: number
}

// DRAFT = borrador; PENDING = pendiente de recibir; PARTIAL = parcialmente recibido;
// RECEIVED = recibido completo; CANCELLED = cancelado
export type PurchaseOrderStatus = 'DRAFT' | 'PENDING' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED'

// Tipos de cotizaciones
export interface Quotation {
  id: string
  quotationNumber: string
  branch: Store
  customer: Customer
  items: QuotationItem[]
  subtotal: number
  tax: number
  discount: number
  total: number
  status: QuotationStatus
  validUntil: string
  notes?: string
  createdBy: User
  convertedToSale?: string // ID de la venta si se convirtió
  createdAt: string
  updatedAt: string
}

export interface QuotationItem {
  id: string
  product: Product
  variation?: ProductVariation
  quantity: number
  unitPrice: number
  discount: number
  total: number
}

// DRAFT = borrador; SENT = enviada al cliente; ACCEPTED = aceptada; REJECTED = rechazada;
// EXPIRED = vencida; CONVERTED = convertida a venta
export type QuotationStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CONVERTED'

// Tipos para reportes
export interface DashboardMetrics {
  totalSales: number
  totalRevenue: number
  totalProducts: number
  lowStockProducts: number
  topSellingProducts: Product[]
  salesByHour: { hour: number; sales: number }[]
  salesByCategory: { category: string; amount: number }[]
}