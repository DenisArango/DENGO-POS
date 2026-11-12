import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Palette, Sun, Moon, Monitor, Check, ShoppingCart } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import { DEFAULT_PRIMARY, applyPrimaryColor, getSavedPrimaryColor, savePrimaryColor } from '../../lib/theme'
import PageIcon from '../../components/common/PageIcon'

const themeOptions = [
  { id: 'light', name: 'Claro', icon: Sun, ready: true },
  { id: 'dark', name: 'Oscuro', icon: Moon, ready: false },
  { id: 'auto', name: 'Automático', icon: Monitor, ready: false },
]

// Each is the 600 of its scale (buttons, active states) and keeps white text
// at ≥4.5:1.
const primaryColors = [
  { name: 'Azul', value: DEFAULT_PRIMARY },
  { name: 'Índigo', value: '#4F46E5' },
  { name: 'Violeta', value: '#7C3AED' },
  { name: 'Esmeralda', value: '#059669' },
  { name: 'Naranja', value: '#EA580C' },
  { name: 'Rosa', value: '#DB2777' },
]

const same = (a: string, b: string) => a.toUpperCase() === b.toUpperCase()

export default function Appearance() {
  const navigate = useNavigate()
  const [saved, setSaved] = useState(getSavedPrimaryColor)
  const [primaryColor, setPrimaryColor] = useState(saved)
  const hasChanges = !same(primaryColor, saved)

  // The page previews the colour live; leaving without saving puts the saved
  // one back.
  const savedRef = useRef(saved)
  savedRef.current = saved
  useEffect(() => () => applyPrimaryColor(savedRef.current), [])

  const handleColorChange = (color: string) => {
    setPrimaryColor(color)
    applyPrimaryColor(color)
  }

  const handleSave = () => {
    savePrimaryColor(primaryColor)
    setSaved(primaryColor)
    toast.success('Color principal guardado en este dispositivo')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/settings')} aria-label="Volver a Configuración" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-3">
              <PageIcon icon={Palette} color="pink" />
              Apariencia
            </h1>
            <p className="text-gray-600 text-sm mt-1">Color principal y tema del sistema</p>
          </div>
        </div>
        <button onClick={handleSave} disabled={!hasChanges} className="btn-primary btn-md">
          Guardar Cambios
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card">
          <h2 className="text-base font-semibold text-gray-900">Color Principal</h2>
          <p className="mt-1 text-sm text-gray-600">Botones, enlaces y la opción activa del menú. Se ve al instante; guarda para conservarlo.</p>

          <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {primaryColors.map(color => {
              const selected = same(primaryColor, color.value)
              return (
                <button
                  key={color.value}
                  onClick={() => handleColorChange(color.value)}
                  aria-pressed={selected}
                  className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                    selected ? 'border-gray-900 ring-1 ring-gray-900' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: color.value }}>
                    {selected && <Check size={16} className="text-white" aria-hidden />}
                  </span>
                  <span className="text-sm font-medium text-gray-800">{color.name}</span>
                </button>
              )
            })}
          </div>
          <p className="mt-4 text-xs text-gray-500">Se guarda en este dispositivo. Cada computadora o tablet puede tener el suyo.</p>
        </motion.section>

        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="card">
          <h2 className="text-base font-semibold text-gray-900">Tema</h2>
          <p className="mt-1 text-sm text-gray-600">El modo oscuro está en preparación.</p>

          <div className="mt-5 grid grid-cols-3 gap-3">
            {themeOptions.map(option => (
              <button
                key={option.id}
                disabled={!option.ready}
                aria-pressed={option.id === 'light'}
                className={`flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors ${
                  option.id === 'light'
                    ? 'border-primary-600 bg-primary-50 ring-1 ring-primary-600'
                    : 'border-gray-200 cursor-not-allowed'
                }`}
              >
                <option.icon size={22} className={option.id === 'light' ? 'text-primary-600' : 'text-gray-400'} />
                <span className={`text-sm font-medium ${option.id === 'light' ? 'text-primary-800' : 'text-gray-500'}`}>{option.name}</span>
                {!option.ready && <span className="text-[11px] text-gray-500">Próximamente</span>}
              </button>
            ))}
          </div>
        </motion.section>
      </div>

      {/* Live preview built from the real components */}
      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card">
        <h2 className="text-base font-semibold text-gray-900">Vista Previa</h2>
        <div className="mt-4 grid gap-4 rounded-xl bg-gray-50 p-5 md:grid-cols-[14rem_1fr]">
          <nav className="space-y-0.5 rounded-xl border border-gray-200/80 bg-white p-2 shadow-sm" aria-hidden>
            <span className="flex h-9 items-center gap-3 rounded-lg bg-primary-50 px-3 text-sm font-medium text-primary-700">
              <ShoppingCart size={17} className="text-primary-600" /> Punto de Venta
            </span>
            <span className="flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium text-gray-600">
              <Palette size={17} className="text-gray-400" /> Apariencia
            </span>
          </nav>
          <div className="rounded-xl border border-gray-200/80 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-gray-600">Total</p>
                <p className="text-3xl font-bold tracking-tight text-primary-700">Q248.50</p>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn-outline btn-md">Cancelar</button>
                <button type="button" className="btn-primary btn-md">Cobrar Q248.50</button>
              </div>
            </div>
            <a className="mt-4 inline-block text-sm font-medium text-primary-600 hover:text-primary-700" href="#preview" onClick={e => e.preventDefault()}>
              Ver detalle de la venta
            </a>
          </div>
        </div>
      </motion.section>
    </div>
  )
}
