// Brand colour for the POS (Configuración → Apariencia).
//
// Tailwind's `primary` reads --primary-* CSS variables (index.css holds the
// brand-blue defaults). Choosing another colour derives a full 50–950 scale
// from it and writes the variables on <html>; the default removes them again.
// The choice is kept on this device (localStorage), applied before first paint
// from main.tsx.

export const DEFAULT_PRIMARY = '#2563EB'
const STORAGE_KEY = 'dengo-primary-color'
const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] as const

// The chosen colour is the 600 (buttons, active states); lighter shades mix
// toward white, darker toward black.
const LIGHTEN: Record<string, number> = { '50': 0.94, '100': 0.87, '200': 0.74, '300': 0.56, '400': 0.34, '500': 0.15 }
const DARKEN: Record<string, number> = { '700': 0.18, '800': 0.34, '900': 0.48, '950': 0.64 }

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1]!, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const mix = (c: [number, number, number], to: number, amount: number) =>
  c.map(v => Math.round(v + (to - v) * amount)).join(' ')

export function applyPrimaryColor(hex?: string | null) {
  const root = document.documentElement
  const rgb = hex ? hexToRgb(hex) : null
  if (!rgb || hex!.toUpperCase() === DEFAULT_PRIMARY) {
    SHADES.forEach(s => root.style.removeProperty(`--primary-${s}`))
    return
  }
  for (const s of SHADES) {
    const value = s === '600' ? rgb.join(' ')
      : LIGHTEN[s] !== undefined ? mix(rgb, 255, LIGHTEN[s]!)
      : mix(rgb, 0, DARKEN[s]!)
    root.style.setProperty(`--primary-${s}`, value)
  }
}

export function getSavedPrimaryColor(): string {
  try { return localStorage.getItem(STORAGE_KEY) || DEFAULT_PRIMARY } catch { return DEFAULT_PRIMARY }
}

export function savePrimaryColor(hex: string) {
  try {
    if (hex.toUpperCase() === DEFAULT_PRIMARY) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, hex)
  } catch { /* storage blocked: the colour still applies for this session */ }
  applyPrimaryColor(hex)
}
