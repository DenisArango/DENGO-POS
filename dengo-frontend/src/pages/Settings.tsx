import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Settings as SettingsIcon, Users, Shield, Building2,
  CreditCard, Bell, Database, Palette, Globe,
  ChevronRight, Lock, Store, Target, PackagePlus
} from 'lucide-react'
import { useAuthStore } from '../store'
import { usePermissions } from '../hooks/usePermissions'

interface SettingCard {
  id: string
  title: string
  description: string
  icon: React.ComponentType<any>
  path: string
  color: string
  category: 'general' | 'security' | 'system'
  // Most cards map to a real permission key checked server-side by the
  // screen they lead to. A few (Respaldos, Seguridad) have no backend route
  // at all yet, so there's no permission key for them — those fall back to
  // the user's actual ADMIN role instead of a fake simulated one.
  requiredPermission?: string
  adminOnly?: boolean
}

const settingCards: SettingCard[] = [
  {
    id: 'users',
    title: 'Usuarios',
    description: 'Gestionar usuarios del sistema, crear nuevos y editar existentes',
    icon: Users,
    path: '/settings/users',
    color: 'bg-blue-500',
    category: 'security',
    requiredPermission: 'settings.users'
  },
  {
    id: 'roles',
    title: 'Roles y Permisos',
    description: 'Configurar roles de usuario y asignar permisos específicos',
    icon: Shield,
    path: '/settings/roles',
    color: 'bg-purple-500',
    category: 'security',
    requiredPermission: 'settings.roles'
  },
  {
    id: 'stores',
    title: 'Tiendas y Sucursales',
    description: 'Administrar tiendas, sucursales y sus configuraciones',
    icon: Store,
    path: '/settings/stores',
    color: 'bg-green-500',
    category: 'general',
    requiredPermission: 'settings.stores'
  },
  {
    id: 'company',
    title: 'Información de Empresa',
    description: 'Datos fiscales, logo y configuración general de la empresa',
    icon: Building2,
    path: '/settings/company',
    color: 'bg-orange-500',
    category: 'general',
    requiredPermission: 'settings.system'
  },
  {
    id: 'sales-goals',
    title: 'Metas de Venta',
    description: 'Configurar la meta mensual de ventas por sucursal',
    icon: Target,
    path: '/settings/sales-goals',
    color: 'bg-cyan-500',
    category: 'general',
    requiredPermission: 'goals.manage'
  },
  {
    id: 'inventory-reasons',
    title: 'Motivos de Ajuste',
    description: 'Motivos que se pueden elegir al subir o bajar inventario manualmente',
    icon: PackagePlus,
    path: '/settings/inventory-reasons',
    color: 'bg-lime-500',
    category: 'general',
    requiredPermission: 'inventory.adjust'
  },
  {
    id: 'payment-methods',
    title: 'Métodos de Pago',
    description: 'Configurar métodos de pago aceptados y comisiones',
    icon: CreditCard,
    path: '/settings/payment-methods',
    color: 'bg-teal-500',
    category: 'general',
    requiredPermission: 'settings.system'
  },
  {
    id: 'notifications',
    title: 'Notificaciones',
    description: 'Configurar alertas y notificaciones del sistema',
    icon: Bell,
    path: '/settings/notifications',
    color: 'bg-yellow-500',
    category: 'general'
  },
  {
    id: 'backup',
    title: 'Respaldos',
    description: 'Configurar respaldos automáticos y restauración',
    icon: Database,
    path: '/settings/backup',
    color: 'bg-red-500',
    category: 'system',
    adminOnly: true
  },
  {
    id: 'appearance',
    title: 'Apariencia',
    description: 'Personalizar colores, temas y preferencias visuales',
    icon: Palette,
    path: '/settings/appearance',
    color: 'bg-pink-500',
    category: 'general'
  },
  {
    id: 'localization',
    title: 'Localización',
    description: 'Idioma, zona horaria y formato de moneda',
    icon: Globe,
    path: '/settings/localization',
    color: 'bg-indigo-500',
    category: 'general'
  },
  {
    id: 'security',
    title: 'Seguridad',
    description: 'Políticas de contraseña y configuración de seguridad',
    icon: Lock,
    path: '/settings/security',
    color: 'bg-gray-600',
    category: 'security',
    adminOnly: true
  }
]

const categories = [
  { id: 'general', name: 'General', icon: SettingsIcon },
  { id: 'security', name: 'Seguridad y Acceso', icon: Shield },
  { id: 'system', name: 'Sistema', icon: Database }
]

export default function Settings() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { hasPermission } = usePermissions()

  const handleCardClick = (path: string) => {
    navigate(path)
  }

  const canAccessSetting = (card: SettingCard) => {
    if (card.requiredPermission) return hasPermission(card.requiredPermission)
    if (card.adminOnly) return user?.role === 'ADMIN'
    return true
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <SettingsIcon size={28} />
          Configuración
        </h1>
      </div>

      {/* Categorías */}
      {categories.map((category) => (
        <div key={category.id} className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <category.icon size={20} />
            {category.name}
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {settingCards
              .filter(card => card.category === category.id)
              .map((card, index) => {
                const hasAccess = canAccessSetting(card)
                
                return (
                  <motion.div
                    key={card.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.1 }}
                    onClick={() => hasAccess && handleCardClick(card.path)}
                    className={`bg-white rounded-lg shadow-sm p-6 transition-all group ${
                      hasAccess 
                        ? 'hover:shadow-lg cursor-pointer' 
                        : 'opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className={`p-3 rounded-lg ${card.color} bg-opacity-10`}>
                        <card.icon className={`${card.color.replace('bg-', 'text-')}`} size={24} />
                      </div>
                      {hasAccess ? (
                        <ChevronRight className="text-gray-400 group-hover:text-gray-600 transition-colors" size={20} />
                      ) : (
                        <Lock className="text-gray-400" size={20} />
                      )}
                    </div>
                    
                    <h3 className="font-semibold text-gray-800 mb-2">{card.title}</h3>
                    <p className="text-sm text-gray-600 line-clamp-2">{card.description}</p>
                    
                    {!hasAccess && (
                      <p className="text-xs text-red-600 mt-2">
                        Requiere permisos de administrador
                      </p>
                    )}
                  </motion.div>
                )
              })}
          </div>
        </div>
      ))}

      {/* Información del sistema */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="font-semibold text-gray-800 mb-4">Información del Sistema</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="text-sm text-gray-600">Versión del Sistema</p>
            <p className="font-medium text-gray-800">v2.0</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Última Actualización</p>
            <p className="font-medium text-gray-800">29 de Mayo, 2026</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Licencia</p>
            <p className="font-medium text-green-700">Premium — Válida hasta 29/05/2027</p>
          </div>
        </div>
      </div>
    </div>
  )
}