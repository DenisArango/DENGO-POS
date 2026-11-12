import { type ReactNode, useEffect, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { LogOut, LayoutDashboard, ClipboardList, Plus, MessageSquare, Bell } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '../../store/authStore'
import { api } from '../../lib/api'
import { BrandMark, usePortalConfig } from '../../lib/usePortalConfig'
import { FALLBACK_NAME } from '../../lib/brand'
import { resyncPush } from '../../lib/push'

function useUnread() {
  const { user } = useAuthStore()
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    const fetch = () => {
      api.getUnreadMessages()
        .then(r => { if (!cancelled) setCount(r.count ?? 0) })
        .catch(() => {})
    }
    fetch()
    const id = setInterval(fetch, 30_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [user])

  return count
}

export default function PortalLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const { config } = usePortalConfig()
  const businessName = config?.businessName || FALLBACK_NAME
  const unread = useUnread()
  const { pathname } = useLocation()
  // Screens with their own bottom bar (order cart, chat composer) keep the
  // whole bottom edge; a back arrow / header link gets the teacher out.
  const showTabBar = !pathname.startsWith('/orders/new') && !pathname.startsWith('/messages')
  // A device that already allowed notifications follows whoever logs in on it.
  useEffect(() => { if (user) void resyncPush() }, [user])

  const handleLogout = () => {
    logout()
    toast.success('Sesión cerrada')
    navigate('/login')
  }

  return (
    <div className="min-h-screen print:bg-white">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-gray-200 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2.5">
            <BrandMark logoUrl={config?.logoUrl} size={36} />
            <div className="leading-tight">
              <p className="font-extrabold text-gray-800 text-sm sm:text-base">{businessName}</p>
              <p className="text-xs text-brand-700 font-medium">Portal de maestros</p>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            <NavLink
              to="/dashboard"
              className={({ isActive }) => `px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 ${isActive ? 'bg-brand-50 text-brand-600' : 'text-gray-600 hover:bg-brand-50 hover:text-brand-600'}`}
            >
              <LayoutDashboard size={16} /> Inicio
            </NavLink>
            <NavLink
              to="/orders"
              end
              className={({ isActive }) => `px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 ${isActive ? 'bg-brand-50 text-brand-600' : 'text-gray-600 hover:bg-brand-50 hover:text-brand-600'}`}
            >
              <ClipboardList size={16} /> Mis Pedidos
            </NavLink>
            <NavLink
              to="/messages"
              className={({ isActive }) => `relative px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 ${isActive ? 'bg-brand-50 text-brand-600' : 'text-gray-600 hover:bg-brand-50 hover:text-brand-600'}`}
            >
              <MessageSquare size={16} />
              Mensajes
              {unread > 0 && (
                <span aria-label={`${unread} sin leer`} className="ml-0.5 min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-xs font-semibold rounded-full flex items-center justify-center">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </NavLink>
            <Link to="/orders/new" className="group ml-1 px-3.5 py-2 rounded-lg text-sm font-semibold bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm shadow-brand-700/30 hover:brightness-110 flex items-center gap-1.5">
              <Plus size={16} /> Nuevo Pedido
            </Link>
          </nav>

          <div className="flex items-center gap-1 sm:gap-3">
            <Link to="/notifications" title="Notificaciones en tu celular" aria-label="Notificaciones" className="hidden md:block p-2 text-gray-600 hover:text-brand-600">
              <Bell size={20} />
            </Link>
            <div className="hidden sm:block text-right leading-tight">
              <p className="text-sm font-semibold text-gray-800">{user?.name}</p>
              <p className="text-[11px] text-gray-500">Maestro/a</p>
            </div>
            <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-600 font-bold flex items-center justify-center">
              {user?.name?.charAt(0).toUpperCase() ?? 'M'}
            </div>
            <button
              onClick={handleLogout}
              title="Cerrar sesión"
              className="p-2 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className={`max-w-7xl mx-auto px-4 sm:px-6 pt-6 md:pb-6 print:p-0 print:max-w-none ${showTabBar ? 'pb-28' : 'pb-6'}`}>{children}</main>

      {showTabBar && <MobileTabBar unread={unread} />}
    </div>
  )
}

// Phones: the header has no room for the nav, so the four places a teacher
// goes live at the thumb. "Nuevo" is the main action and stands out.
function MobileTabBar({ unread }: { unread: number }) {
  const tab = ({ isActive }: { isActive: boolean }) =>
    `flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${isActive ? 'text-brand-600' : 'text-gray-500 active:text-gray-800'}`
  return (
    <nav
      aria-label="Navegación"
      className="md:hidden fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur print:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-md items-stretch px-2">
        <NavLink to="/dashboard" className={tab}>
          <LayoutDashboard size={21} /> Inicio
        </NavLink>
        <NavLink to="/orders" end className={tab}>
          <ClipboardList size={21} /> Pedidos
        </NavLink>
        <div className="flex flex-1 items-center justify-center">
          <Link
            to="/orders/new"
            aria-label="Nuevo pedido"
            className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-700/30 ring-4 ring-white active:scale-95 transition-transform"
          >
            <Plus size={26} />
          </Link>
        </div>
        <NavLink to="/messages" className={tab}>
          <span className="relative">
            <MessageSquare size={21} />
            {unread > 0 && (
              <span className="absolute -right-2 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white ring-2 ring-white">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </span>
          Mensajes
        </NavLink>
        <NavLink to="/notifications" className={tab}>
          <Bell size={21} /> Avisos
        </NavLink>
      </div>
    </nav>
  )
}
