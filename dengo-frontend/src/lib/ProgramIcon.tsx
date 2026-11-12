import { Backpack, BookOpen, Package, PencilLine, Utensils, type LucideIcon } from 'lucide-react'

// Same icons and colours the teacher portal uses for each program, so the
// admin and the teacher recognise a program the same way.
const ICONS: Record<string, LucideIcon> = {
  FOOD_PACKAGE: Utensils,
  SCHOOL_SUPPLIES: PencilLine,
  TEACHING_KIT: Backpack,
  GRATUITY: BookOpen,
}

// Full class strings so Tailwind keeps them.
const TILES: Record<string, string> = {
  FOOD_PACKAGE: 'from-amber-100 to-orange-50 text-amber-600 ring-amber-200/70',
  SCHOOL_SUPPLIES: 'from-sky-100 to-cyan-50 text-sky-600 ring-sky-200/70',
  TEACHING_KIT: 'from-violet-100 to-fuchsia-50 text-violet-600 ring-violet-200/70',
  GRATUITY: 'from-emerald-100 to-teal-50 text-emerald-600 ring-emerald-200/70',
}
const FALLBACK = 'from-gray-100 to-gray-50 text-gray-600 ring-gray-200/70'

export function ProgramGlyph({ type, size = 16, className = '' }: { type: string; size?: number; className?: string }) {
  const Icon = ICONS[type] ?? Package
  return <Icon size={size} strokeWidth={1.9} aria-hidden className={`shrink-0 ${className}`} />
}

/** The program icon on a soft coloured tile; wiggles when its card (a `group`) is hovered. */
export function ProgramTile({ type, size = 22, className = '' }: { type: string; size?: number; className?: string }) {
  return (
    <span className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ring-1 ring-inset transition-transform duration-300 motion-safe:group-hover:scale-110 motion-safe:group-hover:-rotate-6 ${TILES[type] ?? FALLBACK} ${className}`}>
      <ProgramGlyph type={type} size={size} className="motion-safe:group-hover:animate-wiggle" />
    </span>
  )
}
