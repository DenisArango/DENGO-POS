/**
 * Backfills SaleItem.unitCost for sales made before that column existed, so
 * their profit stops moving every time a product's cost is edited.
 *
 * Like backfill-intake-unit-cost.ts this is a RECONSTRUCTION: the cost at the
 * moment of each old sale was never stored, so it's derived from PriceHistory
 * (every 'Cost' change with its date) — for each line, the product's cost as
 * of the sale's date, × the presentation's conversion factor. A product whose
 * cost never changed gets exactly today's cost (which is what reports already
 * show for it). Only lines with unitCost = null are touched; safe to re-run.
 *
 * Usage:
 *   npx tsx scripts/backfill-sale-unit-cost.ts            (report only, writes nothing)
 *   npx tsx scripts/backfill-sale-unit-cost.ts --apply    (actually updates)
 */
import { prisma } from '../src/lib/prisma.js'

const shouldApply = process.argv.includes('--apply')
const BATCH = 2000

type Change = { oldValue: number; newValue: number; createdAt: Date }

function costAtTime(at: Date, currentCost: number, history: Change[] | undefined): number {
  if (!history || history.length === 0) return currentCost
  let last: Change | undefined
  for (const h of history) {
    if (h.createdAt <= at) last = h
    else break
  }
  // Before every recorded change: the cost right before the earliest one.
  return last ? last.newValue : history[0]!.oldValue
}

async function main() {
  const pending = await prisma.saleItem.count({ where: { unitCost: null } })
  if (pending === 0) {
    console.log('Todas las líneas de venta ya tienen su costo guardado.')
    return
  }
  console.log(`${pending} línea(s) de venta sin costo guardado.`)

  const products = await prisma.product.findMany({ select: { id: true, cost: true } })
  const costById = new Map(products.map(p => [p.id, Number(p.cost ?? 0)]))
  const historyRows = await prisma.priceHistory.findMany({
    where: { field: 'Cost' },
    select: { productId: true, oldValue: true, newValue: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  const historyByProduct = new Map<string, Change[]>()
  for (const h of historyRows) {
    const list = historyByProduct.get(h.productId) ?? []
    list.push({ oldValue: Number(h.oldValue), newValue: Number(h.newValue), createdAt: h.createdAt })
    historyByProduct.set(h.productId, list)
  }
  console.log(`${historyByProduct.size} producto(s) con cambios de costo registrados; el resto usa su costo actual.`)

  let done = 0
  let fromHistory = 0
  let cursor: string | undefined
  for (;;) {
    const items = await prisma.saleItem.findMany({
      where: { unitCost: null },
      select: { id: true, productId: true, sale: { select: { createdAt: true } }, variation: { select: { conversionFactor: true } } },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    })
    if (items.length === 0) break
    cursor = items[items.length - 1]!.id

    if (shouldApply) {
      await prisma.$transaction(items.map(item => {
        const history = historyByProduct.get(item.productId)
        if (history) fromHistory++
        const base = costAtTime(item.sale.createdAt, costById.get(item.productId) ?? 0, history)
        return prisma.saleItem.update({
          where: { id: item.id },
          data: { unitCost: base * Number(item.variation?.conversionFactor ?? 1) },
        })
      }))
    } else {
      fromHistory += items.filter(i => historyByProduct.has(i.productId)).length
    }
    done += items.length
    // With --apply the updated rows drop out of `unitCost: null`, so restart
    // from the beginning of what's left instead of paging past it.
    if (shouldApply) cursor = undefined
    process.stdout.write(`\r${done}/${pending}`)
  }

  console.log(`\n${done} línea(s) ${shouldApply ? 'actualizadas' : 'por actualizar'} (${fromHistory} reconstruidas con el historial de costos).`)
  if (!shouldApply) console.log('Solo reporte — corre con --apply para guardar.')
}

main().finally(() => prisma.$disconnect())
