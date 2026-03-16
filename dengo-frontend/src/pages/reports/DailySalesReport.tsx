import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Calendar, Download, Printer, DollarSign,
  ShoppingCart, Clock, CreditCard, TrendingUp, Users,
  Package, FileText, Filter, ChevronDown
} from 'lucide-react'
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

// Datos de ejemplo
const salesByHour = [
  { hour: '08:00', sales: 120 },
  { hour: '09:00', sales: 280 },
  { hour: '10:00', sales: 450 },
  { hour: '11:00', sales: 520 },
  { hour: '12:00', sales: 680 },
  { hour: '13:00', sales: 750 },
  { hour: '14:00', sales: 620 },
  { hour: '15:00', sales: 480 },
  { hour: '16:00', sales: 390 },
  { hour: '17:00', sales: 420 },
  { hour: '18:00', sales: 580 },
  { hour: '19:00', sales: 490 },
  { hour: '20:00', sales: 320 },
]

const paymentMethods = [
  { name: 'Efectivo', value: 1850, color: '#10B981' },
  { name: 'Tarjeta', value: 980, color: '#3B82F6' },
  { name: 'Transferencia', value: 420, color: '#8B5CF6' },
  { name: 'Crédito', value: 195, color: '#F59E0B' },
]

const topProducts = [
  { name: 'Coca Cola 600ml', quantity: 45, revenue: 675 },
  { name: 'Sabritas Original', quantity: 38, revenue: 703 },
  { name: 'Galletas Oreo', quantity: 32, revenue: 528 },
  { name: 'Agua Ciel 1L', quantity: 28, revenue: 280 },
  { name: 'Chocolate Snickers', quantity: 25, revenue: 550 },
]

const salesByCategory = [
  { category: 'Bebidas', sales: 1245, percentage: 35 },
  { category: 'Snacks', sales: 892, percentage: 25 },
  { category: 'Dulces', sales: 678, percentage: 19 },
  { category: 'Papelería', sales: 463, percentage: 13 },
  { category: 'Otros', sales: 267, percentage: 8 },
]

export default function DailySalesReport() {
  const navigate = useNavigate()
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [showFilters, setShowFilters] = useState(false)

  const stats = {
    totalSales: 3445.00,
    transactions: 142,
    averageTicket: 24.26,
    itemsSold: 389,
    newCustomers: 12,
    creditSales: 195.00
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
            <h1 className="text-2xl font-bold text-gray-800">Reporte de Ventas del Día</h1>
            <p className="text-gray-600 text-sm mt-1">
              {format(selectedDate, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}
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
          <div className="flex-1 flex items-center gap-4">
            <Calendar className="text-gray-400" size={20} />
            <input
              type="date"
              value={format(selectedDate, 'yyyy-MM-dd')}
              onChange={(e) => setSelectedDate(new Date(e.target.value))}
              className="input"
            />
          </div>
          
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="btn-outline btn-md flex items-center gap-2"
          >
            <Filter size={18} />
            Filtros
            <ChevronDown size={16} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
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
            <span className="text-gray-600 text-sm">Ventas Totales</span>
            <DollarSign className="text-green-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">${stats.totalSales.toFixed(2)}</p>
          <p className="text-xs text-green-600 mt-1">+15% vs ayer</p>
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
          <p className="text-2xl font-bold text-gray-800">{stats.transactions}</p>
          <p className="text-xs text-blue-600 mt-1">+8 vs ayer</p>
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
          <p className="text-2xl font-bold text-gray-800">${stats.averageTicket.toFixed(2)}</p>
          <p className="text-xs text-purple-600 mt-1">+$2.15 vs ayer</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Productos Vendidos</span>
            <Package className="text-orange-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.itemsSold}</p>
          <p className="text-xs text-orange-600 mt-1">2.74 por venta</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Clientes Nuevos</span>
            <Users className="text-teal-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.newCustomers}</p>
          <p className="text-xs text-teal-600 mt-1">+3 vs ayer</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Ventas a Crédito</span>
            <CreditCard className="text-yellow-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">${stats.creditSales.toFixed(2)}</p>
          <p className="text-xs text-yellow-600 mt-1">5.7% del total</p>
        </motion.div>
      </div>

      {/* Gráficos principales */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ventas por hora */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Clock size={20} />
            Ventas por Hora
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={salesByHour}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hour" />
              <YAxis />
              <Tooltip formatter={(value) => `$${value}`} />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="sales" 
                stroke="#3B82F6" 
                strokeWidth={2}
                name="Ventas"
                dot={{ fill: '#3B82F6' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Métodos de pago */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <CreditCard size={20} />
            Métodos de Pago
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={paymentMethods}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {paymentMethods.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => `$${value}`} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tablas de detalle */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top productos */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Package size={20} />
            Productos Más Vendidos
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4 text-sm font-medium text-gray-700">Producto</th>
                  <th className="text-center py-2 px-4 text-sm font-medium text-gray-700">Cantidad</th>
                  <th className="text-right py-2 px-4 text-sm font-medium text-gray-700">Ingresos</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((product, index) => (
                  <tr key={index} className="border-b">
                    <td className="py-2 px-4 text-sm">{product.name}</td>
                    <td className="py-2 px-4 text-sm text-center">{product.quantity}</td>
                    <td className="py-2 px-4 text-sm text-right font-medium">${product.revenue.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Ventas por categoría */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <BarChart size={20} />
            Ventas por Categoría
          </h3>
          <div className="space-y-3">
            {salesByCategory.map((item, index) => (
              <div key={index}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm text-gray-700">{item.category}</span>
                  <span className="text-sm font-medium">${item.sales.toFixed(2)}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-primary-600 h-2 rounded-full transition-all"
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Resumen del día */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <FileText size={20} />
          Resumen del Día
        </h3>
        <div className="prose prose-sm max-w-none text-gray-600">
          <p>
            El día registró un total de <strong>${stats.totalSales.toFixed(2)}</strong> en ventas a través de{' '}
            <strong>{stats.transactions}</strong> transacciones. El horario de mayor actividad fue entre las{' '}
            <strong>12:00 y 14:00</strong>, representando el 28% de las ventas diarias.
          </p>
          <p>
            El método de pago más utilizado fue <strong>efectivo</strong> con el 53.7% de las transacciones,
            seguido por <strong>tarjeta</strong> con 28.4%. Se registraron <strong>{stats.newCustomers}</strong>{' '}
            clientes nuevos y <strong>${stats.creditSales.toFixed(2)}</strong> en ventas a crédito.
          </p>
        </div>
      </div>
    </div>
  )
}