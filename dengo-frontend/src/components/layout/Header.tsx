import { Building2, Menu } from 'lucide-react'
import QuickNav from './QuickNav'
import { roleLabel } from '../../lib/roles'
import { useAuthStore } from '../../store'
import { useAppStore } from '../../store'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import StoreSelector from './StoreSelector'
import NotificationPanel from './NotificationPanel'
import { useStore } from '../../contexts/StoreContext'

export default function Header() {
  const user = useAuthStore((state) => state.user)
  const { toggleSidebar } = useAppStore()
  const { currentStore, availableStores, switchStore, canSwitchStore, isLoading } = useStore()

  const storeOptions = availableStores.map(s => ({
    id: s.id,
    name: s.name,
    code: s.code,
    type: s.type as 'main' | 'branch',
    city: s.city || s.name,
    status: s.status as 'active' | 'inactive' | 'maintenance',
    logo: s.logo,
  }))

  const renderStoreSelector = () => {
    if (isLoading) {
      return (
        <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400" />
          <span className="hidden sm:inline">Cargando…</span>
        </div>
      )
    }
    if (storeOptions.length === 0 || !currentStore) {
      return (
        <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500">
          <Building2 size={18} className="text-gray-400" />
        </div>
      )
    }
    return (
      <StoreSelector
        stores={storeOptions}
        currentStoreId={currentStore.id}
        onStoreChange={switchStore}
        canChangeStore={canSwitchStore}
      />
    )
  }

  // "miércoles, 11 de noviembre de 2026" → first letter only, like the portal.
  const today = format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-gray-200 bg-white/95 px-4 backdrop-blur-sm supports-[backdrop-filter]:bg-white/85 md:px-6 print:hidden">
      {/* Left */}
      <div className="flex min-w-0 items-center gap-2 md:gap-4">
        {/* Mobile hamburger — only visible when sidebar is hidden */}
        <button
          onClick={toggleSidebar}
          aria-label="Abrir menú"
          className="rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 lg:hidden"
        >
          <Menu size={20} />
        </button>
        {renderStoreSelector()}
        <div className="hidden border-l border-gray-200 pl-4 text-sm text-gray-500 md:block">
          {today.charAt(0).toUpperCase() + today.slice(1)}
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        <QuickNav />

        <NotificationPanel branchId={currentStore?.id ?? user?.branchId} />

        <div className="flex items-center border-l border-gray-200 pl-3">
          <div className="text-right text-sm">
            <p className="font-medium leading-none text-gray-900">{user?.name || 'Usuario'}</p>
            <p className="mt-1 text-xs text-gray-500">{roleLabel(user?.role) || 'Rol'}</p>
          </div>
        </div>
      </div>
    </header>
  )
}
