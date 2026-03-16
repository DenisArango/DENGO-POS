import { useState } from 'react'
import { motion } from 'framer-motion'
import { Palette, Sun, Moon, Monitor } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'

const themeOptions = [
  { id: 'light', name: 'Claro', icon: Sun },
  { id: 'dark', name: 'Oscuro', icon: Moon },
  { id: 'auto', name: 'Automático', icon: Monitor }
]

const primaryColors = [
  { name: 'Azul', value: '#2563eb' },
  { name: 'Verde', value: '#10b981' },
  { name: 'Púrpura', value: '#8b5cf6' },
  { name: 'Rojo', value: '#ef4444' },
  { name: 'Naranja', value: '#f97316' },
  { name: 'Rosa', value: '#ec4899' }
]

export default function Appearance() {
  const navigate = useNavigate()
  const [theme, setTheme] = useState('light')
  const [primaryColor, setPrimaryColor] = useState('#2563eb')
  const [hasChanges, setHasChanges] = useState(false)

  const handleThemeChange = (newTheme: string) => {
    setTheme(newTheme)
    setHasChanges(true)
  }

  const handleColorChange = (color: string) => {
    setPrimaryColor(color)
    setHasChanges(true)
  }

  const handleSave = () => {
    toast.success('Configuración de apariencia guardada')
    setHasChanges(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <button onClick={() => navigate('/settings')} className="text-sm text-gray-600 hover:text-gray-800 mb-2">
            ← Volver a Configuración
          </button>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Palette size={28} />
            Apariencia
          </h1>
          <p className="text-gray-600 text-sm mt-1">Personalizar colores, temas y preferencias visuales</p>
        </div>
        <button onClick={handleSave} disabled={!hasChanges} className={`btn-primary btn-md ${!hasChanges ? 'opacity-50 cursor-not-allowed' : ''}`}>
          Guardar Cambios
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Tema</h2>

          <div className="grid grid-cols-3 gap-3">
            {themeOptions.map((option) => (
              <button
                key={option.id}
                onClick={() => handleThemeChange(option.id)}
                className={`p-4 border-2 rounded-lg transition-all flex flex-col items-center gap-2 ${
                  theme === option.id
                    ? 'border-primary-600 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <option.icon size={24} className={theme === option.id ? 'text-primary-600' : 'text-gray-600'} />
                <span className={`text-sm font-medium ${theme === option.id ? 'text-primary-600' : 'text-gray-700'}`}>
                  {option.name}
                </span>
              </button>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Color Principal</h2>

          <div className="grid grid-cols-3 gap-3">
            {primaryColors.map((color) => (
              <button
                key={color.value}
                onClick={() => handleColorChange(color.value)}
                className={`p-4 border-2 rounded-lg transition-all flex flex-col items-center gap-2 ${
                  primaryColor === color.value
                    ? 'border-gray-800 ring-2 ring-gray-300'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div
                  className="w-12 h-12 rounded-full"
                  style={{ backgroundColor: color.value }}
                />
                <span className="text-sm font-medium text-gray-700">{color.name}</span>
              </button>
            ))}
          </div>
        </motion.div>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Vista Previa</h2>

        <div className="border rounded-lg p-6 bg-gray-50">
          <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-800">Ejemplo de Tarjeta</h3>
              <button
                className="px-4 py-2 rounded-lg text-white font-medium transition-colors"
                style={{ backgroundColor: primaryColor }}
              >
                Botón Primario
              </button>
            </div>
            <p className="text-gray-600 text-sm">
              Esta es una vista previa de cómo se verán los elementos con la configuración seleccionada.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
