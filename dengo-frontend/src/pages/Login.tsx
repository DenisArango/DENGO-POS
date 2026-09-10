import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { LogIn, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '../store'

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

      login({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        branchId: u.branchId,
        branchIds: u.branchIds,
        permissions: u.permissions,
        branch: {
          id: u.branch.id,
          name: u.branch.name,
          code: u.branch.code,
          type: u.branch.type,
          address: u.branch.address,
          city: u.branch.city,
          phone: u.branch.phone,
          email: u.branch.email,
          manager: u.branch.manager,
          status: u.branch.status,
          openTime: u.branch.openTime,
          closeTime: u.branch.closeTime,
          config: {
            currency: u.branch.currency,
            timezone: u.branch.timezone,
            taxRate: Number(u.branch.taxRate),
            printerEnabled: u.branch.printerEnabled,
          },
          createdAt: u.branch.createdAt,
          updatedAt: u.branch.updatedAt,
        },
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      }, token)

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

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8">
      {/* Logo */}
      <div className="flex justify-center mb-8">
        <motion.div
          initial={{ rotate: 0 }}
          animate={{ rotate: 360 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="w-16 h-16 bg-gradient-to-br from-primary-600 to-secondary-600 rounded-2xl flex items-center justify-center"
        >
          <LogIn className="text-white" size={28} />
        </motion.div>
      </div>

      {/* Title */}
      <h2 className="text-2xl font-bold text-center text-gray-800 mb-2">
        Iniciar Sesión
      </h2>
      <p className="text-center text-gray-600 mb-8">
        Ingresa tus credenciales para continuar
      </p>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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
            <p className="mt-1 text-sm text-secondary-600">{errors.email.message}</p>
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
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          {errors.password && (
            <p className="mt-1 text-sm text-secondary-600">{errors.password.message}</p>
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

      {/* Credenciales de prueba */}
      <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-100">
        <p className="text-xs text-blue-700 text-center font-medium mb-1">Credenciales de prueba</p>
        <p className="text-xs text-blue-600 text-center">admin@dengo.gt · Admin1234!</p>
      </div>
    </div>
  )
}