import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'

export type SortDir = 'asc' | 'desc'
export interface SortState<K extends string = string> { key: K; dir: SortDir }

// Clicking a column sorts by it; clicking the same column again flips the
// direction. Numeric columns usually want "biggest first" on the first click,
// so the caller passes firstDir='desc' for those.
export function nextSort<K extends string>(current: SortState<K> | null, key: K, firstDir: SortDir = 'asc'): SortState<K> {
  if (current?.key === key) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
  return { key, dir: firstDir }
}

export function SortableTh<K extends string>({
  label, sortKey, sort, onSort, align = 'left', firstDir = 'asc', className = '', title,
}: {
  label: string
  sortKey: K
  sort: SortState<K> | null
  onSort: (next: SortState<K>) => void
  align?: 'left' | 'center' | 'right'
  firstDir?: SortDir
  className?: string
  title?: string
}) {
  const active = sort?.key === sortKey
  const Icon = !active ? ArrowUpDown : sort!.dir === 'asc' ? ArrowUp : ArrowDown
  const justify = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'
  const textAlign = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  return (
    <th className={`py-3 px-4 font-medium text-gray-700 ${textAlign} ${className}`} aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => onSort(nextSort(sort, sortKey, firstDir))}
        title={title ?? `Ordenar por ${label.toLowerCase()}`}
        className={`inline-flex items-center gap-1 ${justify} w-full hover:text-primary-600 transition-colors ${active ? 'text-primary-700' : ''}`}
      >
        {label}
        <Icon size={13} className={active ? 'opacity-100' : 'opacity-40'} />
      </button>
    </th>
  )
}

// Client-side sort for report tables that already hold every row in memory.
export function sortRows<T>(rows: T[], sort: SortState | null, getValue: (row: T, key: string) => unknown): T[] {
  if (!sort) return rows
  const factor = sort.dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const va = getValue(a, sort.key)
    const vb = getValue(b, sort.key)
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * factor
    return String(va).localeCompare(String(vb), 'es', { numeric: true, sensitivity: 'base' }) * factor
  })
}
