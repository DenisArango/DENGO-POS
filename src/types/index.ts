// Tipos de usuario y autenticación
export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  branch: Branch
  createdAt: string
  updatedAt: string
}

export enum UserRole {
  ADMIN = 'ADMIN',
  AUDITOR = 'AUDITOR',
  INVENTORY_CONTROL = 'INVENTORY_CONTROL',
  OPERATOR = 'OPERATOR'
}

// Tipos de sucursal
export interface Branch {
  id: string
  name: string
  address: string
  phone: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

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
}

export interface ProductUnit {
  id: string
  name: string
  abbreviation: string
  type: UnitType // DISCRETE, CONTINUOUS
}

export enum UnitType {
  DISCRETE = 'DISCRETE', // Unidades enteras (piezas, cajas)
  CONTINUOUS = 'CONTINUOUS' // Unidades fraccionables (metros, litros, kilos)
}

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
  branch: Branch
  quantity: number
  lastRestockDate?: string
  lastSaleDate?: string
}

export interface StockMovement {
  id: string
  product: Product
  branch: Branch
  type: MovementType
  quantity: number
  reason?: string
  performedBy: User
  createdAt: string
}

export enum MovementType {
  IN = 'IN',
  OUT = 'OUT',
  ADJUSTMENT = 'ADJUSTMENT',
  TRANSFER = 'TRANSFER',
  SALE = 'SALE',
  RETURN = 'RETURN'
}

// Tipos de ventas
export interface Sale {
  id: string
  invoiceNumber: string
  branch: Branch
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
  quantity: number
  unitPrice: number
  discount: number
  total: number
}

export interface CartItem {
  product: Product
  quantity: number
  discount?: number
}

export enum PaymentMethod {
  CASH = 'CASH',
  CARD = 'CARD',
  TRANSFER = 'TRANSFER',
  MIXED = 'MIXED',
  CREDIT = 'CREDIT'
}

export enum SaleType {
  CASH = 'CASH',
  CREDIT = 'CREDIT'
}

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
  branch: Branch
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

export enum CashMovementType {
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE'
}

export enum CashRegisterStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED'
}

// Tipos de transferencias
export interface Transfer {
  id: string
  fromBranch: Branch
  toBranch: Branch
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

export enum TransferStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  IN_TRANSIT = 'IN_TRANSIT',
  RECEIVED = 'RECEIVED',
  REJECTED = 'REJECTED'
}

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