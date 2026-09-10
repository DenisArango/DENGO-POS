import { type ReactNode, useEffect, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { LogOut, GraduationCap, LayoutDashboard, ClipboardList, Plus, MessageSquare } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '../../store/authStore'
import { api } from '../../lib/api'

function getBusinessName(): string {
  try {
    const raw = localStorage.getItem('portal-config')
    if (raw) {
      const cfg = JSON.parse(raw)
      if (cfg?.businessName) return cfg.businessName
    }
  } catch { /* ignore */ }
  return 'Variedades Dayana'
}

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
  const businessName = getBusinessName()
  const unread = useUnread()

  const handleLogout = () => {
    logout()
    toast.success('Sesión cerrada')
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center text-white">
              <GraduationCap size={20} />
            </div>
            <div className="leading-tight">
              <p className="font-extrabold text-gray-800 text-sm sm:text-base">{businessName}</p>
              <p className="text-[11px] text-brand-600 font-medium">Portal de Maestros</p>
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
              className={({ isActive }) => `px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 ${isActive ? 'bg-brand-50 text-brand-600' : 'text-gray-600 hover:bg-brand-50 hover:text-brand-600'}`}
            >
              <ClipboardList size={16} /> Mis Pedidos
            </NavLink>
            <NavLink
              to="/messages"
              className={({ isActive }) => `relative px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 ${isActive ? 'bg-brand-50 text-brand-600' : 'text-gray-600 hover:bg-brand-50 hover:text-brand-600'}`}
            >
              <span className="relative">
                <MessageSquare size={16} />
                {unread > 0 && (
                  <span className="absolute -top-2 -right-2 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </span>
              Mensajes
              {unread > 0 && (
                <span className="ml-0.5 min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {unread}
                </span>
              )}
            </NavLink>
            <Link to="/orders/new" className="ml-1 px-3 py-2 rounded-lg text-sm font-semibold bg-brand-500 text-white hover:bg-brand-600 flex items-center gap-1.5">
              <Plus size={16} /> Nuevo Pedido
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            {/* Mobile messages badge */}
            <Link to="/messages" className="relative md:hidden p-2 text-gray-600 hover:text-brand-600">
              <MessageSquare size={20} />
              {unread > 0 && (
                <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">{children}</main>
    </div>
  )
}
