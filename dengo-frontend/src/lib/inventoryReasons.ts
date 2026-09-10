// Shared between Inventory.tsx's manual stock adjustment and POS.tsx's
// inline "not enough stock, adjust now?" prompt — kept in its own module
// (not exported from either page) so importing it doesn't drag one lazy-
// loaded route's whole bundle into the other's chunk.
//
// Reasons are configurable (Configuración → Motivos de Ajuste), not a fixed
// list in code — and direction-specific: a reason tagged UP only shows when
// stock is increasing, DOWN only when decreasing, so "Rotura/Daño" can never
// be picked while adding stock and "Ajuste inicial" can never be picked
// while removing it. Cached locally (same pattern as everything else this
// app keeps working offline) so the adjustment flow — including the "no
// stock in the system but it's sitting right there" case, which is
// specifically an UP adjustment — still works without a live connection.
import { api } from './api'
import { getCache, setCache } from './offlineDb'

export interface AdjustmentReason {
  id: string
  label: string
  direction: 'UP' | 'DOWN'
  sortOrder: number
}

function cacheKey(direction: 'UP' | 'DOWN'): string {
  return `adjustmentReasons-${direction}`
}

export async function getAdjustmentReasons(direction: 'UP' | 'DOWN'): Promise<AdjustmentReason[]> {
  try {
    const reasons = await api.get<AdjustmentReason[]>(`/api/inventory-reasons?direction=${direction}`)
    await setCache(cacheKey(direction), reasons)
    return reasons ?? []
  } catch {
    const cached = await getCache<AdjustmentReason[]>(cacheKey(direction))
    return cached ?? []
  }
}
