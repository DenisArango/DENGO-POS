import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'sonner'
import './index.css'
import { api } from './lib/api'
import { ModeContext } from './lib/useMode'
import Shell from './components/Shell'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ClientPage from './pages/ClientPage'
import NewClient from './pages/NewClient'
import JobPage from './pages/JobPage'
import Jobs from './pages/Jobs'
import ServerPage from './pages/ServerPage'
import Migration from './pages/Migration'
import { Spinner } from './components/ui'

function App() {
  const [state, setState] = useState<'loading' | 'in' | 'out'>('loading')
  const [mode, setMode] = useState<'real' | 'simulate'>('real')
  const check = () => api<{ mode: 'real' | 'simulate' }>('/api/me').then(m => { setMode(m.mode); setState('in') }).catch(() => setState('out'))
  useEffect(() => {
    void check()
    const out = () => setState('out')
    window.addEventListener('dadm:logout', out)
    return () => window.removeEventListener('dadm:logout', out)
  }, [])
  if (state === 'loading') return <div className="flex min-h-screen items-center justify-center text-ink-500"><Spinner className="h-6 w-6" /></div>
  if (state === 'out') return <Login onDone={check} />
  return (
    <ModeContext.Provider value={mode}>
      <BrowserRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Dashboard />} />
            <Route path="nuevo" element={<NewClient />} />
            <Route path="clientes/:name" element={<ClientPage />} />
            <Route path="clientes/:name/migracion" element={<Migration />} />
            <Route path="trabajos" element={<Jobs />} />
            <Route path="trabajos/:id" element={<JobPage />} />
            <Route path="servidor" element={<ServerPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ModeContext.Provider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Toaster position="top-right" richColors closeButton toastOptions={{ style: { borderRadius: 14, fontFamily: 'Inter Variable, sans-serif' } }} />
  </StrictMode>,
)
