// Shared branch-wide monthly sales goal progress bar — shown on the
// Dashboard (bigger card) and in the POS (compact strip) so the whole team
// sees the same number move, not just whoever configured it. Renders
// nothing when the branch has no goal set for the current month, so pages
// that embed it don't need to know or care whether one exists.
import { useEffect, useState } from 'react'
import { Target } from 'lucide-react'
import { api } from '../lib/api'

interface GoalProgress {
  targetAmount: number | null
  currentAmount: number
  percent: number | null
}

export default function SalesGoalWidget({ branchId, compact = false }: { branchId: string; compact?: boolean }) {
  const [progress, setProgress] = useState<GoalProgress | null>(null)

  useEffect(() => {
    if (!branchId) return
    api.get<GoalProgress>(`/api/goals?branchId=${branchId}`)
      .then(setProgress)
      .catch(() => {
        // Non-critical — the widget just doesn't show if the goal can't be fetched
      })
  }, [branchId])

  if (!progress || progress.targetAmount == null) return null

  const percent = Math.min(100, progress.percent ?? 0)
  const reached = percent >= 100

  if (compact) {
    return (
      <div className="bg-white rounded-lg shadow-sm px-4 py-2.5 border border-gray-100 flex items-center gap-3">
        <Target size={16} className={reached ? 'text-green-600' : 'text-primary-600'} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-500">Meta del mes</span>
            <span className={`font-semibold ${reached ? 'text-green-600' : 'text-gray-700'}`}>
              Q{progress.currentAmount.toLocaleString('es-GT', { maximumFractionDigits: 0 })} / Q{progress.targetAmount.toLocaleString('es-GT', { maximumFractionDigits: 0 })} ({percent.toFixed(0)}%)
            </span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full transition-all ${reached ? 'bg-green-500' : 'bg-primary-600'}`} style={{ width: `${percent}%` }} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-gray-500 flex items-center gap-1.5">
          <Target size={15} className="text-primary-600" /> Meta del Mes
        </p>
        <span className={`text-sm font-bold ${reached ? 'text-green-600' : 'text-gray-700'}`}>{percent.toFixed(0)}%</span>
      </div>
      <div className="h-3 bg-gray-100 rounded-full overflow-hidden mb-2">
        <div className={`h-full transition-all ${reached ? 'bg-green-500' : 'bg-primary-600'}`} style={{ width: `${percent}%` }} />
      </div>
      <div className="flex justify-between text-xs text-gray-500">
        <span>Q{progress.currentAmount.toLocaleString('es-GT', { minimumFractionDigits: 2 })}</span>
        <span>Meta: Q{progress.targetAmount.toLocaleString('es-GT', { minimumFractionDigits: 2 })}</span>
      </div>
      {reached && <p className="text-xs text-green-600 font-medium mt-2">¡Meta alcanzada!</p>}
    </div>
  )
}
