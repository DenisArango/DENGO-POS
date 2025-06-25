import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Calendar, Download, Printer, UserCheck,
  Activity, Clock, Shield, AlertTriangle, Monitor,
  LogIn, LogOut, Package, DollarSign, Settings,
  Eye, Filter, ChevronDown, Search, User
} from 'lucide-react'
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface UserActivity {
  id: string
  userId: string
  userName: string
  userRole: string
  action: string
  category: 'auth' | 'sales' | 'inventory' | 'reports' | 'settings'
  details: string
  timestamp: string
  ip: string
  device: string
  status: 'success' | 'failed' | 'warning'
}

interface UserStats {
  id: string
  name: string
  role: string
  lastLogin: string
  totalActions: number
  salesCount: number
  inventoryActions: number
  reportsGenerated: number
  status: 'active' | 'inactive'
  riskLevel: 'low' | 'medium' | 'high'
}

// Datos de ejemplo
const recentActivities: UserActivity[] = [
  {
    id: '1',
    userId: '1',
    userName: 'Juan Pérez',
    userRole: 'Operador',
    action: 'Venta realizada',
    category: 'sales',
    details: 'Venta #1234 por $125.50',
    timestamp: '2024-01-20 14:30:00',
    ip: '192.168.1.100',
    device: 'Desktop - Chrome',
    status: 'success'
  },
  {
    id: '2',
    userId: '2',
    userName: 'María García',
    userRole: 'Admin',
    action: 'Ajuste de inventario',
    category: 'inventory',
    details: 'Ajuste de -5 unidades en Coca Cola 600ml',
    timestamp: '2024-01-20 14:25:00',
    ip: '192.168.1.101',
    device: 'Mobile - Safari',
    status: 'warning'
  },
  {
    id: '3',
    userId: '3',
    userName: 'Carlos López',
    userRole: 'Auditor',
    action: 'Reporte generado',
    category: 'reports',
    details: 'Reporte de ventas diarias exportado',
    timestamp: '2024-01-20 14:20:00',
    ip: '192.168.1.102',
    device: 'Desktop - Firefox',
    status: 'success'
  },
  {
    id: '4',
    userId: '1',
    userName: 'Juan Pérez',
    userRole: 'Operador',
    action: 'Intento de acceso fallido',
    category: 'auth',
    details: 'Intento de acceso a configuración del sistema',
    timestamp: '2024-01-20 14:15:00',
    ip: '192.168.1.100',
    device: 'Desktop - Chrome',
    status: 'failed'
  }
]

const userStats: UserStats[] = [
  {
    id: '1',
    name: 'Juan Pérez',
    role: 'Operador',
    lastLogin: '2024-01-20 08:00:00',
    totalActions: 142,
    salesCount: 89,
    inventoryActions: 12,
    reportsGenerated: 5,
    status: 'active',
    riskLevel: 'low'
  },
  {
    id: '2',
    name: 'María García',
    role: 'Admin',
    lastLogin: '2024-01-20 07:45:00',
    totalActions: 256,
    salesCount: 45,
    inventoryActions: 78,
    reportsGenerated: 23,
    status: 'active',
    riskLevel: 'low'
  },
  {
    id: '3',
    name: 'Carlos López',
    role: 'Auditor',
    lastLogin: '2024-01-20 09:00:00',
    totalActions: 98,
    salesCount: 0,
    inventoryActions: 5,
    reportsGenerated: 45,
    status: 'active',
    riskLevel: 'medium'
  },
  {
    id: '4',
    name: 'Ana Martínez',
    role: 'Operador',
    lastLogin: '2024-01-18 16:00:00',
    totalActions: 67,
    salesCount: 45,
    inventoryActions: 8,
    reportsGenerated: 2,
    status: 'inactive',
    riskLevel: 'high'
  }
]

const activityByHour = [
  { hour: '00:00', actions: 5 },
  { hour: '04:00', actions: 2 },
  { hour: '08:00', actions: 45 },
  { hour: '12:00', actions: 78 },
  { hour: '16:00', actions: 65 },
  { hour: '20:00', actions: 32 }
]

const activityByCategory = [
  { category: 'Ventas', count: 245, color: '#10B981' },
  { category: 'Inventario', count: 156, color: '#3B82F6' },
  { category: 'Reportes', count: 89, color: '#8B5CF6' },
  { category: 'Autenticación', count: 67, color: '#F59E0B' },
  { category: 'Configuración', count: 23, color: '#EF4444' }
]

const suspiciousActivities = [
  {
    user: 'Ana Martínez',
    activity: 'Múltiples intentos de login fallidos',
    timestamp: '2024-01-19 23:45:00',
    severity: 'high'
  },
  {
    user: 'Carlos López',
    activity: 'Acceso fuera de horario laboral',
    timestamp: '2024-01-20 02:30:00',
    severity: 'medium'
  },
  {
    user: 'Juan Pérez',
    activity: 'Intento de acceso a módulo no autorizado',
    timestamp: '2024-01-20 14:15:00',
    severity: 'medium'
  }
]

export default function UserActivityReport() {
  const navigate = useNavigate()
  const [selectedUser, setSelectedUser] = useState<string>('all')
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'month'>('today')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const stats = {
    totalUsers: 12,
    activeUsers: 8,
    totalActions: 580,
    suspiciousActions: 3,
    averageActionsPerUser: 48.3,
    peakHour: '12:00 - 13:00'
  }

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'sales': return <DollarSign size={16} />
      case 'inventory': return <Package size={16} />
      case 'reports': return <Eye size={16} />
      case 'auth': return <LogIn size={16} />
      case 'settings': return <Settings size={16} />
      default: return <Activity size={16} />
    }
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'sales': return 'text-green-600 bg-green-100'
      case 'inventory': return 'text-blue-600 bg-blue-100'
      case 'reports': return 'text-purple-600 bg-purple-100'
      case 'auth': return 'text-yellow-600 bg-yellow-100'
      case 'settings': return 'text-red-600 bg-red-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'text-green-600'
      case 'failed': return 'text-red-600'
      case 'warning': return 'text-yellow-600'
      default: return 'text-gray-600'
    }
  }

  const getRiskLevelColor = (level: string) => {
    switch (level) {
      case 'low': return 'text-green-600 bg-green-100'
      case 'medium': return 'text-yellow-600 bg-yellow-100'
      case 'high': return 'text-red-600 bg-red-100'
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
            <h1 className="text-2xl font-bold text-gray-800">Reporte de Actividad de Usuarios</h1>
            <p className="text-gray-600 text-sm mt-1">
              Registro y análisis de acciones realizadas en el sistema
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
              onClick={() => setSelectedPeriod('today')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedPeriod === 'today'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Hoy
            </button>
            <button
              onClick={() => setSelectedPeriod('week')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedPeriod === 'week'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Esta Semana
            </button>
            <button
              onClick={() => setSelectedPeriod('month')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedPeriod === 'month'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Este Mes
            </button>
          </div>
          
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Buscar usuario o acción..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input pl-10 w-full"
            />
          </div>
          
          <div className="flex gap-2">
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="input"
            >
              <option value="all">Todos los usuarios</option>
              <option value="admin">Administradores</option>
              <option value="operator">Operadores</option>
              <option value="auditor">Auditores</option>
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Usuarios Totales</span>
            <User className="text-blue-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.totalUsers}</p>
          <p className="text-xs text-blue-600 mt-1">Registrados</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Usuarios Activos</span>
            <UserCheck className="text-green-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.activeUsers}</p>
          <p className="text-xs text-green-600 mt-1">En línea hoy</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Acciones Totales</span>
            <Activity className="text-purple-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.totalActions}</p>
          <p className="text-xs text-purple-600 mt-1">Hoy</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Actividad Sospechosa</span>
            <AlertTriangle className="text-red-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.suspiciousActions}</p>
          <p className="text-xs text-red-600 mt-1">Alertas</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Promedio/Usuario</span>
            <Monitor className="text-teal-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.averageActionsPerUser.toFixed(1)}</p>
          <p className="text-xs text-teal-600 mt-1">Acciones</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Hora Pico</span>
            <Clock className="text-orange-600" size={20} />
          </div>
          <p className="text-lg font-bold text-gray-800">{stats.peakHour}</p>
          <p className="text-xs text-orange-600 mt-1">Mayor actividad</p>
        </motion.div>
      </div>

      {/* Gráficos principales */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Actividad por hora */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Clock size={20} />
            Actividad por Hora
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={activityByHour}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hour" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="actions" 
                stroke="#3B82F6" 
                strokeWidth={2}
                name="Acciones"
                dot={{ fill: '#3B82F6' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Actividad por categoría */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Activity size={20} />
            Distribución por Tipo de Actividad
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={activityByCategory}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ category, percent }) => `${category} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="count"
              >
                {activityByCategory.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tabla de usuarios */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <UserCheck size={20} />
          Resumen de Actividad por Usuario
        </h3>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Usuario</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Último Acceso</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Total Acciones</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Ventas</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Inventario</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Reportes</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Estado</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Nivel de Riesgo</th>
              </tr>
            </thead>
            <tbody>
              {userStats.map((user) => (
                <tr key={user.id} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <div>
                      <p className="font-medium text-gray-800">{user.name}</p>
                      <p className="text-xs text-gray-500">{user.role}</p>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center text-sm">
                    {format(new Date(user.lastLogin), "d MMM HH:mm", { locale: es })}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="font-medium">{user.totalActions}</span>
                  </td>
                  <td className="py-3 px-4 text-center">{user.salesCount}</td>
                  <td className="py-3 px-4 text-center">{user.inventoryActions}</td>
                  <td className="py-3 px-4 text-center">{user.reportsGenerated}</td>
                  <td className="py-3 px-4 text-center">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${
                      user.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {user.status === 'active' ? (
                        <>
                          <div className="w-2 h-2 bg-green-500 rounded-full" />
                          Activo
                        </>
                      ) : (
                        <>
                          <div className="w-2 h-2 bg-gray-400 rounded-full" />
                          Inactivo
                        </>
                      )}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getRiskLevelColor(user.riskLevel)}`}>
                      {user.riskLevel === 'low' ? 'Bajo' : user.riskLevel === 'medium' ? 'Medio' : 'Alto'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Registro de actividades recientes */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Activity size={20} />
          Actividades Recientes
        </h3>
        
        <div className="space-y-3">
          {recentActivities
            .filter(activity => 
              activity.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
              activity.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
              activity.details.toLowerCase().includes(searchTerm.toLowerCase())
            )
            .map((activity) => (
              <div key={activity.id} className="flex items-start gap-4 p-4 rounded-lg hover:bg-gray-50 transition-colors">
                <div className={`p-2 rounded-lg ${getCategoryColor(activity.category)}`}>
                  {getCategoryIcon(activity.category)}
                </div>
                
                <div className="flex-1">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-gray-800">
                        {activity.userName} - {activity.action}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">{activity.details}</p>
                      <div className="flex gap-4 mt-2 text-xs text-gray-500">
                        <span>{format(new Date(activity.timestamp), "d MMM HH:mm:ss", { locale: es })}</span>
                        <span>IP: {activity.ip}</span>
                        <span>{activity.device}</span>
                      </div>
                    </div>
                    <span className={`text-sm font-medium ${getStatusColor(activity.status)}`}>
                      {activity.status === 'success' ? '✓ Exitoso' : 
                       activity.status === 'failed' ? '✗ Fallido' : '⚠ Advertencia'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Actividades sospechosas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-red-50 rounded-lg p-6">
          <h3 className="font-semibold text-red-900 mb-3 flex items-center gap-2">
            <Shield size={20} />
            Actividades Sospechosas Detectadas
          </h3>
          <div className="space-y-3">
            {suspiciousActivities.map((activity, index) => (
              <div key={index} className="p-3 bg-white rounded-lg border border-red-200">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-800">{activity.user}</p>
                    <p className="text-sm text-gray-600 mt-1">{activity.activity}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {format(new Date(activity.timestamp), "d 'de' MMMM HH:mm", { locale: es })}
                    </p>
                  </div>
                  <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                    activity.severity === 'high' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {activity.severity === 'high' ? 'Alta' : 'Media'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-blue-50 rounded-lg p-6">
          <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
            <Shield size={20} />
            Recomendaciones de Seguridad
          </h3>
          <ul className="space-y-2 text-sm text-blue-800">
            <li className="flex items-start gap-2">
              <span className="text-blue-600 mt-0.5">•</span>
              <span>
                Revisar los permisos de <strong>Ana Martínez</strong> tras múltiples intentos fallidos.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 mt-0.5">•</span>
              <span>
                Implementar autenticación de dos factores para usuarios con acceso administrativo.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 mt-0.5">•</span>
              <span>
                Establecer horarios de acceso permitidos por rol de usuario.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 mt-0.5">•</span>
              <span>
                Configurar alertas automáticas para accesos fuera de horario.
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}