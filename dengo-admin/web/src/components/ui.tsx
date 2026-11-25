import { useEffect, useRef, useState, type ReactNode, type ComponentType } from 'react'
import { motion, useInView, animate, useReducedMotion } from 'motion/react'
import { Check, Copy, Loader2 } from 'lucide-react'
import type { ClientStatus } from '../lib/api'

const spring = { type: 'spring', stiffness: 380, damping: 30 } as const

/** A bento tile: white body, layered shadow, lifts under the pointer. */
export function Tile({ children, className = '', ink = false, hover = true, delay = 0, as = 'div', onClick }: {
  children: ReactNode; className?: string; ink?: boolean; hover?: boolean; delay?: number; as?: 'div' | 'section' | 'button'; onClick?: () => void
}) {
  const reduce = useReducedMotion()
  const M = as === 'button' ? motion.button : as === 'section' ? motion.section : motion.div
  return (
    <M
      onClick={onClick}
      initial={reduce ? false : { opacity: 0, y: 14, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...spring, delay }}
      whileHover={hover && !reduce ? { y: -3, boxShadow: ink ? undefined : '0 1px 0 0 rgba(255,255,255,.9) inset, 0 2px 4px rgba(17,48,63,.07), 0 12px 24px -8px rgba(17,48,63,.18), 0 30px 60px -24px rgba(17,48,63,.28)' } : undefined}
      className={`${ink ? 'tile-ink' : 'tile'} ${as === 'button' ? 'w-full min-w-0 text-left' : ''} ${className}`}
    >
      {children}
    </M>
  )
}

const TONES = {
  ink: 'from-ink-500 to-ink-800 shadow-ink-900/30',
  coral: 'from-coral-400 to-coral-700 shadow-coral-700/30',
  emerald: 'from-emerald-400 to-emerald-700 shadow-emerald-800/30',
  amber: 'from-amber-300 to-amber-600 shadow-amber-700/30',
  teal: 'from-teal-400 to-teal-700 shadow-teal-800/30',
  sky: 'from-sky-400 to-sky-700 shadow-sky-800/30',
  rose: 'from-rose-400 to-rose-700 shadow-rose-800/30',
  slate: 'from-slate-400 to-slate-600 shadow-slate-700/30',
} as const
export type Tone = keyof typeof TONES

/** Coloured icon tile with a little volume (top highlight + drop). */
export function IconBadge({ icon: Icon, tone = 'ink', size = 'md' }: { icon: ComponentType<{ className?: string }>; tone?: Tone; size?: 'sm' | 'md' | 'lg' }) {
  const s = size === 'sm' ? 'h-8 w-8 rounded-[10px]' : size === 'lg' ? 'h-12 w-12 rounded-2xl' : 'h-10 w-10 rounded-xl'
  const i = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-6 w-6' : 'h-5 w-5'
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center bg-gradient-to-br text-white shadow-md ${TONES[tone]} ${s}`}>
      <span className="pointer-events-none absolute inset-x-1 top-0.5 h-1/2 rounded-[inherit] bg-gradient-to-b from-white/35 to-transparent" />
      <Icon className={`relative ${i}`} />
    </span>
  )
}

export const STATUS: Record<ClientStatus, { label: string; dot: string; pill: string }> = {
  online: { label: 'En línea', dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  down: { label: 'Sin respuesta', dot: 'bg-rose-500', pill: 'bg-rose-50 text-rose-700 ring-rose-600/20' },
  suspended: { label: 'Suspendido', dot: 'bg-amber-500', pill: 'bg-amber-50 text-amber-800 ring-amber-600/25' },
  stopped: { label: 'Detenido', dot: 'bg-slate-400', pill: 'bg-slate-100 text-slate-700 ring-slate-500/20' },
  archived: { label: 'Archivado', dot: 'bg-slate-400', pill: 'bg-slate-100 text-slate-600 ring-slate-500/20' },
}

export function StatusPill({ status }: { status: ClientStatus }) {
  const s = STATUS[status]
  const live = status === 'online' || status === 'down'
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 ${s.pill}`}>
      <span className="relative flex h-2 w-2">
        {live && <span className={`absolute inline-flex h-full w-full rounded-full ${s.dot} animate-ping2`} />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${s.dot}`} />
      </span>
      {s.label}
    </span>
  )
}

/** Number that counts up when it scrolls into view. */
export function CountUp({ value, format = (n: number) => String(Math.round(n)), className = '' }: { value: number; format?: (n: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const reduce = useReducedMotion()
  const [shown, setShown] = useState(reduce ? value : 0)
  const last = useRef(0)
  useEffect(() => {
    if (!inView) return
    if (reduce) { setShown(value); return }
    const c = animate(last.current, value, { duration: 0.9, ease: [0.16, 1, 0.3, 1], onUpdate: setShown })
    last.current = value
    return () => c.stop()
  }, [value, inView, reduce])
  return <span ref={ref} className={`tabular ${className}`}>{format(shown)}</span>
}

/** Accessible switch with a springy knob. */
export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 disabled:opacity-50 ${checked ? 'bg-emerald-500 shadow-[inset_0_1px_2px_rgba(0,0,0,.15)]' : 'bg-ink-200 shadow-well'}`}
    >
      <motion.span layout transition={spring} className={`h-6 w-6 rounded-full bg-white shadow-[0_2px_5px_rgba(17,48,63,.3)] ${checked ? 'ml-auto' : ''}`} />
    </button>
  )
}

/** 14-day sales as bars that grow in, today highlighted. */
export function Bars({ data, height = 56, tone = 'ink' }: { data: { day: string; total: number; count: number }[]; height?: number; tone?: 'ink' | 'light' }) {
  const max = Math.max(...data.map(d => d.total), 1)
  const reduce = useReducedMotion()
  const empty = data.every(d => !d.total)
  return (
    <div className="relative flex items-end gap-[3px]" style={{ height }} role="img" aria-label={`Ventas de los últimos ${data.length} días`}>
      {data.map((d, i) => {
        const h = d.total ? Math.max(6, (d.total / max) * 100) : 3
        const today = i === data.length - 1
        const color = tone === 'light'
          ? (today ? 'bg-coral-300' : 'bg-white/35')
          : (today ? 'bg-gradient-to-t from-coral-600 to-coral-400' : d.total ? 'bg-gradient-to-t from-ink-600 to-ink-400' : 'bg-ink-100')
        return (
          <motion.span
            key={d.day} title={`${d.day}: Q${d.total.toFixed(2)} · ${d.count} ventas`}
            initial={reduce ? false : { height: '3%' }} animate={{ height: `${h}%` }}
            transition={{ type: 'spring', stiffness: 220, damping: 22, delay: 0.15 + i * 0.025 }}
            className={`flex-1 rounded-[4px] ${color}`}
          />
        )
      })}
      {empty && <span className={`absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[11px] font-semibold ${tone === 'light' ? 'text-white/70' : 'text-ink-500'}`}>Sin ventas en {data.length} días</span>}
    </div>
  )
}

/** Horizontal meter; tone shifts to amber/rose as it fills. */
export function Meter({ value, max, className = '' }: { value: number; max: number | null; className?: string }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0
  const tone = !max ? 'from-ink-400 to-ink-600' : pct > 90 ? 'from-rose-400 to-rose-600' : pct > 70 ? 'from-amber-300 to-amber-500' : 'from-emerald-400 to-emerald-600'
  return (
    <div className={`h-2.5 overflow-hidden rounded-full bg-ink-100 shadow-well ${className}`}>
      <motion.div initial={{ width: 0 }} animate={{ width: max ? `${pct}%` : '100%' }} transition={{ type: 'spring', stiffness: 120, damping: 20, delay: 0.2 }}
        className={`h-full rounded-full bg-gradient-to-r ${tone} ${!max ? 'opacity-30' : ''}`} />
    </div>
  )
}

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} />
}

export function CopyButton({ text, label = 'Copiar' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button type="button" onClick={() => { void navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1400) }}
      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-semibold text-ink-600 transition hover:bg-ink-50" aria-label={label}>
      {done ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      {done ? 'Copiado' : label}
    </button>
  )
}

/** Two-step button for actions that need a second thought (no modal). */
export function ConfirmButton({ children, confirm, onConfirm, className = 'btn-soft', busy }: { children: ReactNode; confirm: string; onConfirm: () => void; className?: string; busy?: boolean }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t) }, [armed])
  return (
    <button type="button" disabled={busy} className={armed ? 'btn-danger' : className} onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}>
      {busy ? <Spinner /> : null}
      {armed ? confirm : children}
    </button>
  )
}

export function Field({ label, hint, error, children, className = '' }: { label: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-[13px] font-semibold text-ink-800">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-[12px] font-medium text-rose-600">{error}</span>
        : hint ? <span className="mt-1 block text-[12px] text-ink-500">{hint}</span> : null}
    </label>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`rounded-xl bg-[linear-gradient(90deg,#e3ecf2_25%,#f2f6f9_50%,#e3ecf2_75%)] bg-[length:200%_100%] animate-shimmer ${className}`} />
}
