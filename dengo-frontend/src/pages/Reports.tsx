import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  FileBarChart, TrendingUp, DollarSign, Package,
  Users, ShoppingCart, Calendar, Clock,
  AlertTriangle, BarChart3, PieChart, LineChart,
  FileText, Download, ArrowRight, Warehouse,
  CreditCard, UserCheck, History, ArrowUpDown, Sparkles
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import { format, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { api } from '../lib/api'
import { useAuthStore } from '../store'
import { useStore } from '../contexts/StoreContext'

interface ReportCard {
  id: string
  title: string
  description: string
  icon: React.ComponentType<any>
  path: string
  color: string
  category: 'sales' | 'inventory' | 'financial' | 'audit' | 'ai'
  badge?: string
}

const reportCards: ReportCard[] = [
  {
    id: 'custom-reports',
    title: 'Consultas con IA',
    description: 'Pídele a la IA cualquier análisis en lenguaje natural. Genera reportes personalizados y guárdalos.',
    icon: Sparkles,
    path: '/reports/custom',
    color: 'bg-gradient-to-r from-primary-600 to-purple-600',
    category: 'ai',
    badge: 'NUEVO',
  },
  {
    id: 'daily-sales',
    title: 'Ventas del Día',
    description: 'Resumen detallado de ventas, transacciones y métodos de pago del día actual',
    icon: DollarSign,
    path: '/reports/daily-sales',
    color: 'bg-green-500',
    category: 'sales'
  },
  {
    id: 'sales-by-period',
    title: 'Ventas por Período',
    description: 'Análisis comparativo de ventas por día, semana, mes o año personalizado',
    icon: Calendar,
    path: '/reports/sales-by-period',
    color: 'bg-blue-500',
    category: 'sales'
  },
  {
    id: 'top-products',
    title: 'Productos Más Vendidos',
    description: 'Ranking de productos por cantidad vendida y generación de ingresos',
    icon: TrendingUp,
    path: '/reports/top-products',
    color: 'bg-purple-500',
    category: 'sales'
  },
  {
    id: 'hourly-sales',
    title: 'Ventas por Hora',
    description: 'Distribución de ventas por franja horaria para optimizar personal',
    icon: Clock,
    path: '/reports/hourly-sales',
    color: 'bg-indigo-500',
    category: 'sales'
  },
  {
    id: 'sales-history',
    title: 'Historial de Ventas',
    description: 'Consulta, edita y gestiona el registro completo de todas las ventas realizadas',
    icon: History,
    path: '/reports/sales-history',
    color: 'bg-pink-500',
    category: 'sales'
  },
  {
    id: 'inventory-status',
    title: 'Estado del Inventario',
    description: 'Valoración actual del inventario, productos con stock bajo y crítico',
    icon: Warehouse,
    path: '/reports/inventory-status',
    color: 'bg-orange-500',
    category: 'inventory'
  },
  {
    id: 'inventory-movements',
    title: 'Movimientos de Inventario',
    description: 'Historial de entradas, salidas, ajustes y transferencias de productos',
    icon: ArrowUpDown,
    path: '/reports/inventory-movements',
    color: 'bg-cyan-500',
    category: 'inventory'
  },
  {
    id: 'inventory-adjustments',
    title: 'Ajustes de Inventario',
    description: 'Registro detallado de todos los ajustes realizados con razones y usuarios',
    icon: History,
    path: '/reports/inventory-adjustments',
    color: 'bg-red-500',
    category: 'audit'
  },
  {
    id: 'product-rotation',
    title: 'Rotación de Productos',
    description: 'Análisis de velocidad de venta y días de inventario por producto',
    icon: Package,
    path: '/reports/product-rotation',
    color: 'bg-teal-500',
    category: 'inventory'
  },
  {
    id: 'cash-flow',
    title: 'Flujo de Caja',
    description: 'Movimientos de efectivo, cierres de caja y cuadre diario',
    icon: CreditCard,
    path: '/reports/cash-flow',
    color: 'bg-emerald-500',
    category: 'financial'
  },
  {
    id: 'profit-margins',
    title: 'Márgenes de Ganancia',
    description: 'Análisis de rentabilidad por producto, categoría y período',
    icon: BarChart3,
    path: '/reports/profit-margins',
    color: 'bg-yellow-500',
    category: 'financial'
  },
  {
    id: 'credit-sales',
    title: 'Ventas al Crédito',
    description: 'Estado de cuentas por cobrar, vencimientos y pagos pendientes',
    icon: FileText,
    path: '/reports/credit-sales',
    color: 'bg-rose-500',
    category: 'financial'
  },
  {
    id: 'user-activity',
    title: 'Actividad de Usuarios',
    description: 'Registro de acciones realizadas por cada usuario del sistema',
    icon: UserCheck,
    path: '/reports/user-activity',
    color: 'bg-gray-500',
    category: 'audit'
  }
]

const categories = [
  { id: 'ai', name: 'IA', icon: Sparkles },
  { id: 'sales', name: 'Ventas', icon: ShoppingCart },
  { id: 'inventory', name: 'Inventario', icon: Package },
  { id: 'financial', name: 'Financiero', icon: DollarSign },
  { id: 'audit', name: 'Auditoría', icon: FileText }
]

export default function Reports() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { currentStore } = useStore()
  const branchId = currentStore?.id ?? user?.branchId ?? ''

  const [quickStats, setQuickStats] = useState({
    dailySales: 0, dailyTransactions: 0, lowStockCount: 0, avgTicket: 0
  })
  const [weeklySales, setWeeklySales] = useState<{ label: string; total: number }[]>([])
  const [topProducts, setTopProducts] = useState<any[]>([])
  const [loadingCharts, setLoadingCharts] = useState(true)

  useEffect(() => { fetchQuickData() }, [branchId])

  async function fetchQuickData() {
    setLoadingCharts(true)
    try {
      const bq = branchId ? `&branchId=${branchId}` : ''
      const today = format(new Date(), 'yyyy-MM-dd')
      const weekAgo = format(subDays(new Date(), 6), 'yyyy-MM-dd')

      const [dashRes, weeklyRes, topRes] = await Promise.allSettled([
        api.get<any>(`/api/reports/dashboard${branchId ? `?branchId=${branchId}` : ''}`),
        api.get<any[]>(`/api/reports/daily-sales?from=${weekAgo}T00:00:00&to=${today}T23:59:59${bq}`),
        api.get<any[]>(`/api/reports/top-products?from=${today}T00:00:00&to=${today}T23:59:59${bq}&limit=5`),
      ])

      if (dashRes.status === 'fulfilled' && dashRes.value) {
        const s = dashRes.value.stats ?? {}
        const sales = Number(s.dailySales ?? 0)
        const txn = Number(s.dailyTransactions ?? 0)
        setQuickStats({
          dailySales: sales,
          dailyTransactions: txn,
          lowStockCount: s.lowStockCount ?? 0,
          avgTicket: txn > 0 ? sales / txn : 0,
        })
      }

      if (weeklyRes.status === 'fulfilled') {
        setWeeklySales((weeklyRes.value ?? []).map((d: any) => ({
          label: format(new Date(d.date + 'T12:00:00'), 'EEE d', { locale: es }),
          total: Math.round(Number(d.total) * 100) / 100,
        })))
      }

      if (topRes.status === 'fulfilled') {
        setTopProducts((topRes.value ?? []).slice(0, 5))
      }
    } catch { /* silent */ } finally { setLoadingCharts(false) }
  }

  const topMax = topProducts[0]?.revenue ?? 1

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <FileBarChart size={28} />
          Reportes y Análisis
        </h1>
      </div>

      {/* Estadísticas rápidas — datos reales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Ventas Hoy',
            value: `Q${quickStats.dailySales.toLocaleString('es-GT', { minimumFractionDigits: 2 })}`,
            icon: DollarSign,
            color: 'text-green-600',
            bg: 'bg-green-100',
            sub: 'Total del día',
          },
          {
            label: 'Transacciones',
            value: String(quickStats.dailyTransactions),
            icon: ShoppingCart,
            color: 'text-blue-600',
            bg: 'bg-blue-100',
            sub: `Ticket prom: Q${quickStats.avgTicket.toFixed(2)}`,
          },
          {
            label: 'Ticket Promedio',
            value: `Q${quickStats.avgTicket.toFixed(2)}`,
            icon: TrendingUp,
            color: 'text-purple-600',
            bg: 'bg-purple-100',
            sub: 'Por transacción',
          },
          {
            label: 'Stock Bajo',
            value: String(quickStats.lowStockCount),
            icon: AlertTriangle,
            color: 'text-yellow-600',
            bg: 'bg-yellow-100',
            sub: quickStats.lowStockCount > 0 ? 'Requieren atención' : 'Todo en orden',
          },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            className="bg-white rounded-lg shadow-sm p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-500 text-sm">{s.label}</span>
              <div className={`p-1.5 rounded-lg ${s.bg}`}>
                <s.icon className={s.color} size={16} />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-800">{loadingCharts ? '—' : s.value}</p>
            <p className={`text-xs mt-1 ${s.color}`}>{s.sub}</p>
          </motion.div>
        ))}
      </div>

      {/* Gráficos rápidos */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="font-semibold text-gray-800 mb-5 flex items-center gap-2">
          <LineChart size={20} />
          Gráficos Rápidos
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Ventas de la semana */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">Ventas de la Semana (últimos 7 días)</h4>
            {loadingCharts ? (
              <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Cargando...</div>
            ) : weeklySales.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Sin datos</div>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={weeklySales} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `Q${v}`} width={56} />
                  <Tooltip formatter={(v: any) => [`Q${Number(v).toFixed(2)}`, 'Ventas']} />
                  <Bar dataKey="total" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Top 5 productos hoy */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">Top 5 Productos Hoy</h4>
            {loadingCharts ? (
              <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Cargando...</div>
            ) : topProducts.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Sin ventas hoy</div>
            ) : (
              <div className="space-y-2.5">
                {topProducts.map((p, i) => {
                  const pct = Math.round((Number(p.revenue) / topMax) * 100)
                  return (
                    <div key={p.productId ?? i}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs text-gray-700 truncate flex-1 mr-2">
                          <span className="text-gray-400 mr-1">{i + 1}.</span>{p.name}
                        </span>
                        <span className="text-xs font-medium text-gray-800 flex-shrink-0">
                          Q{Number(p.revenue).toFixed(2)}
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div
                          className="h-1.5 rounded-full bg-primary-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Categorías de reportes */}
      {categories.map((category) => (
        <div key={category.id} className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <category.icon size={20} />
            {category.id === 'ai' ? 'Inteligencia Artificial' : `Reportes de ${category.name}`}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {reportCards
              .filter(report => report.category === category.id)
              .map((report, index) => (
                <motion.div
                  key={report.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.07 }}
                  onClick={() => navigate(report.path)}
                  className={`bg-white rounded-lg shadow-sm p-6 hover:shadow-lg transition-all cursor-pointer group ${report.category === 'ai' ? 'ring-2 ring-primary-200' : ''}`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={`p-3 rounded-lg ${report.color} ${report.category === 'ai' ? '' : 'bg-opacity-10'}`}>
                      <report.icon
                        className={report.category === 'ai' ? 'text-white' : report.color.replace('bg-', 'text-').split(' ')[0]}
                        size={24}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      {report.badge && (
                        <span className="text-[10px] font-bold bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded">
                          {report.badge}
                        </span>
                      )}
                      <ArrowRight className="text-gray-400 group-hover:text-gray-600 transition-colors" size={20} />
                    </div>
                  </div>
                  <h3 className="font-semibold text-gray-800 mb-2">{report.title}</h3>
                  <p className="text-sm text-gray-600 line-clamp-2">{report.description}</p>
                </motion.div>
              ))}
          </div>
        </div>
      ))}
    </div>
  )
}
