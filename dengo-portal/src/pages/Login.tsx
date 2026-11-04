import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Mail, Lock, Eye, EyeOff, ArrowRight, ArrowLeft } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../store/authStore'
import { BrandMark, usePortalConfig } from '../lib/usePortalConfig'
import { FALLBACK_NAME } from '../lib/brand'

export default function Login() {
  const navigate = useNavigate()
  const login = useAuthStore(s => s.login)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Whether the "página" module is licensed for this client: the branded
  // panel only appears once /config confirms it, so an unlicensed client's
  // login never flashes it (404 = página no licenciada, o sin configurar).
  const { config, status } = usePortalConfig()
  const branded = status === 'ready'
  const checkingConfig = status === 'loading'
  const businessName = config?.businessName || FALLBACK_NAME
  const waLink = config?.whatsapp ? `https://wa.me/${config.whatsapp.replace(/\D/g, '').replace(/^(\d{8})$/, '502$1')}` : null

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

  if (checkingConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <span className="w-8 h-8 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
      </div>
    )
  }

  const loginForm = (
    <form onSubmit={handleSubmit} className="mt-8 space-y-5">
      <div>
        <label htmlFor="login-email" className="block text-sm font-semibold text-gray-800 mb-1.5">Correo electrónico</label>
        <div className="relative">
          <Mail size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="maestro@correo.com"
            className="w-full pl-11 pr-4 py-3 border border-gray-300 bg-white focus:border-brand-600 focus:ring-2 focus:ring-brand-100 outline-none transition"
            autoComplete="email"
          />
        </div>
      </div>

      <div>
        <label htmlFor="login-password" className="block text-sm font-semibold text-gray-800 mb-1.5">Contraseña</label>
        <div className="relative">
          <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            id="login-password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full pl-11 pr-11 py-3 border border-gray-300 bg-white focus:border-brand-600 focus:ring-2 focus:ring-brand-100 outline-none transition"
            autoComplete="current-password"
          />
          <button
            type="button"
            onClick={() => setShowPassword(v => !v)}
            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
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
        className="w-full py-3.5 bg-brand-600 text-white font-bold hover:bg-brand-700 active:translate-y-px transition flex items-center justify-center gap-2 disabled:opacity-60"
      >
        {loading ? (
          <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <>Ingresar <ArrowRight size={18} /></>
        )}
      </button>

      {waLink ? (
        <a href={`${waLink}?text=${encodeURIComponent('Hola, olvidé mi contraseña del portal de maestros. Mi correo es: ' + email)}`}
          target="_blank" rel="noreferrer"
          className="block w-full text-center text-sm text-brand-700 hover:text-brand-800 font-medium">
          Olvidé mi contraseña — escribir por WhatsApp
        </a>
      ) : (
        <button
          type="button"
          onClick={() => toast.info('Contacta al proveedor para restablecer tu contraseña.')}
          className="w-full text-center text-sm text-brand-700 hover:text-brand-800 font-medium"
        >
          Olvidé mi contraseña
        </button>
      )}
    </form>
  )

  // Página no licenciada (o sin configurar): un formulario simple, sin marca,
  // sin logo ni copy comercial — nada que insinúe una landing paga.
  if (!branded) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 py-12 bg-gray-50">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-200 p-8"
        >
          <h2 className="text-xl font-bold text-gray-900">Iniciar sesión</h2>
          <p className="mt-1.5 text-gray-500 text-sm">Ingresa con las credenciales que te proporcionaron.</p>
          {loginForm}
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#f2f3f5]">
      {/* Left: brand panel */}
      <div className="lg:w-1/2 bg-brand-700 text-white px-8 py-12 lg:p-16 flex flex-col justify-between gap-12">
        <Link to="/" className="inline-flex items-center gap-3">
          <BrandMark logoUrl={config?.logoUrl} size={40} light />
          <span className="font-bold text-xl">{businessName}</span>
        </Link>
        <div className="max-w-lg">
          <h1 className="text-[clamp(2.4rem,5vw,4.5rem)] font-extrabold leading-[0.95] tracking-[-0.035em]">
            Portal de maestros
          </h1>
          <p className="mt-6 text-lg sm:text-xl leading-relaxed text-white/90">
            Arma y envía los pedidos de útiles, valija didáctica y gratuidad de tu escuela, y sigue su estado desde cualquier dispositivo.
          </p>
        </div>
        <p className="hidden lg:block text-white/80 text-[15px]">{config?.city || config?.address || ''}</p>
      </div>

      {/* Right: form */}
      <div className="lg:w-1/2 flex items-center justify-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md bg-white p-8 sm:p-10"
        >
          <h2 className="text-3xl font-extrabold tracking-[-0.02em]">Inicia sesión</h2>
          <p className="mt-2 text-gray-700">Con el correo y la contraseña que te entregó {businessName}.</p>

          {loginForm}

          <Link to="/" className="mt-6 flex items-center justify-center gap-1.5 text-sm text-gray-700 hover:text-gray-900">
            <ArrowLeft size={16} /> Volver al inicio
          </Link>
        </motion.div>
      </div>
    </div>
  )
}
