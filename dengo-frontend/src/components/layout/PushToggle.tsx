import { useEffect, useState } from 'react'
import { BellRing, BellOff, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { getPushState, enablePush, disablePush, sendTestPush, type PushState } from '../../lib/push'

// "Avisos en este dispositivo" — lives in the bell menu so every user (not
// only admins with access to Configuración) can turn it on for themselves.
const HELP: Partial<Record<PushState, string>> = {
  'insecure': 'Disponible cuando el sistema se abre con https://',
  'needs-install': 'En iPhone/iPad: Compartir → "Agregar a pantalla de inicio", y abre el POS desde ese ícono.',
  'unsupported': 'Este navegador no permite avisos. Usa Chrome o Edge.',
  'denied': 'Bloqueaste los avisos. Actívalos en el candado junto a la dirección → Notificaciones → Permitir.',
}

export default function PushToggle() {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { getPushState().then(setState).catch(() => setState('unsupported')) }, [])

  if (!state) return null
  const on = state === 'on'
  const canToggle = state === 'on' || state === 'off'

  async function toggle() {
    setBusy(true)
    try {
      const next = on ? await disablePush() : await enablePush()
      setState(next)
      if (next === 'on') {
        const r = await sendTestPush().catch(() => null)
        toast.success(r?.sent ? 'Avisos activados. Te enviamos uno de prueba.' : 'Avisos activados en este dispositivo')
      } else if (next === 'off' && on) {
        toast('Avisos desactivados en este dispositivo')
      } else if (HELP[next]) {
        toast.error(HELP[next]!)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cambiar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-4 py-3 border-t bg-white">
      <div className="flex items-center gap-3">
        {on ? <BellRing size={18} className="text-primary-600 flex-shrink-0" /> : <BellOff size={18} className="text-gray-400 flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800">Avisos en este dispositivo</p>
          <p className="text-xs text-gray-500 leading-snug">
            {on ? 'Te llegan aunque el POS esté cerrado.' : canToggle ? 'Mensajes, traslados y stock, aunque el POS esté cerrado.' : HELP[state]}
          </p>
        </div>
        {canToggle && (
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label="Avisos en este dispositivo"
            disabled={busy}
            onClick={toggle}
            className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 disabled:opacity-60 ${on ? 'bg-primary-600' : 'bg-gray-300'}`}
          >
            <span className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow flex items-center justify-center transition-transform ${on ? 'translate-x-5' : ''}`}>
              {busy && <Loader2 size={12} className="animate-spin text-gray-500" />}
            </span>
          </button>
        )}
      </div>
    </div>
  )
}
