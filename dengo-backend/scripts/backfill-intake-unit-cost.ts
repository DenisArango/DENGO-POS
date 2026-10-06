/**
 * Backfills StockMovement.unitCost for past Compras intakes (type IN,
 * referenceId starting with "INTAKE-") that predate this field — Purchases.tsx's
 * history list can now show a cost total per intake, but every intake made
 * before this feature shipped has unitCost = null, showing as "—" instead.
 *
 * This is a RECONSTRUCTION, not the exact value that was typed at that intake
 * — that was simply never recorded anywhere. It's derived from PriceHistory
 * (every Cost change for that product, with when it happened): for each old
 * movement, it finds what the product's cost was AT THAT MOMENT by walking
 * the price-change log backward from today. For a product whose cost has
 * never changed since, this is exact (today's cost = back then too). For one
 * that's changed multiple times, it should land on the right value for each
 * past intake's date — but if a batch was bought at a one-off negotiated
 * price that was never reflected as a lasting Product.cost change, this
 * script has no way to know that and will show the catalog price instead.
 * Good enough to fill in the gap, not a substitute for what was actually
 * paid in every single case.
 *
 * Usage:
 *   npx tsx scripts/backfill-intake-unit-cost.ts            (report only, writes nothing)
 *   npx tsx scripts/backfill-intake-unit-cost.ts --apply    (actually updates)
 */
import { prisma } from '../src/lib/prisma.js'

const shouldApply = process.argv.includes('--apply')

async function costAtTime(
  productId: string,
  at: Date,
  currentCost: number,
  historyByProduct: Map<string, { oldValue: number; newValue: number; createdAt: Date }[]>,
): Promise<number> {
  const history = historyByProduct.get(productId)
  if (!history || history.length === 0) return currentCost

  // history is sorted oldest → newest. Find the last change at or before `at`.
  let lastAtOrBefore: { oldValue: number; newValue: number; createdAt: Date } | undefined
  for (const h of history) {
    if (h.createdAt <= at) lastAtOrBefore = h
    else break
  }
  if (lastAtOrBefore) return lastAtOrBefore.newValue
  // `at` is before every recorded change — best guess is the cost right
  // before the earliest change we know about.
  return history[0]!.oldValue
}

async function main() {
  const movements = await prisma.stockMovement.findMany({
    where: { type: 'IN', referenceId: { startsWith: 'INTAKE-' }, unitCost: null },
    select: { id: true, productId: true, createdAt: true, referenceId: true },
    orderBy: { createdAt: 'asc' },
  })

  if (movements.length === 0) {
    console.log('No hay movimientos de ingreso sin costo que rellenar.')
    return
  }

  console.log(`${movements.length} movimiento(s) de ingreso sin costo encontrados.\n`)

  const productIds = Array.from(new Set(movements.map(m => m.productId)))
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, cost: true },
  })
  const productById = new Map(products.map(p => [p.id, p]))

  const historyRows = await prisma.priceHistory.findMany({
    where: { productId: { in: productIds }, field: 'Cost' },
    select: { productId: true, oldValue: true, newValue: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  const historyByProduct = new Map<string, { oldValue: number; newValue: number; createdAt: Date }[]>()
  for (const h of historyRows) {
    const list = historyByProduct.get(h.productId) ?? []
    list.push({ oldValue: Number(h.oldValue), newValue: Number(h.newValue), createdAt: h.createdAt })
    historyByProduct.set(h.productId, list)
  }

  let updated = 0
  let skippedNoProduct = 0
  for (const m of movements) {
    const product = productById.get(m.productId)
    if (!product) { skippedNoProduct++; continue }
    const reconstructed = await costAtTime(m.productId, m.createdAt, Number(product.cost), historyByProduct)
    console.log(
      `${shouldApply ? 'Actualizando' : '[reporte]'} ${m.referenceId} · ${product.name} · ` +
      `${m.createdAt.toISOString().slice(0, 10)} → costo reconstruido Q${reconstructed.toFixed(2)}`
    )
    if (shouldApply) {
      await prisma.stockMovement.update({ where: { id: m.id }, data: { unitCost: reconstructed } })
    }
    updated++
  }

  console.log(`\n${shouldApply ? 'Actualizados' : 'Se actualizarían'}: ${updated}`)
  if (skippedNoProduct > 0) console.log(`Omitidos (producto ya no existe): ${skippedNoProduct}`)
  if (!shouldApply) console.log('\nEsto fue solo un reporte — nada se guardó. Vuelve a correr con --apply para aplicar los cambios.')
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
