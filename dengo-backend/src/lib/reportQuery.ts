// A general-purpose "slice my sales/inventory/cash data by X, show me Y"
// engine — the core of the AI reporting feature (see routes/ai.ts). Before
// this, every new kind of question needed a brand-new REST endpoint, a new
// entry in ai.ts's allowlist, a new prompt line, AND a new frontend label
// mapping — four places to touch per question type, and anything not
// anticipated just didn't work. This collapses the vast majority of
// "ventas/inventario/caja agrupado por algo, con tal métrica" questions into
// ONE endpoint the model composes freely (groupBy + metrics + filters), so a
// new phrasing of an already-supported combination needs zero new code.
//
// Safety: this is a closed vocabulary (fixed dimension/metric enums), never
// raw SQL or a free-form Prisma filter from the model — the dangerous part
// (which Prisma query runs) is entirely decided by this file, not by AI
// output. Branch scoping is enforced the same way as every other report
// (resolveBranchScope), and routes/ai.ts additionally force-pins branchId to
// the asking user's own branch for everything except the one case designed
// to compare branches (groupBy: 'branch').
import type { FastifyRequest } from 'fastify'
import { prisma } from './prisma.js'
import { resolveBranchScope } from './branch-scope.js'
import { parseBusinessDateParam, toBusinessDateKey, toBusinessWeekKey, toBusinessMonthKey } from './timezone.js'

export const SALES_DIMENSIONS = ['none', 'day', 'week', 'month', 'product', 'category', 'customer', 'branch', 'paymentMethod', 'saleType', 'cashier', 'cashRegister'] as const
export const SALES_METRICS = ['revenue', 'quantity', 'salesCount', 'profit', 'cost', 'marginPercent', 'avgTicket'] as const
export const INVENTORY_DIMENSIONS = ['none', 'category', 'product', 'branch'] as const
export const INVENTORY_METRICS = ['quantity', 'value', 'cost', 'lowStockCount', 'productCount'] as const
export const CASH_DIMENSIONS = ['none', 'day', 'branch', 'status'] as const
export const CASH_METRICS = ['totalSales', 'cashSales', 'cardSales', 'transferSales', 'sessionCount', 'avgSessionSales'] as const

export interface ReportQueryInput {
  entity: 'sales' | 'inventory' | 'cashRegisters'
  groupBy?: string | undefined
  metrics?: string[] | undefined
  branchId?: string | undefined
  from?: string | undefined
  to?: string | undefined
  // Name-based, not id-based: the model composing this query has no way to
  // know a real database id for "the product/category/customer the question
  // mentions" — it only has the name as typed in the question. Resolved to
  // an id server-side via a case-insensitive contains match before querying.
  categoryName?: string | undefined
  productName?: string | undefined
  customerName?: string | undefined
  paymentMethod?: string | undefined
  saleType?: string | undefined
  cashRegisterId?: string | undefined
  sortBy?: string | undefined
  sortDir?: 'asc' | 'desc' | undefined
  limit?: number | undefined
}

async function resolveCategoryId(name?: string): Promise<string | undefined> {
  if (!name) return undefined
  const c = await prisma.category.findFirst({ where: { name: { contains: name, mode: 'insensitive' }, isActive: true }, select: { id: true } })
  return c?.id
}
async function resolveProductId(name?: string): Promise<string | undefined> {
  if (!name) return undefined
  const p = await prisma.product.findFirst({ where: { name: { contains: name, mode: 'insensitive' }, isActive: true }, select: { id: true } })
  return p?.id
}
async function resolveCustomerId(name?: string): Promise<string | undefined> {
  if (!name) return undefined
  const c = await prisma.customer.findFirst({ where: { name: { contains: name, mode: 'insensitive' }, isActive: true }, select: { id: true } })
  return c?.id
}

export interface ReportColumn { key: string; label: string; type: 'string' | 'number' | 'currency' | 'percent' | 'date' }
export interface ReportResult { columns: ReportColumn[]; rows: Record<string, unknown>[] }

// One label dictionary shared by every entity — dimension names mean the
// same thing wherever they're reused ("branch" is always "Sucursal").
export const DIMENSION_LABELS: Record<string, string> = {
  none: 'Total', day: 'Fecha', week: 'Semana', month: 'Mes',
  product: 'Producto', category: 'Categoría', customer: 'Cliente',
  branch: 'Sucursal', paymentMethod: 'Método de Pago', saleType: 'Tipo de Venta',
  cashier: 'Cajero', cashRegister: 'Caja', status: 'Estado',
}
const METRIC_META: Record<string, { label: string; type: ReportColumn['type'] }> = {
  revenue: { label: 'Ingresos (Q)', type: 'currency' },
  quantity: { label: 'Cantidad', type: 'number' },
  salesCount: { label: '# Ventas', type: 'number' },
  profit: { label: 'Ganancia (Q)', type: 'currency' },
  cost: { label: 'Costo (Q)', type: 'currency' },
  marginPercent: { label: 'Margen (%)', type: 'percent' },
  avgTicket: { label: 'Ticket Promedio (Q)', type: 'currency' },
  value: { label: 'Valor (Q)', type: 'currency' },
  lowStockCount: { label: 'Productos con Stock Bajo', type: 'number' },
  productCount: { label: '# Productos', type: 'number' },
  totalSales: { label: 'Ventas Totales (Q)', type: 'currency' },
  cashSales: { label: 'Efectivo (Q)', type: 'currency' },
  cardSales: { label: 'Tarjeta (Q)', type: 'currency' },
  transferSales: { label: 'Transferencia (Q)', type: 'currency' },
  sessionCount: { label: '# Sesiones', type: 'number' },
  avgSessionSales: { label: 'Promedio por Sesión (Q)', type: 'currency' },
}
const PAYMENT_LABELS: Record<string, string> = { CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia', MIXED: 'Mixto', CREDIT: 'Crédito' }

function dateFilterFrom(from?: string, to?: string, field = 'createdAt') {
  if (!from && !to) return {}
  return { [field]: { ...(from ? { gte: parseBusinessDateParam(from) } : {}), ...(to ? { lte: parseBusinessDateParam(to) } : {}) } }
}

function buildRow(label: string, metrics: readonly string[], values: Record<string, number>): Record<string, unknown> {
  const row: Record<string, unknown> = { group: label }
  for (const m of metrics) row[m] = Math.round((values[m] ?? 0) * 100) / 100
  return row
}

function finalize(rows: Record<string, unknown>[], dimension: string, metrics: readonly string[], q: ReportQueryInput): ReportResult {
  const isDateDimension = dimension === 'day' || dimension === 'week' || dimension === 'month'
  const sortKey = q.sortBy && (metrics.includes(q.sortBy) || q.sortBy === 'group') ? q.sortBy : (isDateDimension ? 'group' : metrics[0])
  const sortDir = q.sortDir ?? (isDateDimension ? 'asc' : 'desc')
  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey!], bv = b[sortKey!]
    if (typeof av === 'string' && typeof bv === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    return sortDir === 'asc' ? Number(av) - Number(bv) : Number(bv) - Number(av)
  })
  const limit = q.limit ?? (dimension === 'none' ? 1 : 50)
  const columns: ReportColumn[] = [
    { key: 'group', label: DIMENSION_LABELS[dimension] ?? 'Grupo', type: isDateDimension ? 'date' : 'string' },
    ...metrics.map(m => ({ key: m, label: METRIC_META[m]?.label ?? m, type: METRIC_META[m]?.type ?? 'number' as const })),
  ]
  return { columns, rows: sorted.slice(0, limit) }
}

interface SaleDimensionFields {
  id: string
  createdAt: Date
  customerId: string | null
  customer: { name: string } | null
  branchId: string
  branch: { name: string } | null
  paymentMethod: string
  saleType: string
  cashierId: string
  cashier: { name: string } | null
  cashRegisterId: string | null
  cashRegister: { name: string; registerNumber: string } | null
}

function dimensionKeyForSale(sale: SaleDimensionFields, dimension: string): { key: string; label: string } {
  switch (dimension) {
    case 'day': { const k = toBusinessDateKey(sale.createdAt); return { key: k, label: k } }
    case 'week': { const k = toBusinessWeekKey(sale.createdAt); return { key: k, label: `Semana del ${k}` } }
    case 'month': { const k = toBusinessMonthKey(sale.createdAt); return { key: k, label: k } }
    case 'customer': return { key: sale.customerId ?? '__none__', label: sale.customer?.name ?? 'Sin cliente' }
    case 'branch': return { key: sale.branchId, label: sale.branch?.name ?? sale.branchId }
    case 'paymentMethod': return { key: sale.paymentMethod, label: PAYMENT_LABELS[sale.paymentMethod] ?? sale.paymentMethod }
    case 'saleType': return { key: sale.saleType, label: sale.saleType === 'CREDIT' ? 'Crédito' : 'Contado' }
    case 'cashier': return { key: sale.cashierId, label: sale.cashier?.name ?? sale.cashierId }
    case 'cashRegister': return { key: sale.cashRegisterId ?? '__none__', label: sale.cashRegister ? `${sale.cashRegister.name} #${sale.cashRegister.registerNumber}` : 'Sin caja' }
    default: return { key: '__total__', label: 'Total' }
  }
}

async function runSalesQuery(request: FastifyRequest, q: ReportQueryInput): Promise<ReportResult> {
  const branchId = resolveBranchScope(request, q.branchId)
  const dimension = (SALES_DIMENSIONS as readonly string[]).includes(q.groupBy ?? '') ? q.groupBy! : 'none'
  const metrics = (q.metrics?.length ? q.metrics.filter(m => (SALES_METRICS as readonly string[]).includes(m)) : ['revenue', 'salesCount'])
  const needsItemData = metrics.some(m => ['quantity', 'profit', 'cost', 'marginPercent'].includes(m))
  const [productId, categoryId, customerId] = await Promise.all([
    resolveProductId(q.productName), resolveCategoryId(q.categoryName), resolveCustomerId(q.customerName),
  ])

  const saleWhere: Record<string, unknown> = {
    isVoided: false,
    ...(branchId ? { branchId } : {}),
    ...dateFilterFrom(q.from, q.to),
    ...(q.paymentMethod ? { paymentMethod: q.paymentMethod } : {}),
    ...(q.saleType ? { saleType: q.saleType } : {}),
    ...(customerId ? { customerId } : {}),
    ...(q.cashRegisterId ? { cashRegisterId: q.cashRegisterId } : {}),
    ...(productId ? { items: { some: { productId } } } : {}),
    ...(categoryId ? { items: { some: { product: { categoryId } } } } : {}),
  }

  const isItemDimension = dimension === 'product' || dimension === 'category'
  const hasProductFilter = !!(productId || categoryId)

  // Item-level path: used whenever the grouping itself is product/category,
  // OR a product/category filter is active. The filter case matters even
  // when grouping by something else (e.g. "ventas de Coca-Cola por día") —
  // without it, a sale-level revenue sum would count the OTHER products in
  // the same basket too, since filtering only narrows which *sales* qualify,
  // not which *items* within them. Keying each matched item off its own
  // parent sale (not a separate sale query) keeps the two concepts — "which
  // dimension bucket" and "how much of this sale counts" — correctly scoped
  // to just the matching items.
  if (isItemDimension || hasProductFilter) {
    const items = await prisma.saleItem.findMany({
      where: {
        sale: saleWhere,
        ...(productId ? { productId } : {}),
        ...(categoryId ? { product: { categoryId } } : {}),
      },
      include: {
        product: { include: { category: true } },
        variation: { select: { conversionFactor: true } },
        sale: {
          select: {
            id: true, createdAt: true,
            customerId: true, customer: { select: { name: true } },
            branchId: true, branch: { select: { name: true } },
            paymentMethod: true, saleType: true,
            cashierId: true, cashier: { select: { name: true } },
            cashRegisterId: true, cashRegister: { select: { name: true, registerNumber: true } },
          },
        },
      },
      take: 50_000,
    })
    const buckets = new Map<string, { label: string; revenue: number; quantity: number; cost: number; saleIds: Set<string> }>()
    for (const item of items) {
      let key: string, label: string
      if (dimension === 'product') { key = label = item.product.name }
      else if (dimension === 'category') { key = label = item.product.category?.name ?? 'Sin categoría' }
      else { ({ key, label } = dimensionKeyForSale(item.sale, dimension)) }
      if (!buckets.has(key)) buckets.set(key, { label, revenue: 0, quantity: 0, cost: 0, saleIds: new Set() })
      const b = buckets.get(key)!
      const convFactor = Number(item.variation?.conversionFactor ?? 1)
      const qty = Number(item.quantity)
      b.revenue += Number(item.total)
      b.quantity += qty
      b.cost += Number(item.product.cost ?? 0) * convFactor * qty
      b.saleIds.add(item.saleId)
    }
    const rows = [...buckets.values()].map(b => buildRow(b.label, metrics, {
      revenue: b.revenue, quantity: b.quantity, cost: b.cost,
      profit: b.revenue - b.cost,
      marginPercent: b.revenue > 0 ? ((b.revenue - b.cost) / b.revenue) * 100 : 0,
      salesCount: b.saleIds.size,
      avgTicket: b.saleIds.size > 0 ? b.revenue / b.saleIds.size : 0,
    }))
    return finalize(rows, dimension, metrics, q)
  }

  const sales = await prisma.sale.findMany({
    where: saleWhere,
    select: {
      id: true, total: true, createdAt: true,
      customerId: true, customer: { select: { name: true } },
      branchId: true, branch: { select: { name: true } },
      paymentMethod: true, saleType: true,
      cashierId: true, cashier: { select: { name: true } },
      cashRegisterId: true, cashRegister: { select: { name: true, registerNumber: true } },
    },
    take: 50_000,
  })

  const costBySale = new Map<string, number>()
  const qtyBySale = new Map<string, number>()
  if (needsItemData && sales.length) {
    const items = await prisma.saleItem.findMany({
      where: { saleId: { in: sales.map(s => s.id) } },
      select: { saleId: true, quantity: true, product: { select: { cost: true } }, variation: { select: { conversionFactor: true } } },
    })
    for (const item of items) {
      const convFactor = Number(item.variation?.conversionFactor ?? 1)
      const qty = Number(item.quantity)
      costBySale.set(item.saleId, (costBySale.get(item.saleId) ?? 0) + Number(item.product.cost ?? 0) * convFactor * qty)
      qtyBySale.set(item.saleId, (qtyBySale.get(item.saleId) ?? 0) + qty)
    }
  }

  const buckets = new Map<string, { label: string; revenue: number; cost: number; quantity: number; count: number }>()
  for (const sale of sales) {
    const { key, label } = dimensionKeyForSale(sale, dimension)
    if (!buckets.has(key)) buckets.set(key, { label, revenue: 0, cost: 0, quantity: 0, count: 0 })
    const b = buckets.get(key)!
    b.revenue += Number(sale.total)
    b.cost += costBySale.get(sale.id) ?? 0
    b.quantity += qtyBySale.get(sale.id) ?? 0
    b.count += 1
  }

  const rows = [...buckets.values()].map(b => buildRow(b.label, metrics, {
    revenue: b.revenue, cost: b.cost, quantity: b.quantity,
    profit: b.revenue - b.cost,
    marginPercent: b.revenue > 0 ? ((b.revenue - b.cost) / b.revenue) * 100 : 0,
    salesCount: b.count,
    avgTicket: b.count > 0 ? b.revenue / b.count : 0,
  }))
  return finalize(rows, dimension, metrics, q)
}

async function runInventoryQuery(request: FastifyRequest, q: ReportQueryInput): Promise<ReportResult> {
  const branchId = resolveBranchScope(request, q.branchId)
  const dimension = (INVENTORY_DIMENSIONS as readonly string[]).includes(q.groupBy ?? '') ? q.groupBy! : 'none'
  const metrics = (q.metrics?.length ? q.metrics.filter(m => (INVENTORY_METRICS as readonly string[]).includes(m)) : ['quantity', 'value'])
  const [productId, categoryId] = await Promise.all([resolveProductId(q.productName), resolveCategoryId(q.categoryName)])

  const rows = await prisma.inventory.findMany({
    where: {
      ...(branchId ? { branchId } : {}),
      product: { isActive: true, ...(categoryId ? { categoryId } : {}), ...(productId ? { id: productId } : {}) },
    },
    include: { product: { include: { category: true } }, branch: { select: { name: true } } },
  })

  const buckets = new Map<string, { label: string; quantity: number; value: number; cost: number; low: number; products: Set<string> }>()
  for (const row of rows) {
    const key = dimension === 'category' ? (row.product.category?.name ?? 'Sin categoría')
      : dimension === 'product' ? row.product.name
      : dimension === 'branch' ? row.branchId
      : '__total__'
    const label = dimension === 'branch' ? (row.branch?.name ?? row.branchId) : dimension === 'none' ? 'Total' : key
    if (!buckets.has(key)) buckets.set(key, { label, quantity: 0, value: 0, cost: 0, low: 0, products: new Set() })
    const b = buckets.get(key)!
    const qty = Number(row.quantity)
    b.quantity += qty
    b.value += qty * Number(row.product.basePrice)
    b.cost += qty * Number(row.product.cost)
    if (qty <= Number(row.product.minStock)) b.low += 1
    b.products.add(row.productId)
  }

  const resultRows = [...buckets.values()].map(b => buildRow(b.label, metrics, {
    quantity: b.quantity, value: b.value, cost: b.cost, lowStockCount: b.low, productCount: b.products.size,
  }))
  return finalize(resultRows, dimension, metrics, q)
}

async function runCashQuery(request: FastifyRequest, q: ReportQueryInput): Promise<ReportResult> {
  const branchId = resolveBranchScope(request, q.branchId)
  const dimension = (CASH_DIMENSIONS as readonly string[]).includes(q.groupBy ?? '') ? q.groupBy! : 'none'
  const metrics = (q.metrics?.length ? q.metrics.filter(m => (CASH_METRICS as readonly string[]).includes(m)) : ['totalSales', 'sessionCount'])

  const sessions = await prisma.cashRegister.findMany({
    where: { ...(branchId ? { branchId } : {}), ...dateFilterFrom(q.from, q.to, 'openedAt') },
    select: { id: true, branchId: true, branch: { select: { name: true } }, status: true, openedAt: true, totalSales: true, cashSales: true, cardSales: true, transferSales: true },
  })

  const buckets = new Map<string, { label: string; totalSales: number; cashSales: number; cardSales: number; transferSales: number; count: number }>()
  for (const s of sessions) {
    const key = dimension === 'day' ? toBusinessDateKey(s.openedAt)
      : dimension === 'branch' ? s.branchId
      : dimension === 'status' ? s.status
      : '__total__'
    const label = dimension === 'day' ? key
      : dimension === 'branch' ? (s.branch?.name ?? s.branchId)
      : dimension === 'status' ? (s.status === 'OPEN' ? 'Abierta' : 'Cerrada')
      : 'Total'
    if (!buckets.has(key)) buckets.set(key, { label, totalSales: 0, cashSales: 0, cardSales: 0, transferSales: 0, count: 0 })
    const b = buckets.get(key)!
    b.totalSales += Number(s.totalSales)
    b.cashSales += Number(s.cashSales)
    b.cardSales += Number(s.cardSales)
    b.transferSales += Number(s.transferSales)
    b.count += 1
  }

  const resultRows = [...buckets.values()].map(b => buildRow(b.label, metrics, {
    totalSales: b.totalSales, cashSales: b.cashSales, cardSales: b.cardSales, transferSales: b.transferSales,
    sessionCount: b.count, avgSessionSales: b.count > 0 ? b.totalSales / b.count : 0,
  }))
  return finalize(resultRows, dimension, metrics, q)
}

export async function runReportQuery(request: FastifyRequest, q: ReportQueryInput): Promise<ReportResult> {
  if (q.entity === 'inventory') return runInventoryQuery(request, q)
  if (q.entity === 'cashRegisters') return runCashQuery(request, q)
  return runSalesQuery(request, q)
}
