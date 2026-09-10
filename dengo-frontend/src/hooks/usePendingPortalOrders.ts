import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAuthStore } from '../store'

/**
 * Polls the portal-admin stats endpoint every 30 seconds and returns the
 * number of pending portal orders. Only polls for ADMIN users.
 */
export function usePendingPortalOrders(): number {
  const user = useAuthStore(s => s.user)
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!user || user.role !== 'ADMIN') {
      setCount(0)
      return
    }

    let cancelled = false

    const fetchCount = () => {
      api.get<{ pendingOrders: number }>('/api/portal-admin/stats')
        .then(r => { if (!cancelled) setCount(r.pendingOrders ?? 0) })
        .catch(() => { /* silently ignore polling errors */ })
    }

    fetchCount()
    const id = setInterval(fetchCount, 30_000)

    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [user])

  return count
}
