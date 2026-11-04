import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Bell, BellOff, BellRing, CheckCircle2, Smartphone, Monitor, Share, PlusSquare, MoreVertical, Lock, AlertTriangle } from 'lucide-react'
import PortalLayout from '../components/layout/PortalLayout'
import { api } from '../lib/api'
import { detectPlatform, disablePush, enablePush, getPushState, isStandalone, type Platform, type PushState } from '../lib/push'

const TABS: { id: Platform; label: string; icon: typeof Smartphone }[] = [
  { id: 'android', label: 'Android', icon: Smartphone },
  { id: 'ios', label: 'iPhone / iPad', icon: Smartphone },
  { id: 'desktop', label: 'Computadora', icon: Monitor },
]

const WHAT = [
  'Cuando tu pedido es aprobado, corregido o no aprobado',
  'Cuando el proveedor te envía la cotización o la factura',
  'Cuando el proveedor te escribe un mensaje',
]

export default function Notifications() {
  const here = detectPlatform()
  const [tab, setTab] = useState<Platform>(here)
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { getPushState().then(setState).catch(() => setState('unsupported')) }, [])

  const turnOn = async () => {
    setBusy(true)
    try {
      const next = await enablePush()
      setState(next)
      if (next === 'on') {
        toast.success('Notificaciones activadas')
        await api.testPush().catch(() => {})
      } else if (next === 'denied') {
        toast.error('Las notificaciones quedaron bloqueadas. Mira abajo cómo desbloquearlas.')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudieron activar')
    } finally {
      setBusy(false)
    }
  }
  const turnOff = async () => {
    setBusy(true)
    setState(await disablePush())
    setBusy(false)
    toast.success('Notificaciones desactivadas en este dispositivo')
  }
  const test = async () => {
    const r = await api.testPush().catch(() => ({ sent: 0 }))
    if (r.sent > 0) toast.success('Te enviamos una notificación de prueba')
    else toast.error('No se pudo enviar. Desactiva y vuelve a activar.')
  }

  return (
    <PortalLayout>
      <div className="max-w-2xl mx-auto space-y-5">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Notificaciones en tu celular</h1>
          <p className="text-sm text-gray-500 mt-1">Te avisamos al momento, aunque no tengas el portal abierto.</p>
        </div>

        {/* Status + main action for THIS device */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          {state === null ? (
            <div className="h-16 flex items-center justify-center"><div className="w-6 h-6 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : state === 'on' ? (
            <div className="flex flex-wrap items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center"><BellRing size={24} /></div>
              <div className="flex-1 min-w-[12rem]">
                <p className="font-bold text-gray-900">Activadas en este dispositivo</p>
                <p className="text-sm text-gray-500">Si usas otro celular o computadora, actívalas también allí.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={test} className="px-4 py-2.5 rounded-xl border-2 border-gray-200 text-sm font-semibold text-gray-700">Probar</button>
                <button onClick={turnOff} disabled={busy} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-500 hover:text-red-600">Desactivar</button>
              </div>
            </div>
          ) : state === 'off' ? (
            <div className="flex flex-wrap items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center"><Bell size={24} /></div>
              <div className="flex-1 min-w-[12rem]">
                <p className="font-bold text-gray-900">Están apagadas</p>
                <p className="text-sm text-gray-500">Toca el botón y luego <strong>Permitir</strong> cuando te lo pregunte.</p>
              </div>
              <button onClick={turnOn} disabled={busy} className="w-full sm:w-auto px-6 py-3 rounded-xl bg-brand-500 text-white font-bold hover:bg-brand-600 disabled:opacity-60 flex items-center justify-center gap-2">
                {busy ? <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Bell size={18} /> Activar notificaciones</>}
              </button>
            </div>
          ) : state === 'needs-install' ? (
            <Status icon={<PlusSquare size={24} />} tone="amber" title="Primero agrega el portal a tu pantalla de inicio"
              text="En iPhone y iPad las notificaciones solo funcionan cuando abres el portal desde su ícono. Sigue los pasos de abajo." />
          ) : state === 'denied' ? (
            <Status icon={<BellOff size={24} />} tone="red" title="Las notificaciones están bloqueadas"
              text="Las bloqueaste en algún momento. Abajo te explicamos cómo desbloquearlas; después vuelve aquí y toca Activar." />
          ) : (
            <Status icon={<AlertTriangle size={24} />} tone="amber" title="Este navegador no permite notificaciones"
              text={here === 'android' ? 'Abre el portal en Google Chrome.' : here === 'ios' ? 'Necesitas iOS 16.4 o más nuevo y abrir el portal en Safari.' : 'Usa Google Chrome, Microsoft Edge o Firefox.'} />
          )}
        </div>

        {/* What gets notified */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="font-bold text-gray-900 mb-2">¿De qué te avisamos?</p>
          <ul className="space-y-1.5">
            {WHAT.map(w => <li key={w} className="flex items-start gap-2 text-sm text-gray-700"><CheckCircle2 size={16} className="text-green-500 mt-0.5 flex-shrink-0" />{w}</li>)}
          </ul>
        </div>

        {/* Step-by-step guide per device */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-5 pb-0">
            <p className="font-bold text-gray-900">Paso a paso según tu dispositivo</p>
          </div>
          <div className="flex gap-1 p-2 mx-3 mt-3 bg-gray-100 rounded-xl" role="tablist">
            {TABS.map(t => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 ${tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                <t.icon size={15} /> {t.label}{t.id === here && <span className="sr-only"> (este dispositivo)</span>}
              </button>
            ))}
          </div>
          <div className="p-5">
            {tab === 'android' && (
              <>
                <Steps steps={[
                  <>Abre el portal en <strong>Google Chrome</strong>.</>,
                  <>Entra a esta página (<strong>Notificaciones</strong>) y toca <strong>Activar notificaciones</strong>.</>,
                  <>Cuando Chrome pregunte, toca <strong>Permitir</strong>. Te llegará una notificación de prueba.</>,
                  <>Opcional, para tenerlo como app: toca el menú <MoreVertical size={14} className="inline -mt-0.5" /> de Chrome y luego <strong>Agregar a pantalla principal</strong> (o <strong>Instalar app</strong>).</>,
                ]} />
                <Unblock title="¿Las bloqueaste por error?">
                  Toca el <Lock size={13} className="inline -mt-0.5" /> candado junto a la dirección del portal, luego <strong>Permisos</strong> → <strong>Notificaciones</strong> → <strong>Permitir</strong>. Vuelve aquí y toca Activar.
                </Unblock>
              </>
            )}
            {tab === 'ios' && (
              <>
                <p className="text-xs text-gray-500 mb-3">Necesitas iOS 16.4 o más nuevo (Ajustes → General → Información → Versión de iOS).</p>
                <Steps steps={[
                  <>Abre el portal en <strong>Safari</strong> (no funciona desde otras apps como Facebook o WhatsApp).</>,
                  <>Toca el botón <strong>Compartir</strong> <Share size={14} className="inline -mt-0.5" /> (el cuadro con la flecha hacia arriba).</>,
                  <>Baja y toca <strong>Agregar a pantalla de inicio</strong> <PlusSquare size={14} className="inline -mt-0.5" />, luego <strong>Agregar</strong>.</>,
                  <>Cierra Safari y abre el portal desde el <strong>ícono nuevo</strong> en tu pantalla. Inicia sesión.</>,
                  <>Entra a <strong>Notificaciones</strong>, toca <strong>Activar notificaciones</strong> y luego <strong>Permitir</strong>.</>,
                ]} />
                {here === 'ios' && isStandalone() && <p className="mt-3 text-sm text-green-700 font-medium">✓ Ya abriste el portal desde su ícono: solo falta el paso 5.</p>}
                <Unblock title="¿Las bloqueaste por error?">
                  Abre <strong>Ajustes</strong> → <strong>Notificaciones</strong> → busca <strong>Pedidos</strong> → activa <strong>Permitir notificaciones</strong>.
                </Unblock>
              </>
            )}
            {tab === 'desktop' && (
              <>
                <Steps steps={[
                  <>Abre el portal en <strong>Google Chrome</strong>, <strong>Microsoft Edge</strong> o <strong>Firefox</strong>.</>,
                  <>Entra a esta página y haz clic en <strong>Activar notificaciones</strong>.</>,
                  <>Cuando el navegador pregunte arriba a la izquierda, haz clic en <strong>Permitir</strong>.</>,
                  <>Las notificaciones llegan mientras el navegador esté abierto, aunque el portal esté en otra pestaña.</>,
                ]} />
                <Unblock title="¿Las bloqueaste por error?">
                  Haz clic en el <Lock size={13} className="inline -mt-0.5" /> candado junto a la dirección, busca <strong>Notificaciones</strong> y elige <strong>Permitir</strong>. Recarga la página.
                </Unblock>
              </>
            )}
          </div>
        </div>
      </div>
    </PortalLayout>
  )
}

function Status({ icon, tone, title, text }: { icon: React.ReactNode; tone: 'amber' | 'red'; title: string; text: string }) {
  const cls = tone === 'red' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'
  return (
    <div className="flex items-start gap-4">
      <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${cls}`}>{icon}</div>
      <div>
        <p className="font-bold text-gray-900">{title}</p>
        <p className="text-sm text-gray-600 mt-0.5">{text}</p>
      </div>
    </div>
  )
}

function Steps({ steps }: { steps: React.ReactNode[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3 text-sm text-gray-700 leading-relaxed">
          <span className="w-7 h-7 rounded-full bg-brand-500 text-white font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
          <span className="pt-1">{s}</span>
        </li>
      ))}
    </ol>
  )
}

function Unblock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
      <p className="font-semibold text-gray-900 mb-1">{title}</p>
      <p className="leading-relaxed">{children}</p>
    </div>
  )
}
