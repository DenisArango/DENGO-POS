import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import Sidebar from './Sidebar.tsx'
import Header from './Header'
import { useAppStore } from '../../store'
import { subscribeSyncState, startOfflineSync, trySync, type SyncState } from '../../lib/offlineSync'
import FailedOfflineItemsModal from '../common/FailedOfflineItemsModal'

// Pages that still make sense with no connection: POS queues sales locally
// (see lib/offlineSync.ts), and cash-register open/close is where a cashier
// legitimately needs to be before/after a selling shift. Everything else —
// reports, settings, products, etc. — just fetches and renders blank or
// throws on a dead connection, so there's nothing useful to do there while
// offline; bouncing back to POS is safer than letting the cashier land on a
// broken screen.
const OFFLINE_ALLOWED_PATHS = ['/pos', '/cash-register']

export default function MainLayout() {
  const { isSidebarCollapsed, toggleSidebar } = useAppStore()
  const location = useLocation()
  const navigate = useNavigate()
  const [syncState, setSyncState] = useState<SyncState>({ isOnline: navigator.onLine, pendingCount: 0, pendingRegisterCount: 0, failedCount: 0, syncing: false })
  const [showFailedItems, setShowFailedItems] = useState(false)
  const warnedOffline = useRef(false)

  useEffect(() => {
    startOfflineSync()
    return subscribeSyncState(setSyncState)
  }, [])

  // React Router doesn't reset scroll on navigation by default (unlike a
  // real page load) — <main> isn't its own scroll container (no
  // overflow-y-auto), the whole document scrolls, and that scroll position
  // has nothing to do with the new page's content, so without this a report
  // opened after scrolling deep into a previous one starts pre-scrolled
  // instead of at the top.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  useEffect(() => {
    if (syncState.isOnline) {
      warnedOffline.current = false
      return
    }
    if (!OFFLINE_ALLOWED_PATHS.some(p => location.pathname.startsWith(p))) {
      if (!warnedOffline.current) {
        toast.error('Sin conexión — solo Punto de Venta y Caja funcionan sin internet')
        warnedOffline.current = true
      }
      navigate('/pos', { replace: true })
    }
  }, [syncState.isOnline, location.pathname, navigate])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Backdrop for mobile — closes sidebar when tapping outside */}
      {!isSidebarCollapsed && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Sidebar */}
      <Sidebar offlineRestricted={!syncState.isOnline} allowedPaths={OFFLINE_ALLOWED_PATHS} />

      {/* Main Content — full width on mobile, offset on desktop */}
      <div className={`transition-all duration-300 ${
        isSidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'
      }`}>
        {/* Header */}
        <Header />

        {/* Connectivity banner — shown on every page, not just POS, since
            navigation itself is restricted while offline */}
        {(!syncState.isOnline || syncState.pendingCount > 0 || syncState.pendingRegisterCount > 0) && (
          <div className="mx-4 md:mx-6 mt-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 flex items-center justify-between gap-3">
            <span className="text-sm text-amber-800 font-medium flex items-center gap-2">
              <AlertCircle size={16} />
              {!syncState.isOnline
                ? `Sin conexión con el servidor — se guarda todo localmente${syncState.pendingCount > 0 || syncState.pendingRegisterCount > 0 ? ` (${[syncState.pendingCount > 0 ? `${syncState.pendingCount} venta${syncState.pendingCount === 1 ? '' : 's'}` : null, syncState.pendingRegisterCount > 0 ? `${syncState.pendingRegisterCount} de caja` : null].filter(Boolean).join(', ')} pendiente${(syncState.pendingCount + syncState.pendingRegisterCount) === 1 ? '' : 's'} de sincronizar)` : ''}`
                : `Sincronizando ${syncState.pendingCount + syncState.pendingRegisterCount} pendiente${(syncState.pendingCount + syncState.pendingRegisterCount) === 1 ? '' : 's'}...`}
            </span>
            {syncState.isOnline && (syncState.pendingCount > 0 || syncState.pendingRegisterCount > 0) && !syncState.syncing && (
              <button onClick={() => trySync()} className="btn-secondary btn-sm whitespace-nowrap">
                Reintentar ahora
              </button>
            )}
          </div>
        )}

        {/* Rejected (not connectivity) sales/register ops — these will
            never sync on their own, so they get their own distinct banner
            instead of blending into "pendiente de sincronizar" above. */}
        {syncState.failedCount > 0 && (
          <div className="mx-4 md:mx-6 mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 flex items-center justify-between gap-3">
            <span className="text-sm text-red-800 font-medium flex items-center gap-2">
              <AlertCircle size={16} />
              {syncState.failedCount} {syncState.failedCount === 1 ? 'venta/movimiento rechazado' : 'ventas/movimientos rechazados'} — no se sincronizaron
            </span>
            <button onClick={() => setShowFailedItems(true)} className="btn-secondary btn-sm whitespace-nowrap">
              Ver detalles
            </button>
          </div>
        )}
        {showFailedItems && <FailedOfflineItemsModal onClose={() => setShowFailedItems(false)} />}

        {/* Page Content */}
        <main className="p-4 md:p-6">
          <AnimatePresence mode="wait">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}
