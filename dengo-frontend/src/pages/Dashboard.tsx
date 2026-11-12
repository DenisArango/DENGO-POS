import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  TrendingUp,
  TrendingDown,
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
import { usePermissions } from '../hooks/usePermissions'
import StatStrip from '../components/common/StatStrip'
import SalesGoalWidget from '../components/SalesGoalWidget'

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrador', AUDITOR: 'Auditor', INVENTORY_CONTROL: 'Control de Inventario', OPERATOR: 'Cajero',
}

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

interface WeekDayEntry {
  label: string
  date: string
  amount: number
  isToday: boolean
}

interface BranchSaleEntry {
  branchId: string
  branchName: string
  total: number
  count: number
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
  hasOpenRegister: boolean
  dailySalesChange?: number
  dailyTransactionsChange?: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

// `permission: null` = always visible (no view-gate on that route). Filtered
// per-role in the component so a cashier, say, never sees a shortcut to a
// page they'd just bounce off with a 403.
const quickAccessLinks = [
  { path: '/pos',           label: 'Punto de Venta', icon: ShoppingCart, color: 'text-primary-600 bg-primary-100', permission: 'sales.create' },
  { path: '/inventory',     label: 'Inventario',     icon: Package,      color: 'text-green-600 bg-green-100',     permission: 'inventory.view' },
  { path: '/purchases',     label: 'Compras',        icon: PlusCircle,   color: 'text-sky-600 bg-sky-100',         permission: 'purchases.receive' },
  { path: '/suppliers',     label: 'Proveedores',    icon: Truck,        color: 'text-orange-600 bg-orange-100',   permission: 'suppliers.view' },
  { path: '/reports',       label: 'Reportes',       icon: FileBarChart, color: 'text-purple-600 bg-purple-100',   permission: 'reports.sales' },
  { path: '/cash-register', label: 'Caja',           icon: DollarSign,   color: 'text-yellow-600 bg-yellow-100',   permission: 'cash.open' },
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

// Monday-start week containing `today`, one entry per day (future days get 0).
function buildWeekEntries(dailySales: { date: string; total: number }[]): WeekDayEntry[] {
  const byDate = new Map(dailySales.map(d => [d.date, d.total]))
  const today = new Date()
  const todayKey = today.toISOString().slice(0, 10)
  const dow = today.getDay() // 0=Sun..6=Sat
  const mondayOffset = dow === 0 ? -6 : 1 - dow
  const monday = new Date(today)
  monday.setDate(today.getDate() + mondayOffset)

  return WEEKDAY_LABELS.map((label, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const key = d.toISOString().slice(0, 10)
    return { label, date: key, amount: byDate.get(key) ?? 0, isToday: key === todayKey }
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
  const navigate = useNavigate()
  const { currentStore } = useStore()
  const branchId = currentStore?.id ?? user?.branchId ?? ''

  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<DashboardStats>({
    dailySales: 0,
    dailyTransactions: 0,
    lowStockCount: 0,
    cashBalance: 0,
    hasOpenRegister: false,
  })
  const [hourlySales, setHourlySales] = useState<HourlySaleEntry[]>([])
  const [categorySales, setCategorySales] = useState<CategorySaleEntry[]>([])
  const [weekSales, setWeekSales] = useState<WeekDayEntry[]>([])
  const [branchSales, setBranchSales] = useState<BranchSaleEntry[]>([])
  const [inventoryAlerts, setInventoryAlerts] = useState<InventoryAlert[]>([])

  const isAdmin = user?.role === 'ADMIN'
  const { hasPermission } = usePermissions()
  const visibleQuickAccessLinks = quickAccessLinks.filter(link => hasPermission(link.permission))
  const canViewInventory = hasPermission('inventory.view')

  useEffect(() => {
    if (branchId) fetchDashboard()
  }, [branchId])

  async function fetchDashboard() {
    setLoading(true)
    try {
      const branchQ = branchId ? `?branchId=${branchId}` : ''
      // Monday of the current week, so "Ventas de la Semana" always covers Mon→today
      const today = new Date()
      const dow = today.getDay()
      const monday = new Date(today)
      monday.setDate(today.getDate() + (dow === 0 ? -6 : 1 - dow))
      const weekFrom = monday.toISOString().slice(0, 10)

      const [data, weekly, byBranch] = await Promise.all([
        api.get<any>(`/api/reports/dashboard${branchQ}`),
        api.get<{ date: string; total: number }[]>(`/api/reports/daily-sales?from=${weekFrom}${branchId ? `&branchId=${branchId}` : ''}`),
        isAdmin ? api.get<BranchSaleEntry[]>('/api/reports/sales-by-branch') : Promise.resolve(null),
      ])
      const s = data.stats ?? {}

      setStats({
        dailySales: s.dailySales ?? 0,
        dailyTransactions: s.dailyTransactions ?? 0,
        lowStockCount: s.lowStockCount ?? 0,
        cashBalance: s.cashBalance ?? 0,
        hasOpenRegister: s.hasOpenRegister ?? false,
      })

      setHourlySales(normaliseHourly(data.hourlySales ?? []))

      // Backend now sends topCategoriesToday — actual today's revenue by category
      const cats = (data.topCategoriesToday ?? []).map((c: any) => ({
        category: c.name,
        amount: c.amount,
      }))
      setCategorySales(normaliseCategory(cats))

      setWeekSales(buildWeekEntries((weekly ?? []).map(d => ({ date: d.date, total: Number(d.total ?? 0) }))))
      if (byBranch) setBranchSales(byBranch)
      setInventoryAlerts(normaliseAlerts(data.inventoryAlerts ?? []))
    } catch {
      // Silently fail — dashboard is read-only, showing zeros is acceptable
    } finally {
      setLoading(false)
    }
  }

  const barColors = [
    'bg-gradient-to-r from-blue-500 to-sky-400',
    'bg-gradient-to-r from-violet-500 to-fuchsia-400',
    'bg-gradient-to-r from-emerald-500 to-teal-400',
    'bg-gradient-to-r from-amber-500 to-orange-400',
    'bg-gradient-to-r from-pink-500 to-rose-400',
    'bg-gradient-to-r from-cyan-500 to-sky-400',
  ]

  return (
    <motion.div
      className="space-y-6 min-h-full"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* ── Header ── */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            Dashboard
            {user?.role && (
              <span className="flex items-center gap-1 text-xs font-medium bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full">
                <Users size={12} /> {ROLE_LABEL[user.role] ?? user.role}
              </span>
            )}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5 first-letter:uppercase">
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
          {branchId && (
            <motion.div variants={itemVariants}>
              <SalesGoalWidget branchId={branchId} />
            </motion.div>
          )}

          {/* ── Stats Cards ── */}
          <motion.div variants={itemVariants}>
            <StatStrip
              stats={[
                {
                  label: 'Ventas del Día', color: 'blue' as const,
                  icon: ShoppingCart,
                  value: `Q${stats.dailySales.toLocaleString('es-GT', { minimumFractionDigits: 2 })}`,
                  hint: stats.dailySalesChange != null && (
                    <>
                      {stats.dailySalesChange >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {stats.dailySalesChange >= 0 ? '+' : ''}{stats.dailySalesChange}% vs ayer
                    </>
                  ),
                  hintTone: stats.dailySalesChange == null ? 'neutral' : stats.dailySalesChange >= 0 ? 'good' : 'bad',
                },
                {
                  label: 'Transacciones de Hoy', color: 'emerald' as const,
                  icon: BarChart3,
                  value: stats.dailyTransactions,
                  hint: stats.dailyTransactionsChange != null && (
                    <>
                      {stats.dailyTransactionsChange >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {stats.dailyTransactionsChange >= 0 ? '+' : ''}{stats.dailyTransactionsChange} vs ayer
                    </>
                  ),
                  hintTone: stats.dailyTransactionsChange == null ? 'neutral' : stats.dailyTransactionsChange >= 0 ? 'good' : 'bad',
                },
                {
                  label: 'Productos Stock Bajo', color: 'amber' as const,
                  icon: AlertTriangle,
                  value: stats.lowStockCount,
                  valueTone: stats.lowStockCount > 0 ? 'warn' : 'neutral',
                  hint: stats.lowStockCount > 0 ? 'Requieren atención' : 'Todo en orden',
                  hintTone: stats.lowStockCount > 0 ? 'warn' : 'neutral',
                  onClick: canViewInventory ? () => navigate('/inventory') : undefined,
                },
                {
                  label: 'Caja Actual', color: 'violet' as const,
                  icon: DollarSign,
                  value: `Q${stats.cashBalance.toLocaleString('es-GT', { minimumFractionDigits: 2 })}`,
                  hint: (
                    <>
                      <span className={`h-1.5 w-1.5 rounded-full ${stats.hasOpenRegister ? 'bg-emerald-500' : 'bg-gray-300'}`} aria-hidden />
                      {stats.hasOpenRegister ? 'Caja abierta' : 'Sin caja abierta'}
                    </>
                  ),
                },
              ]}
            />
          </motion.div>

          {/* ── Charts Row ── */}
          <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Ventas por Hora */}
            <div className="card">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-base font-semibold text-gray-900">Ventas por Hora</h2>
                <span className="text-xs text-gray-500">Hoy</span>
              </div>
              {hourlySales.length > 0 ? (
                <>
                  <div className="overflow-x-auto -mx-2 px-2">
                    <div className="flex items-end gap-1 h-40 min-w-[480px]">
                      {hourlySales.map((entry) => {
                        const heightPct = Math.round((entry.amount / entry.max) * 100)
                        const isTopHour = entry.amount >= entry.max * 0.85
                        return (
                          <div key={entry.hour} className="flex flex-col items-center flex-1 gap-1">
                            <div className="w-full flex items-end justify-center" style={{ height: '140px' }}>
                              <div
                                className={`w-full rounded-t-sm transition-all duration-500 ${
                                  isTopHour ? 'bg-gradient-to-t from-primary-600 to-violet-400' : 'bg-primary-200'
                                }`}
                                style={{ height: `${heightPct}%` }}
                                title={`Q${entry.amount}`}
                              />
                            </div>
                            <span className="text-[9px] text-gray-400 leading-none">{entry.hour.slice(0, 2)}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-sm bg-gradient-to-t from-primary-600 to-violet-400 inline-block" /> Hora pico
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-sm bg-primary-200 inline-block" /> Normal
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
                  Sin datos de ventas por hora
                </div>
              )}
            </div>

            {/* Ventas por Categoría */}
            <div className="card">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-base font-semibold text-gray-900">Top Categorías Hoy</h2>
                <span className="text-xs text-gray-500">Hoy</span>
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
                <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
                  Sin datos de ventas por categoría
                </div>
              )}
            </div>
          </motion.div>

          {/* ── Bottom Row ── */}
          <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Ventas de la Semana */}
            <div className={`card ${!canViewInventory ? 'lg:col-span-2' : ''}`}>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-base font-semibold text-gray-900">Ventas de la Semana</h2>
                <span className="text-xs text-gray-500">Lun – Dom</span>
              </div>
              {weekSales.some(d => d.amount > 0) ? (
                <>
                  <div className="flex items-end gap-2 h-40">
                    {weekSales.map(day => {
                      const max = Math.max(...weekSales.map(d => d.amount), 1)
                      const heightPct = Math.round((day.amount / max) * 100)
                      return (
                        <div key={day.date} className="flex flex-col items-center flex-1 gap-1.5">
                          <span className="text-[10px] text-gray-400">{day.amount > 0 ? `Q${day.amount.toFixed(0)}` : ''}</span>
                          <div className="w-full flex items-end justify-center" style={{ height: '120px' }}>
                            <div
                              className={`w-full rounded-t-sm transition-all duration-500 ${day.isToday ? 'bg-gradient-to-t from-primary-600 to-violet-400' : 'bg-primary-200'}`}
                              style={{ height: `${Math.max(heightPct, day.amount > 0 ? 4 : 0)}%` }}
                              title={`Q${day.amount.toFixed(2)}`}
                            />
                          </div>
                          <span className={`text-xs ${day.isToday ? 'font-bold text-primary-600' : 'text-gray-500'}`}>{day.label}</span>
                        </div>
                      )
                    })}
                  </div>
                  <div className="mt-3 flex justify-between text-xs text-gray-500 border-t border-gray-100 pt-3">
                    <span>Total semana</span>
                    <span className="font-semibold text-gray-700">Q{weekSales.reduce((s, d) => s + d.amount, 0).toLocaleString('es-GT', { minimumFractionDigits: 2 })}</span>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
                  Sin ventas registradas esta semana
                </div>
              )}
            </div>

            {/* Alertas de Inventario — hidden for roles without inventory access */}
            {canViewInventory && (
            <div className="card p-0 overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h2 className="text-base font-semibold text-gray-900">
                  Alertas de Inventario
                  {stats.lowStockCount > 0 && (
                    <span className="ml-1.5 text-xs font-medium text-gray-400">
                      ({stats.lowStockCount}{stats.lowStockCount > inventoryAlerts.length ? `, mostrando ${inventoryAlerts.length}` : ''})
                    </span>
                  )}
                </h2>
                <NavLink
                  to="/inventory"
                  className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1 font-medium"
                >
                  Ver todo <ArrowRight size={13} />
                </NavLink>
              </div>
              {inventoryAlerts.length > 0 ? (
                <div className="divide-y divide-gray-100 max-h-[320px] overflow-y-auto">
                  {inventoryAlerts.map((item) => {
                    const badge = getAlertBadge(item.status)
                    return (
                      <div key={item.id} className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`stat-tile p-1.5 rounded-lg flex-shrink-0 ${
                            item.status === 'out' ? 'bg-rose-100 text-rose-600'
                            : item.status === 'critical' ? 'bg-orange-100 text-orange-600'
                            : 'bg-amber-100 text-amber-600'
                          }`}>
                            <Package size={15} aria-hidden />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
                            <p className="text-xs text-gray-500">
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
                            className="text-xs text-primary-600 hover:text-primary-800 font-medium rounded px-1.5 py-0.5 hover:bg-primary-50 transition-colors"
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
            )}
          </motion.div>

          {/* ── Ventas Mensuales por Sucursal (admin only — needs cross-branch data) ── */}
          {isAdmin && (
            <motion.div variants={itemVariants} className="card">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-base font-semibold text-gray-900">Ventas Mensuales por Sucursal</h2>
                <span className="text-xs text-gray-500">
                  {new Date().toLocaleDateString('es-GT', { month: 'long', year: 'numeric' })}
                </span>
              </div>
              {branchSales.length > 0 && branchSales.some(b => b.total > 0) ? (
                <div className="space-y-3">
                  {branchSales
                    .slice()
                    .sort((a, b) => b.total - a.total)
                    .map((b, idx) => {
                      const max = Math.max(...branchSales.map(x => x.total), 1)
                      const widthPct = Math.round((b.total / max) * 100)
                      return (
                        <div key={b.branchId}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-gray-700">{b.branchName}</span>
                            <span className="text-xs text-gray-500">
                              Q{b.total.toLocaleString('es-GT', { minimumFractionDigits: 2 })} · {b.count} ventas
                            </span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2.5">
                            <div
                              className={`${barColors[idx % barColors.length]} h-2.5 rounded-full transition-all duration-700`}
                              style={{ width: `${widthPct}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                </div>
              ) : (
                <div className="flex items-center justify-center h-24 text-gray-400 text-sm">
                  Sin ventas registradas este mes
                </div>
              )}
            </motion.div>
          )}

          {/* ── Quick Access ── */}
          <motion.div variants={itemVariants}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-gray-900">Acceso Rápido</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {visibleQuickAccessLinks.map(({ path, label, icon: Icon, color }) => {
                return (
                  <NavLink
                    key={path}
                    to={path}
                    className="group flex items-center gap-3 rounded-xl border border-gray-200/80 bg-white px-4 py-3 shadow-sm transition-[border-color,box-shadow,transform] duration-200 hover:border-primary-200 hover:shadow-md motion-safe:hover:-translate-y-0.5"
                  >
                    <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg transition-transform duration-300 motion-safe:group-hover:scale-110 motion-safe:group-hover:-rotate-6 ${color}`}>
                      <Icon size={18} className="motion-safe:group-hover:animate-wiggle" aria-hidden />
                    </span>
                    <span className="text-sm font-medium text-gray-700 leading-tight group-hover:text-gray-900">{label}</span>
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
