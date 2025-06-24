import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ShoppingCart,
  Package,
  Warehouse,
  FileBarChart,
  DollarSign,
  ArrowLeftRight,
  Settings,
  Users,
  Menu,
  X,
  LogOut
} from 'lucide-react'
import { useAppStore, useAuthStore } from '../../store'
import type { UserRole } from '../../types'

const menuItems = [
  { path: '/pos', icon: ShoppingCart, label: 'Punto de Venta', roles: ['ADMIN', 'OPERATOR'] },
  { path: '/products', icon: Package, label: 'Productos', roles: ['ADMIN', 'INVENTORY_CONTROL'] },
  { path: '/inventory', icon: Warehouse, label: 'Inventario', roles: ['ADMIN', 'INVENTORY_CONTROL', 'AUDITOR'] },
  { path: '/reports', icon: FileBarChart, label: 'Reportes', roles: ['ADMIN', 'AUDITOR'] },
  { path: '/cash-register', icon: DollarSign, label: 'Caja', roles: ['ADMIN', 'OPERATOR', 'AUDITOR'] },
  { path: '/transfers', icon: ArrowLeftRight, label: 'Traslados', roles: ['ADMIN', 'INVENTORY_CONTROL'] },
  { path: '/users', icon: Users, label: 'Usuarios', roles: ['ADMIN'] },
  { path: '/settings', icon: Settings, label: 'Configuración', roles: ['ADMIN'] },
]

export default function Sidebar() {
  const { isSidebarCollapsed, toggleSidebar } = useAppStore()
  const { user, logout } = useAuthStore()

  const filteredMenuItems = menuItems.filter(item => 
    user && item.roles.includes(user.role)
  )

  return (
    <aside className={`fixed left-0 top-0 h-full bg-white border-r border-gray-200 transition-all duration-300 z-40 ${
      isSidebarCollapsed ? 'w-16' : 'w-64'
    }`}>
      {/* Logo y Toggle */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200">
        <motion.div
          animate={{ opacity: isSidebarCollapsed ? 0 : 1 }}
          className="flex items-center"
        >
          <div className="w-8 h-8 bg-gradient-to-br from-primary-600 to-secondary-600 rounded-lg"></div>
          <span className="ml-3 font-bold text-lg text-gray-800">POS System</span>
        </motion.div>
        <button
          onClick={toggleSidebar}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          {isSidebarCollapsed ? <Menu size={20} /> : <X size={20} />}
        </button>
      </div>

      {/* Menu Items */}
      <nav className="mt-6">
        {filteredMenuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center px-4 py-3 mx-2 mb-1 rounded-lg transition-all ${
                isActive
                  ? 'bg-primary-50 text-primary-600 border-l-4 border-primary-600'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`
            }
          >
            <item.icon size={20} className="flex-shrink-0" />
            <motion.span
              animate={{ 
                opacity: isSidebarCollapsed ? 0 : 1,
                width: isSidebarCollapsed ? 0 : 'auto'
              }}
              className="ml-3 whitespace-nowrap overflow-hidden"
            >
              {item.label}
            </motion.span>
          </NavLink>
        ))}
      </nav>

      {/* User Info & Logout */}
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : ''}`}>
            <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
              <span className="text-sm font-medium text-gray-700">
                {user?.name.charAt(0).toUpperCase()}
              </span>
            </div>
            {!isSidebarCollapsed && (
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-700">{user?.name}</p>
                <p className="text-xs text-gray-500">{user?.role}</p>
              </div>
            )}
          </div>
          <button
            onClick={logout}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600 hover:text-secondary-600"
            title="Cerrar sesión"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </aside>
  )
}