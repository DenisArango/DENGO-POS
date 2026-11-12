import type { LucideIcon } from 'lucide-react'
import { STAT_TILE, type StatColor } from './StatStrip'

/**
 * Section icon next to a page title, on a tile in the section's colour (the same
 * colour it has in the Settings index / quick links). Springs when the title is hovered.
 */
export default function PageIcon({ icon: Icon, color }: { icon: LucideIcon; color: StatColor }) {
  return (
    <span className={`stat-tile inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ring-1 ring-inset ${STAT_TILE[color]}`}>
      <Icon size={21} aria-hidden />
    </span>
  )
}
