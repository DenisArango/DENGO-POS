import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  GraduationCap, Mail, Lock, Eye, EyeOff, ArrowRight, ArrowLeft,
  BookOpen, Pencil, Backpack,
} from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../store/authStore'

export default function Login() {
  const navigate = useNavigate()
  const login = useAuthStore(s => s.login)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const businessName = (() => {
    try {
      const raw = localStorage.getItem('portal-config')
      if (raw) return JSON.parse(raw)?.businessName ?? 'Variedades Dayana'
    } catch { /* ignore */ }
    return 'Variedades Dayana'
  })()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      setError('Ingresa tu correo y contraseña')
      return
    }
    setError('')
    setLoading(true)
    try {
      const { user, token } = await api.login(email.trim(), password)
      login(user, token)
      toast.success(`¡Bienvenido/a, ${user.name}!`)
      navigate('/dashboard')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo iniciar sesión'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left: brand panel */}
      <div className="relative lg:w-1/2 bg-gradient-to-br from-brand-500 to-brand-700 text-white px-8 py-12 lg:p-16 flex flex-col justify-center overflow-hidden">
        <div className="absolute -top-20 -right-20 w-80 h-80 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -left-10 w-80 h-80 bg-amber-300/20 rounded-full blur-3xl" />

        <div className="relative max-w-md">
          <Link to="/" className="inline-flex items-center gap-2.5 mb-10">
            <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
              <GraduationCap size={24} />
            </div>
            <span className="font-extrabold text-xl">{businessName}</span>
          </Link>

          <h1 className="text-3xl lg:text-4xl font-extrabold leading-tight">
            Portal de Maestros
          </h1>
          <p className="mt-4 text-brand-50 text-lg">
            Realiza las selecciones de tus programas educativos de forma rápida, segura y desde cualquier dispositivo.
          </p>

          <div className="mt-10 grid grid-cols-3 gap-3 max-w-sm">
            {[
              { icon: BookOpen, label: 'Catálogo' },
              { icon: Pencil, label: 'Útiles' },
              { icon: Backpack, label: 'Programas' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="rounded-2xl bg-white/10 backdrop-blur border border-white/15 p-4 text-center">
                <Icon size={26} className="mx-auto" />
                <p className="mt-2 text-xs font-medium opacity-90">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right: form */}
      <div className="lg:w-1/2 flex items-center justify-center px-6 py-12 bg-gray-50">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-gray-100 p-8 sm:p-10"
        >
          <div className="lg:hidden flex items-center gap-2.5 mb-6">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center text-white">
              <GraduationCap size={20} />
            </div>
            <span className="font-extrabold text-gray-900">{businessName}</span>
          </div>

          <h2 className="text-2xl font-extrabold text-gray-900">Inicia sesión</h2>
          <p className="mt-1.5 text-gray-500 text-sm">Accede con las credenciales que te proporcionó el proveedor.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Correo electrónico</label>
              <div className="relative">
                <Mail size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="maestro@correo.com"
                  className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition"
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Contraseña</label>
              <div className="relative">
                <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-11 pr-11 py-3 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-brand-500 text-white font-bold shadow-lg shadow-brand-500/30 hover:bg-brand-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading ? (
                <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>Ingresar <ArrowRight size={18} /></>
              )}
            </button>

            <button
              type="button"
              onClick={() => toast.info('Contacta al proveedor para restablecer tu contraseña.')}
              className="w-full text-center text-sm text-brand-600 hover:text-brand-700 font-medium"
            >
              Olvidé mi contraseña
            </button>
          </form>

          <Link to="/" className="mt-6 flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
            <ArrowLeft size={16} /> Volver al inicio
          </Link>
        </motion.div>
      </div>
    </div>
  )
}
