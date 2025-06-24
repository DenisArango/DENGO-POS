import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Download, Printer, TrendingUp,
  Package, DollarSign, BarChart3, Award,
  Filter, ChevronDown, Calendar, Star
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, Area, AreaChart } from 'recharts'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface TopProduct {
  rank: number
  sku: string
  name: string
  category: string
  quantitySold: number
  revenue: number
  averagePrice: number
  profitMargin: number
  stockLevel: number
  trend: 'up' | 'down' | 'stable'
  lastMonthRank?: number
}

// Datos de ejemplo
const topProducts: TopProduct[] = [
  {
    rank: 1,
    sku: 'BEB-001',
    name: 'Coca Cola Original 600ml',
    category: 'Bebidas',
    quantitySold: 1250,
    revenue: 18750,
    averagePrice: 15,
    profitMargin: 33.3,
    stockLevel: 150,
    trend: 'up',
    lastMonthRank: 3
  },
  {
    rank: 2,
    sku: 'SNK-001',
    name: 'Sabritas Original 45g',
    category: 'Snacks',
    quantitySold: 980,
    revenue: 18130,
    averagePrice: 18.5,
    profitMargin: 35.1,
    stockLevel: 75,
    trend: 'up',
    lastMonthRank: 2
  },
  {
    rank: 3,
    sku: 'BEB-003',
    name: 'Agua Ciel 1L',
    category: 'Bebidas',
    quantitySold: 920,
    revenue: 9200,
    averagePrice: 10,
    profitMargin: 40,
    stockLevel: 200,
    trend: 'stable',
    lastMonthRank: 4
  },
  {
    rank: 4,
    sku: 'DUL-001',
    name: 'Chocolate Snickers',
    category: 'Dulces',
    quantitySold: 750,
    revenue: 16500,
    averagePrice: 22,
    profitMargin: 31.8,
    stockLevel: 45,
    trend: 'up',
    lastMonthRank: 7
  },
  {
    rank: 5,
    sku: 'GAL-001',
    name: 'Galletas Oreo',
    category: 'Galletas',
    quantitySold: 680,
    revenue: 11220,
    averagePrice: 16.5,
    profitMargin: 33.3,
    stockLevel: 90,
    trend: 'down',
    lastMonthRank: 1
  }
]

const salesTrend = [
  { month: 'Ene', coca: 850, sabritas: 720, agua: 650, snickers: 480, oreo: 890 },
  { month: 'Feb', coca: 920, sabritas: 850, agua: 700, snickers: 520, oreo: 850 },
  { month: 'Mar', coca: 1100, sabritas: 900, agua: 850, snickers: 650, oreo: 750 },
  { month: 'Abr', coca: 1050, sabritas: 950, agua: 880, snickers: 700, oreo: 700 },
  { month: 'May', coca: 1200, sabritas: 980, agua: 900, snickers: 720, oreo: 680 },
  { month: 'Jun', coca: 1250, sabritas: 980, agua: 920, snickers: 750, oreo: 680 },
]

const categoryPerformance = [
  { category: 'Bebidas', products: 45, revenue: 38500, percentage: 42 },
  { category: 'Snacks', products: 38, revenue: 28750, percentage: 31 },
  { category: 'Dulces', products: 32, revenue: 18900, percentage: 20 },
  { category: 'Galletas', products: 15, revenue: 6430, percentage: 7 },
]

export default function TopProductsReport() {
  const navigate = useNavigate()
  const [period, setPeriod] = useState('month')
  const [showFilters, setShowFilters] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const filteredProducts = selectedCategory
    ? topProducts.filter(p => p.category === selectedCategory)
    : topProducts

  const getTrendIcon = (trend: string, currentRank: number, lastRank?: number) => {
    if (!lastRank) return null
    
    if (currentRank < lastRank) {
      return <TrendingUp className="text-green-600" size={16} />
    } else if (currentRank > lastRank) {
      return <TrendingUp className="text-red-600 rotate-180" size={16} />
    }
    return <span className="text-gray-400">→</span>
  }

  const getRankChange = (currentRank: number, lastRank?: number) => {
    if (!lastRank) return null
    const change = lastRank - currentRank
    if (change > 0) return `+${change}`
    if (change < 0) return `${change}`
    return '='
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
            <h1 className="text-2xl font-bold text-gray-800">Productos Más Vendidos</h1>
            <p className="text-gray-600 text-sm mt-1">
              Ranking de productos por desempeño en ventas
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
              onClick={() => setPeriod('week')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                period === 'week'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Última Semana
            </button>
            <button
              onClick={() => setPeriod('month')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                period === 'month'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Último Mes
            </button>
            <button
              onClick={() => setPeriod('quarter')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                period === 'quarter'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Último Trimestre
            </button>
          </div>
          
          <div className="flex-1" />
          
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="btn-outline btn-md flex items-center gap-2"
          >
            <Filter size={18} />
            Filtros
            <ChevronDown size={16} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t">
            <label className="text-sm font-medium text-gray-700 mb-2 block">Categoría</label>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  !selectedCategory
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Todas
              </button>
              {['Bebidas', 'Snacks', 'Dulces', 'Galletas'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    selectedCategory === cat
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Top 5 productos destacados */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {filteredProducts.slice(0, 5).map((product, index) => (
          <motion.div
            key={product.sku}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className={`bg-white rounded-lg shadow-sm p-4 ${
              index === 0 ? 'ring-2 ring-yellow-400' : ''
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
                index === 0 ? 'bg-yellow-100 text-yellow-600' :
                index === 1 ? 'bg-gray-100 text-gray-600' :
                index === 2 ? 'bg-orange-100 text-orange-600' :
                'bg-gray-50 text-gray-500'
              }`}>
                {index === 0 ? <Award size={20} /> : <span className="font-bold">#{product.rank}</span>}
              </div>
              <div className="flex items-center gap-1 text-xs">
                {getTrendIcon(product.trend, product.rank, product.lastMonthRank)}
                <span className={`font-medium ${
                  product.rank < (product.lastMonthRank || 999) ? 'text-green-600' :
                  product.rank > (product.lastMonthRank || 0) ? 'text-red-600' :
                  'text-gray-600'
                }`}>
                  {getRankChange(product.rank, product.lastMonthRank)}
                </span>
              </div>
            </div>
            
            <h4 className="font-medium text-sm text-gray-800 mb-1 line-clamp-2">{product.name}</h4>
            <p className="text-xs text-gray-500 mb-3">{product.category}</p>
            
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-gray-600">Vendidos:</span>
                <span className="font-medium">{product.quantitySold}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-600">Ingresos:</span>
                <span className="font-medium text-green-600">${product.revenue.toLocaleString()}</span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tendencia de ventas Top 5 */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <TrendingUp size={20} />
            Tendencia de Ventas - Top 5
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={salesTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="coca" stroke="#ef4444" name="Coca Cola" strokeWidth={2} />
              <Line type="monotone" dataKey="sabritas" stroke="#f59e0b" name="Sabritas" strokeWidth={2} />
              <Line type="monotone" dataKey="agua" stroke="#3b82f6" name="Agua Ciel" strokeWidth={2} />
              <Line type="monotone" dataKey="snickers" stroke="#8b5cf6" name="Snickers" strokeWidth={2} />
              <Line type="monotone" dataKey="oreo" stroke="#10b981" name="Oreo" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Rendimiento por categoría */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <BarChart3 size={20} />
            Rendimiento por Categoría
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={categoryPerformance} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="category" type="category" />
              <Tooltip formatter={(value: any) => `$${value.toLocaleString()}`} />
              <Bar dataKey="revenue" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tabla detallada */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="p-6 border-b">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <Package size={20} />
            Ranking Completo de Productos
          </h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-center py-3 px-4 font-medium text-gray-700">Ranking</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700">Producto</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700">Categoría</th>
                <th className="text-right py-3 px-4 font-medium text-gray-700">Cantidad Vendida</th>
                <th className="text-right py-3 px-4 font-medium text-gray-700">Ingresos</th>
                <th className="text-right py-3 px-4 font-medium text-gray-700">Precio Promedio</th>
                <th className="text-right py-3 px-4 font-medium text-gray-700">Margen %</th>
                <th className="text-center py-3 px-4 font-medium text-gray-700">Stock Actual</th>
                <th className="text-center py-3 px-4 font-medium text-gray-700">Tendencia</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => (
                <tr key={product.sku} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <span className={`font-bold ${
                        product.rank === 1 ? 'text-yellow-600' :
                        product.rank === 2 ? 'text-gray-600' :
                        product.rank === 3 ? 'text-orange-600' :
                        'text-gray-500'
                      }`}>
                        #{product.rank}
                      </span>
                      {product.lastMonthRank && (
                        <span className={`text-xs ${
                          product.rank < product.lastMonthRank ? 'text-green-600' :
                          product.rank > product.lastMonthRank ? 'text-red-600' :
                          'text-gray-500'
                        }`}>
                          ({getRankChange(product.rank, product.lastMonthRank)})
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div>
                      <p className="font-medium text-gray-800">{product.name}</p>
                      <p className="text-xs text-gray-500">SKU: {product.sku}</p>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-gray-600">{product.category}</td>
                  <td className="py-3 px-4 text-right font-medium">{product.quantitySold.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right font-medium text-green-600">
                    ${product.revenue.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right">${product.averagePrice.toFixed(2)}</td>
                  <td className="py-3 px-4 text-right">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      product.profitMargin >= 35 ? 'bg-green-100 text-green-700' :
                      product.profitMargin >= 30 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {product.profitMargin.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`font-medium ${
                      product.stockLevel < 50 ? 'text-red-600' :
                      product.stockLevel < 100 ? 'text-yellow-600' :
                      'text-green-600'
                    }`}>
                      {product.stockLevel}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    {getTrendIcon(product.trend, product.rank, product.lastMonthRank)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recomendaciones */}
      <div className="bg-blue-50 rounded-lg p-6">
        <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
          <Star size={20} />
          Recomendaciones Basadas en el Análisis
        </h3>
        <ul className="space-y-2 text-sm text-blue-800">
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-0.5">•</span>
            <span>
              <strong>Coca Cola 600ml</strong> mantiene el liderazgo con excelente rotación. 
              Considerar aumentar el stock de seguridad para evitar quiebres.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-0.5">•</span>
            <span>
              <strong>Galletas Oreo</strong> ha bajado del puesto #1 al #5. 
              Revisar precio y promociones para recuperar posición.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-0.5">•</span>
            <span>
              <strong>Chocolate Snickers</strong> muestra el mejor crecimiento (+3 posiciones). 
              Aprovechar el momento con mayor visibilidad en tienda.
            </span>
          </li>
        </ul>
      </div>
    </div>
  )
}