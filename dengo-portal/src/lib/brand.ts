import type { PortalConfig } from '../types'

// The portal is deployed once per client, so its name, logo and colour come
// from PortalConfig (Configuración → Portal in DENGO), never from code.
// The last config seen is cached so Login/Layout can brand themselves before
// (or without) the network round-trip.

const CACHE_KEY = 'portal-config'
const DEFAULT_COLOR = '#f97316' // tailwind orange-500 — the shades in index.css

export const FALLBACK_NAME = 'Portal de Maestros'

export function getCachedConfig(): Partial<PortalConfig> | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function cacheConfig(cfg: Partial<PortalConfig>) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cfg)) } catch { /* ignore */ }
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1]!, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const mix = (c: [number, number, number], to: number, amount: number) =>
  c.map(v => Math.round(v + (to - v) * amount)).join(' ')

// Rewrites the --brand-* CSS variables tailwind's `brand` colour reads, so
// every bg-brand-500 / text-brand-600 / ... follows the client's colour.
export function applyBrandColor(hex?: string | null) {
  const root = document.documentElement
  const rgb = hex ? hexToRgb(hex) : null
  const shades = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900']
  if (!rgb || hex!.toLowerCase() === DEFAULT_COLOR) {
    shades.forEach(s => root.style.removeProperty(`--brand-${s}`))
    return
  }
  const lighten: Record<string, number> = { '50': 0.94, '100': 0.86, '200': 0.72, '300': 0.52, '400': 0.26 }
  const darken: Record<string, number> = { '600': 0.14, '700': 0.3, '800': 0.45, '900': 0.58 }
  for (const s of shades) {
    const value = s === '500' ? rgb.join(' ')
      : lighten[s] !== undefined ? mix(rgb, 255, lighten[s]!)
      : mix(rgb, 0, darken[s]!)
    root.style.setProperty(`--brand-${s}`, value)
  }
}
