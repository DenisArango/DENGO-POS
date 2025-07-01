import { Bell, Search } from 'lucide-react'
import { useAuthStore } from '../../store'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import StoreSelector from './StoreSelector'
import { useState } from 'react'

export default function Header() {
  const user = useAuthStore((state) => state.user)

  // Datos de ejemplo para probar el StoreSelector
  const availableStores = [
    {
      id: '1',
      name: 'Tienda Central',
      code: 'TC001',
      type: 'main' as const,
      city: 'Ciudad de Guatemala',
      status: 'active' as const,
      stats: {
        dailySales: 4500,
        employees: 8,
        lowStock: 12
      }
    },
    {
      id: '2',
      name: 'Sucursal Norte',
      code: 'SN001',
      type: 'branch' as const,
      city: 'Mixco',
      status: 'active' as const,
      stats: {
        dailySales: 2800,
        employees: 5,
        lowStock: 8
      }
    },
    {
      id: '3',
      name: 'Sucursal Sur',
      code: 'SS001',
      type: 'branch' as const,
      city: 'Villa Nueva',
      status: 'maintenance' as const,
      stats: {
        dailySales: 0,
        employees: 4,
        lowStock: 15
      }
    }
  ]

  // Estado temporal para la tienda actual
  const [currentStoreId, setCurrentStoreId] = useState('1')
  
  const handleStoreChange = (storeId: string) => {
    console.log('Cambiando a tienda:', storeId)
    setCurrentStoreId(storeId)
  }

  return (
    <header className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between">
      {/* Left side */}
      <div className="flex items-center space-x-4">
        {/* StoreSelector aquí en lugar del Building/Branch */}
        <StoreSelector 
          stores={availableStores}
          currentStoreId={currentStoreId}
          onStoreChange={handleStoreChange}
          canChangeStore={true}
        />
        
        <div className="text-sm text-gray-500 border-l pl-4">
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

        {/* User info (opcional) */}
        <div className="flex items-center space-x-2 border-l pl-4">
          <div className="text-sm text-right">
            <p className="font-medium text-gray-800">{user?.name || 'Usuario'}</p>
            <p className="text-xs text-gray-500">{user?.role || 'Rol'}</p>
          </div>
        </div>
      </div>
    </header>
  )
}