import { useEffect, useState } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import { PauseCircle } from 'lucide-react'
import Router from './router'

type Suspension = { message: string | null } | null

/** The vendor can suspend a client (dengo-admin): the licence says so, and every API then answers 423. */
function useSuspension(): Suspension {
  const [state, setState] = useState<Suspension>(null)
  useEffect(() => {
    fetch('/api/license')
      .then(r => (r.ok ? r.json() : null))
      .then(l => { if (l?.suspended) setState({ message: l.suspendedMessage ?? null }) })
      .catch(() => {})
    const on = () => setState(s => s ?? { message: null })
    window.addEventListener('dengo:suspended', on)
    return () => window.removeEventListener('dengo:suspended', on)
  }, [])
  return state
}

function Suspended({ message }: { message: string | null }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-orange-50 p-6">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-[0_24px_60px_-20px_rgba(30,77,104,0.35)] ring-1 ring-slate-900/5">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#E07A5F] to-[#c4553a] text-white shadow-lg">
          <PauseCircle className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Servicio suspendido</h1>
        <p className="mt-3 text-slate-600">{message || 'El acceso a este portal está suspendido temporalmente.'}</p>
        <p className="mt-2 text-sm text-slate-500">Contacte a su proveedor para reactivarlo.</p>
        <button onClick={() => window.location.reload()} className="mt-6 rounded-xl bg-[#1E4D68] px-5 py-2.5 text-sm font-semibold text-white">Reintentar</button>
      </div>
    </div>
  )
}

export default function App() {
  const suspension = useSuspension()
  if (suspension) return <Suspended message={suspension.message} />
  return (
    <BrowserRouter>
      <Router />
      <Toaster position="top-right" richColors closeButton duration={3000} />
    </BrowserRouter>
  )
}
