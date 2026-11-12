import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { CornerDownLeft, Search } from 'lucide-react'
import { useNavItems, type NavItem } from './navItems'

// Accent- and case-insensitive, so "cotizacion" finds «Cotizaciones».
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/**
 * The header's finder: jump to any section the user can open (Ctrl/⌘+K).
 * It replaces a "Buscar…" field that looked like search but had no handler.
 */
export default function QuickNav() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-9 w-64 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 pl-3 pr-2 text-sm text-gray-500 transition-colors hover:border-gray-300 hover:bg-white lg:flex"
      >
        <Search size={16} className="text-gray-400" aria-hidden />
        <span className="flex-1 text-left">Ir a…</span>
        <kbd className="rounded border border-gray-200 bg-white px-1.5 py-0.5 font-sans text-[11px] font-medium text-gray-500">
          {isMac ? '⌘' : 'Ctrl'} K
        </kbd>
      </button>
      {createPortal(
        <AnimatePresence>{open && <Finder onClose={() => setOpen(false)} />}</AnimatePresence>,
        document.body,
      )}
    </>
  )
}

function Finder({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const { main, portal } = useNavItems()
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

  const all = useMemo(() => [
    ...main.map(i => ({ ...i, group: '' })),
    ...portal.map(i => ({ ...i, group: 'Portal Escolar' })),
  ], [main, portal])

  const results = useMemo(() => {
    const q = fold(query.trim())
    if (!q) return all
    return all
      .map(item => {
        const label = fold(item.label)
        const words = fold(`${item.keywords ?? ''} ${item.group}`)
        const score = label.startsWith(q) ? 0 : label.includes(q) ? 1 : words.includes(q) ? 2 : -1
        return { item, score }
      })
      .filter(r => r.score >= 0)
      .sort((a, b) => a.score - b.score)
      .map(r => r.item)
  }, [all, query])

  useEffect(() => { setIndex(0) }, [query])
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${index}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [index])

  const go = (item?: NavItem) => {
    if (!item) return
    onClose()
    navigate(item.path)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex(i => Math.min(i + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[index]) }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-gray-900/30 px-4 pt-[12vh]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        role="dialog"
        aria-label="Ir a una sección"
        className="w-full max-w-lg overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl"
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -4, scale: 0.98 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex items-center gap-3 border-b border-gray-200 px-4">
          <Search size={18} className="text-gray-400" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="¿A dónde quieres ir? Caja, clientes, reportes…"
            className="h-12 flex-1 bg-transparent text-[15px] text-gray-900 placeholder:text-gray-500 focus:outline-none"
            role="combobox"
            aria-expanded="true"
            aria-controls="quicknav-list"
            aria-activedescendant={results[index] ? `quicknav-${index}` : undefined}
          />
          <kbd className="rounded border border-gray-200 px-1.5 py-0.5 font-sans text-[11px] text-gray-500">Esc</kbd>
        </div>
        {results.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-gray-500">No hay ninguna sección que coincida con «{query}».</p>
        ) : (
          <ul id="quicknav-list" ref={listRef} role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
            {results.map((item, i) => {
              const active = i === index
              return (
                <li
                  key={item.path}
                  id={`quicknav-${i}`}
                  data-i={i}
                  role="option"
                  aria-selected={active}
                  onMouseMove={() => setIndex(i)}
                  onClick={() => go(item)}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${active ? 'bg-primary-50 text-primary-800' : 'text-gray-700'}`}
                >
                  <item.icon size={18} className={active ? 'text-primary-600' : 'text-gray-400'} aria-hidden />
                  <span className="flex-1 font-medium">{item.label}</span>
                  {item.group && <span className="text-xs text-gray-500">{item.group}</span>}
                  {active && <CornerDownLeft size={14} className="text-primary-500" aria-hidden />}
                </li>
              )
            })}
          </ul>
        )}
      </motion.div>
    </motion.div>
  )
}
