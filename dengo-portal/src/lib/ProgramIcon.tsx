import { Backpack, BookOpen, Package, PencilLine, Utensils, type LucideIcon } from 'lucide-react'

// Drawn icons for each program, in place of the emoji that rendered
// differently on every phone and computer. Each program also has its own
// colour so a teacher recognises it at a glance in lists and cards.
const ICONS: Record<string, LucideIcon> = {
  FOOD_PACKAGE: Utensils,
  SCHOOL_SUPPLIES: PencilLine,
  TEACHING_KIT: Backpack,
  GRATUITY: BookOpen,
}

// Full class strings so Tailwind keeps them.
const COLORS: Record<string, { text: string; tile: string; bar: string }> = {
  FOOD_PACKAGE: { text: 'text-amber-600', tile: 'from-amber-100 to-orange-50 text-amber-600 ring-amber-200/70', bar: 'from-amber-400 to-orange-400' },
  SCHOOL_SUPPLIES: { text: 'text-sky-600', tile: 'from-sky-100 to-cyan-50 text-sky-600 ring-sky-200/70', bar: 'from-sky-400 to-cyan-400' },
  TEACHING_KIT: { text: 'text-violet-600', tile: 'from-violet-100 to-fuchsia-50 text-violet-600 ring-violet-200/70', bar: 'from-violet-400 to-fuchsia-400' },
  GRATUITY: { text: 'text-emerald-600', tile: 'from-emerald-100 to-teal-50 text-emerald-600 ring-emerald-200/70', bar: 'from-emerald-400 to-teal-400' },
}
const FALLBACK = { text: 'text-brand-600', tile: 'from-brand-100 to-brand-50 text-brand-600 ring-brand-200/70', bar: 'from-brand-400 to-brand-500' }

export const programColor = (type: string) => COLORS[type] ?? FALLBACK

/** Program icon in the program's colour. */
export default function ProgramIcon({ type, size = 16, className = '' }: { type: string; size?: number; className?: string }) {
  const Icon = ICONS[type] ?? Package
  return <Icon size={size} strokeWidth={1.9} aria-hidden className={`shrink-0 ${programColor(type).text} ${className}`} />
}

/** The icon on a soft coloured tile; wiggles when its card (a `group`) is hovered. */
export function ProgramTile({ type, size = 20, className = '' }: { type: string; size?: number; className?: string }) {
  const Icon = ICONS[type] ?? Package
  return (
    <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ring-1 ring-inset transition-transform duration-300 motion-safe:group-hover:scale-110 motion-safe:group-hover:-rotate-6 ${programColor(type).tile} ${className}`}>
      <Icon size={size} strokeWidth={1.9} aria-hidden className="motion-safe:group-hover:animate-wiggle" />
    </span>
  )
}
