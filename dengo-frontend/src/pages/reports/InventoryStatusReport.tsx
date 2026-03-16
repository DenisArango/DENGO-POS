import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Download, Printer, Package,
  AlertTriangle, TrendingDown, DollarSign,
  BarChart3, PieChart as PieChartIcon, AlertCircle,
  CheckCircle, XCircle, Warehouse
} from 'lucide-react'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface InventoryProduct {
  sku: string
  name: string
  category: string
  currentStock: number
  minStock: number
  maxStock: number
  unit: string
  costPerUnit: number
  totalValue: number
  daysOfInventory: number
  status: 'normal' | 'low' | 'critical' | 'overstock' | 'out'
  lastRestockDate: string
  averageDailySales: number
}

// Datos de ejemplo
const inventoryData: InventoryProduct[] = [
  {
    sku: 'BEB-001',
    name: 'Coca Cola Original 600ml',
    category: 'Bebidas',
    currentStock: 15,
    minStock: 20,
    maxStock: 200,
    unit: 'piezas',
    costPerUnit: 10,
    totalValue: 150,
    daysOfInventory: 3,
    status: 'low',
    lastRestockDate: '2024-01-15',
    averageDailySales: 5
  },
  {
    sku: 'SNK-001',
    name: 'Sabritas Original 45g',
    category: 'Snacks',
    currentStock: 5,
    minStock: 30,
    maxStock: 150,
    unit: 'piezas',
    costPerUnit: 12,
    totalValue: 60,
    daysOfInventory: 1,
    status: 'critical',
    lastRestockDate: '2024-01-08',
    averageDailySales: 4.5
  },
  {
    sku: 'DUL-001',
    name: 'Chocolate Snickers',
    category: 'Dulces',
    currentStock: 0,
    minStock: 20,
    maxStock: 100,
    unit: 'piezas',
    costPerUnit: 15,
    totalValue: 0,
    daysOfInventory: 0,
    status: 'out',
    lastRestockDate: '2024-01-10',
    averageDailySales: 3
  },
  {
    sku: 'TEL-001',
    name: 'Hilo Omega Azul Marino',
    category: 'Telas y Mercería',
    currentStock: 200,
    minStock: 50,
    maxStock: 150,
    unit: 'metros',
    costPerUnit: 3,
    totalValue: 600,
    daysOfInventory: 40,
    status: 'overstock',
    lastRestockDate: '2024-01-12',
    averageDailySales: 5
  },
  {
    sku: 'PAP-001',
    name: 'Cuaderno Arimany Doble Línea 80 Hojas',
    category: 'Papelería',
    currentStock: 75,
    minStock: 10,
    maxStock: 100,
    unit: 'piezas',
    costPerUnit: 15,
    totalValue: 1125,
    daysOfInventory: 25,
    status: 'normal',
    lastRestockDate: '2024-01-10',
    averageDailySales: 3
  }
]

const inventoryByStatus = [
  { name: 'Stock Normal', value: 45, color: '#10B981' },
  { name: 'Stock Bajo', value: 23, color: '#F59E0B' },
  { name: 'Stock Crítico', value: 12, color: '#EF4444' },
  { name: 'Sin Stock', value: 5, color: '#6B7280' },
  { name: 'Sobrestock', value: 8, color: '#3B82F6' },
]

const inventoryByCategory = [
  { category: 'Bebidas', value: 12500, units: 450 },
  { category: 'Snacks', value: 8900, units: 320 },
  { category: 'Dulces', value: 6200, units: 180 },
  { category: 'Papelería', value: 4500, units: 150 },
  { category: 'Telas', value: 3200, units: 280 },
]

const stockAlerts = [
  { product: 'Chocolate Snickers', daysOut: 2, estimatedLoss: 180 },
  { product: 'Sabritas Original', daysToOut: 1, urgency: 'critical' },
  { product: 'Coca Cola 600ml', daysToOut: 3, urgency: 'high' },
  { product: 'Galletas Oreo', daysToOut: 5, urgency: 'medium' },
]

export default function InventoryStatusReport() {
  const navigate = useNavigate()

  const stats = {
    totalValue: 35300,
    totalProducts: 93,
    criticalItems: 17,
    outOfStock: 5,
    overstock: 8,
    averageDaysInventory: 18
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'normal': return 'text-green-600 bg-green-50'
      case 'low': return 'text-yellow-600 bg-yellow-50'
      case 'critical': return 'text-red-600 bg-red-50'
      case 'overstock': return 'text-blue-600 bg-blue-50'
      case 'out': return 'text-gray-600 bg-gray-50'
      default: return 'text-gray-600 bg-gray-50'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'normal': return <CheckCircle size={16} />
      case 'low': return <AlertCircle size={16} />
      case 'critical': return <AlertTriangle size={16} />
      case 'overstock': return <TrendingDown size={16} />
      case 'out': return <XCircle size={16} />
      default: return null
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'normal': return 'Normal'
      case 'low': return 'Stock Bajo'
      case 'critical': return 'Crítico'
      case 'overstock': return 'Sobrestock'
      case 'out': return 'Sin Stock'
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
            <h1 className="text-2xl font-bold text-gray-800">Estado del Inventario</h1>
            <p className="text-gray-600 text-sm mt-1">
              Análisis actual del inventario y alertas de stock
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

      {/* KPIs principales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Valor Total</span>
            <DollarSign className="text-green-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">${stats.totalValue.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1">En inventario</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Total Productos</span>
            <Package className="text-blue-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.totalProducts}</p>
          <p className="text-xs text-blue-600 mt-1">SKUs activos</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Items Críticos</span>
            <AlertTriangle className="text-red-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.criticalItems}</p>
          <p className="text-xs text-red-600 mt-1">Requieren atención</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Sin Stock</span>
            <XCircle className="text-gray-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.outOfStock}</p>
          <p className="text-xs text-gray-600 mt-1">Productos agotados</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Sobrestock</span>
            <TrendingDown className="text-purple-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.overstock}</p>
          <p className="text-xs text-purple-600 mt-1">Exceso inventario</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Días Promedio</span>
            <Warehouse className="text-teal-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.averageDaysInventory}</p>
          <p className="text-xs text-teal-600 mt-1">De inventario</p>
        </motion.div>
      </div>

      {/* Alertas críticas */}
      <div className="bg-red-50 rounded-lg p-6">
        <h3 className="font-semibold text-red-900 mb-4 flex items-center gap-2">
          <AlertTriangle size={20} />
          Alertas Críticas de Stock
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {stockAlerts.map((alert, index) => (
            <motion.div
              key={alert.product}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
              className="bg-white rounded-lg p-4 border border-red-200"
            >
              <h4 className="font-medium text-gray-800 text-sm mb-2">{alert.product}</h4>
              {alert.daysOut ? (
                <div>
                  <p className="text-red-600 font-bold">Agotado hace {alert.daysOut} días</p>
                  <p className="text-xs text-gray-600 mt-1">
                    Pérdida estimada: ${alert.estimatedLoss}
                  </p>
                </div>
              ) : (
                <div>
                  <p className={`font-bold ${
                    alert.urgency === 'critical' ? 'text-red-600' :
                    alert.urgency === 'high' ? 'text-orange-600' :
                    'text-yellow-600'
                  }`}>
                    Se agotará en {alert.daysToOut} días
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    Urgencia: {alert.urgency === 'critical' ? 'Crítica' : alert.urgency === 'high' ? 'Alta' : 'Media'}
                  </p>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Distribución por estado */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <PieChartIcon size={20} />
            Distribución por Estado de Stock
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={inventoryByStatus}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {inventoryByStatus.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Valor por categoría */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <BarChart3 size={20} />
            Valor de Inventario por Categoría
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={inventoryByCategory}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="category" />
              <YAxis />
              <Tooltip formatter={(value: any) => `${value.toLocaleString()}`} />
              <Legend />
              <Bar dataKey="value" fill="#3B82F6" name="Valor ($)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tabla de productos críticos */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="p-6 border-b">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <AlertCircle size={20} />
            Productos que Requieren Atención Inmediata
          </h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-3 px-4 font-medium text-gray-700">SKU</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700">Producto</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700">Categoría</th>
                <th className="text-center py-3 px-4 font-medium text-gray-700">Stock Actual</th>
                <th className="text-center py-3 px-4 font-medium text-gray-700">Stock Mínimo</th>
                <th className="text-center py-3 px-4 font-medium text-gray-700">Estado</th>
                <th className="text-center py-3 px-4 font-medium text-gray-700">Días Inventario</th>
                <th className="text-right py-3 px-4 font-medium text-gray-700">Valor</th>
                <th className="text-center py-3 px-4 font-medium text-gray-700">Última Reposición</th>
              </tr>
            </thead>
            <tbody>
              {inventoryData
                .filter(item => ['critical', 'out', 'low'].includes(item.status))
                .sort((a, b) => {
                  const statusOrder = { out: 0, critical: 1, low: 2 }
                  return statusOrder[a.status] - statusOrder[b.status]
                })
                .map((item) => (
                  <tr key={item.sku} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4 font-medium">{item.sku}</td>
                    <td className="py-3 px-4">
                      <p className="font-medium text-gray-800">{item.name}</p>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{item.category}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`font-bold ${
                        item.status === 'out' ? 'text-gray-600' :
                        item.status === 'critical' ? 'text-red-600' :
                        'text-yellow-600'
                      }`}>
                        {item.currentStock} {item.unit}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center text-gray-600">
                      {item.minStock} {item.unit}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(item.status)}`}>
                        {getStatusIcon(item.status)}
                        {getStatusLabel(item.status)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`font-medium ${
                        item.daysOfInventory === 0 ? 'text-red-600' :
                        item.daysOfInventory <= 3 ? 'text-yellow-600' :
                        'text-gray-600'
                      }`}>
                        {item.daysOfInventory} días
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-medium">
                      ${item.totalValue.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-center text-sm text-gray-600">
                      {new Date(item.lastRestockDate).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Productos con sobrestock */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="p-6 border-b">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <TrendingDown size={20} />
            Productos con Exceso de Inventario
          </h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-3 px-4 font-medium text-gray-700">Producto</th>
                <th className="text-center py-3 px-4 font-medium text-gray-700">Stock Actual</th>
                <th className="text-center py-3 px-4 font-medium text-gray-700">Stock Máximo</th>
                <th className="text-center py-3 px-4 font-medium text-gray-700">Días de Inventario</th>
                <th className="text-right py-3 px-4 font-medium text-gray-700">Capital Inmovilizado</th>
                <th className="text-center py-3 px-4 font-medium text-gray-700">Recomendación</th>
              </tr>
            </thead>
            <tbody>
              {inventoryData
                .filter(item => item.status === 'overstock')
                .map((item) => (
                  <tr key={item.sku} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-medium text-gray-800">{item.name}</p>
                        <p className="text-xs text-gray-500">SKU: {item.sku}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center font-medium text-blue-600">
                      {item.currentStock} {item.unit}
                    </td>
                    <td className="py-3 px-4 text-center text-gray-600">
                      {item.maxStock} {item.unit}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="font-medium text-purple-600">{item.daysOfInventory} días</span>
                    </td>
                    <td className="py-3 px-4 text-right font-medium">
                      ${item.totalValue.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-sm text-gray-600">
                        Promover con {Math.round((item.currentStock - item.maxStock) / item.currentStock * 100)}% descuento
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Resumen y recomendaciones */}
      <div className="bg-blue-50 rounded-lg p-6">
        <h3 className="font-semibold text-blue-900 mb-3">Resumen y Recomendaciones</h3>
        <div className="space-y-2 text-sm text-blue-800">
          <p>
            • <strong>Acción inmediata:</strong> Reabastecer los {stats.outOfStock} productos sin stock 
            que representan una pérdida estimada de $450 diarios.
          </p>
          <p>
            • <strong>Prioridad alta:</strong> Ordenar reposición para {stats.criticalItems - stats.outOfStock} productos 
            en estado crítico antes de que se agoten.
          </p>
          <p>
            • <strong>Optimización:</strong> Revisar los {stats.overstock} productos con sobrestock. 
            Considerar promociones o transferencias a otras sucursales.
          </p>
          <p>
            • <strong>Eficiencia:</strong> El inventario promedio de {stats.averageDaysInventory} días está dentro 
            del rango óptimo (15-30 días) para el tipo de negocio.
          </p>
        </div>
      </div>
    </div>
  )
}