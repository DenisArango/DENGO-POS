import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Settings as SettingsIcon, Users, Shield, Building2,
  CreditCard, Bell, Database, Palette, Globe,
  ChevronRight, Lock, Store, Target, PackagePlus, Tag, FileText
} from 'lucide-react'
import { useAuthStore } from '../store'
import { usePermissions } from '../hooks/usePermissions'
import PageIcon from '../components/common/PageIcon'

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
    id: 'categories',
    title: 'Categorías',
    description: 'Crear, renombrar, fusionar y eliminar categorías de productos',
    icon: Tag,
    path: '/settings/categories',
    color: 'bg-amber-500',
    category: 'general',
    requiredPermission: 'inventory.edit'
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
    color: 'bg-cyan-500',
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
    id: 'fel',
    title: 'Facturación electrónica',
    description: 'Certificador FEL (FELplex), establecimientos y prueba de conexión',
    icon: FileText,
    path: '/settings/fel',
    color: 'bg-purple-600',
    category: 'system',
    adminOnly: true
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
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-3">
          <PageIcon icon={SettingsIcon} color="slate" />
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
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1], delay: Math.min(index * 0.03, 0.2) }}
                    onClick={() => hasAccess && handleCardClick(card.path)}
                    className={`bg-white rounded-xl border border-gray-200/80 shadow-sm p-5 transition-[border-color,box-shadow,transform] duration-200 group ${
                      hasAccess
                        ? 'hover:border-primary-200 hover:shadow-lg motion-safe:hover:-translate-y-0.5 cursor-pointer'
                        : 'opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-4">
                      {/* bg-opacity-10 on the card's colour → soft tinted tile, icon in full colour */}
                      <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${card.color} bg-opacity-10 transition-transform duration-300 motion-safe:group-hover:scale-110 motion-safe:group-hover:-rotate-6`}>
                        <card.icon size={22} className={`${card.color.replace('bg-', 'text-')} motion-safe:group-hover:animate-wiggle`} />
                      </div>
                      {hasAccess ? (
                        <ChevronRight className="text-gray-400 group-hover:text-primary-600 transition-colors motion-safe:group-hover:animate-bounce-x" size={20} />
                      ) : (
                        <Lock className="text-gray-400" size={20} />
                      )}
                    </div>
                    
                    <h3 className="font-semibold text-gray-900 mb-1">{card.title}</h3>
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
      <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-6">
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