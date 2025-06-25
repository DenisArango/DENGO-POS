import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Calendar, Download, Printer, Package,
  ArrowUpDown, TruckIcon, ShoppingCart, AlertTriangle,
  ArrowUpRight, ArrowDownRight, Filter, ChevronDown,
  Search, Building2, Clock, CheckCircle, XCircle
} from 'lucide-react'
import { LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface InventoryMovement {
  id: string
  date: string
  time: string
  type: 'entry' | 'exit' | 'transfer' | 'adjustment' | 'return'
  product: string
  productCode: string
  quantity: number
  previousStock: number
  newStock: number
  location: string
  destination?: string
  reason: string
  reference: string
  performedBy: string
  status: 'completed' | 'pending' | 'cancelled'
  cost?: number
}

interface MovementSummary {
  type: string
  count: number
  totalUnits: number
  totalValue: number
  icon: React.ComponentType<any>
  color: string
}

// Datos de ejemplo
const recentMovements: InventoryMovement[] = [
  {
    id: '1',
    date: '2024-01-20',
    time: '14:30:00',
    type: 'entry',
    product: 'Coca Cola 600ml',
    productCode: 'BEB-001',
    quantity: 100,
    previousStock: 50,
    newStock: 150,
    location: 'Bodega Principal',
    reason: 'Compra a proveedor',
    reference: 'FAC-2024-001',
    performedBy: 'María García',
    status: 'completed',
    cost: 1500
  },
  {
    id: '2',
    date: '2024-01-20',
    time: '13:45:00',
    type: 'exit',
    product: 'Sabritas Original',
    productCode: 'SNK-003',
    quantity: 25,
    previousStock: 80,
    newStock: 55,
    location: 'Bodega Principal',
    reason: 'Venta al por mayor',
    reference: 'VTA-2024-145',
    performedBy: 'Juan Pérez',
    status: 'completed',
    cost: 462.50
  },
  {
    id: '3',
    date: '2024-01-20',
    time: '12:30:00',
    type: 'transfer',
    product: 'Galletas Oreo',
    productCode: 'DUL-007',
    quantity: 30,
    previousStock: 100,
    newStock: 70,
    location: 'Bodega Principal',
    destination: 'Sucursal Norte',
    reason: 'Reabastecimiento sucursal',
    reference: 'TRF-2024-023',
    performedBy: 'Carlos López',
    status: 'pending',
    cost: 495
  },
  {
    id: '4',
    date: '2024-01-20',
    time: '11:15:00',
    type: 'adjustment',
    product: 'Agua Ciel 1L',
    productCode: 'BEB-005',
    quantity: -5,
    previousStock: 200,
    newStock: 195,
    location: 'Bodega Principal',
    reason: 'Producto dañado',
    reference: 'AJU-2024-012',
    performedBy: 'Ana Martínez',
    status: 'completed',
    cost: 50
  },
  {
    id: '5',
    date: '2024-01-20',
    time: '10:00:00',
    type: 'return',
    product: 'Chocolate Snickers',
    productCode: 'DUL-015',
    quantity: 10,
    previousStock: 45,
    newStock: 55,
    location: 'Bodega Principal',
    reason: 'Devolución de cliente',
    reference: 'DEV-2024-008',
    performedBy: 'Juan Pérez',
    status: 'completed',
    cost: 220
  }
]

const movementSummary: MovementSummary[] = [
  {
    type: 'Entradas',
    count: 45,
    totalUnits: 2500,
    totalValue: 45000,
    icon: ArrowDownRight,
    color: '#10B981'
  },
  {
    type: 'Salidas',
    count: 120,
    totalUnits: 1800,
    totalValue: 32400,
    icon: ArrowUpRight,
    color: '#EF4444'
  },
  {
    type: 'Transferencias',
    count: 23,
    totalUnits: 450,
    totalValue: 8100,
    icon: ArrowUpDown,
    color: '#3B82F6'
  },
  {
    type: 'Ajustes',
    count: 12,
    totalUnits: -30,
    totalValue: -540,
    icon: AlertTriangle,
    color: '#F59E0B'
  }
]

const dailyMovements = [
  { date: 'Lun', entradas: 450, salidas: 380, transferencias: 50 },
  { date: 'Mar', entradas: 520, salidas: 420, transferencias: 80 },
  { date: 'Mié', entradas: 380, salidas: 450, transferencias: 60 },
  { date: 'Jue', entradas: 600, salidas: 400, transferencias: 40 },
  { date: 'Vie', entradas: 480, salidas: 520, transferencias: 90 },
  { date: 'Sáb', entradas: 350, salidas: 600, transferencias: 70 },
  { date: 'Dom', entradas: 250, salidas: 180, transferencias: 30 }
]

const topMovedProducts = [
  { product: 'Coca Cola 600ml', movements: 45, units: 680, percentage: 15 },
  { product: 'Sabritas Original', movements: 38, units: 520, percentage: 12 },
  { product: 'Galletas Oreo', movements: 32, units: 450, percentage: 10 },
  { product: 'Agua Ciel 1L', movements: 28, units: 380, percentage: 8 },
  { product: 'Chocolate Snickers', movements: 25, units: 320, percentage: 7 }
]

const movementsByLocation = [
  { location: 'Bodega Principal', entradas: 1200, salidas: 950, transferencias: 250 },
  { location: 'Sucursal Norte', entradas: 450, salidas: 380, transferencias: 120 },
  { location: 'Sucursal Sur', entradas: 380, salidas: 320, transferencias: 80 },
  { location: 'Sucursal Centro', entradas: 520, salidas: 480, transferencias: 150 }
]

export default function InventoryMovementsReport() {
  const navigate = useNavigate()
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'month'>('week')
  const [selectedType, setSelectedType] = useState<string>('all')
  const [selectedLocation, setSelectedLocation] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const stats = {
    totalMovements: 200,
    totalUnitsIn: 3030,
    totalUnitsOut: 2450,
    netMovement: 580,
    pendingTransfers: 5,
    cancelledMovements: 3
  }

  const getMovementIcon = (type: string) => {
    switch (type) {
      case 'entry': return <ArrowDownRight className="text-green-600" size={16} />
      case 'exit': return <ArrowUpRight className="text-red-600" size={16} />
      case 'transfer': return <ArrowUpDown className="text-blue-600" size={16} />
      case 'adjustment': return <AlertTriangle className="text-yellow-600" size={16} />
      case 'return': return <TruckIcon className="text-purple-600" size={16} />
      default: return <Package size={16} />
    }
  }

  const getMovementColor = (type: string) => {
    switch (type) {
      case 'entry': return 'text-green-600 bg-green-100'
      case 'exit': return 'text-red-600 bg-red-100'
      case 'transfer': return 'text-blue-600 bg-blue-100'
      case 'adjustment': return 'text-yellow-600 bg-yellow-100'
      case 'return': return 'text-purple-600 bg-purple-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getMovementLabel = (type: string) => {
    switch (type) {
      case 'entry': return 'Entrada'
      case 'exit': return 'Salida'
      case 'transfer': return 'Transferencia'
      case 'adjustment': return 'Ajuste'
      case 'return': return 'Devolución'
      default: return type
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="text-green-600" size={16} />
      case 'pending': return <Clock className="text-yellow-600" size={16} />
      case 'cancelled': return <XCircle className="text-red-600" size={16} />
      default: return null
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
            <h1 className="text-2xl font-bold text-gray-800">Reporte de Movimientos de Inventario</h1>
            <p className="text-gray-600 text-sm mt-1">
              Historial de entradas, salidas, ajustes y transferencias
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
              placeholder="Buscar producto o referencia..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input pl-10 w-full"
            />
          </div>
          
          <div className="flex gap-2">
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="input"
            >
              <option value="all">Todos los tipos</option>
              <option value="entry">Entradas</option>
              <option value="exit">Salidas</option>
              <option value="transfer">Transferencias</option>
              <option value="adjustment">Ajustes</option>
              <option value="return">Devoluciones</option>
            </select>
            
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="input"
            >
              <option value="all">Todas las ubicaciones</option>
              <option value="main">Bodega Principal</option>
              <option value="north">Sucursal Norte</option>
              <option value="south">Sucursal Sur</option>
              <option value="center">Sucursal Centro</option>
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
            <span className="text-gray-600 text-sm">Total Movimientos</span>
            <ArrowUpDown className="text-blue-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.totalMovements}</p>
          <p className="text-xs text-blue-600 mt-1">Esta semana</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Unidades Entrada</span>
            <ArrowDownRight className="text-green-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.totalUnitsIn.toLocaleString()}</p>
          <p className="text-xs text-green-600 mt-1">+15% vs anterior</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Unidades Salida</span>
            <ArrowUpRight className="text-red-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.totalUnitsOut.toLocaleString()}</p>
          <p className="text-xs text-red-600 mt-1">-8% vs anterior</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Movimiento Neto</span>
            <Package className="text-purple-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">+{stats.netMovement}</p>
          <p className="text-xs text-purple-600 mt-1">Unidades</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Transferencias Pendientes</span>
            <Clock className="text-yellow-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.pendingTransfers}</p>
          <p className="text-xs text-yellow-600 mt-1">Por completar</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white rounded-lg shadow-sm p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Cancelados</span>
            <XCircle className="text-red-600" size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.cancelledMovements}</p>
          <p className="text-xs text-red-600 mt-1">Esta semana</p>
        </motion.div>
      </div>

      {/* Resumen por tipo */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {movementSummary.map((summary, index) => (
          <motion.div
            key={summary.type}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white rounded-lg shadow-sm p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <summary.icon size={24} style={{ color: summary.color }} />
              <span className="text-2xl font-bold text-gray-800">{summary.count}</span>
            </div>
            <h4 className="font-medium text-gray-800 mb-2">{summary.type}</h4>
            <div className="space-y-1">
              <p className="text-sm text-gray-600">
                Unidades: <span className="font-medium">{summary.totalUnits.toLocaleString()}</span>
              </p>
              <p className="text-sm text-gray-600">
                Valor: <span className="font-medium">${summary.totalValue.toLocaleString()}</span>
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Gráficos principales */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Movimientos diarios */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Calendar size={20} />
            Movimientos Diarios
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={dailyMovements}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="entradas" stackId="1" stroke="#10B981" fill="#10B981" fillOpacity={0.6} />
              <Area type="monotone" dataKey="salidas" stackId="1" stroke="#EF4444" fill="#EF4444" fillOpacity={0.6} />
              <Area type="monotone" dataKey="transferencias" stackId="1" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.6} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Productos más movidos */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Package size={20} />
            Productos con Mayor Movimiento
          </h3>
          <div className="space-y-3">
            {topMovedProducts.map((product, index) => (
              <div key={index}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium text-gray-700">{product.product}</span>
                  <span className="text-sm text-gray-600">{product.movements} mov.</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-primary-600 h-2 rounded-full transition-all"
                      style={{ width: `${product.percentage * 5}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-16 text-right">{product.units} und.</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Detalle de movimientos */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <ArrowUpDown size={20} />
          Detalle de Movimientos Recientes
        </h3>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Fecha/Hora</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Tipo</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Producto</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Cantidad</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Stock</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Ubicación</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Referencia</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Estado</th>
              </tr>
            </thead>
            <tbody>
              {recentMovements
                .filter(movement => 
                  (selectedType === 'all' || movement.type === selectedType) &&
                  (movement.product.toLowerCase().includes(searchTerm.toLowerCase()) ||
                   movement.reference.toLowerCase().includes(searchTerm.toLowerCase()))
                )
                .map((movement) => (
                  <tr key={movement.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <p className="text-sm font-medium">{format(new Date(movement.date), "d MMM", { locale: es })}</p>
                      <p className="text-xs text-gray-500">{movement.time}</p>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${getMovementColor(movement.type)}`}>
                        {getMovementIcon(movement.type)}
                        {getMovementLabel(movement.type)}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-medium text-gray-800">{movement.product}</p>
                      <p className="text-xs text-gray-500">{movement.productCode}</p>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`font-bold ${
                        movement.type === 'entry' || movement.type === 'return' ? 'text-green-600' :
                        movement.type === 'exit' ? 'text-red-600' :
                        movement.type === 'adjustment' && movement.quantity < 0 ? 'text-red-600' :
                        'text-gray-800'
                      }`}>
                        {movement.type === 'entry' || movement.type === 'return' ? '+' : ''}
                        {movement.quantity}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <p className="text-sm">{movement.previousStock} → {movement.newStock}</p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-sm">{movement.location}</p>
                      {movement.destination && (
                        <p className="text-xs text-gray-500">→ {movement.destination}</p>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-sm font-medium">{movement.reference}</p>
                      <p className="text-xs text-gray-500">{movement.reason}</p>
                      <p className="text-xs text-gray-500">Por: {movement.performedBy}</p>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center gap-1">
                        {getStatusIcon(movement.status)}
                        <span className="text-xs">
                          {movement.status === 'completed' ? 'Completado' :
                           movement.status === 'pending' ? 'Pendiente' : 'Cancelado'}
                        </span>
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Movimientos por ubicación */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Building2 size={20} />
          Resumen por Ubicación
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {movementsByLocation.map((location, index) => (
            <div key={index} className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-medium text-gray-800 mb-3">{location.location}</h4>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 flex items-center gap-1">
                    <ArrowDownRight className="text-green-600" size={14} />
                    Entradas
                  </span>
                  <span className="font-medium text-green-600">+{location.entradas}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 flex items-center gap-1">
                    <ArrowUpRight className="text-red-600" size={14} />
                    Salidas
                  </span>
                  <span className="font-medium text-red-600">-{location.salidas}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 flex items-center gap-1">
                    <ArrowUpDown className="text-blue-600" size={14} />
                    Transferencias
                  </span>
                  <span className="font-medium text-blue-600">{location.transferencias}</span>
                </div>
                <div className="pt-2 mt-2 border-t">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-700">Neto</span>
                    <span className={`font-bold ${
                      (location.entradas - location.salidas) > 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {(location.entradas - location.salidas) > 0 ? '+' : ''}
                      {location.entradas - location.salidas}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Alertas y análisis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-yellow-50 rounded-lg p-6">
          <h3 className="font-semibold text-yellow-900 mb-3 flex items-center gap-2">
            <AlertTriangle size={20} />
            Movimientos que Requieren Atención
          </h3>
          <ul className="space-y-2 text-sm text-yellow-800">
            <li className="flex items-start gap-2">
              <span className="text-yellow-600 mt-0.5">•</span>
              <span>
                <strong>5 transferencias pendientes</strong> desde hace más de 24 horas.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-yellow-600 mt-0.5">•</span>
              <span>
                <strong>Ajuste inusual:</strong> -5 unidades de Agua Ciel por producto dañado.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-yellow-600 mt-0.5">•</span>
              <span>
                <strong>Sucursal Norte:</strong> Balance negativo de -120 unidades esta semana.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-yellow-600 mt-0.5">•</span>
              <span>
                Múltiples devoluciones de <strong>Chocolate Snickers</strong> en los últimos 3 días.
              </span>
            </li>
          </ul>
        </div>

        <div className="bg-blue-50 rounded-lg p-6">
          <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
            <TruckIcon size={20} />
            Análisis y Recomendaciones
          </h3>
          <div className="space-y-3 text-sm text-blue-800">
            <div>
              <p className="font-medium mb-1">Eficiencia de Transferencias</p>
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div className="bg-blue-600 h-2 rounded-full" style={{ width: '85%' }} />
              </div>
              <p className="text-xs mt-1">85% completadas a tiempo</p>
            </div>
            <p>
              • Optimizar rutas de transferencia entre sucursales para reducir tiempos.
            </p>
            <p>
              • Establecer stock mínimo de seguridad en Sucursal Norte.
            </p>
            <p>
              • Investigar causa de devoluciones frecuentes de Chocolate Snickers.
            </p>
            <p>
              • Implementar revisión diaria de transferencias pendientes.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}