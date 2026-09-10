import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAuthStore } from '../store'

export function useUnreadMessages(): number {
  const user = useAuthStore(s => s.user)
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!user) { setCount(0); return }

    let cancelled = false
    const fetch = () => {
      api.get<{ count: number }>('/api/messages/unread')
        .then(r => { if (!cancelled) setCount(r.count ?? 0) })
        .catch(() => {})
    }

    fetch()
    const id = setInterval(fetch, 30_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [user])

  return count
}
