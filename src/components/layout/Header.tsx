import { Bell, Building, Search } from 'lucide-react'
import { useAppStore, useAuthStore } from '../../store'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export default function Header() {
  const currentBranch = useAppStore((state) => state.currentBranch)
  const user = useAuthStore((state) => state.user)

  return (
    <header className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between">
      {/* Left side */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2 text-gray-600">
          <Building size={20} />
          <span className="font-medium">{currentBranch?.name || user?.branch.name || 'Sucursal'}</span>
        </div>
        <div className="text-sm text-gray-500">
          {format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center space-x-4">
        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Buscar..."
            className="w-64 pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <Search className="absolute left-3 top-2.5 text-gray-400" size={20} />
        </div>

        {/* Notifications */}
        <button className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <Bell size={20} className="text-gray-600" />
          <span className="absolute top-0 right-0 w-2 h-2 bg-secondary-500 rounded-full"></span>
        </button>
      </div>
    </header>
  )
}