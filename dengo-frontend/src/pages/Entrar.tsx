import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuthStore } from '../store'
import { resyncPush } from '../lib/push'
import { toSessionUser } from '../lib/session'

// Landing spot for "Ingresar" on the client's public website: the site
// already checked the password and sends the person here with a one-time
// code in the fragment (#c=…), which never reaches a server log. The code is
// traded for a normal session and erased from the address bar at once.
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

    void (async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/handoff`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        })
        const body = await res.json().catch(() => null)
        if (!res.ok) throw new Error(body?.error ?? 'No se pudo entrar. Vuelve a iniciar sesión.')
        login(toSessionUser(body.user), body.token)
        void resyncPush()
        toast.success(`¡Bienvenido, ${body.user.name}!`)
        navigate('/pos', { replace: true })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo entrar. Vuelve a iniciar sesión.')
      }
    })()
  }, [login, navigate])

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
      {error ? (
        <>
          <h2 className="text-xl font-bold text-gray-800 mb-2">No pudimos abrir tu sesión</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <Link to="/login" className="btn-primary btn-lg w-full inline-flex justify-center">Iniciar sesión</Link>
        </>
      ) : (
        <div className="flex flex-col items-center gap-4 py-6" role="status">
          <span className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-700 font-medium">Abriendo tu sesión…</p>
        </div>
      )}
    </div>
  )
}
