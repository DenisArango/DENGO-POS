import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Lock, Key, Shield, AlertTriangle, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'

export default function Security() {
  const navigate = useNavigate()
  const [require2FA, setRequire2FA] = useState(false)
  const [minPasswordLength, setMinPasswordLength] = useState(8)
  const [requireUppercase, setRequireUppercase] = useState(true)
  const [requireNumbers, setRequireNumbers] = useState(true)
  const [requireSpecialChars, setRequireSpecialChars] = useState(true)
  const [sessionTimeout, setSessionTimeout] = useState(30)
  const [hasChanges, setHasChanges] = useState(false)

  const handleSave = () => {
    toast.success('Configuración de seguridad guardada exitosamente')
    setHasChanges(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/settings')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <Lock size={28} />
              Seguridad
            </h1>
            <p className="text-gray-600 text-sm mt-1">Políticas de contraseña y configuración de seguridad</p>
          </div>
        </div>
        <button onClick={handleSave} disabled={!hasChanges} className={`btn-primary btn-md ${!hasChanges ? 'opacity-50 cursor-not-allowed' : ''}`}>
          Guardar Cambios
        </button>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Key size={20} />
          Políticas de Contraseña
        </h2>

        <div className="space-y-4">
          <div>
            <label className="label">Longitud Mínima</label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="6"
                max="20"
                value={minPasswordLength}
                onChange={(e) => { setMinPasswordLength(parseInt(e.target.value)); setHasChanges(true); }}
                className="flex-1"
              />
              <span className="font-medium text-gray-800 w-12">{minPasswordLength}</span>
            </div>
          </div>

          <div className="space-y-3">
            <label className="flex items-center justify-between p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
              <div className="flex items-center gap-3">
                <CheckCircle className={requireUppercase ? 'text-primary-600' : 'text-gray-400'} size={20} />
                <div>
                  <p className="font-medium text-gray-800">Requerir Mayúsculas</p>
                  <p className="text-sm text-gray-500">Al menos una letra mayúscula</p>
                </div>
              </div>
              <button
                onClick={() => { setRequireUppercase(!requireUppercase); setHasChanges(true); }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  requireUppercase ? 'bg-primary-600' : 'bg-gray-300'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  requireUppercase ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </label>

            <label className="flex items-center justify-between p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
              <div className="flex items-center gap-3">
                <CheckCircle className={requireNumbers ? 'text-primary-600' : 'text-gray-400'} size={20} />
                <div>
                  <p className="font-medium text-gray-800">Requerir Números</p>
                  <p className="text-sm text-gray-500">Al menos un número</p>
                </div>
              </div>
              <button
                onClick={() => { setRequireNumbers(!requireNumbers); setHasChanges(true); }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  requireNumbers ? 'bg-primary-600' : 'bg-gray-300'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  requireNumbers ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </label>

            <label className="flex items-center justify-between p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
              <div className="flex items-center gap-3">
                <CheckCircle className={requireSpecialChars ? 'text-primary-600' : 'text-gray-400'} size={20} />
                <div>
                  <p className="font-medium text-gray-800">Requerir Caracteres Especiales</p>
                  <p className="text-sm text-gray-500">Al menos un símbolo (@, #, $, etc.)</p>
                </div>
              </div>
              <button
                onClick={() => { setRequireSpecialChars(!requireSpecialChars); setHasChanges(true); }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  requireSpecialChars ? 'bg-primary-600' : 'bg-gray-300'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  requireSpecialChars ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </label>
          </div>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Shield size={20} />
          Autenticación de Dos Factores
        </h2>

        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div>
            <p className="font-medium text-gray-800">Requerir 2FA para todos los usuarios</p>
            <p className="text-sm text-gray-500 mt-1">
              Agregar una capa adicional de seguridad al inicio de sesión
            </p>
          </div>
          <button
            onClick={() => { setRequire2FA(!require2FA); setHasChanges(true); }}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              require2FA ? 'bg-primary-600' : 'bg-gray-300'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              require2FA ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Sesiones</h2>

        <div>
          <label className="label">Tiempo de expiración de sesión (minutos)</label>
          <select
            value={sessionTimeout}
            onChange={(e) => { setSessionTimeout(parseInt(e.target.value)); setHasChanges(true); }}
            className="input w-full"
          >
            <option value={15}>15 minutos</option>
            <option value={30}>30 minutos</option>
            <option value={60}>1 hora</option>
            <option value={120}>2 horas</option>
            <option value={480}>8 horas</option>
          </select>
        </div>
      </motion.div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="text-yellow-600 flex-shrink-0 mt-0.5" size={20} />
          <div>
            <h3 className="font-medium text-yellow-900 mb-1">Importante</h3>
            <p className="text-sm text-yellow-800">
              Los cambios en las políticas de seguridad afectarán a todos los usuarios del sistema.
              Los usuarios existentes deberán actualizar sus contraseñas si no cumplen con los nuevos requisitos.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
