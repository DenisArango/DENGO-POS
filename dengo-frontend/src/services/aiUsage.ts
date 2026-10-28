import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'

// Mirrors GET /api/ai/usage — the client's monthly AI allowance.
export interface AiUsageStatus {
  enabled: boolean
  limit: number | null // null = sin límite
  used: number
  remaining: number | null
  resetsOn: string // YYYY-MM-DD, first day of next month
}

export interface AiUsageDetails {
  status: AiUsageStatus
  byUser: { userId: string; userName: string; count: number }[]
  byKind: Partial<Record<'ANALYST' | 'RECOMMENDATION' | 'QUERY', number>>
  recent: { id: string; kind: string; userName: string; question: string; durationMs: number; createdAt: string }[]
}

export function useAiUsage() {
  const [usage, setUsage] = useState<AiUsageStatus | null>(null)
  const refresh = useCallback(() => {
    api.get<AiUsageStatus>('/api/ai/usage').then(setUsage).catch(() => { /* counter is informative only */ })
  }, [])
  useEffect(() => { refresh() }, [refresh])
  return { usage, refresh }
}

export function formatResetDate(resetsOn: string): string {
  const [y, m, d] = resetsOn.split('-')
  return `${d}/${m}/${y}`
}
