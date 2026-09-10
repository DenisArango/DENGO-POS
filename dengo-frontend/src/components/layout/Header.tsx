import { Search, Building2, Menu } from 'lucide-react'
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

  return (
    <header className="h-16 bg-white border-b border-gray-200 px-4 md:px-6 flex items-center justify-between">
      {/* Left */}
      <div className="flex items-center space-x-2 md:space-x-4">
        {/* Mobile hamburger — only visible when sidebar is hidden */}
        <button
          onClick={toggleSidebar}
          className="lg:hidden p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600"
        >
          <Menu size={20} />
        </button>
        {renderStoreSelector()}
        <div className="text-sm text-gray-500 border-l pl-4 hidden md:block">
          {format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center space-x-3">
        <div className="relative hidden lg:block">
          <input
            type="text"
            placeholder="Buscar..."
            className="w-64 pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
          />
          <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
        </div>

        <NotificationPanel branchId={currentStore?.id ?? user?.branchId} />

        <div className="flex items-center space-x-2 border-l pl-3">
          <div className="text-sm text-right">
            <p className="font-medium text-gray-800 leading-none">{user?.name || 'Usuario'}</p>
            <p className="text-xs text-gray-500 mt-0.5">{user?.role || 'Rol'}</p>
          </div>
        </div>
      </div>
    </header>
  )
}
