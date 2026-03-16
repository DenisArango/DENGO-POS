import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Calendar, Download, Printer, TrendingUp,
  DollarSign, ShoppingCart, Package, Users,
  BarChart3, Filter, ChevronDown, ArrowUpRight,
  ArrowDownRight, Percent
} from 'lucide-react'
import { LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'

interface PeriodData {
  date: string
  sales: number
  transactions: number
  avgTicket: number
  itemsSold: number
  profit: number
  customers: number
}

// Datos de ejemplo para diferentes períodos
const dailyData: PeriodData[] = Array.from({ length: 30 }, (_, i) => {
  const date = subDays(new Date(), 29 - i)
  const dayOfWeek = date.getDay()
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
  const baseSales = isWeekend ? 4500 : 3200
  const variance = Math.random() * 1000 - 500
  const sales = baseSales + variance
  const transactions = Math.floor(sales / 25 + Math.random() * 20)
  
  return {
    date: format(date, 'dd/MM'),
    sales: Math.round(sales),
    transactions,
    avgTicket: Math.round(sales / transactions),
    itemsSold: Math.floor(transactions * 2.8),
    profit: Math.round(sales * 0.35),
    customers: Math.floor(transactions * 0.85)
  }
})

const weeklyData = [
  { date: 'Sem 1', sales: 22500, transactions: 890, avgTicket: 25.28, itemsSold: 2450, profit: 7875, customers: 756 },
  { date: 'Sem 2', sales: 24200, transactions: 950, avgTicket: 25.47, itemsSold: 2612, profit: 8470, customers: 807 },
  { date: 'Sem 3', sales: 23800, transactions: 920, avgTicket: 25.87, itemsSold: 2530, profit: 8330, customers: 782 },
  { date: 'Sem 4', sales: 25500, transactions: 980, avgTicket: 26.02, itemsSold: 2695, profit: 8925, customers: 833 },
]

const monthlyData = [
  { date: 'Ene', sales: 92000, transactions: 3650, avgTicket: 25.21, itemsSold: 10038, profit: 32200, customers: 3102 },
  { date: 'Feb', sales: 95000, transactions: 3800, avgTicket: 25.00, itemsSold: 10450, profit: 33250, customers: 3230 },
  { date: 'Mar', sales: 98500, transactions: 3900, avgTicket: 25.26, itemsSold: 10725, profit: 34475, customers: 3315 },
  { date: 'Abr', sales: 94000, transactions: 3700, avgTicket: 25.41, itemsSold: 10175, profit: 32900, customers: 3145 },
  { date: 'May', sales: 102000, transactions: 4000, avgTicket: 25.50, itemsSold: 11000, profit: 35700, customers: 3400 },
  { date: 'Jun', sales: 105000, transactions: 4100, avgTicket: 25.61, itemsSold: 11275, profit: 36750, customers: 3485 },
]

const yearlyComparison = [
  { year: '2022', q1: 280000, q2: 295000, q3: 310000, q4: 325000 },
  { year: '2023', q1: 295000, q2: 315000, q3: 335000, q4: 355000 },
  { year: '2024', q1: 310000, q2: 330000, q3: 0, q4: 0 },
]

export default function SalesByPeriodReport() {
  const navigate = useNavigate()
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('daily')
  const [dateRange, setDateRange] = useState({
    start: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd')
  })
  const [compareWithPrevious, setCompareWithPrevious] = useState(true)
  const [selectedBranch, setSelectedBranch] = useState('all')

  const getCurrentPeriodData = () => {
    switch (period) {
      case 'daily': return dailyData
      case 'weekly': return weeklyData
      case 'monthly': return monthlyData
      default: return []
    }
  }

  const periodData = getCurrentPeriodData()
  
  // Calcular estadísticas
  const stats = {
    totalSales: periodData.reduce((sum, d) => sum + d.sales, 0),
    totalTransactions: periodData.reduce((sum, d) => sum + d.transactions, 0),
    avgTicket: periodData.reduce((sum, d) => sum + d.avgTicket, 0) / periodData.length,
    totalProfit: periodData.reduce((sum, d) => sum + d.profit, 0),
    growthRate: 12.5, // Calculado vs período anterior
    bestDay: periodData.reduce((best, current) => current.sales > best.sales ? current : best),
    worstDay: periodData.reduce((worst, current) => current.sales < worst.sales ? current : worst)
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
            <h1 className="text-2xl font-bold text-gray-800">Ventas por Período</h1>
            <p className="text-gray-600 text-sm mt-1">
              Análisis comparativo de ventas en diferentes períodos de tiempo
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
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Selector de período */}
          <div className="flex gap-2">
            {(['daily', 'weekly', 'monthly', 'yearly'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  period === p
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {p === 'daily' ? 'Diario' : 
                 p === 'weekly' ? 'Semanal' : 
                 p === 'monthly' ? 'Mensual' : 'Anual'}
              </button>
            ))}
          </div>

          {/* Rango de fechas */}
          <div className="flex items-center gap-2">
            <Calendar className="text-gray-400" size={20} />
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              className="input"
            />
            <span className="text-gray-500">-</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              className="input"
            />
          </div>

          <div className="flex-1" />

          {/* Opciones adicionales */}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={compareWithPrevious}
                onChange={(e) => setCompareWithPrevious(e.target.checked)}
                className="rounded"
              />
              Comparar con período anterior
            </label>
            
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="input"
            >
              <option value="all">Todas las sucursales</option>
              <option value="main">Sucursal Principal</option>
              <option value="north">Sucursal Norte</option>
            </select>
          </div>
        </div>
      </div>

      {/* KPIs del período */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Ventas Totales</span>
            <DollarSign className="text-green-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">${stats.totalSales.toLocaleString()}</p>
          <div className="flex items-center gap-1 mt-1">
            <ArrowUpRight className="text-green-600" size={16} />
            <span className="text-xs text-green-600">+{stats.growthRate}% vs anterior</span>
          </div>
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
          <p className="text-2xl font-bold text-gray-800">{stats.totalTransactions.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1">
            Promedio: {Math.round(stats.totalTransactions / periodData.length)}/día
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Ticket Promedio</span>
            <TrendingUp className="text-purple-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">${stats.avgTicket.toFixed(2)}</p>
          <p className="text-xs text-purple-600 mt-1">+$1.25 vs anterior</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Ganancia Total</span>
            <Percent className="text-orange-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">${stats.totalProfit.toLocaleString()}</p>
          <p className="text-xs text-orange-600 mt-1">35% margen promedio</p>
        </motion.div>
      </div>

      {/* Gráficos principales */}
      {period !== 'yearly' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Gráfico de ventas */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <BarChart3 size={20} />
              Ventas por {period === 'daily' ? 'Día' : period === 'weekly' ? 'Semana' : 'Mes'}
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={periodData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={(value: any) => `$${value.toLocaleString()}`} />
                <Area 
                  type="monotone" 
                  dataKey="sales" 
                  stroke="#3B82F6" 
                  fill="#3B82F6" 
                  fillOpacity={0.6}
                  name="Ventas"
                />
                {compareWithPrevious && (
                  <Area 
                    type="monotone" 
                    dataKey="profit" 
                    stroke="#10B981" 
                    fill="#10B981" 
                    fillOpacity={0.4}
                    name="Ganancia"
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Métricas adicionales */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <TrendingUp size={20} />
              Métricas de Rendimiento
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={periodData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Legend />
                <Line 
                  yAxisId="left"
                  type="monotone" 
                  dataKey="transactions" 
                  stroke="#8B5CF6"
                  strokeWidth={2}
                  name="Transacciones"
                />
                <Line 
                  yAxisId="right"
                  type="monotone" 
                  dataKey="avgTicket" 
                  stroke="#F59E0B"
                  strokeWidth={2}
                  name="Ticket Promedio ($)"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        /* Vista anual - Comparación por trimestres */
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <BarChart3 size={20} />
            Comparación Anual por Trimestres
          </h3>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={yearlyComparison}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" />
              <YAxis />
              <Tooltip formatter={(value: any) => `$${value.toLocaleString()}`} />
              <Legend />
              <Bar dataKey="q1" fill="#3B82F6" name="Q1" />
              <Bar dataKey="q2" fill="#10B981" name="Q2" />
              <Bar dataKey="q3" fill="#F59E0B" name="Q3" />
              <Bar dataKey="q4" fill="#8B5CF6" name="Q4" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Análisis detallado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Mejores y peores períodos */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 mb-4">Análisis de Extremos</h3>
          
          <div className="space-y-4">
            <div className="p-4 bg-green-50 rounded-lg">
              <h4 className="font-medium text-green-900 mb-2 flex items-center gap-2">
                <ArrowUpRight size={18} />
                Mejor {period === 'daily' ? 'Día' : period === 'weekly' ? 'Semana' : 'Mes'}
              </h4>
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-green-700">{stats.bestDay.date}</p>
                  <p className="text-2xl font-bold text-green-900">${stats.bestDay.sales.toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-green-700">{stats.bestDay.transactions} ventas</p>
                  <p className="text-sm text-green-700">Ticket: ${stats.bestDay.avgTicket}</p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-red-50 rounded-lg">
              <h4 className="font-medium text-red-900 mb-2 flex items-center gap-2">
                <ArrowDownRight size={18} />
                Peor {period === 'daily' ? 'Día' : period === 'weekly' ? 'Semana' : 'Mes'}
              </h4>
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-red-700">{stats.worstDay.date}</p>
                  <p className="text-2xl font-bold text-red-900">${stats.worstDay.sales.toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-red-700">{stats.worstDay.transactions} ventas</p>
                  <p className="text-sm text-red-700">Ticket: ${stats.worstDay.avgTicket}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Variación:</strong> ${(stats.bestDay.sales - stats.worstDay.sales).toLocaleString()} 
              ({((stats.bestDay.sales - stats.worstDay.sales) / stats.worstDay.sales * 100).toFixed(1)}%)
            </p>
          </div>
        </div>

        {/* Tendencias identificadas */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 mb-4">Tendencias Identificadas</h3>
          
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 bg-green-500 rounded-full mt-1.5"></div>
              <div>
                <p className="font-medium text-gray-800">Crecimiento sostenido</p>
                <p className="text-sm text-gray-600">
                  Las ventas muestran una tendencia alcista del {stats.growthRate}% en el período analizado
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-2 h-2 bg-blue-500 rounded-full mt-1.5"></div>
              <div>
                <p className="font-medium text-gray-800">Patrón semanal</p>
                <p className="text-sm text-gray-600">
                  Los fines de semana generan 40% más ventas que los días entre semana
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-2 h-2 bg-purple-500 rounded-full mt-1.5"></div>
              <div>
                <p className="font-medium text-gray-800">Ticket promedio estable</p>
                <p className="text-sm text-gray-600">
                  El ticket promedio se mantiene consistente con variación menor al 5%
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-2 h-2 bg-orange-500 rounded-full mt-1.5"></div>
              <div>
                <p className="font-medium text-gray-800">Oportunidad de mejora</p>
                <p className="text-sm text-gray-600">
                  Los martes y miércoles presentan las ventas más bajas, ideal para promociones
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla de datos completos */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="p-6 border-b">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <Package size={20} />
            Detalle por Período
          </h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-3 px-4 font-medium text-gray-700">
                  {period === 'daily' ? 'Fecha' : period === 'weekly' ? 'Semana' : 'Mes'}
                </th>
                <th className="text-right py-3 px-4 font-medium text-gray-700">Ventas</th>
                <th className="text-right py-3 px-4 font-medium text-gray-700">Transacciones</th>
                <th className="text-right py-3 px-4 font-medium text-gray-700">Ticket Promedio</th>
                <th className="text-right py-3 px-4 font-medium text-gray-700">Items Vendidos</th>
                <th className="text-right py-3 px-4 font-medium text-gray-700">Clientes</th>
                <th className="text-right py-3 px-4 font-medium text-gray-700">Ganancia</th>
                {compareWithPrevious && (
                  <th className="text-center py-3 px-4 font-medium text-gray-700">Variación</th>
                )}
              </tr>
            </thead>
            <tbody>
              {periodData.map((row, index) => (
                <tr key={index} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-4 font-medium">{row.date}</td>
                  <td className="py-3 px-4 text-right font-medium">${row.sales.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right">{row.transactions}</td>
                  <td className="py-3 px-4 text-right">${row.avgTicket.toFixed(2)}</td>
                  <td className="py-3 px-4 text-right">{row.itemsSold}</td>
                  <td className="py-3 px-4 text-right">{row.customers}</td>
                  <td className="py-3 px-4 text-right font-medium text-green-600">
                    ${row.profit.toLocaleString()}
                  </td>
                  {compareWithPrevious && (
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex items-center gap-1 text-sm ${
                        index % 3 === 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {index % 3 === 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                        {index % 3 === 0 ? '+' : '-'}{Math.floor(Math.random() * 20 + 5)}%
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}