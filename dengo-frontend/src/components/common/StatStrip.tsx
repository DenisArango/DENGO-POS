import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export type StatTone = 'neutral' | 'good' | 'bad' | 'warn' | 'info'
export type StatColor = 'blue' | 'emerald' | 'violet' | 'amber' | 'sky' | 'pink' | 'indigo' | 'orange' | 'teal' | 'rose' | 'cyan' | 'lime' | 'yellow' | 'slate'

export interface Stat {
  label: string
  value: ReactNode
  icon?: LucideIcon
  /** Colour of the icon tile; defaults to a rotating palette. */
  color?: StatColor
  /** Small line under the number (trend, state, unit…). */
  hint?: ReactNode
  hintTone?: StatTone
  /** Colours the number itself — for values that are a warning in themselves. */
  valueTone?: StatTone
  onClick?: () => void
  /** Tooltip for a clickable stat (what clicking does). */
  title?: string
  /** A clickable stat that is currently applied as a filter. */
  active?: boolean
}

// Full class strings so Tailwind keeps them.
export const STAT_TILE: Record<StatColor, string> = {
  blue: 'from-blue-100 to-blue-50 text-blue-600 ring-blue-200/60',
  emerald: 'from-emerald-100 to-emerald-50 text-emerald-600 ring-emerald-200/60',
  violet: 'from-violet-100 to-violet-50 text-violet-600 ring-violet-200/60',
  amber: 'from-amber-100 to-amber-50 text-amber-600 ring-amber-200/60',
  sky: 'from-sky-100 to-sky-50 text-sky-600 ring-sky-200/60',
  pink: 'from-pink-100 to-pink-50 text-pink-600 ring-pink-200/60',
  indigo: 'from-indigo-100 to-indigo-50 text-indigo-600 ring-indigo-200/60',
  orange: 'from-orange-100 to-orange-50 text-orange-600 ring-orange-200/60',
  teal: 'from-teal-100 to-teal-50 text-teal-600 ring-teal-200/60',
  rose: 'from-rose-100 to-rose-50 text-rose-600 ring-rose-200/60',
  cyan: 'from-cyan-100 to-cyan-50 text-cyan-600 ring-cyan-200/60',
  lime: 'from-lime-100 to-lime-50 text-lime-700 ring-lime-200/60',
  yellow: 'from-yellow-100 to-amber-50 text-yellow-600 ring-yellow-200/60',
  slate: 'from-slate-100 to-slate-50 text-slate-600 ring-slate-200/60',
}

// Thin accent line along the top edge, shown on hover.
const BAR: Record<StatColor, string> = {
  blue: 'from-blue-500 to-sky-400',
  emerald: 'from-emerald-500 to-teal-400',
  violet: 'from-violet-500 to-fuchsia-400',
  amber: 'from-amber-500 to-orange-400',
  sky: 'from-sky-500 to-cyan-400',
  pink: 'from-pink-500 to-rose-400',
  indigo: 'from-indigo-500 to-violet-400',
  orange: 'from-orange-500 to-amber-400',
  teal: 'from-teal-500 to-emerald-400',
  rose: 'from-rose-500 to-pink-400',
  cyan: 'from-cyan-500 to-sky-400',
  lime: 'from-lime-500 to-emerald-400',
  yellow: 'from-yellow-400 to-amber-400',
  slate: 'from-slate-500 to-slate-400',
}

const ROTATION: StatColor[] = ['blue', 'emerald', 'violet', 'amber', 'sky', 'pink']

const HINT: Record<StatTone, string> = {
  neutral: 'text-gray-500',
  good: 'text-emerald-600',
  bad: 'text-rose-600',
  warn: 'text-amber-600',
  info: 'text-primary-600',
}

const VALUE: Record<StatTone, string> = {
  neutral: 'text-gray-900',
  good: 'text-emerald-600',
  bad: 'text-rose-600',
  warn: 'text-amber-600',
  info: 'text-primary-600',
}

const COLS: Record<number, string> = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4',
  5: 'grid-cols-2 md:grid-cols-3 xl:grid-cols-5',
  6: 'grid-cols-2 md:grid-cols-3 xl:grid-cols-6',
}

/**
 * A row of key figures as cards, each with its own coloured icon. On hover the
 * card lifts a little, a colour line appears on top and the icon wiggles.
 */
export default function StatStrip({ stats, className = '', cols }: { stats: Stat[]; className?: string; /** Overrides the default grid columns. */ cols?: string }) {
  // Five or more cards share a row on wide screens: a smaller number keeps amounts like Q19,369.28 whole.
  const dense = !cols && stats.length >= 5
  return (
    <div className={`grid gap-4 ${cols ?? COLS[stats.length] ?? COLS[4]} ${className}`}>
      {stats.map(({ label, value, icon: Icon, color, hint, hintTone = 'neutral', valueTone = 'neutral', onClick, title, active }, i) => {
        const c: StatColor = color
          ?? (valueTone === 'warn' ? 'amber' : valueTone === 'bad' ? 'rose' : ROTATION[i % ROTATION.length]!)
        const body = (
          <>
            <span
              aria-hidden
              className={`pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${BAR[c]} transition-opacity duration-200 ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
            />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium leading-tight text-gray-600">{label}</p>
                <p className={`mt-1.5 whitespace-nowrap font-bold tracking-tight ${dense ? 'text-xl' : 'text-2xl'} ${VALUE[valueTone]}`}>{value}</p>
                {hint && <div className={`mt-1 flex items-center gap-1 text-xs font-medium ${HINT[hintTone]}`}>{hint}</div>}
              </div>
              {Icon && (
                <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ring-1 ring-inset transition-transform duration-300 motion-safe:group-hover:scale-110 ${STAT_TILE[c]}`}>
                  <Icon size={21} className="motion-safe:group-hover:animate-wiggle" aria-hidden />
                </div>
              )}
            </div>
          </>
        )
        const card = 'group relative overflow-hidden rounded-xl border bg-white p-5 shadow-sm transition-[transform,box-shadow,border-color] duration-200 motion-safe:hover:-translate-y-0.5 hover:shadow-md'
        return onClick ? (
          <button
            key={label}
            type="button"
            onClick={onClick}
            title={title}
            aria-pressed={active}
            className={`${card} text-left ${active ? 'border-primary-300 ring-1 ring-primary-300' : 'border-gray-200/80'}`}
          >
            {body}
          </button>
        ) : (
          <div key={label} className={`${card} border-gray-200/80`}>{body}</div>
        )
      })}
    </div>
  )
}
