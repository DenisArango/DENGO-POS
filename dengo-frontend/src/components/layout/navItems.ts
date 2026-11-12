import {
  TrendingUp, ShoppingCart, Package, Warehouse, FileBarChart, DollarSign, ArrowLeftRight, Settings,
  Users, Truck, LayoutDashboard, PackageCheck, UserCircle, ClipboardList, Inbox, GraduationCap,
  School, BookOpen, Globe, Layers, BarChart2, MessageSquare, type LucideIcon,
} from 'lucide-react'
import { useAuthStore, useLicenseStore } from '../../store'
import { userHasPermission } from '../../hooks/usePermissions'

export interface NavItem {
  path: string
  icon: LucideIcon
  label: string
  roles: string[]
  permissions?: string[]
  license?: 'pageEnabled'
  badge?: 'unreadMessages' | 'pendingPortalOrders' | 'unreadPortalMessages'
  /** Extra words the quick finder matches on (Ctrl+K). */
  keywords?: string
}

// `roles` keeps the legacy base-role gate (still how the 4 built-in roles
// see the menu they always saw). `permissions` is an any-of fallback so a
// custom role that was only granted fine-grained permissions — never one of
// the 4 base roles — still gets a link to the pages it can actually use,
// instead of only reaching them by typing the URL directly.
export const menuItems: NavItem[] = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: ['ADMIN', 'OPERATOR', 'AUDITOR', 'INVENTORY_CONTROL'], keywords: 'inicio resumen' },
  { path: '/pos', icon: ShoppingCart, label: 'Punto de Venta', roles: ['ADMIN', 'OPERATOR'], permissions: ['sales.create'], keywords: 'vender venta cobrar pos' },
  { path: '/products', icon: Package, label: 'Productos', roles: ['ADMIN', 'INVENTORY_CONTROL'], permissions: ['inventory.view'], keywords: 'articulos catalogo precios' },
  { path: '/inventory', icon: Warehouse, label: 'Inventario', roles: ['ADMIN', 'INVENTORY_CONTROL', 'AUDITOR'], permissions: ['inventory.view'], keywords: 'existencias stock conteo' },
  { path: '/purchases', icon: PackageCheck, label: 'Compras', roles: ['ADMIN', 'INVENTORY_CONTROL'], permissions: ['purchases.receive'], keywords: 'ordenes de compra recepcion' },
  { path: '/suppliers', icon: Truck, label: 'Proveedores', roles: ['ADMIN', 'INVENTORY_CONTROL'], permissions: ['suppliers.view'] },
  { path: '/reports', icon: FileBarChart, label: 'Reportes', roles: ['ADMIN', 'AUDITOR'], permissions: ['reports.sales', 'reports.inventory', 'reports.financial', 'reports.audit'], keywords: 'informes analisis ia' },
  { path: '/cash-register', icon: DollarSign, label: 'Caja', roles: ['ADMIN', 'OPERATOR', 'AUDITOR'], permissions: ['cash.open', 'cash.close', 'cash.movements'], keywords: 'abrir cerrar corte efectivo' },
  { path: '/transfers', icon: ArrowLeftRight, label: 'Traslados', roles: ['ADMIN', 'INVENTORY_CONTROL'], permissions: ['transfers.view'], keywords: 'envios sucursales' },
  { path: '/customers', icon: UserCircle, label: 'Clientes', roles: ['ADMIN', 'OPERATOR'], permissions: ['customers.view'], keywords: 'credito abonos nit' },
  { path: '/quotations', icon: ClipboardList, label: 'Cotizaciones', roles: ['ADMIN', 'OPERATOR'], permissions: ['quotations.view'], keywords: 'proformas' },
  { path: '/website', icon: Globe, label: 'Página web', roles: ['ADMIN'], permissions: ['website.manage', 'promotions.manage', 'promotions.reports'], license: 'pageEnabled', keywords: 'sitio cupones promociones' },
  { path: '/messages', icon: MessageSquare, label: 'Mensajes', roles: ['ADMIN', 'OPERATOR', 'AUDITOR', 'INVENTORY_CONTROL'], badge: 'unreadMessages', keywords: 'chat' },
  { path: '/settings/users', icon: Users, label: 'Usuarios', roles: ['ADMIN'], permissions: ['settings.users'], keywords: 'empleados accesos' },
  { path: '/settings', icon: Settings, label: 'Configuración', roles: ['ADMIN'], permissions: ['settings.users', 'settings.roles', 'settings.stores', 'settings.system', 'settings.cashRegisters', 'goals.manage'], keywords: 'ajustes tiendas roles metas' },
]

export const portalItems: NavItem[] = [
  { path: '/portal/orders', icon: Inbox, label: 'Pedidos Portal', roles: ['ADMIN'], badge: 'pendingPortalOrders', keywords: 'maestros escuelas' },
  { path: '/portal/messages', icon: MessageSquare, label: 'Mensajes Maestros', roles: ['ADMIN'], badge: 'unreadPortalMessages' },
  { path: '/portal/teachers', icon: GraduationCap, label: 'Maestros', roles: ['ADMIN'], keywords: 'docentes' },
  { path: '/portal/schools', icon: School, label: 'Escuelas', roles: ['ADMIN'] },
  { path: '/portal/programs', icon: BookOpen, label: 'Programas', roles: ['ADMIN'] },
  { path: '/portal/program-options', icon: Layers, label: 'Paquetes', roles: ['ADMIN'] },
  { path: '/portal/consolidated', icon: BarChart2, label: 'Consolidado', roles: ['ADMIN'] },
  { path: '/portal/metrics', icon: TrendingUp, label: 'Rentabilidad', roles: ['ADMIN'] },
  { path: '/portal/config', icon: Globe, label: 'Config. Portal', roles: ['ADMIN'] },
]

/** The menu the current user is allowed to see — shared by the sidebar and the quick finder. */
export function useNavItems() {
  const user = useAuthStore(s => s.user)
  const maestrosEnabled = useLicenseStore(s => s.maestrosEnabled)
  const pageEnabled = useLicenseStore(s => s.pageEnabled)

  const main = menuItems.filter(item =>
    (item.license !== 'pageEnabled' || pageEnabled) &&
    !!user && (
      item.roles.includes(user.role) ||
      !!item.permissions?.some(p => userHasPermission(user, p))
    )
  )
  // Nothing to manage here if this instance's teacher-portal module is
  // switched off by the vendor (see LicenseConfig) — a teacher can't even log
  // in to place an order, so the admin config screens behind these links
  // would have nothing real to do either.
  const portal = maestrosEnabled
    ? portalItems.filter(item => !!user && item.roles.includes(user.role))
    : []

  return { main, portal }
}
