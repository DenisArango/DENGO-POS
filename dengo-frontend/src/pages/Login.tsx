import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '../store'
import { resyncPush } from '../lib/push'
import { toSessionUser } from '../lib/session'
import DengoLogo from '../components/common/DengoLogo'

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
})

type LoginForm = z.infer<typeof loginSchema>

export default function Login() {
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  // When the business's website is published with «Ingresar» pointing here,
  // its /ingresar is the front door: forward there. ?directo keeps this form
  // (an emergency way in), and if the site can't be reached in time
  // (offline, site down) the form shows as always.
  const direct = new URLSearchParams(window.location.search).has('directo')
  const [checkingSite, setCheckingSite] = useState(!direct)
  useEffect(() => {
    if (direct) return
    const ctl = new AbortController()
    const giveUp = window.setTimeout(() => { ctl.abort(); setCheckingSite(false) }, 2500)
    fetch(`${import.meta.env.VITE_API_URL}/api/site/entry`, { signal: ctl.signal })
      .then(r => (r.ok ? r.json() : null))
      .then((d: { url?: string | null } | null) => {
        if (d?.url && /^https?:\/\//.test(d.url) && new URL(d.url).host !== window.location.host) window.location.replace(d.url)
        else setCheckingSite(false)
      })
      .catch(() => setCheckingSite(false))
      .finally(() => window.clearTimeout(giveUp))
    return () => { window.clearTimeout(giveUp); ctl.abort() }
  }, [direct])

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.email, password: data.password }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        // Surface the backend's actual message — it's specific for lockouts
        // ("Cuenta bloqueada por 15 minutos...") and license blocks, and a
        // generic "Credenciales incorrectas" otherwise (never confirms which
        // field was wrong).
        throw new Error(body?.error ?? 'Error del servidor. Intenta nuevamente.')
      }

      const { token, user: u } = await res.json()

      login(toSessionUser(u), token)
      void resyncPush()

      toast.success(`¡Bienvenido, ${u.name}!`)
      navigate('/pos')
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message || 'Error de conexión. Verifica que el servidor esté activo.')
      }
      console.error('Login error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  if (checkingSite) {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-8 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" aria-label="Cargando" />
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xl p-8 sm:p-10">
      {/* Logo */}
      <DengoLogo className="mb-10" symbolClass="h-9 w-9" textClass="text-[22px]" />

      {/* Title */}
      <h2 className="text-2xl font-bold tracking-tight text-gray-900 mb-1.5">
        Iniciar Sesión
      </h2>
      <p className="text-gray-600 mb-8">
        Ingresa tus credenciales para continuar
      </p>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div>
          <label htmlFor="email" className="label">
            Correo Electrónico
          </label>
          <input
            {...register('email')}
            type="email"
            id="email"
            className="input mt-1"
            placeholder="correo@ejemplo.com"
          />
          {errors.email && (
            <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="password" className="label">
            Contraseña
          </label>
          <div className="relative">
            <input
              {...register('password')}
              type={showPassword ? 'text' : 'password'}
              id="password"
              className="input mt-1 pr-10"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              className="absolute right-3 top-1/2 mt-0.5 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          {errors.password && (
            <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="btn-primary btn-lg w-full"
        >
          {isLoading ? (
            <div className="flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
              Iniciando sesión...
            </div>
          ) : (
            'Iniciar Sesión'
          )}
        </button>
      </form>

      <p className="text-center text-[11px] text-gray-400 mt-8">DENGO POS v{__APP_VERSION__}</p>
    </div>
  )
}