import { useState } from 'react'
import { api } from '../lib/api'

export interface ReportData {
  type: string
  data: any
  context?: string
}

export interface AIRecommendation {
  title: string
  description: string
  priority: 'high' | 'medium' | 'low'
  category: 'inventory' | 'pricing' | 'marketing' | 'operations'
  actionable: boolean
}

export function useAIRecommendations() {
  const [loading, setLoading] = useState(false)
  const [recommendations, setRecommendations] = useState<AIRecommendation[]>([])
  const [error, setError] = useState<string | null>(null)

  const generateRecommendations = async (reportData: ReportData) => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.post<{ recommendations: AIRecommendation[] }>('/api/ai/analyze', {
        reportType: reportData.type,
        data: reportData.data,
        context: reportData.context,
      })
      setRecommendations(result?.recommendations ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al generar recomendaciones')
      setRecommendations([])
    } finally {
      setLoading(false)
    }
  }

  return { recommendations, loading, error, generateRecommendations }
}
