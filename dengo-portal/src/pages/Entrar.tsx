import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { useAuthStore } from '../store/authStore'

// Landing spot for "Ingresar" on the client's public website: the site
// already checked the password and sends the teacher here with a one-time
// code in the fragment (#c=…). It is traded for a session and erased from
// the address bar at once.
export default function Entrar() {
  const navigate = useNavigate()
  const login = useAuthStore(s => s.login)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const code = new URLSearchParams(window.location.hash.slice(1)).get('c')
    window.history.replaceState(null, '', window.location.pathname)
    if (!code) { navigate('/login', { replace: true }); return }
    api.handoff(code)
      .then(({ user, token }) => {
        login(user, token)
        toast.success(`¡Bienvenido/a, ${user.name}!`)
        navigate('/dashboard', { replace: true })
      })
      .catch(err => setError(err instanceof Error ? err.message : 'No se pudo entrar. Vuelve a iniciar sesión.'))
  }, [login, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12 bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
        {error ? (
          <>
            <h1 className="text-xl font-bold text-gray-900">No pudimos abrir tu sesión</h1>
            <p className="mt-2 text-gray-600 text-sm">{error}</p>
            <Link to="/login" className="mt-6 block w-full py-3 bg-brand-600 text-white font-bold hover:bg-brand-700">Iniciar sesión</Link>
          </>
        ) : (
          <div className="flex flex-col items-center gap-4 py-4" role="status">
            <span className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-700 font-medium">Abriendo tu sesión…</p>
          </div>
        )}
      </div>
    </div>
  )
}
