import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, CreditCard, DollarSign, Building2, ArrowLeftRight, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'

interface PaymentMethodSetting {
  method: string
  enabled: boolean
  commission: number
}

const METHOD_INFO: Record<string, { name: string; icon: LucideIcon; description: string }> = {
  CASH: { name: 'Efectivo', icon: DollarSign, description: 'Pago en efectivo. Sin comisiones.' },
  CARD: { name: 'Tarjeta de Crédito/Débito', icon: CreditCard, description: 'Aceptar pagos con tarjeta. Comisión aplicable según tu terminal.' },
  TRANSFER: { name: 'Transferencia Bancaria', icon: Building2, description: 'Transferencia directa a cuenta bancaria.' },
  MIXED: { name: 'Mixto (efectivo + transferencia)', icon: ArrowLeftRight, description: 'Divide una venta entre efectivo y transferencia. Pausado por defecto — actívalo aquí si tu negocio lo necesita.' },
}

const METHOD_ORDER = ['CASH', 'CARD', 'TRANSFER', 'MIXED']

export default function PaymentMethods() {
  const navigate = useNavigate()
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodSetting[]>([])
  const [hasChanges, setHasChanges] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get<PaymentMethodSetting[]>('/api/settings/payment-methods')
      .then(data => setPaymentMethods([...data].sort((a, b) => METHOD_ORDER.indexOf(a.method) - METHOD_ORDER.indexOf(b.method))))
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [])

  const toggleMethod = (method: string) => {
    setPaymentMethods(methods =>
      methods.map(m => m.method === method ? { ...m, enabled: !m.enabled } : m)
    )
    setHasChanges(true)
  }

  const updateCommission = (method: string, commission: number) => {
    setPaymentMethods(methods =>
      methods.map(m => m.method === method ? { ...m, commission } : m)
    )
    setHasChanges(true)
  }

  const handleSave = () => {
    setSaving(true)
    api.put('/api/settings/payment-methods', paymentMethods)
      .then(() => {
        toast.success('Configuración de métodos de pago guardada exitosamente')
        setHasChanges(false)
      })
      .catch(e => toast.error(e.message))
      .finally(() => setSaving(false))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/settings')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <CreditCard size={28} />
              Métodos de Pago
            </h1>
            <p className="text-gray-600 text-sm mt-1">
              Configurar métodos de pago aceptados y comisiones
            </p>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className={`btn-primary btn-md ${
            !hasChanges || saving ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          Guardar Cambios
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
        </div>
      ) : (
      <>
      {/* Lista de métodos de pago */}
      <div className="space-y-4">
        {paymentMethods.map((method, index) => {
          const info = METHOD_INFO[method.method]
          if (!info) return null
          return (
          <motion.div
            key={method.method}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white rounded-lg shadow-sm p-6"
          >
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-lg ${
                method.enabled ? 'bg-primary-100' : 'bg-gray-100'
              }`}>
                <info.icon className={
                  method.enabled ? 'text-primary-600' : 'text-gray-400'
                } size={24} />
              </div>

              <div className="flex-1">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-semibold text-gray-800">{info.name}</h3>
                    <p className="text-sm text-gray-600 mt-1">{info.description}</p>
                  </div>

                  <button
                    onClick={() => toggleMethod(method.method)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      method.enabled ? 'bg-primary-600' : 'bg-gray-300'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      method.enabled ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>

                {method.enabled && (
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="label">Comisión (%)</label>
                      <input
                        type="number"
                        value={method.commission === 0 ? '' : method.commission}
                        onChange={(e) => updateCommission(method.method, parseFloat(e.target.value) || 0)}
                        className="input w-full"
                        min="0"
                        max="100"
                        step="0.1"
                      />
                    </div>

                    <div className="flex items-end">
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 w-full">
                        <p className="text-xs text-gray-600">Ejemplo: Venta de Q100.00</p>
                        <p className="text-sm font-medium text-gray-800">
                          Recibes: Q{(100 - (100 * method.commission / 100)).toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-500">
                          Comisión: Q{(100 * method.commission / 100).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
          )
        })}
      </div>

      {/* Info card */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <CreditCard className="text-blue-600 flex-shrink-0 mt-0.5" size={20} />
          <div>
            <h3 className="font-medium text-blue-900 mb-1">Sobre las Comisiones</h3>
            <p className="text-sm text-blue-700">
              Las comisiones configuradas son informativas y te ayudan a calcular tus costos.
              En el POS se mostrarán todos los métodos habilitados. Los métodos deshabilitados
              no estarán disponibles para realizar ventas.
            </p>
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  )
}
