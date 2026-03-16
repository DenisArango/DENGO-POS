import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Download, Printer, Percent,
  TrendingUp, TrendingDown, DollarSign, Package,
  BarChart3, AlertTriangle, Target, PieChart as PieChartIcon
} from 'lucide-react'
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Treemap } from 'recharts'

interface ProductMargin {
  id: string
  name: string
  category: string
  cost: number
  price: number
  margin: number
  marginPercent: number
  unitsSold: number
  totalRevenue: number
  totalProfit: number
  trend: 'up' | 'down' | 'stable'
}

interface CategoryMargin {
  category: string
  avgMargin: number
  totalRevenue: number
  totalProfit: number
  productCount: number
  color: string
}

// Datos de ejemplo
const productMargins: ProductMargin[] = [
  {
    id: '1',
    name: 'Hilo Omega Azul Marino',
    category: 'Telas y Mercería',
    cost: 3,
    price: 5,
    margin: 2,
    marginPercent: 40,
    unitsSold: 450,
    totalRevenue: 2250,
    totalProfit: 900,
    trend: 'up'
  },
  {
    id: '2',
    name: 'Cuaderno Arimany 80 Hojas',
    category: 'Papelería',
    cost: 15,
    price: 25,
    margin: 10,
    marginPercent: 40,
    unitsSold: 320,
    totalRevenue: 8000,
    totalProfit: 3200,
    trend: 'stable'
  },
  {
    id: '3',
    name: 'Agua Ciel 1L',
    category: 'Bebidas',
    cost: 6,
    price: 10,
    margin: 4,
    marginPercent: 40,
    unitsSold: 920,
    totalRevenue: 9200,
    totalProfit: 3680,
    trend: 'up'
  },
  {
    id: '4',
    name: 'Sabritas Original',
    category: 'Snacks',
    cost: 12,
    price: 18.5,
    margin: 6.5,
    marginPercent: 35.1,
    unitsSold: 680,
    totalRevenue: 12580,
    totalProfit: 4420,
    trend: 'up'
  },
  {
    id: '5',
    name: 'Coca Cola 600ml',
    category: 'Bebidas',
    cost: 10,
    price: 15,
    margin: 5,
    marginPercent: 33.3,
    unitsSold: 1250,
    totalRevenue: 18750,
    totalProfit: 6250,
    trend: 'stable'
  },
  {
    id: '6',
    name: 'Chocolate Snickers',
    category: 'Dulces',
    cost: 15,
    price: 22,
    margin: 7,
    marginPercent: 31.8,
    unitsSold: 420,
    totalRevenue: 9240,
    totalProfit: 2940,
    trend: 'down'
  },
  {
    id: '7',
    name: 'Galletas Emperador',
    category: 'Galletas',
    cost: 8,
    price: 12,
    margin: 4,
    marginPercent: 33.3,
    unitsSold: 280,
    totalRevenue: 3360,
    totalProfit: 1120,
    trend: 'down'
  },
  {
    id: '8',
    name: 'Chicles Trident',
    category: 'Dulces',
    cost: 7,
    price: 12,
    margin: 5,
    marginPercent: 41.7,
    unitsSold: 520,
    totalRevenue: 6240,
    totalProfit: 2600,
    trend: 'up'
  }
]

const categoryMargins: CategoryMargin[] = [
  { category: 'Telas y Mercería', avgMargin: 42.5, totalRevenue: 8500, totalProfit: 3612, productCount: 12, color: '#06B6D4' },
  { category: 'Papelería', avgMargin: 38.2, totalRevenue: 15200, totalProfit: 5806, productCount: 18, color: '#8B5CF6' },
  { category: 'Bebidas', avgMargin: 35.8, totalRevenue: 35600, totalProfit: 12745, productCount: 25, color: '#3B82F6' },
  { category: 'Snacks', avgMargin: 34.5, totalRevenue: 28900, totalProfit: 9970, productCount: 22, color: '#F59E0B' },
  { category: 'Dulces', avgMargin: 33.9, totalRevenue: 22400, totalProfit: 7594, productCount: 28, color: '#EC4899' },
  { category: 'Galletas', avgMargin: 32.1, totalRevenue: 12800, totalProfit: 4109, productCount: 15, color: '#10B981' },
]

const marginTrend = [
  { month: 'Ene', margin: 34.2, target: 35 },
  { month: 'Feb', margin: 34.8, target: 35 },
  { month: 'Mar', margin: 35.2, target: 35 },
  { month: 'Abr', margin: 35.5, target: 35 },
  { month: 'May', margin: 35.8, target: 35 },
  { month: 'Jun', margin: 36.2, target: 35 },
]

const treemapData = productMargins.map(product => ({
  name: product.name,
  size: product.totalProfit,
  margin: product.marginPercent,
  category: product.category
}))

export default function ProfitMarginsReport() {
  const navigate = useNavigate()

  const stats = {
    avgMargin: 35.4,
    totalRevenue: 123400,
    totalProfit: 43700,
    bestMarginProduct: 'Hilo Omega Azul Marino',
    bestMarginPercent: 42.5,
    worstMarginProduct: 'Chocolate Snickers',
    worstMarginPercent: 31.8,
    targetMargin: 35
  }

  const getMarginColor = (margin: number) => {
    if (margin >= 40) return 'text-green-600 bg-green-50'
    if (margin >= 35) return 'text-blue-600 bg-blue-50'
    if (margin >= 30) return 'text-yellow-600 bg-yellow-50'
    return 'text-red-600 bg-red-50'
  }

  const getTrendIcon = (trend: string) => {
    if (trend === 'up') return <TrendingUp className="text-green-600" size={16} />
    if (trend === 'down') return <TrendingDown className="text-red-600" size={16} />
    return <span className="text-gray-400">→</span>
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
            <h1 className="text-2xl font-bold text-gray-800">Márgenes de Ganancia</h1>
            <p className="text-gray-600 text-sm mt-1">
              Análisis de rentabilidad por producto y categoría
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Margen Promedio</span>
            <Percent className="text-blue-600" size={20} />
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold text-gray-800">{stats.avgMargin}%</p>
            <span className={`text-xs ${stats.avgMargin >= stats.targetMargin ? 'text-green-600' : 'text-red-600'}`}>
              {stats.avgMargin >= stats.targetMargin ? '↑' : '↓'} Meta: {stats.targetMargin}%
            </span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Ganancia Total</span>
            <DollarSign className="text-green-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">${stats.totalProfit.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1">De ${stats.totalRevenue.toLocaleString()} en ventas</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Mejor Margen</span>
            <TrendingUp className="text-green-600" size={20} />
          </div>
          <p className="text-lg font-bold text-gray-800">{stats.bestMarginPercent}%</p>
          <p className="text-xs text-gray-600 mt-1 truncate">{stats.bestMarginProduct}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Margen más Bajo</span>
            <AlertTriangle className="text-yellow-600" size={20} />
          </div>
          <p className="text-lg font-bold text-gray-800">{stats.worstMarginPercent}%</p>
          <p className="text-xs text-gray-600 mt-1 truncate">{stats.worstMarginProduct}</p>
        </motion.div>
      </div>

      {/* Gráficos principales */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Margen por categoría */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <BarChart3 size={20} />
            Margen Promedio por Categoría
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={categoryMargins} layout="horizontal">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="category" />
              <YAxis />
              <Tooltip formatter={(value: any) => `${value}%`} />
              <Bar dataKey="avgMargin" name="Margen %">
                {categoryMargins.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Tendencia de márgenes */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <TrendingUp size={20} />
            Evolución del Margen vs Objetivo
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={marginTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis domain={[30, 40]} />
              <Tooltip formatter={(value: any) => `${value}%`} />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="margin" 
                stroke="#3B82F6" 
                strokeWidth={2}
                name="Margen Real"
                dot={{ fill: '#3B82F6' }}
              />
              <Line 
                type="monotone" 
                dataKey="target" 
                stroke="#EF4444" 
                strokeDasharray="5 5"
                name="Objetivo"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Treemap de contribución a ganancias */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <PieChartIcon size={20} />
          Contribución a las Ganancias por Producto
        </h3>
        <ResponsiveContainer width="100%" height={400}>
          <Treemap
            data={treemapData}
            dataKey="size"
            ratio={4/3}
            stroke="#fff"
            content={({ x, y, width, height, name, size, margin }) => {
              const marginColor = margin >= 40 ? '#10B981' : 
                               margin >= 35 ? '#3B82F6' : 
                               margin >= 30 ? '#F59E0B' : '#EF4444'
              
              return (
                <g>
                  <rect
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    style={{
                      fill: marginColor,
                      fillOpacity: 0.7,
                      stroke: '#fff',
                      strokeWidth: 2,
                      strokeOpacity: 1,
                    }}
                  />
                  {width > 60 && height > 40 && (
                    <>
                      <text
                        x={x + width / 2}
                        y={y + height / 2 - 10}
                        textAnchor="middle"
                        fill="#fff"
                        fontSize={12}
                        fontWeight="bold"
                      >
                        {name}
                      </text>
                      <text
                        x={x + width / 2}
                        y={y + height / 2 + 10}
                        textAnchor="middle"
                        fill="#fff"
                        fontSize={11}
                      >
                        ${size} ({margin}%)
                      </text>
                    </>
                  )}
                </g>
              )
            }}
          />
        </ResponsiveContainer>
        <div className="mt-4 flex items-center justify-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-500 rounded"></div>
            <span>≥40% margen</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-500 rounded"></div>
            <span>35-39% margen</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-yellow-500 rounded"></div>
            <span>30-34% margen</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-500 rounded"></div>
            <span>30% margen</span>
          </div>
        </div>
      </div>

      {/* Tabla detallada de productos */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="p-6 border-b">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <Package size={20} />
            Análisis Detallado por Producto
          </h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-3 px-4 font-medium text-gray-700">Producto</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700">Categoría</th>
                <th className="text-right py-3 px-4 font-medium text-gray-700">Costo</th>
                <th className="text-right py-3 px-4 font-medium text-gray-700">Precio</th>
                <th className="text-right py-3 px-4 font-medium text-gray-700">Margen $</th>
                <th className="text-center py-3 px-4 font-medium text-gray-700">Margen %</th>
                <th className="text-right py-3 px-4 font-medium text-gray-700">Unidades</th>
                <th className="text-right py-3 px-4 font-medium text-gray-700">Ganancia Total</th>
                <th className="text-center py-3 px-4 font-medium text-gray-700">Tendencia</th>
              </tr>
            </thead>
            <tbody>
              {productMargins
                .sort((a, b) => b.marginPercent - a.marginPercent)
                .map((product) => (
                  <tr key={product.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <p className="font-medium text-gray-800">{product.name}</p>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{product.category}</td>
                    <td className="py-3 px-4 text-right">${product.cost.toFixed(2)}</td>
                    <td className="py-3 px-4 text-right font-medium">${product.price.toFixed(2)}</td>
                    <td className="py-3 px-4 text-right text-green-600">
                      ${product.margin.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getMarginColor(product.marginPercent)}`}>
                        {product.marginPercent.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">{product.unitsSold.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right font-bold text-green-600">
                      ${product.totalProfit.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {getTrendIcon(product.trend)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Análisis por categoría */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="p-6 border-b">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <PieChartIcon size={20} />
            Resumen por Categoría
          </h3>
        </div>
        
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {categoryMargins.map((category, index) => (
              <motion.div
                key={category.category}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1 }}
                className="border rounded-lg p-4 hover:shadow-md transition-all"
                style={{ borderColor: category.color }}
              >
                <div className="flex items-start justify-between mb-3">
                  <h4 className="font-medium text-gray-800">{category.category}</h4>
                  <span 
                    className="text-2xl font-bold"
                    style={{ color: category.color }}
                  >
                    {category.avgMargin}%
                  </span>
                </div>
                
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Productos:</span>
                    <span className="font-medium">{category.productCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Ingresos:</span>
                    <span className="font-medium">${category.totalRevenue.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Ganancia:</span>
                    <span className="font-medium text-green-600">
                      ${category.totalProfit.toLocaleString()}
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Recomendaciones */}
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
                <strong>Chocolate Snickers</strong> tiene el margen más bajo (31.8%). 
                Evaluar aumento de precio o negociar mejor costo con proveedor.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-yellow-600 mt-0.5">•</span>
              <span>
                La categoría <strong>Galletas</strong> está por debajo del objetivo de 35%. 
                Revisar estrategia de precios completa.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-yellow-600 mt-0.5">•</span>
              <span>
                3 productos muestran <strong>tendencia negativa</strong>. 
                Investigar causas y ajustar promociones.
              </span>
            </li>
          </ul>
        </div>

        <div className="bg-green-50 rounded-lg p-6">
          <h3 className="font-semibold text-green-900 mb-3 flex items-center gap-2">
            <Target size={20} />
            Estrategias para Mejorar Márgenes
          </h3>
          <ul className="space-y-2 text-sm text-green-800">
            <li className="flex items-start gap-2">
              <span className="text-green-600 mt-0.5">•</span>
              <span>
                Promover productos de <strong>alta rentabilidad</strong> como Hilo Omega 
                y Cuadernos Arimany con ubicación preferencial.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-600 mt-0.5">•</span>
              <span>
                Implementar <strong>bundles</strong> mezclando productos de alto y bajo margen 
                para mejorar el promedio.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-600 mt-0.5">•</span>
              <span>
                Negociar <strong>volúmenes mayores</strong> en productos estrella para 
                reducir costos en 5-10%.
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}