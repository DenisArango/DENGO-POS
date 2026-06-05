import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  TrendingUp,
  ShoppingCart,
  Package,
  DollarSign,
  AlertTriangle,
  Clock,
  ArrowRight,
  BarChart3,
  Users,
  Truck,
  FileBarChart,
  PlusCircle
} from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../store'
import { useStore } from '../contexts/StoreContext'

// ─── Types ────────────────────────────────────────────────────────────────────

interface HourlySaleEntry {
  hour: string
  amount: number
  max: number
}

interface CategorySaleEntry {
  category: string
  amount: number
  max: number
}

interface RecentTransaction {
  id: string
  customer: string
  products: string
  amount: string
  time: string
  method: string
  methodColor: string
}

interface InventoryAlert {
  id: string | number
  name: string
  currentStock: number
  minStock: number
  status: string
}

interface DashboardStats {
  dailySales: number
  dailyTransactions: number
  lowStockCount: number
  cashBalance: number
  dailySalesChange?: number
  dailyTransactionsChange?: number
}

interface DashboardData {
  stats: DashboardStats
  hourlySales: HourlySaleEntry[]
  categorySales: CategorySaleEntry[]
  recentTransactions: RecentTransaction[]
  inventoryAlerts: InventoryAlert[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const METHOD_COLORS: Record<string, string> = {
  EFECTIVO: 'bg-green-100 text-green-700',
  TARJETA: 'bg-blue-100 text-blue-700',
  TRANSFERENCIA: 'bg-purple-100 text-purple-700',
  CREDITO: 'bg-orange-100 text-orange-700',
}

const quickAccessLinks = [
  { path: '/pos',           label: 'Punto de Venta', icon: ShoppingCart, color: 'text-primary-600 bg-primary-100' },
  { path: '/inventory',     label: 'Inventario',     icon: Package,      color: 'text-green-600 bg-green-100' },
  { path: '/purchases',     label: 'Compras',        icon: PlusCircle,   color: 'text-blue-600 bg-blue-100' },
  { path: '/suppliers',     label: 'Proveedores',    icon: Truck,        color: 'text-orange-600 bg-orange-100' },
  { path: '/reports',       label: 'Reportes',       icon: FileBarChart, color: 'text-purple-600 bg-purple-100' },
  { path: '/cash-register', label: 'Caja',           icon: DollarSign,   color: 'text-yellow-600 bg-yellow-100' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Buenos días'
  if (hour < 18) return 'Buenas tardes'
  return 'Buenas noches'
}

function formatDate(): string {
  return new Date().toLocaleDateString('es-GT', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function getAlertBadge(status: string) {
  switch (status) {
    case 'out':
      return { label: 'Agotado', classes: 'bg-red-100 text-red-700' }
    case 'critical':
      return { label: 'Crítico', classes: 'bg-orange-100 text-orange-700' }
    default:
      return { label: 'Bajo', classes: 'bg-yellow-100 text-yellow-700' }
  }
}

function normaliseMethodColor(method: string): string {
  const key = (method ?? '').toUpperCase()
  return METHOD_COLORS[key] ?? 'bg-gray-100 text-gray-700'
}

function normaliseTransactions(raw: any[]): RecentTransaction[] {
  return (raw ?? []).map((tx: any) => {
    const method = (tx.paymentMethod ?? tx.method ?? 'EFECTIVO').toUpperCase()
    const itemsLabel = Array.isArray(tx.items)
      ? tx.items.map((i: any) => i.productName ?? i.name ?? '').filter(Boolean).join(', ')
      : (tx.products ?? '')
    const customerName =
      tx.customer?.fullName ??
      tx.customer?.name ??
      tx.customerName ??
      tx.customer ??
      'Cliente general'
    const amountLabel =
      tx.total != null
        ? `Q${Number(tx.total).toFixed(2)}`
        : tx.amount ?? 'Q0.00'
    const timeLabel =
      tx.createdAt
        ? new Date(tx.createdAt).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' })
        : (tx.time ?? '')
    return {
      id: tx.id ?? tx.receiptNumber ?? '',
      customer: customerName,
      products: itemsLabel,
      amount: amountLabel,
      time: timeLabel,
      method,
      methodColor: normaliseMethodColor(method),
    }
  })
}

function normaliseAlerts(raw: any[]): InventoryAlert[] {
  return (raw ?? []).map((item: any) => {
    const qty = item.quantity ?? item.currentStock ?? 0
    const min = item.product?.minStock ?? item.minStock ?? 0
    let status = 'low'
    if (qty === 0) status = 'out'
    else if (qty <= min * 0.3) status = 'critical'
    return {
      id: item.id ?? item.productId ?? Math.random(),
      name: item.product?.name ?? item.name ?? 'Producto',
      currentStock: qty,
      minStock: min,
      status: item.status ?? status,
    }
  })
}

function normaliseHourly(raw: any[]): HourlySaleEntry[] {
  if (!raw?.length) return []
  const max = Math.max(...raw.map((e: any) => e.amount ?? e.total ?? 0), 1)
  return raw.map((e: any) => ({
    hour: e.hour ?? e.label ?? '',
    amount: e.amount ?? e.total ?? 0,
    max,
  }))
}

function normaliseCategory(raw: any[]): CategorySaleEntry[] {
  if (!raw?.length) return []
  const max = Math.max(...raw.map((e: any) => e.amount ?? e.total ?? 0), 1)
  return raw.map((e: any) => ({
    category: e.category ?? e.categoryName ?? e.name ?? '',
    amount: e.amount ?? e.total ?? 0,
    max,
  }))
}

// ─── Animation variants ───────────────────────────────────────────────────────

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const greeting = getGreeting()
  const dateLabel = formatDate()
  const { user } = useAuthStore()
  const { currentStore } = useStore()
  const branchId = currentStore?.id ?? user?.branchId ?? ''

  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<DashboardStats>({
    dailySales: 0,
    dailyTransactions: 0,
    lowStockCount: 0,
    cashBalance: 0,
  })
  const [hourlySales, setHourlySales] = useState<HourlySaleEntry[]>([])
  const [categorySales, setCategorySales] = useState<CategorySaleEntry[]>([])
  const [recentTransactions, setRecentTransactions] = useState<RecentTransaction[]>([])
  const [inventoryAlerts, setInventoryAlerts] = useState<InventoryAlert[]>([])

  useEffect(() => {
    if (branchId) fetchDashboard()
  }, [branchId])

  async function fetchDashboard() {
    setLoading(true)
    try {
      const branchQ = branchId ? `?branchId=${branchId}` : ''
      const data = await api.get<any>(`/api/reports/dashboard${branchQ}`)
      const s = data.stats ?? {}

      setStats({
        dailySales: s.dailySales ?? 0,
        dailyTransactions: s.dailyTransactions ?? 0,
        lowStockCount: s.lowStockCount ?? 0,
        cashBalance: s.cashBalance ?? 0,
      })

      setHourlySales(normaliseHourly(data.hourlySales ?? []))
      setCategorySales(normaliseCategory(data.categorySales ?? []))
      setRecentTransactions(normaliseTransactions(data.recentTransactions ?? []))
      setInventoryAlerts(normaliseAlerts(data.inventoryAlerts ?? []))
    } catch {
      // Silently fail — dashboard is read-only, showing zeros is acceptable
    } finally {
      setLoading(false)
    }
  }

  const barColors = [
    'bg-primary-500',
    'bg-green-500',
    'bg-blue-500',
    'bg-orange-400',
    'bg-purple-500',
    'bg-gray-400',
  ]

  return (
    <motion.div
      className="p-6 space-y-6 min-h-full bg-gray-50"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* ── Header ── */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5 capitalize">
            {greeting} &mdash; {dateLabel}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500 bg-white border border-gray-200 rounded-lg px-4 py-2 shadow-sm w-fit">
          <Clock size={15} className="text-primary-600" />
          <span>{loading ? 'Cargando...' : 'Actualizado ahora'}</span>
        </div>
      </motion.div>

      {/* ── Loading spinner ── */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
        </div>
      )}

      {!loading && (
        <>
          {/* ── Stats Cards ── */}
          <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {/* Ventas del día */}
            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Ventas del Día</p>
                  <p className="text-2xl font-bold text-gray-800 mt-1">
                    Q{stats.dailySales.toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                  </p>
                  {stats.dailySalesChange != null && (
                    <p className={`text-xs mt-1 flex items-center gap-1 ${stats.dailySalesChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      <TrendingUp size={12} />
                      {stats.dailySalesChange >= 0 ? '+' : ''}{stats.dailySalesChange}% vs ayer
                    </p>
                  )}
                </div>
                <div className="p-3 bg-primary-100 rounded-lg">
                  <ShoppingCart className="text-primary-600" size={24} />
                </div>
              </div>
            </div>

            {/* Transacciones */}
            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Transacciones de Hoy</p>
                  <p className="text-2xl font-bold text-gray-800 mt-1">{stats.dailyTransactions}</p>
                  {stats.dailyTransactionsChange != null && (
                    <p className={`text-xs mt-1 flex items-center gap-1 ${stats.dailyTransactionsChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      <TrendingUp size={12} />
                      {stats.dailyTransactionsChange >= 0 ? '+' : ''}{stats.dailyTransactionsChange} vs ayer
                    </p>
                  )}
                </div>
                <div className="p-3 bg-green-100 rounded-lg">
                  <BarChart3 className="text-green-600" size={24} />
                </div>
              </div>
            </div>

            {/* Stock bajo */}
            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Productos Stock Bajo</p>
                  <p className="text-2xl font-bold text-gray-800 mt-1">{stats.lowStockCount}</p>
                  <p className="text-xs text-orange-600 mt-1 flex items-center gap-1">
                    <AlertTriangle size={12} />
                    Requieren atención
                  </p>
                </div>
                <div className="p-3 bg-orange-100 rounded-lg">
                  <AlertTriangle className="text-orange-600" size={24} />
                </div>
              </div>
            </div>

            {/* Caja actual */}
            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Caja Actual</p>
                  <p className="text-2xl font-bold text-gray-800 mt-1">
                    Q{stats.cashBalance.toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                    <DollarSign size={12} />
                    Caja abierta
                  </p>
                </div>
                <div className="p-3 bg-blue-100 rounded-lg">
                  <DollarSign className="text-blue-600" size={24} />
                </div>
              </div>
            </div>
          </motion.div>

          {/* ── Charts Row ── */}
          <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Ventas por Hora */}
            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-base font-semibold text-gray-800">Ventas por Hora</h2>
                <span className="text-xs text-gray-400">Hoy</span>
              </div>
              {hourlySales.length > 0 ? (
                <>
                  <div className="flex items-end gap-1.5 h-40">
                    {hourlySales.map((entry) => {
                      const heightPct = Math.round((entry.amount / entry.max) * 100)
                      const isTopHour = entry.amount >= entry.max * 0.85
                      return (
                        <div key={entry.hour} className="flex flex-col items-center flex-1 gap-1">
                          <div className="w-full flex items-end justify-center" style={{ height: '140px' }}>
                            <div
                              className={`w-full rounded-t-sm transition-all duration-500 ${
                                isTopHour ? 'bg-primary-500' : 'bg-primary-200'
                              }`}
                              style={{ height: `${heightPct}%` }}
                              title={`Q${entry.amount}`}
                            />
                          </div>
                          <span className="text-[10px] text-gray-400 leading-none">{entry.hour}</span>
                        </div>
                      )
                    })}
                  </div>
                  <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-sm bg-primary-500 inline-block" /> Hora pico
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-sm bg-primary-200 inline-block" /> Normal
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
                  Sin datos de ventas por hora
                </div>
              )}
            </div>

            {/* Ventas por Categoría */}
            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-base font-semibold text-gray-800">Ventas por Categoría</h2>
                <span className="text-xs text-gray-400">Hoy</span>
              </div>
              {categorySales.length > 0 ? (
                <div className="space-y-3">
                  {categorySales.map((entry, idx) => {
                    const widthPct = Math.round((entry.amount / entry.max) * 100)
                    return (
                      <div key={entry.category}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-600">{entry.category}</span>
                          <span className="text-xs font-medium text-gray-700">
                            Q{entry.amount.toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div
                            className={`${barColors[idx % barColors.length]} h-2 rounded-full transition-all duration-700`}
                            style={{ width: `${widthPct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
                  Sin datos de ventas por categoría
                </div>
              )}
            </div>
          </motion.div>

          {/* ── Bottom Row ── */}
          <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Últimas Transacciones */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h2 className="text-base font-semibold text-gray-800">Últimas Transacciones</h2>
                <NavLink
                  to="/pos"
                  className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1 font-medium"
                >
                  Ver todo <ArrowRight size={13} />
                </NavLink>
              </div>
              {recentTransactions.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                        <th className="text-left px-6 py-2.5 font-medium">Cliente</th>
                        <th className="text-left px-4 py-2.5 font-medium hidden sm:table-cell">Productos</th>
                        <th className="text-right px-4 py-2.5 font-medium">Monto</th>
                        <th className="text-right px-4 py-2.5 font-medium hidden md:table-cell">Hora</th>
                        <th className="text-center px-4 py-2.5 font-medium">Método</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {recentTransactions.map((tx) => (
                        <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-3">
                            <p className="font-medium text-gray-700 text-xs">{tx.customer}</p>
                            <p className="text-gray-400 text-[11px]">{tx.id}</p>
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs hidden sm:table-cell max-w-[140px] truncate">
                            {tx.products}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-800 text-xs">
                            {tx.amount}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-400 text-xs hidden md:table-cell">
                            {tx.time}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full ${tx.methodColor}`}>
                              {tx.method}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex items-center justify-center py-10 text-gray-400 text-sm">
                  Sin transacciones recientes
                </div>
              )}
            </div>

            {/* Alertas de Inventario */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h2 className="text-base font-semibold text-gray-800">Alertas de Inventario</h2>
                <NavLink
                  to="/inventory"
                  className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1 font-medium"
                >
                  Ver todo <ArrowRight size={13} />
                </NavLink>
              </div>
              {inventoryAlerts.length > 0 ? (
                <div className="divide-y divide-gray-50 max-h-[320px] overflow-y-auto">
                  {inventoryAlerts.map((item) => {
                    const badge = getAlertBadge(item.status)
                    return (
                      <div key={item.id} className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`p-1.5 rounded-md flex-shrink-0 ${
                            item.status === 'out'
                              ? 'bg-red-100'
                              : item.status === 'critical'
                              ? 'bg-orange-100'
                              : 'bg-yellow-100'
                          }`}>
                            <Package size={14} className={
                              item.status === 'out'
                                ? 'text-red-600'
                                : item.status === 'critical'
                                ? 'text-orange-600'
                                : 'text-yellow-600'
                            } />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-gray-700 truncate">{item.name}</p>
                            <p className="text-[11px] text-gray-400">
                              Stock: <span className="font-semibold text-gray-600">{item.currentStock}</span>
                              {' '}/ Mín: <span className="font-semibold text-gray-600">{item.minStock}</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${badge.classes}`}>
                            {badge.label}
                          </span>
                          <NavLink
                            to="/inventory"
                            className="text-[11px] text-primary-600 hover:text-primary-700 font-medium border border-primary-200 rounded px-2 py-0.5 hover:bg-primary-50 transition-colors"
                          >
                            Ver
                          </NavLink>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="flex items-center justify-center py-10 text-gray-400 text-sm">
                  Sin alertas de inventario
                </div>
              )}
            </div>
          </motion.div>

          {/* ── Quick Access ── */}
          <motion.div variants={itemVariants}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-gray-800">Acceso Rápido</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {quickAccessLinks.map(({ path, label, icon: Icon, color }) => {
                const [textClass, bgClass] = color.split(' ')
                return (
                  <NavLink
                    key={path}
                    to={path}
                    className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 flex flex-col items-center gap-2 hover:shadow-md transition-all duration-200 group"
                  >
                    <div className={`p-2 rounded-lg ${bgClass}`}>
                      <Icon size={20} className={textClass} />
                    </div>
                    <span className="text-xs font-medium text-gray-700 text-center leading-tight group-hover:text-gray-900">{label}</span>
                  </NavLink>
                )
              })}
            </div>
          </motion.div>
        </>
      )}
    </motion.div>
  )
}
