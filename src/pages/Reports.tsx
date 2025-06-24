import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  FileBarChart, TrendingUp, DollarSign, Package,
  Users, ShoppingCart, Calendar, Clock,
  AlertTriangle, BarChart3, PieChart, LineChart,
  FileText, Download, ArrowRight, Warehouse,
  CreditCard, UserCheck, History, ArrowUpDown
} from 'lucide-react'

interface ReportCard {
  id: string
  title: string
  description: string
  icon: React.ComponentType<any>
  path: string
  color: string
  category: 'sales' | 'inventory' | 'financial' | 'audit'
}

const reportCards: ReportCard[] = [
  // Reportes de Ventas
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

  // Reportes de Inventario
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

  // Reportes Financieros
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

  // Reportes de Auditoría
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
  { id: 'sales', name: 'Ventas', icon: ShoppingCart },
  { id: 'inventory', name: 'Inventario', icon: Package },
  { id: 'financial', name: 'Financiero', icon: DollarSign },
  { id: 'audit', name: 'Auditoría', icon: FileText }
]

export default function Reports() {
  const navigate = useNavigate()

  const handleReportClick = (path: string) => {
    navigate(path)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <FileBarChart size={28} />
          Reportes y Análisis
        </h1>
        <button className="btn-outline btn-md flex items-center gap-2">
          <Download size={18} />
          Exportar Personalizado
        </button>
      </div>

      {/* Estadísticas rápidas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Ventas Hoy</span>
            <DollarSign className="text-green-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">$2,845.00</p>
          <p className="text-xs text-green-600 mt-1">+12% vs ayer</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Transacciones</span>
            <ShoppingCart className="text-blue-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">142</p>
          <p className="text-xs text-blue-600 mt-1">Promedio: $20.04</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Productos Vendidos</span>
            <Package className="text-purple-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">389</p>
          <p className="text-xs text-purple-600 mt-1">Top: Coca Cola 600ml</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Alertas</span>
            <AlertTriangle className="text-yellow-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">7</p>
          <p className="text-xs text-yellow-600 mt-1">5 productos stock bajo</p>
        </motion.div>
      </div>

      {/* Categorías de reportes */}
      {categories.map((category) => (
        <div key={category.id} className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <category.icon size={20} />
            Reportes de {category.name}
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {reportCards
              .filter(report => report.category === category.id)
              .map((report, index) => (
                <motion.div
                  key={report.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.1 }}
                  onClick={() => handleReportClick(report.path)}
                  className="bg-white rounded-lg shadow-sm p-6 hover:shadow-lg transition-all cursor-pointer group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={`p-3 rounded-lg ${report.color} bg-opacity-10`}>
                      <report.icon className={`${report.color.replace('bg-', 'text-')}`} size={24} />
                    </div>
                    <ArrowRight className="text-gray-400 group-hover:text-gray-600 transition-colors" size={20} />
                  </div>
                  
                  <h3 className="font-semibold text-gray-800 mb-2">{report.title}</h3>
                  <p className="text-sm text-gray-600 line-clamp-2">{report.description}</p>
                </motion.div>
              ))}
          </div>
        </div>
      ))}

      {/* Accesos rápidos */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <LineChart size={20} />
          Gráficos Rápidos
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Mini gráfico de ventas de la semana */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Ventas de la Semana</h4>
            <div className="h-32 bg-gray-100 rounded-lg flex items-center justify-center">
              <span className="text-gray-500">Gráfico de líneas aquí</span>
            </div>
          </div>
          
          {/* Mini gráfico de productos más vendidos */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Top 5 Productos Hoy</h4>
            <div className="h-32 bg-gray-100 rounded-lg flex items-center justify-center">
              <span className="text-gray-500">Gráfico de barras aquí</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}