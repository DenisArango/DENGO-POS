// «Detalle técnico» for connection problems: the rolling log from
// lib/connLog.ts, readable enough for a screenshot and copyable as text.
// Used inline under the offline banner (MainLayout) and inside
// ConnectionLogModal (opened from the «Sin conexión» toast).
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Copy, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { getConnLog, subscribeConnLog, formatConnEvent, formatConnLog, clearConnLog, deviceSummary } from '../../lib/connLog'

export const SHOW_CONN_LOG_EVENT = 'dengo:show-conn-log'

function useConnLog() {
  const [, force] = useState(0)
  useEffect(() => subscribeConnLog(() => force(n => n + 1)), [])
  return getConnLog()
}

function ago(t: number): string {
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 60) return `hace ${s} s`
  if (s < 3600) return `hace ${Math.round(s / 60)} min`
  return `hace ${Math.round(s / 3600)} h`
}

export function ConnectionDetailsBody({ limit = 25 }: { limit?: number }) {
  const events = useConnLog()
  const lastBad = [...events].reverse().find(e => e.bad)
  const shown = events.slice(-limit).reverse()
  const dev = deviceSummary()

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(formatConnLog())
      toast.success('Detalle copiado — pégalo en el chat de soporte')
    } catch {
      toast.error('No se pudo copiar; toma una captura de pantalla')
    }
  }

  return (
    <div className="text-xs text-gray-700">
      <div className="mb-2 space-y-0.5">
        {lastBad
          ? <p><span className="font-semibold">Último problema ({ago(lastBad.t)}):</span> {lastBad.method && lastBad.path ? `${lastBad.method} ${lastBad.path} — ` : ''}{lastBad.msg}</p>
          : <p className="text-gray-500">No hay problemas de conexión registrados.</p>}
        <p className="text-gray-500">{dev.app} · {dev.sitio}{dev.usuario ? ` · ${dev.usuario}` : ''} · {dev.red} · {dev.hora}</p>
      </div>
      <div className="bg-gray-900 text-gray-100 rounded p-2 font-mono text-[11px] leading-snug max-h-64 overflow-auto whitespace-pre-wrap break-words">
        {shown.length === 0
          ? <span className="text-gray-400">(sin eventos)</span>
          : shown.map((e, i) => (
              <div key={`${e.t}-${i}`} className={e.bad ? 'text-red-300' : 'text-green-300'}>{formatConnEvent(e)}</div>
            ))}
      </div>
      <div className="flex gap-2 mt-2">
        <button onClick={copy} className="btn-secondary btn-sm flex items-center gap-1"><Copy size={12} /> Copiar detalle</button>
        <button onClick={() => { if (confirm('¿Borrar el registro de conexión de este dispositivo?')) clearConnLog() }} className="btn-secondary btn-sm flex items-center gap-1"><Trash2 size={12} /> Limpiar</button>
      </div>
    </div>
  )
}

/** The arrow + collapsible panel, for putting under an error message. */
export function ConnectionDetailsToggle({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={className}>
      <button onClick={() => setOpen(o => !o)} className="text-xs font-medium text-amber-900 hover:underline flex items-center gap-1">
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Detalle técnico
      </button>
      {open && <div className="mt-2"><ConnectionDetailsBody /></div>}
    </div>
  )
}

/** Mounted once (App.tsx); opens on SHOW_CONN_LOG_EVENT, e.g. from the toast's «Ver detalle». */
export function ConnectionLogModal() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const show = () => setOpen(true)
    window.addEventListener(SHOW_CONN_LOG_EVENT, show)
    return () => window.removeEventListener(SHOW_CONN_LOG_EVENT, show)
  }, [])
  if (!open) return null
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]" onClick={() => setOpen(false)}>
      <div className="bg-white rounded-lg p-5 max-w-3xl w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-gray-800">Detalle técnico de la conexión</h3>
          <button onClick={() => setOpen(false)} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>
        <p className="text-xs text-gray-500 mb-3">Toma una captura de esta ventana o usa «Copiar detalle» y envíala a soporte. Lo más reciente va arriba.</p>
        <ConnectionDetailsBody limit={40} />
      </div>
    </div>
  )
}
