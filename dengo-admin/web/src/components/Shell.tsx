import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { LayoutGrid, PlusCircle, Server, ListChecks, LogOut, FlaskConical } from 'lucide-react'
import { api } from '../lib/api'
import { useMode } from '../lib/useMode'

export function DengoSymbol({ className = 'h-8 w-8', stroke = '#1E4D68' }: { className?: string; stroke?: string }) {
  return (
    <svg viewBox="3 3 124 139" className={className} aria-hidden>
      <path d="M65 15 115 44v57l-50 29-50-29V44Z" fill="none" stroke={stroke} strokeWidth={12} strokeLinejoin="round" strokeLinecap="round" />
      <line x1={15} y1={101} x2={115} y2={44} stroke={stroke} strokeWidth={8} strokeLinecap="round" />
      <path d="M28 107 65 42l37 65" fill="none" stroke="#E07A5F" strokeWidth={12} strokeLinejoin="round" />
    </svg>
  )
}

const NAV = [
  { to: '/', label: 'Clientes', icon: LayoutGrid, end: true },
  { to: '/nuevo', label: 'Nuevo cliente', icon: PlusCircle },
  { to: '/trabajos', label: 'Trabajos', icon: ListChecks },
  { to: '/servidor', label: 'Servidor', icon: Server },
]

export default function Shell() {
  const loc = useLocation()
  const mode = useMode()
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* phones: the rail becomes a top bar */}
      <header className="sticky top-0 z-30 flex items-center gap-1 bg-ink-800 px-3 py-2 md:hidden" style={{ background: 'linear-gradient(90deg,#1E4D68,#11303f)' }}>
        <span className="mr-2 flex h-9 w-9 items-center justify-center rounded-xl bg-white"><DengoSymbol className="h-6 w-6" /></span>
        {NAV.map(n => (
          <NavLink key={n.to} to={n.to} end={n.end} aria-label={n.label}
            className={({ isActive }) => `flex h-10 flex-1 items-center justify-center rounded-xl transition ${isActive ? 'bg-white/15 text-coral-300' : 'text-ink-200'}`}>
            <n.icon className="h-5 w-5" />
          </NavLink>
        ))}
      </header>
      <div className="hidden shrink-0 md:block md:w-[76px] lg:w-[232px]" style={{ background: 'linear-gradient(180deg,#1E4D68,#11303f)' }}>
      <aside className="sticky top-0 z-20 flex h-screen w-full flex-col items-center gap-2 py-5 lg:items-stretch lg:px-4"
        style={{ backgroundImage: 'radial-gradient(140% 60% at 0% 0%, #2b5b79 0%, transparent 70%), linear-gradient(180deg,#1E4D68,#11303f)' }}>
        <div className="mb-6 flex items-center gap-3 lg:px-2">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-lg shadow-black/20">
            <DengoSymbol className="h-7 w-7" />
          </span>
          <span className="hidden leading-tight lg:block">
            <span className="block font-display text-[17px] font-bold tracking-wide text-white">DENGO</span>
            <span className="block text-[12px] text-ink-200">Consola de clientes</span>
          </span>
        </div>
        <nav className="flex flex-col gap-1" aria-label="Principal">
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} end={n.end} title={n.label}
              className={({ isActive }) => `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-semibold transition ${isActive ? 'text-white' : 'text-ink-200 hover:bg-white/5 hover:text-white'}`}>
              {({ isActive }) => (
                <>
                  {isActive && <motion.span layoutId="nav-active" transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    className="absolute inset-0 rounded-xl bg-white/12 shadow-[inset_0_1px_0_rgba(255,255,255,.18),0_6px_14px_-6px_rgba(0,0,0,.4)]" />}
                  <n.icon className={`relative h-5 w-5 transition ${isActive ? 'text-coral-300' : ''}`} />
                  <span className="relative hidden lg:inline">{n.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2">
          {mode === 'simulate' && (
            <div className="hidden items-start gap-2 rounded-xl bg-amber-400/15 p-3 text-[12px] leading-snug text-amber-100 ring-1 ring-amber-300/25 lg:flex">
              <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <span><b className="text-amber-200">Simulación.</b> pm2, Caddy y git no se ejecutan de verdad.</span>
            </div>
          )}
          <button onClick={() => api('/api/logout', { method: 'POST', json: {} }).finally(() => window.dispatchEvent(new CustomEvent('dadm:logout')))}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-semibold text-ink-200 transition hover:bg-white/5 hover:text-white" title="Salir">
            <LogOut className="h-5 w-5" /><span className="hidden lg:inline">Salir</span>
          </button>
        </div>
      </aside>
      </div>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-5 lg:px-9 lg:py-8">
        <AnimatePresence mode="wait">
          <motion.div key={loc.pathname.split('/').slice(0, 3).join('/')} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}>
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}
