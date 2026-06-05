import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, AlertTriangle, ArrowUpDown, FileText, X, Package, CheckCircle } from 'lucide-react'
import { api } from '../../lib/api'
import { useNavigate } from 'react-router-dom'

interface Notification {
  id: string
  type: 'warning' | 'info' | 'error' | 'success'
  icon: React.ReactNode
  title: string
  description: string
  path: string
}

interface NotificationPanelProps {
  branchId?: string
}

export default function NotificationPanel({ branchId }: NotificationPanelProps) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (branchId) fetchNotifications()
    const interval = setInterval(() => { if (branchId) fetchNotifications() }, 60_000)
    return () => clearInterval(interval)
  }, [branchId])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function fetchNotifications() {
    const items: Notification[] = []
    try {
      const branchQ = branchId ? `?branchId=${branchId}` : ''
      const fromQ  = branchId ? `?fromBranchId=${branchId}&status=PENDING`    : '?status=PENDING'
      const toQ    = branchId ? `?toBranchId=${branchId}&status=IN_TRANSIT`   : '?status=IN_TRANSIT'

      const [inventory, pendingOut, incomingIn, quotations] = await Promise.allSettled([
        api.get<any[]>(`/api/inventory${branchQ}`),
        api.get<any[]>(`/api/transfers${fromQ}`),
        api.get<any[]>(`/api/transfers${toQ}`),
        api.get<any[]>('/api/quotations?status=ACCEPTED'),
      ])

      // ── Stock crítico / bajo ────────────────────────────────────────────────
      if (inventory.status === 'fulfilled') {
        const low = (inventory.value ?? []).filter((item: any) => {
          const qty = Number(item.quantity ?? 0)
          const min = Number(item.product?.minStock ?? 0)
          return qty === 0 || qty <= min
        })
        if (low.length > 0) {
          items.push({
            id: 'low-stock',
            type: 'error',
            icon: <AlertTriangle size={16} className="text-red-500" />,
            title: `${low.length} producto${low.length > 1 ? 's' : ''} con stock crítico`,
            description: low.slice(0, 3).map((i: any) => i.product?.name ?? '').join(', ') +
              (low.length > 3 ? ` y ${low.length - 3} más` : ''),
            path: '/inventory',
          })
        }

        const overstock = (inventory.value ?? []).filter((item: any) => {
          const qty = Number(item.quantity ?? 0)
          const min = Number(item.product?.minStock ?? 0)
          return min > 0 && qty > min * 3
        })
        if (overstock.length > 0) {
          items.push({
            id: 'overstock',
            type: 'warning',
            icon: <Package size={16} className="text-blue-500" />,
            title: `${overstock.length} producto${overstock.length > 1 ? 's' : ''} en sobrestock`,
            description: 'Considera crear promociones para reducir el exceso de inventario.',
            path: '/inventory',
          })
        }
      }

      // ── Traslados pendientes de enviar (salen de esta sucursal) ────────────
      if (pendingOut.status === 'fulfilled') {
        const list = pendingOut.value ?? []
        if (list.length > 0) {
          const names = list.slice(0, 2)
            .map((t: any) => t.toBranch?.name ?? t.toBranchId ?? '?')
            .join(', ')
          items.push({
            id: 'transfers-out',
            type: 'warning',
            icon: <ArrowUpDown size={16} className="text-orange-500" />,
            title: `${list.length} traslado${list.length > 1 ? 's' : ''} pendiente${list.length > 1 ? 's' : ''} de aprobar`,
            description: `Destino: ${names}${list.length > 2 ? ` y ${list.length - 2} más` : ''}`,
            path: '/transfers',
          })
        }
      }

      // ── Traslados en camino a esta sucursal (pendientes de recibir) ────────
      if (incomingIn.status === 'fulfilled') {
        const list = incomingIn.value ?? []
        if (list.length > 0) {
          const names = list.slice(0, 2)
            .map((t: any) => t.fromBranch?.name ?? t.fromBranchId ?? '?')
            .join(', ')
          items.push({
            id: 'transfers-in',
            type: 'info',
            icon: <ArrowUpDown size={16} className="text-blue-500" />,
            title: `${list.length} traslado${list.length > 1 ? 's' : ''} en camino — pendiente${list.length > 1 ? 's' : ''} de recibir`,
            description: `Origen: ${names}${list.length > 2 ? ` y ${list.length - 2} más` : ''}`,
            path: '/transfers',
          })
        }
      }

      // ── Cotizaciones aceptadas listas para convertir ────────────────────────
      if (quotations.status === 'fulfilled') {
        const accepted = (quotations.value ?? []).filter((q: any) => q.status === 'ACCEPTED')
        if (accepted.length > 0) {
          items.push({
            id: 'accepted-quotations',
            type: 'success',
            icon: <FileText size={16} className="text-green-500" />,
            title: `${accepted.length} cotización${accepted.length > 1 ? 'es' : ''} aceptada${accepted.length > 1 ? 's' : ''}`,
            description: 'Listas para convertir en venta.',
            path: '/quotations',
          })
        }
      }

      if (items.length === 0) {
        items.push({
          id: 'all-good',
          type: 'success',
          icon: <CheckCircle size={16} className="text-green-500" />,
          title: 'Todo en orden',
          description: 'No hay alertas activas en este momento.',
          path: '',
        })
      }
    } catch { /* silent */ }
    setNotifications(items)
  }

  const unread = notifications.filter(n => n.type !== 'success' || n.id !== 'all-good').length
  const hasAlert = notifications.some(n => n.type === 'error' || n.type === 'warning')

  const typeColors: Record<string, string> = {
    error:   'bg-red-50 border-red-100',
    warning: 'bg-yellow-50 border-yellow-100',
    info:    'bg-blue-50 border-blue-100',
    success: 'bg-green-50 border-green-100',
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(prev => !prev)}
        className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors"
        title="Notificaciones"
      >
        <Bell size={20} className="text-gray-600" />
        {unread > 0 && (
          <span className={`absolute top-0.5 right-0.5 w-4 h-4 text-[10px] font-bold rounded-full flex items-center justify-center text-white ${hasAlert ? 'bg-red-500' : 'bg-primary-500'}`}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
              <span className="font-semibold text-gray-800 text-sm">Notificaciones</span>
              <button onClick={() => setOpen(false)} className="p-1 hover:bg-gray-200 rounded">
                <X size={14} className="text-gray-500" />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
              {notifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => { if (n.path) { navigate(n.path); setOpen(false) } }}
                  className={`px-4 py-3 flex items-start gap-3 transition-colors ${n.path ? 'cursor-pointer hover:bg-gray-50' : ''} ${typeColors[n.type]}`}
                >
                  <div className="flex-shrink-0 mt-0.5">{n.icon}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 leading-snug">{n.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-snug">{n.description}</p>
                  </div>
                  {n.path && <span className="text-xs text-primary-500 flex-shrink-0 mt-1">Ver →</span>}
                </div>
              ))}
            </div>

            <div className="px-4 py-2 border-t bg-gray-50 text-center">
              <button
                onClick={() => { fetchNotifications(); }}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Actualizar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
