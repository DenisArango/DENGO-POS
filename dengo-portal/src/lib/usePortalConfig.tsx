import { useEffect, useState } from 'react'
import { GraduationCap } from 'lucide-react'
import { api } from './api'
import { applyBrandColor, cacheConfig, getCachedConfig } from './brand'
import type { PortalConfig } from '../types'

type Status = 'loading' | 'ready' | 'unavailable'

// Shared by Landing, Login and the logged-in layout. `unavailable` = /config
// answered 404 (page module not licensed or not configured) — callers fall
// back to an unbranded look, and the stale cache is dropped so a client that
// turned the page off doesn't keep showing its old branding.
export function usePortalConfig() {
  const [config, setConfig] = useState<Partial<PortalConfig> | null>(() => getCachedConfig())
  const [status, setStatus] = useState<Status>('loading')

  useEffect(() => {
    let cancelled = false
    api.getConfig()
      .then(c => {
        if (cancelled) return
        setConfig(c)
        cacheConfig(c)
        applyBrandColor(c.primaryColor)
        setStatus('ready')
      })
      .catch(() => {
        if (cancelled) return
        setConfig(null)
        try { localStorage.removeItem('portal-config') } catch { /* ignore */ }
        applyBrandColor(null)
        setStatus('unavailable')
      })
    return () => { cancelled = true }
  }, [])

  return { config, status }
}

// The client's logo when configured, otherwise the generic mortarboard mark.
export function BrandMark({ logoUrl, size = 36, light = false }: { logoUrl?: string | null; size?: number; light?: boolean }) {
  if (logoUrl) {
    return <img src={logoUrl} alt="" className="rounded-xl object-contain bg-white" style={{ width: size, height: size }} />
  }
  return (
    <div
      className={`rounded-xl flex items-center justify-center shadow-sm ${light ? 'bg-white/20 text-white' : 'bg-brand-600 text-white'}`}
      style={{ width: size, height: size }}
    >
      <GraduationCap size={Math.round(size * 0.55)} />
    </div>
  )
}
