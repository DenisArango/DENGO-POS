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
  LogOut,
  Truck,
  LayoutDashboard,
  PackageCheck,
  UserCircle,
  ClipboardList,
  Inbox,
  GraduationCap,
  School,
  BookOpen,
  Globe,
  Layers,
  BarChart2,
  MessageSquare,
} from 'lucide-react'
import { useAppStore, useAuthStore } from '../../store'
import { usePendingPortalOrders } from '../../hooks/usePendingPortalOrders'
import { useUnreadMessages } from '../../hooks/useUnreadMessages'
import { useUnreadPortalMessages } from '../../hooks/useUnreadPortalMessages'
import { userHasPermission } from '../../hooks/usePermissions'

// `roles` keeps the legacy base-role gate (still how the 4 built-in roles
// see the menu they always saw). `permissions` is an any-of fallback so a
// custom role that was only granted fine-grained permissions — never one of
// the 4 base roles — still gets a link to the pages it can actually use,
// instead of only reaching them by typing the URL directly.
const menuItems = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: ['ADMIN', 'OPERATOR', 'AUDITOR', 'INVENTORY_CONTROL'] },
  { path: '/pos', icon: ShoppingCart, label: 'Punto de Venta', roles: ['ADMIN', 'OPERATOR'], permissions: ['sales.create'] },
  { path: '/products', icon: Package, label: 'Productos', roles: ['ADMIN', 'INVENTORY_CONTROL'], permissions: ['inventory.view'] },
  { path: '/inventory', icon: Warehouse, label: 'Inventario', roles: ['ADMIN', 'INVENTORY_CONTROL', 'AUDITOR'], permissions: ['inventory.view'] },
  { path: '/purchases', icon: PackageCheck, label: 'Compras', roles: ['ADMIN', 'INVENTORY_CONTROL'], permissions: ['purchases.receive'] },
  { path: '/suppliers', icon: Truck, label: 'Proveedores', roles: ['ADMIN', 'INVENTORY_CONTROL'], permissions: ['suppliers.view'] },
  { path: '/reports', icon: FileBarChart, label: 'Reportes', roles: ['ADMIN', 'AUDITOR'], permissions: ['reports.sales', 'reports.inventory', 'reports.financial', 'reports.audit'] },
  { path: '/cash-register', icon: DollarSign, label: 'Caja', roles: ['ADMIN', 'OPERATOR', 'AUDITOR'], permissions: ['cash.open', 'cash.close', 'cash.movements'] },
  { path: '/transfers', icon: ArrowLeftRight, label: 'Traslados', roles: ['ADMIN', 'INVENTORY_CONTROL'], permissions: ['transfers.view'] },
  { path: '/customers', icon: UserCircle, label: 'Clientes', roles: ['ADMIN', 'OPERATOR'], permissions: ['customers.view'] },
  { path: '/quotations', icon: ClipboardList, label: 'Cotizaciones', roles: ['ADMIN', 'OPERATOR'], permissions: ['quotations.view'] },
  { path: '/messages', icon: MessageSquare, label: 'Mensajes', roles: ['ADMIN', 'OPERATOR', 'AUDITOR', 'INVENTORY_CONTROL'], badge: 'unreadMessages' },
  { path: '/settings/users', icon: Users, label: 'Usuarios', roles: ['ADMIN'], permissions: ['settings.users'] },
  { path: '/settings', icon: Settings, label: 'Configuración', roles: ['ADMIN'], permissions: ['settings.users', 'settings.roles', 'settings.stores', 'settings.system', 'settings.cashRegisters', 'goals.manage'] },
]

const portalItems = [
  { path: '/portal/orders', icon: Inbox, label: 'Pedidos Portal', roles: ['ADMIN'], badge: 'pendingPortalOrders' },
  { path: '/portal/messages', icon: MessageSquare, label: 'Mensajes Maestros', roles: ['ADMIN'], badge: 'unreadPortalMessages' },
  { path: '/portal/teachers', icon: GraduationCap, label: 'Maestros', roles: ['ADMIN'] },
  { path: '/portal/schools', icon: School, label: 'Escuelas', roles: ['ADMIN'] },
  { path: '/portal/programs', icon: BookOpen, label: 'Programas', roles: ['ADMIN'] },
  { path: '/portal/program-options', icon: Layers, label: 'Paquetes', roles: ['ADMIN'] },
  { path: '/portal/consolidated', icon: BarChart2, label: 'Consolidado', roles: ['ADMIN'] },
  { path: '/portal/config', icon: Globe, label: 'Config. Portal', roles: ['ADMIN'] },
]

export default function Sidebar({ offlineRestricted = false, allowedPaths = [] }: { offlineRestricted?: boolean; allowedPaths?: string[] }) {
  const { isSidebarCollapsed, toggleSidebar } = useAppStore()
  const { user, logout } = useAuthStore()
  const pendingPortalOrders = usePendingPortalOrders()
  const unreadMessages = useUnreadMessages()
  const unreadPortalMessages = useUnreadPortalMessages()

  const filteredMenuItems = menuItems.filter(item =>
    user && (
      item.roles.includes(user.role) ||
      (item as { permissions?: string[] }).permissions?.some(p => userHasPermission(user, p))
    )
  )
  const filteredPortalItems = portalItems.filter(item =>
    user && item.roles.includes(user.role)
  )

  // While offline, grey out and disable every link that isn't part of the
  // selling workflow (see MainLayout's OFFLINE_ALLOWED_PATHS) instead of
  // letting the cashier click through to a page that's just going to bounce
  // them back — MainLayout's redirect still catches it either way, but this
  // avoids the jarring click-then-snap-back.
  const isDisabled = (path: string) => offlineRestricted && !allowedPaths.some(p => path.startsWith(p))

  return (
    <aside className={`fixed left-0 top-0 h-full bg-white border-r border-gray-200 transition-all duration-300 z-40 ${
      isSidebarCollapsed
        ? 'w-64 lg:w-16 -translate-x-full lg:translate-x-0'
        : 'w-64 translate-x-0'
    }`}>
      {/* Logo y Toggle */}
      <div className={`h-16 flex items-center border-b border-gray-200 transition-all duration-300 ${
        isSidebarCollapsed ? 'justify-center' : 'justify-between px-4'
      }`}>
        {!isSidebarCollapsed && (
          <div className="flex items-center">
            <div className="w-8 h-8 bg-gradient-to-br from-primary-600 to-secondary-600 rounded-lg flex-shrink-0" />
            <span className="ml-3 font-bold text-lg text-gray-800 whitespace-nowrap">DENGO POS</span>
          </div>
        )}
        <button
          onClick={toggleSidebar}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
        >
          {isSidebarCollapsed ? <Menu size={20} /> : <X size={20} />}
        </button>
      </div>

      {/* Menu Items */}
      <nav className="mt-6 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 9rem)' }}>
        {filteredMenuItems.map((item) => {
          const mBadgeCount = (item as any).badge === 'unreadMessages' ? unreadMessages : 0
          const mShowBadge = mBadgeCount > 0
          const disabled = isDisabled(item.path)
          return (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={e => disabled && e.preventDefault()}
              title={disabled ? 'No disponible sin conexión' : undefined}
              className={({ isActive }) =>
                `relative flex items-center px-4 py-3 mx-2 mb-1 rounded-lg transition-all ${
                  disabled
                    ? 'text-gray-300 cursor-not-allowed'
                    : isActive
                    ? 'bg-primary-50 text-primary-600 border-l-4 border-primary-600'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              <span className="relative flex-shrink-0">
                <item.icon size={20} />
                {mShowBadge && isSidebarCollapsed && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {mBadgeCount > 9 ? '9+' : mBadgeCount}
                  </span>
                )}
              </span>
              <motion.span
                animate={{
                  opacity: isSidebarCollapsed ? 0 : 1,
                  width: isSidebarCollapsed ? 0 : 'auto',
                }}
                transition={{ duration: 0.2 }}
                className="ml-3 whitespace-nowrap overflow-hidden flex-1"
              >
                {item.label}
              </motion.span>
              {mShowBadge && !isSidebarCollapsed && (
                <span className="ml-auto min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {mBadgeCount}
                </span>
              )}
            </NavLink>
          )
        })}

        {filteredPortalItems.length > 0 && (
          <>
            {!isSidebarCollapsed ? (
              <p className="px-4 mt-5 mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                Portal Escolar
              </p>
            ) : (
              <div className="mx-3 my-3 border-t border-gray-200" />
            )}
            {filteredPortalItems.map((item) => {
              const badgeCount = item.badge === 'pendingPortalOrders' ? pendingPortalOrders : item.badge === 'unreadMessages' ? unreadMessages : item.badge === 'unreadPortalMessages' ? unreadPortalMessages : 0
            const showBadge = badgeCount > 0
              const disabled = isDisabled(item.path)
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={e => disabled && e.preventDefault()}
                  title={disabled ? 'No disponible sin conexión' : undefined}
                  className={({ isActive }) =>
                    `relative flex items-center px-4 py-3 mx-2 mb-1 rounded-lg transition-all ${
                      disabled
                        ? 'text-gray-300 cursor-not-allowed'
                        : isActive
                        ? 'bg-primary-50 text-primary-600 border-l-4 border-primary-600'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`
                  }
                >
                  <span className="relative flex-shrink-0">
                    <item.icon size={20} />
                    {showBadge && isSidebarCollapsed && (
                      <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                        {badgeCount > 9 ? '9+' : badgeCount}
                      </span>
                    )}
                  </span>
                  <motion.span
                    animate={{
                      opacity: isSidebarCollapsed ? 0 : 1,
                      width: isSidebarCollapsed ? 0 : 'auto',
                    }}
                    transition={{ duration: 0.2 }}
                    className="ml-3 whitespace-nowrap overflow-hidden flex-1"
                  >
                    {item.label}
                  </motion.span>
                  {showBadge && !isSidebarCollapsed && (
                    <span className="ml-auto min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                      {badgeCount}
                    </span>
                  )}
                </NavLink>
              )
            })}
          </>
        )}
      </nav>

      {/* User Info & Logout */}
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200">
        {isSidebarCollapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
              <span className="text-sm font-medium text-gray-700">
                {user?.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <button
              onClick={logout}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600 hover:text-secondary-600"
              title="Cerrar sesión"
            >
              <LogOut size={18} />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                <span className="text-sm font-medium text-gray-700">
                  {user?.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-700">{user?.name}</p>
                <p className="text-xs text-gray-500">{user?.role}</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600 hover:text-secondary-600"
              title="Cerrar sesión"
            >
              <LogOut size={18} />
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
