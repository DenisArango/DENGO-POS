import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Calendar, Download, Printer, DollarSign,
  CreditCard, TrendingUp, TrendingDown, AlertTriangle,
  CheckCircle, Clock, Banknote, ArrowUpRight, ArrowDownRight,
  PieChart as PieChartIcon, BarChart3
} from 'lucide-react'
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface CashRegisterSession {
  id: string
  date: string
  openTime: string
  closeTime?: string
  openedBy: string
  closedBy?: string
  initialAmount: number
  finalAmount?: number
  expectedAmount?: number
  difference?: number
  status: 'open' | 'closed'
  totalSales: number
  totalTransactions: number
  incomes: CashMovement[]
  expenses: CashMovement[]
}

interface CashMovement {
  type: 'income' | 'expense'
  amount: number
  description: string
  time: string
  performedBy: string
}

// Datos de ejemplo
const todaySession: CashRegisterSession = {
  id: '1',
  date: '2024-01-20',
  openTime: '08:00',
  closeTime: '20:15',
  openedBy: 'Juan Pérez',
  closedBy: 'María García',
  initialAmount: 500,
  finalAmount: 4125,
  expectedAmount: 4145,
  difference: -20,
  status: 'closed',
  totalSales: 3445,
  totalTransactions: 142,
  incomes: [
    { type: 'income', amount: 200, description: 'Depósito adicional', time: '10:30', performedBy: 'Juan Pérez' },
    { type: 'income', amount: 100, description: 'Cambio de billetes', time: '14:15', performedBy: 'María García' }
  ],
  expenses: [
    { type: 'expense', amount: 50, description: 'Pago a proveedor local', time: '11:45', performedBy: 'Juan Pérez' },
    { type: 'expense', amount: 30, description: 'Gastos de envío', time: '16:20', performedBy: 'Carlos López' }
  ]
}

const weeklyFlow = [
  { day: 'Lun', ingresos: 3200, egresos: 450, neto: 2750 },
  { day: 'Mar', ingresos: 2800, egresos: 320, neto: 2480 },
  { day: 'Mié', ingresos: 3500, egresos: 280, neto: 3220 },
  { day: 'Jue', ingresos: 2900, egresos: 510, neto: 2390 },
  { day: 'Vie', ingresos: 4200, egresos: 380, neto: 3820 },
  { day: 'Sáb', ingresos: 4800, egresos: 420, neto: 4380 },
  { day: 'Dom', ingresos: 3445, egresos: 80, neto: 3365 },
]

const paymentMethodsBreakdown = [
  { method: 'Efectivo', amount: 1850, percentage: 53.7, icon: Banknote },
  { method: 'Tarjeta', amount: 980, percentage: 28.4, icon: CreditCard },
  { method: 'Transferencia', amount: 420, percentage: 12.2, icon: ArrowUpRight },
  { method: 'Crédito', amount: 195, percentage: 5.7, icon: Clock },
]

const monthlyComparison = [
  { month: 'Ene', actual: 95000, proyectado: 92000 },
  { month: 'Feb', actual: 98000, proyectado: 95000 },
  { month: 'Mar', actual: 102000, proyectado: 100000 },
  { month: 'Abr', actual: 99000, proyectado: 103000 },
  { month: 'May', actual: 105000, proyectado: 105000 },
  { month: 'Jun', actual: 108000, proyectado: 107000 },
]

export default function CashFlowReport() {
  const navigate = useNavigate()
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<'daily' | 'weekly' | 'monthly'>('daily')

  const stats = {
    totalCashIn: 24845,
    totalCashOut: 2440,
    netCashFlow: 22405,
    averageDailyFlow: 3201,
    cashOnHand: 4125,
    pendingDeposits: 2000
  }

  const getDifferenceColor = (difference: number) => {
    if (Math.abs(difference) <= 10) return 'text-green-600'
    if (Math.abs(difference) <= 50) return 'text-yellow-600'
    return 'text-red-600'
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
            <h1 className="text-2xl font-bold text-gray-800">Reporte de Flujo de Caja</h1>
            <p className="text-gray-600 text-sm mt-1">
              Análisis de movimientos de efectivo y cierres de caja
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
              onClick={() => setViewMode('daily')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                viewMode === 'daily'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Vista Diaria
            </button>
            <button
              onClick={() => setViewMode('weekly')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                viewMode === 'weekly'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Vista Semanal
            </button>
            <button
              onClick={() => setViewMode('monthly')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                viewMode === 'monthly'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Vista Mensual
            </button>
          </div>
          
          <div className="flex-1" />
          
          <div className="flex items-center gap-2">
            <Calendar className="text-gray-400" size={20} />
            <input
              type="date"
              value={format(selectedDate, 'yyyy-MM-dd')}
              onChange={(e) => setSelectedDate(new Date(e.target.value))}
              className="input"
            />
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
            <span className="text-gray-600 text-sm">Ingresos Totales</span>
            <ArrowUpRight className="text-green-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">${stats.totalCashIn.toLocaleString()}</p>
          <p className="text-xs text-green-600 mt-1">+12% vs anterior</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Egresos Totales</span>
            <ArrowDownRight className="text-red-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">${stats.totalCashOut.toLocaleString()}</p>
          <p className="text-xs text-red-600 mt-1">-8% vs anterior</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Flujo Neto</span>
            <TrendingUp className="text-blue-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">${stats.netCashFlow.toLocaleString()}</p>
          <p className="text-xs text-blue-600 mt-1">Positivo</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Promedio Diario</span>
            <BarChart3 className="text-purple-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">${stats.averageDailyFlow.toLocaleString()}</p>
          <p className="text-xs text-purple-600 mt-1">Últimos 7 días</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Efectivo en Caja</span>
            <Banknote className="text-teal-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">${stats.cashOnHand.toLocaleString()}</p>
          <p className="text-xs text-teal-600 mt-1">Actual</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Depósitos Pendientes</span>
            <Clock className="text-orange-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">${stats.pendingDeposits.toLocaleString()}</p>
          <p className="text-xs text-orange-600 mt-1">Por depositar</p>
        </motion.div>
      </div>

      {viewMode === 'daily' && (
        <>
          {/* Cierre de caja del día */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <DollarSign size={20} />
              Cierre de Caja - {format(selectedDate, "d 'de' MMMM", { locale: es })}
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div>
                <p className="text-sm text-gray-600 mb-1">Apertura</p>
                <p className="font-medium">{todaySession.openTime}</p>
                <p className="text-xs text-gray-500">{todaySession.openedBy}</p>
              </div>
              
              <div>
                <p className="text-sm text-gray-600 mb-1">Cierre</p>
                <p className="font-medium">{todaySession.closeTime || 'En curso'}</p>
                <p className="text-xs text-gray-500">{todaySession.closedBy || '-'}</p>
              </div>
              
              <div>
                <p className="text-sm text-gray-600 mb-1">Monto Inicial</p>
                <p className="font-medium text-lg">${todaySession.initialAmount.toFixed(2)}</p>
              </div>
              
              <div>
                <p className="text-sm text-gray-600 mb-1">Estado</p>
                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${
                  todaySession.status === 'open' 
                    ? 'bg-green-100 text-green-700' 
                    : 'bg-gray-100 text-gray-700'
                }`}>
                  {todaySession.status === 'open' ? (
                    <>
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      Abierta
                    </>
                  ) : (
                    <>
                      <CheckCircle size={16} />
                      Cerrada
                    </>
                  )}
                </span>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-3">
                  <h4 className="font-medium text-gray-700">Resumen de Ventas</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Total Ventas:</span>
                      <span className="font-medium">${todaySession.totalSales.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Transacciones:</span>
                      <span className="font-medium">{todaySession.totalTransactions}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Ticket Promedio:</span>
                      <span className="font-medium">
                        ${(todaySession.totalSales / todaySession.totalTransactions).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-medium text-gray-700">Movimientos de Caja</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Ingresos adicionales:</span>
                      <span className="font-medium text-green-600">
                        +${todaySession.incomes.reduce((sum, inc) => sum + inc.amount, 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Egresos:</span>
                      <span className="font-medium text-red-600">
                        -${todaySession.expenses.reduce((sum, exp) => sum + exp.amount, 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-medium text-gray-700">Cuadre de Caja</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Efectivo esperado:</span>
                      <span className="font-medium">${todaySession.expectedAmount?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Efectivo contado:</span>
                      <span className="font-medium">${todaySession.finalAmount?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Diferencia:</span>
                      <span className={`font-bold ${getDifferenceColor(todaySession.difference || 0)}`}>
                        {todaySession.difference && todaySession.difference > 0 ? '+' : ''}
                        ${todaySession.difference?.toFixed(2) || '0.00'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Detalle de movimientos */}
            <div className="mt-6 pt-6 border-t">
              <h4 className="font-medium text-gray-700 mb-4">Detalle de Movimientos</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Ingresos */}
                <div>
                  <h5 className="text-sm font-medium text-green-700 mb-3 flex items-center gap-2">
                    <ArrowUpRight size={16} />
                    Ingresos Adicionales
                  </h5>
                  <div className="space-y-2">
                    {todaySession.incomes.map((income, index) => (
                      <div key={index} className="flex justify-between items-start p-2 bg-green-50 rounded">
                        <div>
                          <p className="text-sm font-medium text-gray-800">{income.description}</p>
                          <p className="text-xs text-gray-600">{income.time} - {income.performedBy}</p>
                        </div>
                        <span className="font-medium text-green-700">+${income.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Egresos */}
                <div>
                  <h5 className="text-sm font-medium text-red-700 mb-3 flex items-center gap-2">
                    <ArrowDownRight size={16} />
                    Egresos
                  </h5>
                  <div className="space-y-2">
                    {todaySession.expenses.map((expense, index) => (
                      <div key={index} className="flex justify-between items-start p-2 bg-red-50 rounded">
                        <div>
                          <p className="text-sm font-medium text-gray-800">{expense.description}</p>
                          <p className="text-xs text-gray-600">{expense.time} - {expense.performedBy}</p>
                        </div>
                        <span className="font-medium text-red-700">-${expense.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Métodos de pago */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <CreditCard size={20} />
              Desglose por Método de Pago
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {paymentMethodsBreakdown.map((method, index) => (
                <motion.div
                  key={method.method}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-gray-50 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <method.icon className="text-gray-600" size={24} />
                    <span className="text-2xl font-bold text-gray-800">{method.percentage}%</span>
                  </div>
                  <h4 className="font-medium text-gray-800 mb-1">{method.method}</h4>
                  <p className="text-lg font-bold text-primary-600">${method.amount.toFixed(2)}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </>
      )}

      {viewMode === 'weekly' && (
        <>
          {/* Flujo semanal */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <TrendingUp size={20} />
              Flujo de Caja Semanal
            </h3>
            <ResponsiveContainer width="100%" height={400}>
              <AreaChart data={weeklyFlow}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip formatter={(value: any) => `${value.toLocaleString()}`} />
                <Legend />
                <Area type="monotone" dataKey="ingresos" stackId="1" stroke="#10B981" fill="#10B981" fillOpacity={0.6} />
                <Area type="monotone" dataKey="egresos" stackId="2" stroke="#EF4444" fill="#EF4444" fillOpacity={0.6} />
                <Line type="monotone" dataKey="neto" stroke="#3B82F6" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Resumen semanal */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="font-semibold text-gray-800 mb-4">Mejores Días</h3>
              <div className="space-y-3">
                {weeklyFlow
                  .sort((a, b) => b.neto - a.neto)
                  .slice(0, 3)
                  .map((day, index) => (
                    <div key={day.day} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className={`font-bold text-lg ${
                          index === 0 ? 'text-yellow-600' : 'text-gray-600'
                        }`}>
                          #{index + 1}
                        </span>
                        <div>
                          <p className="font-medium text-gray-800">{day.day}</p>
                          <p className="text-sm text-gray-600">
                            Ingresos: ${day.ingresos} | Egresos: ${day.egresos}
                          </p>
                        </div>
                      </div>
                      <span className="font-bold text-green-700">${day.neto}</span>
                    </div>
                  ))}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="font-semibold text-gray-800 mb-4">Análisis de Tendencia</h3>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600 mb-2">Promedio de ingresos diarios</p>
                  <div className="flex items-center justify-between">
                    <div className="flex-1 bg-gray-200 rounded-full h-2 mr-4">
                      <div className="bg-green-500 h-2 rounded-full" style={{ width: '75%' }} />
                    </div>
                    <span className="font-medium">$3,549</span>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-2">Promedio de egresos diarios</p>
                  <div className="flex items-center justify-between">
                    <div className="flex-1 bg-gray-200 rounded-full h-2 mr-4">
                      <div className="bg-red-500 h-2 rounded-full" style={{ width: '25%' }} />
                    </div>
                    <span className="font-medium">$349</span>
                  </div>
                </div>
                <div className="pt-4 border-t">
                  <p className="text-sm text-gray-600 mb-1">Flujo neto semanal</p>
                  <p className="text-2xl font-bold text-green-600">+$22,405</p>
                  <p className="text-xs text-gray-500 mt-1">+15% vs semana anterior</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {viewMode === 'monthly' && (
        <>
          {/* Comparación mensual */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <BarChart3 size={20} />
              Flujo Real vs Proyectado (Últimos 6 meses)
            </h3>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={monthlyComparison}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value: any) => `${value.toLocaleString()}`} />
                <Legend />
                <Bar dataKey="proyectado" fill="#E5E7EB" name="Proyectado" />
                <Bar dataKey="actual" fill="#3B82F6" name="Real" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Proyecciones */}
          <div className="bg-blue-50 rounded-lg p-6">
            <h3 className="font-semibold text-blue-900 mb-4 flex items-center gap-2">
              <TrendingUp size={20} />
              Proyección del Próximo Mes
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <p className="text-sm text-blue-700 mb-2">Ingresos Proyectados</p>
                <p className="text-2xl font-bold text-blue-900">$112,000</p>
                <p className="text-xs text-blue-600 mt-1">Basado en tendencia actual</p>
              </div>
              <div>
                <p className="text-sm text-blue-700 mb-2">Egresos Estimados</p>
                <p className="text-2xl font-bold text-blue-900">$15,400</p>
                <p className="text-xs text-blue-600 mt-1">Promedio últimos 3 meses</p>
              </div>
              <div>
                <p className="text-sm text-blue-700 mb-2">Flujo Neto Esperado</p>
                <p className="text-2xl font-bold text-green-700">+$96,600</p>
                <p className="text-xs text-green-600 mt-1">Escenario conservador</p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Alertas y recomendaciones */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-yellow-50 rounded-lg p-6">
          <h3 className="font-semibold text-yellow-900 mb-3 flex items-center gap-2">
            <AlertTriangle size={20} />
            Alertas de Flujo de Caja
          </h3>
          <ul className="space-y-2 text-sm text-yellow-800">
            <li className="flex items-start gap-2">
              <span className="text-yellow-600 mt-0.5">•</span>
              <span>
                Diferencia de -$20 en el cierre de hoy. Revisar conteo y transacciones.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-yellow-600 mt-0.5">•</span>
              <span>
                $2,000 pendientes de depósito bancario desde hace 2 días.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-yellow-600 mt-0.5">•</span>
              <span>
                El efectivo en caja supera el límite de seguridad recomendado ($3,000).
              </span>
            </li>
          </ul>
        </div>

        <div className="bg-green-50 rounded-lg p-6">
          <h3 className="font-semibold text-green-900 mb-3 flex items-center gap-2">
            <CheckCircle size={20} />
            Recomendaciones
          </h3>
          <ul className="space-y-2 text-sm text-green-800">
            <li className="flex items-start gap-2">
              <span className="text-green-600 mt-0.5">•</span>
              <span>
                Realizar depósito bancario diario cuando el efectivo supere $3,000.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-600 mt-0.5">•</span>
              <span>
                Implementar arqueo de caja aleatorio para reducir diferencias.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-600 mt-0.5">•</span>
              <span>
                Promover pagos con tarjeta para reducir manejo de efectivo.
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}