import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Calendar, Download, Printer, Package,
  TrendingUp, TrendingDown, AlertTriangle, Clock,
  BarChart3, Activity, Zap, Info, ChevronDown,
  ArrowUpRight, ArrowDownRight, RotateCw
} from 'lucide-react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, RadialBarChart, RadialBar, Cell } from 'recharts'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface ProductRotation {
  id: string
  name: string
  category: string
  currentStock: number
  salesLast30Days: number
  rotationIndex: number
  daysOfInventory: number
  status: 'high' | 'normal' | 'low' | 'critical'
  trend: 'up' | 'down' | 'stable'
  averageDailySales: number
  lastRestockDate: string
}

// Datos de ejemplo
const productsRotation: ProductRotation[] = [
  {
    id: '1',
    name: 'Coca Cola 600ml',
    category: 'Bebidas',
    currentStock: 120,
    salesLast30Days: 450,
    rotationIndex: 3.75,
    daysOfInventory: 8,
    status: 'high',
    trend: 'up',
    averageDailySales: 15,
    lastRestockDate: '2024-01-15'
  },
  {
    id: '2',
    name: 'Sabritas Original',
    category: 'Snacks',
    currentStock: 85,
    salesLast30Days: 340,
    rotationIndex: 4.0,
    daysOfInventory: 7.5,
    status: 'high',
    trend: 'stable',
    averageDailySales: 11.3,
    lastRestockDate: '2024-01-16'
  },
  {
    id: '3',
    name: 'Papel Higiénico Elite',
    category: 'Limpieza',
    currentStock: 200,
    salesLast30Days: 60,
    rotationIndex: 0.3,
    daysOfInventory: 100,
    status: 'critical',
    trend: 'down',
    averageDailySales: 2,
    lastRestockDate: '2023-12-20'
  },
  {
    id: '4',
    name: 'Galletas Oreo',
    category: 'Dulces',
    currentStock: 65,
    salesLast30Days: 260,
    rotationIndex: 4.0,
    daysOfInventory: 7.5,
    status: 'high',
    trend: 'up',
    averageDailySales: 8.7,
    lastRestockDate: '2024-01-17'
  },
  {
    id: '5',
    name: 'Detergente Ariel 1kg',
    category: 'Limpieza',
    currentStock: 40,
    salesLast30Days: 80,
    rotationIndex: 2.0,
    daysOfInventory: 15,
    status: 'normal',
    trend: 'stable',
    averageDailySales: 2.7,
    lastRestockDate: '2024-01-10'
  }
]

const rotationByCategory = [
  { category: 'Bebidas', rotation: 4.2, products: 45, color: '#3B82F6' },
  { category: 'Snacks', rotation: 3.8, products: 38, color: '#10B981' },
  { category: 'Dulces', rotation: 3.5, products: 32, color: '#8B5CF6' },
  { category: 'Limpieza', rotation: 1.2, products: 25, color: '#F59E0B' },
  { category: 'Papelería', rotation: 0.8, products: 20, color: '#EF4444' }
]

const rotationTrend = [
  { week: 'Sem 1', indice: 2.8 },
  { week: 'Sem 2', indice: 3.1 },
  { week: 'Sem 3', indice: 3.4 },
  { week: 'Sem 4', indice: 3.2 }
]

const inventoryAging = [
  { range: '0-7 días', products: 120, percentage: 40, value: 25000 },
  { range: '8-15 días', products: 90, percentage: 30, value: 18000 },
  { range: '16-30 días', products: 60, percentage: 20, value: 12000 },
  { range: '31-60 días', products: 20, percentage: 7, value: 4000 },
  { range: '60+ días', products: 10, percentage: 3, value: 2000 }
]

export default function ProductRotationReport() {
  const navigate = useNavigate()
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month' | 'quarter'>('month')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [showFilters, setShowFilters] = useState(false)

  const stats = {
    averageRotation: 3.2,
    totalProducts: 300,
    highRotation: 145,
    lowRotation: 45,
    criticalProducts: 12,
    inventoryValue: 61000
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'high': return 'text-green-600 bg-green-100'
      case 'normal': return 'text-blue-600 bg-blue-100'
      case 'low': return 'text-yellow-600 bg-yellow-100'
      case 'critical': return 'text-red-600 bg-red-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'high': return 'Alta rotación'
      case 'normal': return 'Rotación normal'
      case 'low': return 'Baja rotación'
      case 'critical': return 'Crítico'
      default: return status
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/reports')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Reporte de Rotación de Productos</h1>
            <p className="text-gray-600 text-sm mt-1">
              Análisis de velocidad de venta y días de inventario
            </p>
          </div>
        </div>
        
        <div className="flex gap-3">
          <button className="btn-outline btn-md flex items-center gap-2">
            <Printer size={18} />
            Imprimir
          </button>
          <button className="btn-primary btn-md flex items-center gap-2">
            <Download size={18} />
            Exportar
          </button>
        </div>
      </div>

      {/* Controles */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedPeriod('week')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedPeriod === 'week'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Última Semana
            </button>
            <button
              onClick={() => setSelectedPeriod('month')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedPeriod === 'month'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Último Mes
            </button>
            <button
              onClick={() => setSelectedPeriod('quarter')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedPeriod === 'quarter'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Último Trimestre
            </button>
          </div>
          
          <div className="flex-1" />
          
          <div className="flex gap-2">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="input"
            >
              <option value="all">Todas las categorías</option>
              <option value="bebidas">Bebidas</option>
              <option value="snacks">Snacks</option>
              <option value="dulces">Dulces</option>
              <option value="limpieza">Limpieza</option>
              <option value="papeleria">Papelería</option>
            </select>
            
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="btn-outline btn-md flex items-center gap-2"
            >
              <Package size={18} />
              Filtros
              <ChevronDown size={16} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Índice Promedio</span>
            <RotateCw className="text-blue-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.averageRotation.toFixed(1)}</p>
          <p className="text-xs text-blue-600 mt-1">Rotaciones/mes</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Total Productos</span>
            <Package className="text-purple-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.totalProducts}</p>
          <p className="text-xs text-purple-600 mt-1">En análisis</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Alta Rotación</span>
            <TrendingUp className="text-green-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.highRotation}</p>
          <p className="text-xs text-green-600 mt-1">{((stats.highRotation / stats.totalProducts) * 100).toFixed(0)}% del total</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Baja Rotación</span>
            <TrendingDown className="text-yellow-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.lowRotation}</p>
          <p className="text-xs text-yellow-600 mt-1">{((stats.lowRotation / stats.totalProducts) * 100).toFixed(0)}% del total</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Productos Críticos</span>
            <AlertTriangle className="text-red-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.criticalProducts}</p>
          <p className="text-xs text-red-600 mt-1">Requieren acción</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Valor Inventario</span>
            <BarChart3 className="text-teal-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">${stats.inventoryValue.toLocaleString()}</p>
          <p className="text-xs text-teal-600 mt-1">Total analizado</p>
        </motion.div>
      </div>

      {/* Gráficos principales */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Rotación por categoría */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <BarChart3 size={20} />
            Índice de Rotación por Categoría
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={rotationByCategory}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="category" />
              <YAxis />
              <Tooltip 
                formatter={(value: any, name: string) => {
                  if (name === 'rotation') return [`${value} rotaciones/mes`, 'Índice']
                  return [value, name]
                }}
              />
              <Bar dataKey="rotation" name="Índice de Rotación">
                {rotationByCategory.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Tendencia de rotación */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Activity size={20} />
            Tendencia del Índice de Rotación
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={rotationTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="week" />
              <YAxis />
              <Tooltip formatter={(value: any) => `${value} rotaciones`} />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="indice" 
                stroke="#3B82F6" 
                strokeWidth={2}
                name="Índice de Rotación"
                dot={{ fill: '#3B82F6' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tabla de productos */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Package size={20} />
          Detalle de Rotación por Producto
        </h3>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Producto</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Categoría</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Stock Actual</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Ventas (30d)</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Índice Rotación</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Días Inventario</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Estado</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Tendencia</th>
              </tr>
            </thead>
            <tbody>
              {productsRotation.map((product, index) => (
                <tr key={product.id} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <p className="font-medium text-gray-800">{product.name}</p>
                    <p className="text-xs text-gray-500">
                      Último restock: {format(new Date(product.lastRestockDate), "d 'de' MMM", { locale: es })}
                    </p>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600">{product.category}</td>
                  <td className="py-3 px-4 text-center">
                    <span className="font-medium">{product.currentStock}</span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="font-medium">{product.salesLast30Days}</span>
                    <p className="text-xs text-gray-500">{product.averageDailySales}/día</p>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`font-bold ${
                      product.rotationIndex >= 3 ? 'text-green-600' :
                      product.rotationIndex >= 2 ? 'text-blue-600' :
                      product.rotationIndex >= 1 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {product.rotationIndex.toFixed(1)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`font-medium ${
                      product.daysOfInventory <= 10 ? 'text-green-600' :
                      product.daysOfInventory <= 20 ? 'text-blue-600' :
                      product.daysOfInventory <= 30 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {product.daysOfInventory}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(product.status)}`}>
                      {getStatusLabel(product.status)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    {product.trend === 'up' && <ArrowUpRight className="text-green-600 mx-auto" size={16} />}
                    {product.trend === 'down' && <ArrowDownRight className="text-red-600 mx-auto" size={16} />}
                    {product.trend === 'stable' && <span className="text-gray-400 mx-auto">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Antigüedad del inventario */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Clock size={20} />
          Antigüedad del Inventario
        </h3>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={inventoryAging} layout="horizontal">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="range" type="category" width={80} />
                <Tooltip formatter={(value: any) => [`${value} productos`, 'Cantidad']} />
                <Bar dataKey="products" fill="#3B82F6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          
          <div className="space-y-3">
            {inventoryAging.map((item, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-800">{item.range}</p>
                  <p className="text-sm text-gray-600">{item.products} productos</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-lg text-gray-800">{item.percentage}%</p>
                  <p className="text-sm text-gray-600">${item.value.toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Alertas y recomendaciones */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-yellow-50 rounded-lg p-6">
          <h3 className="font-semibold text-yellow-900 mb-3 flex items-center gap-2">
            <AlertTriangle size={20} />
            Productos que Requieren Atención
          </h3>
          <ul className="space-y-2 text-sm text-yellow-800">
            <li className="flex items-start gap-2">
              <span className="text-yellow-600 mt-0.5">•</span>
              <span>
                <strong>Papel Higiénico Elite:</strong> Rotación crítica (0.3), considerar promoción o descuento.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-yellow-600 mt-0.5">•</span>
              <span>
                <strong>10 productos</strong> tienen más de 60 días en inventario.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-yellow-600 mt-0.5">•</span>
              <span>
                La categoría <strong>Limpieza</strong> presenta baja rotación general (1.2).
              </span>
            </li>
          </ul>
        </div>

        <div className="bg-green-50 rounded-lg p-6">
          <h3 className="font-semibold text-green-900 mb-3 flex items-center gap-2">
            <Zap size={20} />
            Oportunidades de Optimización
          </h3>
          <ul className="space-y-2 text-sm text-green-800">
            <li className="flex items-start gap-2">
              <span className="text-green-600 mt-0.5">•</span>
              <span>
                Incrementar stock de productos con alta rotación: Coca Cola, Sabritas, Oreo.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-600 mt-0.5">•</span>
              <span>
                Implementar promociones 2x1 para productos con más de 30 días en inventario.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-600 mt-0.5">•</span>
              <span>
                Renegociar cantidades mínimas con proveedores de productos de baja rotación.
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}