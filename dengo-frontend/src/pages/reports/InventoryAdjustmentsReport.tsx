import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Calendar, Download, Printer, History,
  Package, User, AlertTriangle, TrendingUp, TrendingDown,
  Filter, ChevronDown, Search, Plus, Minus, ArrowUpDown,
  FileText, BarChart3, Clock
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

// Tipos
interface InventoryAdjustment {
  id: string
  date: string
  time: string
  product: {
    sku: string
    name: string
    category: string
  }
  previousStock: number
  newStock: number
  difference: number
  reason: string
  notes?: string
  user: string
  branchName: string
}

// Datos de ejemplo
const mockAdjustments: InventoryAdjustment[] = [
  {
    id: '1',
    date: '2024-01-20',
    time: '14:35',
    product: {
      sku: 'BEB-001',
      name: 'Coca Cola Original 600ml',
      category: 'Bebidas'
    },
    previousStock: 50,
    newStock: 45,
    difference: -5,
    reason: 'Rotura/Daño',
    notes: 'Botellas rotas durante descarga',
    user: 'Juan Pérez',
    branchName: 'Sucursal Principal'
  },
  {
    id: '2',
    date: '2024-01-20',
    time: '11:20',
    product: {
      sku: 'SNK-001',
      name: 'Sabritas Original 45g',
      category: 'Snacks'
    },
    previousStock: 100,
    newStock: 95,
    difference: -5,
    reason: 'Vencimiento',
    notes: 'Productos vencidos retirados',
    user: 'María García',
    branchName: 'Sucursal Principal'
  },
  {
    id: '3',
    date: '2024-01-19',
    time: '16:45',
    product: {
      sku: 'PAP-001',
      name: 'Cuaderno Arimany Doble Línea 80 Hojas',
      category: 'Papelería'
    },
    previousStock: 30,
    newStock: 50,
    difference: 20,
    reason: 'Error de conteo',
    notes: 'Corrección de inventario inicial',
    user: 'Carlos López',
    branchName: 'Sucursal Principal'
  },
  {
    id: '4',
    date: '2024-01-19',
    time: '10:15',
    product: {
      sku: 'BEB-002',
      name: 'Agua Ciel 1L',
      category: 'Bebidas'
    },
    previousStock: 80,
    newStock: 78,
    difference: -2,
    reason: 'Pérdida/Robo',
    user: 'Ana Martínez',
    branchName: 'Sucursal Norte'
  },
  {
    id: '5',
    date: '2024-01-18',
    time: '09:30',
    product: {
      sku: 'DUL-003',
      name: 'Chocolate Snickers',
      category: 'Dulces'
    },
    previousStock: 40,
    newStock: 45,
    difference: 5,
    reason: 'Devolución de cliente',
    notes: 'Cliente devolvió productos en buen estado',
    user: 'Pedro Rodríguez',
    branchName: 'Sucursal Principal'
  }
]

const adjustmentsByReason = [
  { reason: 'Error de conteo', count: 12, percentage: 30, color: '#3B82F6' },
  { reason: 'Rotura/Daño', count: 10, percentage: 25, color: '#EF4444' },
  { reason: 'Vencimiento', count: 8, percentage: 20, color: '#F59E0B' },
  { reason: 'Pérdida/Robo', count: 6, percentage: 15, color: '#8B5CF6' },
  { reason: 'Devolución', count: 4, percentage: 10, color: '#10B981' },
]

const adjustmentsByDay = [
  { date: 'Lun', positive: 5, negative: 8 },
  { date: 'Mar', positive: 3, negative: 12 },
  { date: 'Mié', positive: 7, negative: 5 },
  { date: 'Jue', positive: 2, negative: 9 },
  { date: 'Vie', positive: 8, negative: 6 },
  { date: 'Sáb', positive: 4, negative: 3 },
  { date: 'Dom', positive: 1, negative: 2 },
]

export default function InventoryAdjustmentsReport() {
  const navigate = useNavigate()
  const [dateRange, setDateRange] = useState({ start: '2024-01-14', end: '2024-01-20' })
  const [selectedReason, setSelectedReason] = useState<string | null>(null)
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const stats = {
    totalAdjustments: 45,
    positiveAdjustments: 30,
    negativeAdjustments: 45,
    totalValue: 1250.50,
    mostAdjustedCategory: 'Bebidas',
    activeUsers: 5
  }

  const filteredAdjustments = mockAdjustments.filter(adj => {
    const matchesSearch = adj.product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         adj.product.sku.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesReason = !selectedReason || adj.reason === selectedReason
    const matchesUser = !selectedUser || adj.user === selectedUser
    return matchesSearch && matchesReason && matchesUser
  })

  const getDifferenceColor = (difference: number) => {
    if (difference > 0) return 'text-green-600 bg-green-50'
    if (difference < 0) return 'text-red-600 bg-red-50'
    return 'text-gray-600 bg-gray-50'
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
            <h1 className="text-2xl font-bold text-gray-800">Reporte de Ajustes de Inventario</h1>
            <p className="text-gray-600 text-sm mt-1">
              Del {format(new Date(dateRange.start), "d 'de' MMMM", { locale: es })} al{' '}
              {format(new Date(dateRange.end), "d 'de' MMMM 'de' yyyy", { locale: es })}
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
          <div className="flex-1 flex flex-col sm:flex-row gap-4">
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
            
            <div className="relative flex-1">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar producto..."
                className="input pl-10 w-full"
              />
              <Search className="absolute left-3 top-2.5 text-gray-400" size={20} />
            </div>
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

        {/* Filtros expandibles */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">Razón del Ajuste</label>
              <select
                value={selectedReason || ''}
                onChange={(e) => setSelectedReason(e.target.value || null)}
                className="input w-full"
              >
                <option value="">Todas las razones</option>
                <option value="Error de conteo">Error de conteo</option>
                <option value="Rotura/Daño">Rotura/Daño</option>
                <option value="Vencimiento">Vencimiento</option>
                <option value="Pérdida/Robo">Pérdida/Robo</option>
                <option value="Devolución de cliente">Devolución de cliente</option>
              </select>
            </div>
            
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">Usuario</label>
              <select
                value={selectedUser || ''}
                onChange={(e) => setSelectedUser(e.target.value || null)}
                className="input w-full"
              >
                <option value="">Todos los usuarios</option>
                <option value="Juan Pérez">Juan Pérez</option>
                <option value="María García">María García</option>
                <option value="Carlos López">Carlos López</option>
                <option value="Ana Martínez">Ana Martínez</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Total Ajustes</span>
            <History className="text-primary-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.totalAdjustments}</p>
          <p className="text-xs text-gray-500 mt-1">En 7 días</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Ajustes Positivos</span>
            <TrendingUp className="text-green-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">+{stats.positiveAdjustments}</p>
          <p className="text-xs text-green-600 mt-1">Aumentos de stock</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Ajustes Negativos</span>
            <TrendingDown className="text-red-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">-{stats.negativeAdjustments}</p>
          <p className="text-xs text-red-600 mt-1">Reducciones de stock</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Valor Afectado</span>
            <Package className="text-orange-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">${stats.totalValue}</p>
          <p className="text-xs text-orange-600 mt-1">En productos</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Categoría Más Ajustada</span>
            <BarChart3 className="text-purple-600" size={20} />
          </div>
          <p className="text-lg font-bold text-gray-800">{stats.mostAdjustedCategory}</p>
          <p className="text-xs text-purple-600 mt-1">18 ajustes</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Usuarios Activos</span>
            <User className="text-teal-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.activeUsers}</p>
          <p className="text-xs text-teal-600 mt-1">Realizaron ajustes</p>
        </motion.div>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ajustes por día */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Calendar size={20} />
            Ajustes por Día
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={adjustmentsByDay}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="positive" fill="#10B981" name="Positivos" />
              <Bar dataKey="negative" fill="#EF4444" name="Negativos" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Razones de ajuste */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <AlertTriangle size={20} />
            Razones de Ajuste
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={adjustmentsByReason}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ reason, percentage }) => `${reason} ${percentage}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="count"
              >
                {adjustmentsByReason.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tabla de ajustes detallados */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="p-6 border-b">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <FileText size={20} />
            Detalle de Ajustes ({filteredAdjustments.length})
          </h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-3 px-4 font-medium text-gray-700">Fecha/Hora</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700">Producto</th>
                <th className="text-center py-3 px-4 font-medium text-gray-700">Stock Anterior</th>
                <th className="text-center py-3 px-4 font-medium text-gray-700">Stock Nuevo</th>
                <th className="text-center py-3 px-4 font-medium text-gray-700">Diferencia</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700">Razón</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700">Usuario</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700">Notas</th>
              </tr>
            </thead>
            <tbody>
              {filteredAdjustments.map((adjustment) => (
                <tr key={adjustment.id} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <div>
                      <p className="text-sm font-medium">{format(new Date(adjustment.date), 'dd/MM/yyyy')}</p>
                      <p className="text-xs text-gray-500">{adjustment.time}</p>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div>
                      <p className="text-sm font-medium">{adjustment.product.name}</p>
                      <p className="text-xs text-gray-500">SKU: {adjustment.product.sku}</p>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center">{adjustment.previousStock}</td>
                  <td className="py-3 px-4 text-center">{adjustment.newStock}</td>
                  <td className="py-3 px-4 text-center">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getDifferenceColor(adjustment.difference)}`}>
                      {adjustment.difference > 0 ? <Plus size={14} /> : <Minus size={14} />}
                      {Math.abs(adjustment.difference)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm">{adjustment.reason}</td>
                  <td className="py-3 px-4 text-sm">{adjustment.user}</td>
                  <td className="py-3 px-4">
                    {adjustment.notes && (
                      <span className="text-sm text-gray-600 italic">{adjustment.notes}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Resumen del período */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Clock size={20} />
          Análisis del Período
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">Horarios con Mayor Actividad</h4>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">14:00 - 16:00</span>
                <span className="text-sm font-medium">18 ajustes</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">10:00 - 12:00</span>
                <span className="text-sm font-medium">12 ajustes</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">16:00 - 18:00</span>
                <span className="text-sm font-medium">8 ajustes</span>
              </div>
            </div>
          </div>
          
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">Usuarios con Más Ajustes</h4>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">María García</span>
                <span className="text-sm font-medium">15 ajustes</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Juan Pérez</span>
                <span className="text-sm font-medium">12 ajustes</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Carlos López</span>
                <span className="text-sm font-medium">8 ajustes</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 p-4 bg-yellow-50 rounded-lg">
          <p className="text-sm text-yellow-800">
            <strong>Nota:</strong> Se recomienda revisar los productos con ajustes frecuentes por "Error de conteo" 
            para identificar posibles problemas en el proceso de inventario o capacitación del personal.
          </p>
        </div>
      </div>
    </div>
  )
}