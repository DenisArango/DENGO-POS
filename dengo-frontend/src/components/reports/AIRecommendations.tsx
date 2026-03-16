import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, TrendingUp, AlertCircle, Lightbulb, ChevronRight, Loader } from 'lucide-react'
import { useAIRecommendations } from '../../services/aiRecommendations'
import type { ReportData } from '../../services/aiRecommendations'

interface AIRecommendationsProps {
  reportData: ReportData
  autoGenerate?: boolean
}

export default function AIRecommendations({ reportData, autoGenerate = false }: AIRecommendationsProps) {
  const { recommendations, loading, error, generateRecommendations } = useAIRecommendations()

  useEffect(() => {
    if (autoGenerate) {
      generateRecommendations(reportData)
    }
  }, [autoGenerate])

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'border-red-200 bg-red-50'
      case 'medium':
        return 'border-yellow-200 bg-yellow-50'
      case 'low':
        return 'border-blue-200 bg-blue-50'
      default:
        return 'border-gray-200 bg-gray-50'
    }
  }

  const getPriorityBadge = (priority: string) => {
    const badges = {
      high: 'bg-red-100 text-red-700',
      medium: 'bg-yellow-100 text-yellow-700',
      low: 'bg-blue-100 text-blue-700'
    }
    const labels = {
      high: 'Alta Prioridad',
      medium: 'Prioridad Media',
      low: 'Baja Prioridad'
    }
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${badges[priority as keyof typeof badges]}`}>
        {labels[priority as keyof typeof labels]}
      </span>
    )
  }

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'inventory':
        return <AlertCircle size={18} className="text-orange-600" />
      case 'pricing':
        return <TrendingUp size={18} className="text-green-600" />
      case 'marketing':
        return <Lightbulb size={18} className="text-purple-600" />
      case 'operations':
        return <ChevronRight size={18} className="text-blue-600" />
      default:
        return <Sparkles size={18} className="text-gray-600" />
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-lg shadow-sm p-6 border-2 border-primary-100"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-r from-primary-600 to-purple-600 rounded-lg">
            <Sparkles size={24} className="text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Recomendaciones con IA</h3>
            <p className="text-sm text-gray-600">Insights generados automáticamente</p>
          </div>
        </div>

        {!autoGenerate && !loading && recommendations.length === 0 && (
          <button
            onClick={() => generateRecommendations(reportData)}
            className="btn-primary btn-sm flex items-center gap-2"
          >
            <Sparkles size={16} />
            Generar
          </button>
        )}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Loader className="animate-spin text-primary-600 mx-auto mb-3" size={32} />
            <p className="text-gray-600">Analizando datos y generando recomendaciones...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <h4 className="font-medium text-red-900 mb-1">Error al generar recomendaciones</h4>
              <p className="text-sm text-red-700">{error}</p>
              <button
                onClick={() => generateRecommendations(reportData)}
                className="text-sm text-red-600 underline mt-2"
              >
                Intentar nuevamente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recommendations */}
      {!loading && !error && recommendations.length > 0 && (
        <div className="space-y-3">
          <AnimatePresence>
            {recommendations.map((rec, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`border-2 rounded-lg p-4 ${getPriorityColor(rec.priority)}`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-1">
                    {getCategoryIcon(rec.category)}
                  </div>

                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-semibold text-gray-800">{rec.title}</h4>
                      {getPriorityBadge(rec.priority)}
                    </div>

                    <p className="text-sm text-gray-700 leading-relaxed">
                      {rec.description}
                    </p>

                    {rec.actionable && (
                      <div className="mt-3 flex items-center gap-2 text-xs text-gray-600">
                        <ChevronRight size={14} />
                        <span className="font-medium">Acción recomendada</span>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && recommendations.length === 0 && !autoGenerate && (
        <div className="text-center py-8 text-gray-500">
          <Sparkles size={48} className="mx-auto mb-3 opacity-50" />
          <p>Haz clic en "Generar" para obtener recomendaciones inteligentes</p>
        </div>
      )}

      {/* Footer Info */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500 text-center">
          💡 Las recomendaciones son generadas por IA y deben ser evaluadas según tu contexto específico
        </p>
      </div>
    </motion.div>
  )
}
