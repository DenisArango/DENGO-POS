// Cost of a sold line, for every profit figure (Dashboard, reports, AI).
//
// SaleItem.unitCost freezes the cost of ONE sold unit (product cost ×
// presentation factor) at sale time, so later edits to a product's cost never
// rewrite past profit. Lines sold before that column existed have it null —
// for those the product's current cost is the only number there is.

import { prisma } from './prisma.js'
import { getConversionFactors } from '../services/inventory.service.js'

type CostItem = {
  unitCost?: unknown
  quantity: unknown
  product?: { cost?: unknown } | null
  variation?: { conversionFactor?: unknown } | null
}

/** Cost of one sold unit of this line (already × the presentation factor). */
export function saleUnitCost(item: CostItem): number {
  if (item.unitCost != null) return Number(item.unitCost)
  return Number(item.product?.cost ?? 0) * Number(item.variation?.conversionFactor ?? 1)
}

/** Total cost of the line: unit cost × quantity sold. */
export function saleLineCost(item: CostItem): number {
  return saleUnitCost(item) * Number(item.quantity)
}

/** Cost per BASE unit (what the product's "costo" field means), for display. */
export function saleBaseUnitCost(item: CostItem): number {
  const factor = Number(item.variation?.conversionFactor ?? 1) || 1
  return saleUnitCost(item) / factor
}

// Cost of one sold unit of each line right now (product cost × presentation
// factor), keyed "productId:variationId" — frozen into SaleItem.unitCost so
// later cost edits don't rewrite this sale's profit.
export async function currentUnitCosts(items: { productId: string; variationId?: string | undefined }[]) {
  const [products, factors] = await Promise.all([
    prisma.product.findMany({ where: { id: { in: items.map(i => i.productId) } }, select: { id: true, cost: true } }),
    getConversionFactors(items.map(i => i.variationId)),
  ])
  const costById = new Map(products.map(p => [p.id, Number(p.cost ?? 0)]))
  return new Map(items.map(i => [
    `${i.productId}:${i.variationId ?? ''}`,
    (costById.get(i.productId) ?? 0) * (i.variationId ? (factors.get(i.variationId) ?? 1) : 1),
  ]))
}
