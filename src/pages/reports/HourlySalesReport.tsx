import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Download, Printer, Clock,
  TrendingUp, Users, DollarSign, ShoppingCart,
  Calendar, BarChart3, Activity, Zap
} from 'lucide-react'
import { BarChart, Bar, LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface HourlyData {
  hour: string
  hourNumber: number
  sales: number
  transactions: number
  avgTicket: number
  customers: number
  itemsPerTransaction: number
  efficiency: number // Ventas por empleado
}

// Datos de ejemplo
const hourlyData: HourlyData[] = [
  { hour: '08:00', hourNumber: 8, sales: 120, transactions: 8, avgTicket: 15, customers: 7, itemsPerTransaction: 2.1, efficiency: 120 },
  { hour: '09:00', hourNumber: 9, sales: 280, transactions: 15, avgTicket: 18.67, customers: 13, itemsPerTransaction: 2.3, efficiency: 140 },
  { hour: '10:00', hourNumber: 10, sales: 450, transactions: 22, avgTicket: 20.45, customers: 20, itemsPerTransaction: 2.5, efficiency: 225 },
  { hour: '11:00', hourNumber: 11, sales: 520, transactions: 25, avgTicket: 20.80, customers: 23, itemsPerTransaction: 2.7, efficiency: 260 },
  { hour: '12:00', hourNumber: 12, sales: 680, transactions: 32, avgTicket: 21.25, customers: 30, itemsPerTransaction: 2.8, efficiency: 340 },
  { hour: '13:00', hourNumber: 13, sales: 750, transactions: 35, avgTicket: 21.43, customers: 32, itemsPerTransaction: 3.0, efficiency: 375 },
  { hour: '14:00', hourNumber: 14, sales: 620, transactions: 28, avgTicket: 22.14, customers: 26, itemsPerTransaction: 2.9, efficiency: 310 },
  { hour: '15:00', hourNumber: 15, sales: 480, transactions: 23, avgTicket: 20.87, customers: 21, itemsPerTransaction: 2.6, efficiency: 240 },
  { hour: '16:00', hourNumber: 16, sales: 390, transactions: 18, avgTicket: 21.67, customers: 16, itemsPerTransaction: 2.4, efficiency: 195 },
  { hour: '17:00', hourNumber: 17, sales: 420, transactions: 20, avgTicket: 21.00, customers: 18, itemsPerTransaction: 2.5, efficiency: 210 },
  { hour: '18:00', hourNumber: 18, sales: 580, transactions: 27, avgTicket: 21.48, customers: 25, itemsPerTransaction: 2.7, efficiency: 290 },
  { hour: '19:00', hourNumber: 19, sales: 490, transactions: 23, avgTicket: 21.30, customers: 21, itemsPerTransaction: 2.6, efficiency: 245 },
  { hour: '20:00', hourNumber: 20, sales: 320, transactions: 15, avgTicket: 21.33, customers: 14, itemsPerTransaction: 2.3, efficiency: 160 },
]

const peakHours = [
  { range: '12:00 - 14:00', percentage: 28, color: '#EF4444' },
  { range: '18:00 - 20:00', percentage: 22, color: '#F59E0B' },
  { range: '10:00 - 12:00', percentage: 18, color: '#3B82F6' },
  { range: 'Resto del día', percentage: 32, color: '#6B7280' },
]

const staffingRecommendations = [
  { hour: '08:00 - 10:00', current: 1, recommended: 2, difference: 1 },
  { hour: '10:00 - 12:00', current: 2, recommended: 3, difference: 1 },
  { hour: '12:00 - 14:00', current: 3, recommended: 4, difference: 1 },
  { hour: '14:00 - 16:00', current: 2, recommended: 3, difference: 1 },
  { hour: '16:00 - 18:00', current: 2, recommended: 2, difference: 0 },
  { hour: '18:00 - 20:00', current: 2, recommended: 3, difference: 1 },
]

const dayComparison = [
  { day: 'Lun', peak: 680, average: 380, low: 120 },
  { day: 'Mar', peak: 720, average: 400, low: 150 },
  { day: 'Mié', peak: 650, average: 360, low: 100 },
  { day: 'Jue', peak: 700, average: 390, low: 130 },
  { day: 'Vie', peak: 850, average: 450, low: 180 },
  { day: 'Sáb', peak: 950, average: 520, low: 220 },
  { day: 'Dom', peak: 750, average: 420, low: 160 },
]

export default function HourlySalesReport() {
  const navigate = useNavigate()
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [compareMode, setCompareMode] = useState<'week' | 'month' | null>(null)

  const stats = {
    peakHour: '13:00',
    peakSales: 750,
    lowHour: '08:00',
    lowSales: 120,
    avgSalesPerHour: 441.54,
    totalOperatingHours: 13,
    avgCustomersPerHour: 21,
    peakEfficiency: 375
  }

  // Datos para el gráfico de radar (patrón de actividad)
  const activityPattern = hourlyData
    .filter((_, index) => index % 2 === 0) // Cada 2 horas para simplificar
    .map(item => ({
      hour: item.hour,
      sales: (item.sales / stats.peakSales) * 100,
      customers: (item.customers / 35) * 100,
      efficiency: (item.efficiency / stats.peakEfficiency) * 100
    }))

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
            <h1 className="text-2xl font-bold text-gray-800">Ventas por Hora</h1>
            <p className="text-gray-600 text-sm mt-1">
              Análisis de patrones de venta y optimización de personal
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
          <div className="flex items-center gap-2">
            <Calendar className="text-gray-400" size={20} />
            <input
              type="date"
              value={format(selectedDate, 'yyyy-MM-dd')}
              onChange={(e) => setSelectedDate(new Date(e.target.value))}
              className="input"
            />
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={() => setCompareMode(compareMode === 'week' ? null : 'week')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                compareMode === 'week'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Comparar con promedio semanal
            </button>
            <button
              onClick={() => setCompareMode(compareMode === 'month' ? null : 'month')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                compareMode === 'month'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Comparar con promedio mensual
            </button>
          </div>
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
            <span className="text-gray-600 text-sm">Hora Pico</span>
            <Zap className="text-red-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.peakHour}</p>
          <p className="text-sm text-gray-600 mt-1">${stats.peakSales} en ventas</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Hora más Baja</span>
            <Activity className="text-blue-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.lowHour}</p>
          <p className="text-sm text-gray-600 mt-1">${stats.lowSales} en ventas</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Promedio por Hora</span>
            <DollarSign className="text-green-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">${Math.round(stats.avgSalesPerHour)}</p>
          <p className="text-sm text-gray-600 mt-1">{stats.avgCustomersPerHour} clientes/hora</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Eficiencia Máxima</span>
            <Users className="text-purple-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">${stats.peakEfficiency}</p>
          <p className="text-sm text-gray-600 mt-1">Ventas/empleado en hora pico</p>
        </motion.div>
      </div>

      {/* Gráfico principal de ventas por hora */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <BarChart3 size={20} />
          Distribución de Ventas por Hora
        </h3>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={hourlyData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="hour" />
            <YAxis yAxisId="left" />
            <YAxis yAxisId="right" orientation="right" />
            <Tooltip />
            <Legend />
            <Bar yAxisId="left" dataKey="sales" fill="#3B82F6" name="Ventas ($)">
              {hourlyData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={
                    entry.sales >= 600 ? '#EF4444' : 
                    entry.sales >= 400 ? '#F59E0B' : 
                    entry.sales >= 200 ? '#3B82F6' : 
                    '#6B7280'
                  } 
                />
              ))}
            </Bar>
            <Line 
              yAxisId="right" 
              type="monotone" 
              dataKey="transactions" 
              stroke="#10B981" 
              strokeWidth={2}
              name="Transacciones"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Patrón de actividad (Radar) */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Activity size={20} />
            Patrón de Actividad
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={activityPattern}>
              <PolarGrid />
              <PolarAngleAxis dataKey="hour" />
              <PolarRadiusAxis angle={90} domain={[0, 100]} />
              <Radar name="Ventas" dataKey="sales" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.6} />
              <Radar name="Clientes" dataKey="customers" stroke="#10B981" fill="#10B981" fillOpacity={0.6} />
              <Radar name="Eficiencia" dataKey="efficiency" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.6} />
              <Legend />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Distribución de horas pico */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Clock size={20} />
            Distribución de Ventas por Franjas Horarias
          </h3>
          <div className="space-y-4">
            {peakHours.map((range, index) => (
              <div key={index}>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-700">{range.range}</span>
                  <span className="text-sm font-bold text-gray-800">{range.percentage}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="h-3 rounded-full transition-all"
                    style={{ 
                      width: `${range.percentage}%`,
                      backgroundColor: range.color
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-4 p-3 bg-yellow-50 rounded-lg">
            <p className="text-sm text-yellow-800">
              <strong>Nota:</strong> El 50% de las ventas se concentran entre las 12:00 y 20:00
            </p>
          </div>
        </div>
      </div>

      {/* Comparación por días */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <TrendingUp size={20} />
          Comparación de Patrones por Día de la Semana
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={dayComparison}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="peak" fill="#EF4444" name="Hora Pico" />
            <Bar dataKey="average" fill="#3B82F6" name="Promedio" />
            <Bar dataKey="low" fill="#6B7280" name="Hora Baja" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Recomendaciones de personal */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="p-6 border-b">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <Users size={20} />
            Optimización de Personal por Horario
          </h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-3 px-4 font-medium text-gray-700">Horario</th>
                <th className="text-center py-3 px-4 font-medium text-gray-700">Personal Actual</th>
                <th className="text-center py-3 px-4 font-medium text-gray-700">Personal Recomendado</th>
                <th className="text-center py-3 px-4 font-medium text-gray-700">Ajuste Necesario</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700">Impacto Esperado</th>
              </tr>
            </thead>
            <tbody>
              {staffingRecommendations.map((rec, index) => (
                <tr key={index} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-4 font-medium">{rec.hour}</td>
                  <td className="py-3 px-4 text-center">{rec.current}</td>
                  <td className="py-3 px-4 text-center font-medium text-primary-600">
                    {rec.recommended}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {rec.difference > 0 ? (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                        +{rec.difference} empleado{rec.difference > 1 ? 's' : ''}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        Óptimo
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600">
                    {rec.difference > 0 
                      ? `Reducir tiempo de espera en ${15 * rec.difference}%`
                      : 'Nivel de servicio adecuado'
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Insights y recomendaciones */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-green-50 rounded-lg p-6">
          <h3 className="font-semibold text-green-900 mb-3 flex items-center gap-2">
            <TrendingUp size={20} />
            Oportunidades Identificadas
          </h3>
          <ul className="space-y-2 text-sm text-green-800">
            <li className="flex items-start gap-2">
              <span className="text-green-600 mt-0.5">•</span>
              <span>
                Implementar <strong>Happy Hour de 15:00 a 17:00</strong> podría incrementar 
                las ventas en horario bajo en un 25-30%.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-600 mt-0.5">•</span>
              <span>
                El <strong>horario de almuerzo (12:00-14:00)</strong> genera el 28% de las ventas 
                diarias con solo 2 horas de operación.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-600 mt-0.5">•</span>
              <span>
                Los <strong>viernes y sábados</strong> muestran picos más altos, 
                considerar extender horario hasta las 21:00.
              </span>
            </li>
          </ul>
        </div>

        <div className="bg-blue-50 rounded-lg p-6">
          <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
            <Users size={20} />
            Recomendaciones de Personal
          </h3>
          <ul className="space-y-2 text-sm text-blue-800">
            <li className="flex items-start gap-2">
              <span className="text-blue-600 mt-0.5">•</span>
              <span>
                Agregar <strong>1 empleado adicional</strong> en horario pico 
                reduciría el tiempo de espera promedio de 8 a 3 minutos.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 mt-0.5">•</span>
              <span>
                Implementar <strong>turnos escalonados</strong> con entrada a las 11:30 
                para cubrir mejor el rush del almuerzo.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 mt-0.5">•</span>
              <span>
                La <strong>eficiencia por empleado</strong> es 40% mayor en horario 
                matutino, ideal para entrenamientos.
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}