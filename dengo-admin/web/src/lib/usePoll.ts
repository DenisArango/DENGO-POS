import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'

/** GET a path now and every `ms` while the tab is visible; `reload()` refetches at once. */
export function usePoll<T>(path: string | null, ms = 15000) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const alive = useRef(true)
  const load = useCallback(async () => {
    if (!path) return
    try {
      const d = await api<T>(path)
      if (alive.current) { setData(d); setError(null) }
    } catch (e) {
      if (alive.current) setError((e as Error).message)
    } finally {
      if (alive.current) setLoading(false)
    }
  }, [path])
  useEffect(() => {
    alive.current = true
    setLoading(true)
    void load()
    if (!ms) return () => { alive.current = false }
    const t = setInterval(() => { if (document.visibilityState === 'visible') void load() }, ms)
    return () => { alive.current = false; clearInterval(t) }
  }, [load, ms])
  return { data, error, loading, reload: load, setData }
}
