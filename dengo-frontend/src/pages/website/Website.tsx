import { lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Globe, BarChart3, Tag, Ticket, LayoutTemplate } from 'lucide-react'
import { useAuthStore } from '../../store'
import { userHasPermission } from '../../hooks/usePermissions'
import PageIcon from '../../components/common/PageIcon'

const WebsiteReports = lazy(() => import('./WebsiteReports'))
const PromotionsList = lazy(() => import('./PromotionsList'))
const CouponsList = lazy(() => import('./CouponsList'))
const SiteEditor = lazy(() => import('./SiteEditor'))

const TABS = [
  { id: 'reportes', label: 'Rendimiento', icon: BarChart3, perm: 'promotions.reports' },
  { id: 'ofertas', label: 'Ofertas', icon: Tag, perm: 'promotions.manage' },
  { id: 'cupones', label: 'Cupones', icon: Ticket, perm: 'promotions.manage' },
  { id: 'sitio', label: 'Sitio web', icon: LayoutTemplate, perm: 'website.manage' },
] as const

// Módulo "Página web": offers with single-use coupons, their performance,
// and the public site's content.
export default function Website() {
  const user = useAuthStore(s => s.user)
  const tabs = TABS.filter(t => user && (user.role === 'ADMIN' || userHasPermission(user, t.perm)))
  const [params, setParams] = useSearchParams()
  const current = tabs.find(t => t.id === params.get('tab'))?.id ?? tabs[0]?.id

  if (!current) {
    return <div className="p-8 text-center text-gray-500">No tienes permiso para este módulo.</div>
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-3"><PageIcon icon={Globe} color="sky" /> Página web</h1>
          <p className="text-sm text-gray-500">Ofertas con cupón, su rendimiento y el contenido de tu sitio.</p>
        </div>
      </div>

      <div role="tablist" aria-label="Secciones de la página web" className="flex gap-1 p-1 bg-gray-100 rounded-xl w-full sm:w-fit overflow-x-auto">
        {tabs.map(t => {
          const active = t.id === current
          return (
            <button key={t.id} role="tab" aria-selected={active} type="button"
              onClick={() => setParams(p => { const n = new URLSearchParams(p); n.set('tab', t.id); return n }, { replace: true })}
              className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${active ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              {active && <motion.span layoutId="website-tab" className="absolute inset-0 bg-white rounded-xl border border-gray-200/80 shadow-sm" transition={{ type: 'spring', duration: 0.35, bounce: 0.15 }} />}
              <t.icon size={16} className="relative" />
              <span className="relative">{t.label}</span>
            </button>
          )
        })}
      </div>

      <Suspense fallback={<div className="h-64 rounded-xl bg-white animate-pulse" />}>
        {current === 'reportes' && <WebsiteReports />}
        {current === 'ofertas' && <PromotionsList />}
        {current === 'cupones' && <CouponsList />}
        {current === 'sitio' && <SiteEditor />}
      </Suspense>
    </div>
  )
}
