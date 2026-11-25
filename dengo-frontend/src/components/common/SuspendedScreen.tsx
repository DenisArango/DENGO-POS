import { motion } from 'framer-motion'
import { PauseCircle } from 'lucide-react'
import DengoLogo from './DengoLogo'

/** Replaces the whole app while the vendor has this client suspended (LICENSE_CONFIG.SUSPENDED). */
export default function SuspendedScreen({ message }: { message: string | null }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-orange-50 p-6">
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-[0_24px_60px_-20px_rgba(30,77,104,0.35),0_2px_6px_rgba(30,77,104,0.08)] ring-1 ring-slate-900/5"
      >
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#E07A5F] to-[#c4553a] text-white shadow-lg shadow-orange-300/50">
          <PauseCircle className="h-8 w-8 motion-safe:animate-pulse" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Servicio suspendido</h1>
        <p className="mt-3 text-slate-600">
          {message || 'El acceso a este sistema está suspendido temporalmente.'}
        </p>
        <p className="mt-2 text-sm text-slate-500">Contacte a su proveedor para reactivarlo. Sus datos están a salvo.</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-[#1E4D68] px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-[#173d53] active:scale-[0.98]"
        >
          Reintentar
        </button>
        <div className="mt-8 flex justify-center opacity-70">
          <DengoLogo symbolClass="h-5 w-5" textClass="text-sm" />
        </div>
      </motion.div>
    </div>
  )
}
