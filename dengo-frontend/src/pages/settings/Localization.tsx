import { useState } from 'react'
import { motion } from 'framer-motion'
import { Globe, DollarSign, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'

const languages = [
  { code: 'es', name: 'Español', nativeName: 'Español' },
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'pt', name: 'Português', nativeName: 'Português' }
]

const currencies = [
  { code: 'GTQ', symbol: 'Q', name: 'Quetzal Guatemalteco' },
  { code: 'USD', symbol: '$', name: 'Dólar Estadounidense' },
  { code: 'MXN', symbol: '$', name: 'Peso Mexicano' },
  { code: 'EUR', symbol: '€', name: 'Euro' }
]

const timezones = [
  { value: 'America/Guatemala', label: 'Guatemala (GMT-6)' },
  { value: 'America/Mexico_City', label: 'Ciudad de México (GMT-6)' },
  { value: 'America/New_York', label: 'Nueva York (GMT-5)' },
  { value: 'America/Los_Angeles', label: 'Los Ángeles (GMT-8)' }
]

const dateFormats = [
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (20/01/2024)' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (01/20/2024)' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (2024-01-20)' }
]

export default function Localization() {
  const navigate = useNavigate()
  const [language, setLanguage] = useState('es')
  const [currency, setCurrency] = useState('GTQ')
  const [timezone, setTimezone] = useState('America/Guatemala')
  const [dateFormat, setDateFormat] = useState('DD/MM/YYYY')
  const [hasChanges, setHasChanges] = useState(false)

  const handleSave = () => {
    toast.success('Configuración regional guardada exitosamente')
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
            <Globe size={28} />
            Localización
          </h1>
          <p className="text-gray-600 text-sm mt-1">Idioma, zona horaria y formato de moneda</p>
        </div>
        <button onClick={handleSave} disabled={!hasChanges} className={`btn-primary btn-md ${!hasChanges ? 'opacity-50 cursor-not-allowed' : ''}`}>
          Guardar Cambios
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Globe size={20} />
            Idioma
          </h2>

          <div className="space-y-3">
            {languages.map((lang) => (
              <label
                key={lang.code}
                className={`flex items-center p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  language === lang.code
                    ? 'border-primary-600 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="language"
                  value={lang.code}
                  checked={language === lang.code}
                  onChange={(e) => { setLanguage(e.target.value); setHasChanges(true); }}
                  className="mr-3"
                />
                <div>
                  <p className="font-medium text-gray-800">{lang.name}</p>
                  <p className="text-sm text-gray-500">{lang.nativeName}</p>
                </div>
              </label>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <DollarSign size={20} />
            Moneda
          </h2>

          <div className="space-y-3">
            {currencies.map((curr) => (
              <label
                key={curr.code}
                className={`flex items-center p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  currency === curr.code
                    ? 'border-primary-600 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="currency"
                  value={curr.code}
                  checked={currency === curr.code}
                  onChange={(e) => { setCurrency(e.target.value); setHasChanges(true); }}
                  className="mr-3"
                />
                <div>
                  <p className="font-medium text-gray-800">{curr.name}</p>
                  <p className="text-sm text-gray-500">{curr.code} ({curr.symbol})</p>
                </div>
              </label>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Clock size={20} />
            Zona Horaria
          </h2>

          <select
            value={timezone}
            onChange={(e) => { setTimezone(e.target.value); setHasChanges(true); }}
            className="input w-full"
          >
            {timezones.map((tz) => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Formato de Fecha</h2>

          <select
            value={dateFormat}
            onChange={(e) => { setDateFormat(e.target.value); setHasChanges(true); }}
            className="input w-full"
          >
            {dateFormats.map((format) => (
              <option key={format.value} value={format.value}>{format.label}</option>
            ))}
          </select>
        </motion.div>
      </div>
    </div>
  )
}
