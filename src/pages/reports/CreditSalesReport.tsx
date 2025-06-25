import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Calendar, Download, Printer, CreditCard,
  Clock, AlertTriangle, CheckCircle, XCircle, TrendingUp,
  Users, DollarSign, FileText, Phone, Mail,
  ChevronDown, Filter, Search, AlertCircle
} from 'lucide-react'
import { PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { format, addDays, differenceInDays } from 'date-fns'
import { es } from 'date-fns/locale'

interface CreditCustomer {
  id: string
  name: string
  phone: string
  email: string
  creditLimit: number
  currentBalance: number
  availableCredit: number
  status: 'active' | 'blocked' | 'warning'
  lastPaymentDate: string
  lastPaymentAmount: number
  totalPurchases: number
  overdueAmount: number
  oldestDebtDays: number
}

interface CreditTransaction {
  id: string
  customerId: string
  customerName: string
  date: string
  type: 'sale' | 'payment'
  amount: number
  balance: number
  description: string
  dueDate?: string
  daysOverdue?: number
  status: 'pending' | 'partial' | 'paid' | 'overdue'
}

// Datos de ejemplo
const creditCustomers: CreditCustomer[] = [
  {
    id: '1',
    name: 'Juan Pérez',
    phone: '+502 5555-1234',
    email: 'juan.perez@email.com',
    creditLimit: 1000,
    currentBalance: 750,
    availableCredit: 250,
    status: 'warning',
    lastPaymentDate: '2024-01-10',
    lastPaymentAmount: 200,
    totalPurchases: 3500,
    overdueAmount: 150,
    oldestDebtDays: 15
  },
  {
    id: '2',
    name: 'María García',
    phone: '+502 5555-5678',
    email: 'maria.garcia@email.com',
    creditLimit: 1500,
    currentBalance: 200,
    availableCredit: 1300,
    status: 'active',
    lastPaymentDate: '2024-01-18',
    lastPaymentAmount: 500,
    totalPurchases: 5200,
    overdueAmount: 0,
    oldestDebtDays: 0
  },
  {
    id: '3',
    name: 'Carlos López',
    phone: '+502 5555-9012',
    email: 'carlos.lopez@email.com',
    creditLimit: 800,
    currentBalance: 850,
    availableCredit: 0,
    status: 'blocked',
    lastPaymentDate: '2023-12-20',
    lastPaymentAmount: 100,
    totalPurchases: 2800,
    overdueAmount: 850,
    oldestDebtDays: 45
  },
  {
    id: '4',
    name: 'Ana Martínez',
    phone: '+502 5555-3456',
    email: 'ana.martinez@email.com',
    creditLimit: 2000,
    currentBalance: 1200,
    availableCredit: 800,
    status: 'active',
    lastPaymentDate: '2024-01-15',
    lastPaymentAmount: 800,
    totalPurchases: 8900,
    overdueAmount: 200,
    oldestDebtDays: 10
  }
]

const recentTransactions: CreditTransaction[] = [
  {
    id: '1',
    customerId: '1',
    customerName: 'Juan Pérez',
    date: '2024-01-20',
    type: 'sale',
    amount: 150,
    balance: 750,
    description: 'Venta de productos varios',
    dueDate: '2024-02-20',
    status: 'pending'
  },
  {
    id: '2',
    customerId: '2',
    customerName: 'María García',
    date: '2024-01-18',
    type: 'payment',
    amount: 500,
    balance: 200,
    description: 'Pago parcial de deuda',
    status: 'paid'
  },
  {
    id: '3',
    customerId: '3',
    customerName: 'Carlos López',
    date: '2024-01-05',
    type: 'sale',
    amount: 200,
    balance: 850,
    description: 'Compra de mercadería',
    dueDate: '2024-01-05',
    daysOverdue: 15,
    status: 'overdue'
  }
]

const creditAgingData = [
  { range: 'Al día', amount: 1200, count: 8, percentage: 30 },
  { range: '1-15 días', amount: 800, count: 5, percentage: 20 },
  { range: '16-30 días', amount: 600, count: 3, percentage: 15 },
  { range: '31-60 días', amount: 900, count: 4, percentage: 22.5 },
  { range: '60+ días', amount: 500, count: 2, percentage: 12.5 }
]

const monthlyCollectionTrend = [
  { month: 'Ago', esperado: 8000, cobrado: 7200, porcentaje: 90 },
  { month: 'Sep', esperado: 8500, cobrado: 7650, porcentaje: 90 },
  { month: 'Oct', esperado: 9000, cobrado: 8100, porcentaje: 90 },
  { month: 'Nov', esperado: 9200, cobrado: 8740, porcentaje: 95 },
  { month: 'Dic', esperado: 10000, cobrado: 8500, porcentaje: 85 },
  { month: 'Ene', esperado: 8800, cobrado: 7920, porcentaje: 90 }
]

const paymentMethodsData = [
  { method: 'Efectivo', amount: 4500, color: '#10B981' },
  { method: 'Transferencia', amount: 2200, color: '#3B82F6' },
  { method: 'Depósito', amount: 1220, color: '#8B5CF6' }
]

export default function CreditSalesReport() {
  const navigate = useNavigate()
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'overdue' | 'warning' | 'blocked'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const stats = {
    totalCredit: 4000,
    totalCollected: 7920,
    pendingCollection: 3000,
    overdueAmount: 1200,
    activeCustomers: 45,
    blockedCustomers: 3,
    collectionRate: 90
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-600 bg-green-100'
      case 'warning': return 'text-yellow-600 bg-yellow-100'
      case 'blocked': return 'text-red-600 bg-red-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <CheckCircle size={16} />
      case 'warning': return <AlertCircle size={16} />
      case 'blocked': return <XCircle size={16} />
      default: return null
    }
  }

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'text-green-600 bg-green-100'
      case 'pending': return 'text-blue-600 bg-blue-100'
      case 'partial': return 'text-yellow-600 bg-yellow-100'
      case 'overdue': return 'text-red-600 bg-red-100'
      default: return 'text-gray-600 bg-gray-100'
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
            <h1 className="text-2xl font-bold text-gray-800">Reporte de Ventas al Crédito</h1>
            <p className="text-gray-600 text-sm mt-1">
              Estado de cuentas por cobrar y análisis de cartera
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
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Buscar cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input pl-10 w-full"
            />
          </div>
          
          <div className="flex gap-2">
            <select
              value={selectedFilter}
              onChange={(e) => setSelectedFilter(e.target.value as any)}
              className="input"
            >
              <option value="all">Todos los clientes</option>
              <option value="overdue">Con mora</option>
              <option value="warning">En advertencia</option>
              <option value="blocked">Bloqueados</option>
            </select>
            
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
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Crédito Total</span>
            <CreditCard className="text-blue-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">${stats.totalCredit.toLocaleString()}</p>
          <p className="text-xs text-blue-600 mt-1">Otorgado</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Cobrado</span>
            <DollarSign className="text-green-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">${stats.totalCollected.toLocaleString()}</p>
          <p className="text-xs text-green-600 mt-1">Este mes</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Por Cobrar</span>
            <Clock className="text-yellow-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">${stats.pendingCollection.toLocaleString()}</p>
          <p className="text-xs text-yellow-600 mt-1">Pendiente</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">En Mora</span>
            <AlertTriangle className="text-red-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">${stats.overdueAmount.toLocaleString()}</p>
          <p className="text-xs text-red-600 mt-1">Vencido</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Clientes Activos</span>
            <Users className="text-purple-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.activeCustomers}</p>
          <p className="text-xs text-purple-600 mt-1">Con crédito</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Bloqueados</span>
            <XCircle className="text-red-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.blockedCustomers}</p>
          <p className="text-xs text-red-600 mt-1">Sin crédito</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-white rounded-lg shadow-sm p-4 col-span-2"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Tasa de Cobro</span>
            <TrendingUp className="text-teal-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.collectionRate}%</p>
          <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
            <div 
              className="bg-teal-600 h-2 rounded-full transition-all"
              style={{ width: `${stats.collectionRate}%` }}
            />
          </div>
        </motion.div>
      </div>

      {/* Gráficos principales */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Antigüedad de cartera */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Clock size={20} />
            Antigüedad de Cartera
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={creditAgingData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="range" />
              <YAxis />
              <Tooltip formatter={(value: any) => `${value}`} />
              <Legend />
              <Bar dataKey="amount" fill="#3B82F6" name="Monto" />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-4 space-y-2">
            {creditAgingData.map((item, index) => (
              <div key={index} className="flex justify-between text-sm">
                <span className="text-gray-600">{item.range}</span>
                <span className="font-medium">{item.count} clientes - {item.percentage}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tendencia de cobros */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <TrendingUp size={20} />
            Tendencia de Cobros Mensuales
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthlyCollectionTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(value: any) => `${value}`} />
              <Legend />
              <Line type="monotone" dataKey="esperado" stroke="#E5E7EB" strokeWidth={2} name="Esperado" />
              <Line type="monotone" dataKey="cobrado" stroke="#10B981" strokeWidth={2} name="Cobrado" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Lista de clientes */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Users size={20} />
          Detalle de Clientes con Crédito
        </h3>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Cliente</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Límite</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Saldo</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Disponible</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">En Mora</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Último Pago</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Estado</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {creditCustomers
                .filter(customer => {
                  if (selectedFilter === 'all') return true
                  if (selectedFilter === 'overdue') return customer.overdueAmount > 0
                  if (selectedFilter === 'warning') return customer.status === 'warning'
                  if (selectedFilter === 'blocked') return customer.status === 'blocked'
                  return true
                })
                .filter(customer => 
                  customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  customer.email.toLowerCase().includes(searchTerm.toLowerCase())
                )
                .map((customer) => (
                  <tr key={customer.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-medium text-gray-800">{customer.name}</p>
                        <div className="flex gap-3 mt-1">
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <Phone size={12} />
                            {customer.phone}
                          </span>
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <Mail size={12} />
                            {customer.email}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="font-medium">${customer.creditLimit.toFixed(2)}</span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`font-medium ${customer.currentBalance > customer.creditLimit ? 'text-red-600' : ''}`}>
                        ${customer.currentBalance.toFixed(2)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`font-medium ${customer.availableCredit === 0 ? 'text-red-600' : 'text-green-600'}`}>
                        ${customer.availableCredit.toFixed(2)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {customer.overdueAmount > 0 ? (
                        <div>
                          <span className="font-medium text-red-600">${customer.overdueAmount.toFixed(2)}</span>
                          <p className="text-xs text-red-500">{customer.oldestDebtDays} días</p>
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div>
                        <p className="text-sm">${customer.lastPaymentAmount.toFixed(2)}</p>
                        <p className="text-xs text-gray-500">
                          {format(new Date(customer.lastPaymentDate), "d MMM", { locale: es })}
                        </p>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(customer.status)}`}>
                        {getStatusIcon(customer.status)}
                        {customer.status === 'active' ? 'Activo' : customer.status === 'warning' ? 'Advertencia' : 'Bloqueado'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button className="text-primary-600 hover:text-primary-700 text-sm font-medium">
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transacciones recientes */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <FileText size={20} />
          Transacciones Recientes
        </h3>
        
        <div className="space-y-3">
          {recentTransactions.map((transaction) => (
            <div key={transaction.id} className={`p-4 rounded-lg border ${
              transaction.status === 'overdue' ? 'border-red-200 bg-red-50' : 'border-gray-200'
            }`}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium text-gray-800">{transaction.customerName}</p>
                  <p className="text-sm text-gray-600 mt-1">{transaction.description}</p>
                  <div className="flex gap-4 mt-2 text-xs text-gray-500">
                    <span>{format(new Date(transaction.date), "d 'de' MMMM", { locale: es })}</span>
                    {transaction.dueDate && (
                      <span>Vence: {format(new Date(transaction.dueDate), "d 'de' MMMM", { locale: es })}</span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-bold text-lg ${
                    transaction.type === 'payment' ? 'text-green-600' : 'text-gray-800'
                  }`}>
                    {transaction.type === 'payment' ? '-' : '+'}${transaction.amount.toFixed(2)}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">Saldo: ${transaction.balance.toFixed(2)}</p>
                  <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full mt-2 ${
                    getPaymentStatusColor(transaction.status)
                  }`}>
                    {transaction.status === 'paid' ? 'Pagado' : 
                     transaction.status === 'pending' ? 'Pendiente' :
                     transaction.status === 'partial' ? 'Pago parcial' : 
                     `Vencido ${transaction.daysOverdue} días`}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Métodos de pago */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <DollarSign size={20} />
            Métodos de Pago Recibidos
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={paymentMethodsData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ method, percent }) => `${method} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="amount"
              >
                {paymentMethodsData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value: any) => `${value}`} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Resumen y alertas */}
        <div className="space-y-4">
          <div className="bg-yellow-50 rounded-lg p-6">
            <h3 className="font-semibold text-yellow-900 mb-3 flex items-center gap-2">
              <AlertTriangle size={20} />
              Clientes que Requieren Gestión
            </h3>
            <ul className="space-y-2 text-sm text-yellow-800">
              <li className="flex items-start gap-2">
                <span className="text-yellow-600 mt-0.5">•</span>
                <span>
                  <strong>Carlos López:</strong> Bloqueado por mora de 45 días. Deuda total: $850.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-600 mt-0.5">•</span>
                <span>
                  <strong>Juan Pérez:</strong> 75% de límite usado, con $150 en mora (15 días).
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-600 mt-0.5">•</span>
                <span>
                  <strong>3 clientes</strong> tienen deudas mayores a 30 días.
                </span>
              </li>
            </ul>
          </div>

          <div className="bg-blue-50 rounded-lg p-6">
            <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
              <TrendingUp size={20} />
              Análisis y Recomendaciones
            </h3>
            <div className="space-y-3 text-sm text-blue-800">
              <div>
                <p className="font-medium mb-1">Tasa de morosidad: 30%</p>
                <div className="w-full bg-blue-200 rounded-full h-2">
                  <div className="bg-red-500 h-2 rounded-full" style={{ width: '30%' }} />
                </div>
              </div>
              <p>
                • Implementar recordatorios automáticos 5 días antes del vencimiento.
              </p>
              <p>
                • Considerar descuentos por pronto pago para reducir días de cobro.
              </p>
              <p>
                • Revisar límites de crédito de clientes con buen historial de pago.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}