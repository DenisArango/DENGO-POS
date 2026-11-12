import { NavLink, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Menu, X, LogOut } from 'lucide-react'
import { useAppStore, useAuthStore } from '../../store'
import { usePendingPortalOrders } from '../../hooks/usePendingPortalOrders'
import { useUnreadMessages } from '../../hooks/useUnreadMessages'
import { useUnreadPortalMessages } from '../../hooks/useUnreadPortalMessages'
import { forgetDeviceOnLogout } from '../../lib/push'
import DengoLogo from '../common/DengoLogo'
import { roleLabel } from '../../lib/roles'
import { useNavItems, type NavItem } from './navItems'

export default function Sidebar({ offlineRestricted = false, allowedPaths = [] }: { offlineRestricted?: boolean; allowedPaths?: string[] }) {
  const { isSidebarCollapsed, toggleSidebar } = useAppStore()
  const { user, logout } = useAuthStore()
  // Unlink this device's notifications first (needs the token), then log out.
  const handleLogout = () => { void forgetDeviceOnLogout().finally(logout) }
  const { main, portal } = useNavItems()
  const { pathname } = useLocation()
  // /settings/users has its own link; don't light up «Configuración» with it.
  const activeFor = (item: NavItem, isActive: boolean) =>
    isActive && !(item.path === '/settings' && pathname.startsWith('/settings/users'))
  const pendingPortalOrders = usePendingPortalOrders()
  const unreadMessages = useUnreadMessages()
  const unreadPortalMessages = useUnreadPortalMessages()

  const badgeCount = (item: NavItem) =>
    item.badge === 'pendingPortalOrders' ? pendingPortalOrders
    : item.badge === 'unreadMessages' ? unreadMessages
    : item.badge === 'unreadPortalMessages' ? unreadPortalMessages
    : 0

  // While offline, grey out and disable every link that isn't part of the
  // selling workflow (see MainLayout's OFFLINE_ALLOWED_PATHS) instead of
  // letting the cashier click through to a page that's just going to bounce
  // them back — MainLayout's redirect still catches it either way, but this
  // avoids the jarring click-then-snap-back.
  const isDisabled = (path: string) => offlineRestricted && !allowedPaths.some(p => path.startsWith(p))

  const renderItem = (item: NavItem) => {
    const count = badgeCount(item)
    const disabled = isDisabled(item.path)
    return (
      <NavLink
        key={item.path}
        to={item.path}
        onClick={e => disabled && e.preventDefault()}
        title={disabled ? 'No disponible sin conexión' : isSidebarCollapsed ? item.label : undefined}
        aria-disabled={disabled || undefined}
        className={({ isActive: routeActive }) => {
          const isActive = activeFor(item, routeActive)
          return `group relative flex h-11 items-center rounded-lg px-3 text-[15px] font-medium transition-colors duration-150 ${
            isSidebarCollapsed ? 'lg:justify-center lg:px-0' : ''
          } ${
            disabled
              ? 'cursor-not-allowed text-gray-300'
              : isActive
              ? 'bg-gradient-to-r from-primary-50 to-violet-50/70 text-primary-700'
              : 'text-gray-600 hover:bg-gray-100/80 hover:text-gray-900'
          }`
        }}
      >
        {({ isActive: routeActive }) => { const isActive = activeFor(item, routeActive); return (
          <>
            {isActive && !disabled && (
              <span aria-hidden className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-primary-500 to-violet-500" />
            )}
            <span className="relative flex-shrink-0">
              <item.icon
                size={20}
                strokeWidth={isActive ? 2.1 : 1.8}
                className={disabled ? '' : `transition-[transform,color] duration-200 motion-safe:group-hover:scale-110 ${isActive ? 'text-primary-600' : 'text-gray-400 group-hover:text-primary-500'}`}
              />
              {count > 0 && isSidebarCollapsed && (
                <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white ring-2 ring-white">
                  {count > 9 ? '9+' : count}
                </span>
              )}
            </span>
            <motion.span
              animate={{
                opacity: isSidebarCollapsed ? 0 : 1,
                width: isSidebarCollapsed ? 0 : 'auto',
              }}
              transition={{ duration: 0.2 }}
              className="ml-3 flex-1 overflow-hidden whitespace-nowrap"
            >
              {item.label}
            </motion.span>
            {count > 0 && !isSidebarCollapsed && (
              <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-semibold text-white">
                {count > 99 ? '99+' : count}
              </span>
            )}
          </>
        )}}
      </NavLink>
    )
  }

  const initial = user?.name?.charAt(0).toUpperCase() ?? '?'

  return (
    <aside className={`fixed left-0 top-0 z-40 flex h-full flex-col border-r border-gray-200 bg-white transition-all duration-300 ${
      isSidebarCollapsed
        ? 'w-64 lg:w-16 -translate-x-full lg:translate-x-0'
        : 'w-64 translate-x-0'
    }`}>
      {/* Logo y Toggle */}
      <div className={`flex h-16 flex-shrink-0 items-center border-b border-gray-200 transition-all duration-300 ${
        isSidebarCollapsed ? 'justify-center' : 'justify-between px-4'
      }`}>
        {!isSidebarCollapsed && (
          <DengoLogo className="pl-1" />
        )}
        <button
          onClick={toggleSidebar}
          aria-label={isSidebarCollapsed ? 'Expandir menú' : 'Contraer menú'}
          className="flex-shrink-0 rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
        >
          {isSidebarCollapsed ? <Menu size={20} /> : <X size={20} />}
        </button>
      </div>

      {/* Menu Items — grows and scrolls on its own, so the user block below
          never covers the last links. */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto overscroll-contain px-2 py-3">
        {main.map(renderItem)}

        {portal.length > 0 && (
          <>
            {!isSidebarCollapsed ? (
              <p className="px-3 pb-1.5 pt-5 text-xs font-medium text-gray-500">Portal Escolar</p>
            ) : (
              <div className="mx-2 my-3 border-t border-gray-200" />
            )}
            {portal.map(renderItem)}
          </>
        )}
      </nav>

      {/* User Info & Logout */}
      <div className="flex-shrink-0 border-t border-gray-200 p-3">
        {isSidebarCollapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700" title={user?.name}>
              {initial}
            </div>
            <button
              onClick={handleLogout}
              className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600"
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
            >
              <LogOut size={18} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-violet-500 text-sm font-semibold text-white">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900">{user?.name}</p>
              <p className="truncate text-xs text-gray-500">{roleLabel(user?.role)}</p>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600"
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
            >
              <LogOut size={18} />
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
