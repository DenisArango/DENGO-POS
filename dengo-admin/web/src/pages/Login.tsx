import { useState } from 'react'
import { motion } from 'motion/react'
import { ArrowRight, KeyRound } from 'lucide-react'
import { api } from '../lib/api'
import { DengoSymbol } from '../components/Shell'
import { Spinner } from '../components/ui'

export default function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try { await api('/api/login', { method: 'POST', json: { password } }); onDone() } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-6"
      style={{ background: 'radial-gradient(90% 70% at 15% 10%, #2b5b79 0%, #1E4D68 40%, #0b1f2a 100%)' }}>
      {/* big symbol watermark, slowly turning */}
      <motion.div aria-hidden className="pointer-events-none absolute -right-32 -top-24 opacity-[0.07]" animate={{ rotate: 360 }} transition={{ duration: 160, repeat: Infinity, ease: 'linear' }}>
        <DengoSymbol className="h-[640px] w-[640px]" stroke="#ffffff" />
      </motion.div>
      <motion.form onSubmit={submit} initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        className="tile relative w-full max-w-[400px] p-8">
        <div className="mb-7 flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ice shadow-well"><DengoSymbol className="h-8 w-8" /></span>
          <div>
            <h1 className="h-display text-[24px] leading-tight">Consola DENGO</h1>
            <p className="text-[13px] text-ink-500">Alta y administración de clientes</p>
          </div>
        </div>
        <label className="block">
          <span className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-ink-800"><KeyRound className="h-4 w-4 text-coral-500" /> Contraseña</span>
          <input className="input" type="password" autoFocus autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
        </label>
        {error && <motion.p initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: [0, -6, 6, -3, 0] }} className="mt-3 text-[13px] font-medium text-rose-600">{error}</motion.p>}
        <button className="btn-primary mt-6 w-full" disabled={busy || !password}>
          {busy ? <Spinner /> : null} Entrar <ArrowRight className="h-4 w-4" />
        </button>
      </motion.form>
    </div>
  )
}
