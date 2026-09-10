import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Bell, Mail, Smartphone, Package, AlertTriangle, Users, TrendingDown, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'

interface NotificationPref {
  event: string
  email: boolean
  push: boolean
  sms: boolean
}

const EVENT_INFO: Record<string, { title: string; description: string; icon: LucideIcon }> = {
  low_stock: {
    title: 'Stock Bajo',
    description: 'Alerta cuando un producto está por debajo del stock mínimo',
    icon: Package,
  },
  out_of_stock: {
    title: 'Sin Stock',
    description: 'Alerta cuando un producto se queda sin existencias',
    icon: AlertTriangle,
  },
  new_sale: {
    title: 'Nueva Venta',
    description: 'Notificación al realizar una nueva venta',
    icon: TrendingDown,
  },
  new_user: {
    title: 'Nuevo Usuario',
    description: 'Alerta cuando se registra un nuevo usuario en el sistema',
    icon: Users,
  },
}

export default function Notifications() {
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState<NotificationPref[]>([])
  const [hasChanges, setHasChanges] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get<NotificationPref[]>('/api/settings/notifications')
      .then(setNotifications)
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [])

  const toggleNotification = (event: string, channel: 'email' | 'push' | 'sms') => {
    setNotifications(notifs =>
      notifs.map(n =>
        n.event === event ? { ...n, [channel]: !n[channel] } : n
      )
    )
    setHasChanges(true)
  }

  const handleSave = () => {
    setSaving(true)
    api.put('/api/settings/notifications', notifications)
      .then(() => {
        toast.success('Configuración de notificaciones guardada exitosamente')
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
              <Bell size={28} />
              Notificaciones
            </h1>
            <p className="text-gray-600 text-sm mt-1">
              Configurar alertas y notificaciones del sistema
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
      {/* Tabla de notificaciones */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-4 px-6 text-sm font-medium text-gray-700">
                  Tipo de Notificación
                </th>
                <th className="text-center py-4 px-4 text-sm font-medium text-gray-700">
                  <div className="flex flex-col items-center gap-1">
                    <Mail size={18} />
                    <span>Email</span>
                  </div>
                </th>
                <th className="text-center py-4 px-4 text-sm font-medium text-gray-700">
                  <div className="flex flex-col items-center gap-1">
                    <Bell size={18} />
                    <span>Push</span>
                  </div>
                </th>
                <th className="text-center py-4 px-4 text-sm font-medium text-gray-700">
                  <div className="flex flex-col items-center gap-1">
                    <Smartphone size={18} />
                    <span>SMS</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {notifications.map((notif, index) => {
                const info = EVENT_INFO[notif.event]
                if (!info) return null
                return (
                <motion.tr
                  key={notif.event}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="border-b hover:bg-gray-50"
                >
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-gray-100 rounded-lg">
                        <info.icon size={20} className="text-gray-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-800">{info.title}</p>
                        <p className="text-sm text-gray-500">{info.description}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex justify-center">
                      <button
                        onClick={() => toggleNotification(notif.event, 'email')}
                        className={`w-12 h-6 rounded-full relative transition-colors ${
                          notif.email ? 'bg-primary-600' : 'bg-gray-300'
                        }`}
                      >
                        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                          notif.email ? 'right-0.5' : 'left-0.5'
                        }`} />
                      </button>
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex justify-center">
                      <button
                        onClick={() => toggleNotification(notif.event, 'push')}
                        className={`w-12 h-6 rounded-full relative transition-colors ${
                          notif.push ? 'bg-primary-600' : 'bg-gray-300'
                        }`}
                      >
                        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                          notif.push ? 'right-0.5' : 'left-0.5'
                        }`} />
                      </button>
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex justify-center">
                      <button
                        onClick={() => toggleNotification(notif.event, 'sms')}
                        className={`w-12 h-6 rounded-full relative transition-colors ${
                          notif.sms ? 'bg-primary-600' : 'bg-gray-300'
                        }`}
                      >
                        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                          notif.sms ? 'right-0.5' : 'left-0.5'
                        }`} />
                      </button>
                    </div>
                  </td>
                </motion.tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Mail className="text-blue-600 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <h3 className="font-medium text-blue-900 mb-1">Email</h3>
              <p className="text-sm text-blue-700">
                Notificaciones enviadas al correo registrado
              </p>
            </div>
          </div>
        </div>

        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Bell className="text-purple-600 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <h3 className="font-medium text-purple-900 mb-1">Push</h3>
              <p className="text-sm text-purple-700">
                Notificaciones en tiempo real en la aplicación
              </p>
            </div>
          </div>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Smartphone className="text-green-600 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <h3 className="font-medium text-green-900 mb-1">SMS</h3>
              <p className="text-sm text-green-700">
                Mensajes de texto al número registrado
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-sm text-yellow-800">
          <strong>Nota:</strong> estas preferencias ya se guardan. El envío real por email/SMS aún no está conectado a
          un proveedor (SMTP, Twilio, etc.) — hoy solo queda registrado qué canales deberían usarse para cada alerta.
        </p>
      </div>
      </>
      )}
    </div>
  )
}
