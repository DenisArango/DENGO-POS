// Read-only — modifies nothing.
//
// Explains the Inventario page's "Costo Total": lists the products that
// contribute the most (quantity x cost per branch) and flags the patterns
// that inflate it, with the stock movements and cost changes behind each:
//   CANTIDAD ENORME  quantity >= 1,000,000 — usually a barcode scanned into a
//                    quantity box (count, purchase, adjustment).
//   COSTO ENORME     cost >= 100,000 — usually a barcode typed into the cost.
//   COSTO > PRECIO   cost per unit above the sale price — usually a purchase
//                    of a presentation ("resma", "caja") whose cost was saved
//                    as the cost of ONE unit (fixed in this release).
//
//   node scripts/diagnose-inventory-value.mjs
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const fmt = n => 'Q' + Number(n).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const rows = await prisma.inventory.findMany({
  where: { product: { isActive: true } },
  select: {
    quantity: true, branchId: true,
    branch: { select: { name: true } },
    product: {
      select: {
        id: true, name: true, cost: true, basePrice: true, barcode: true,
        variations: { select: { name: true, conversionFactor: true, price: true } },
      },
    },
  },
})

const byBranch = new Map()
const enriched = rows.map(r => {
  const qty = Number(r.quantity)
  const cost = Number(r.product.cost)
  const price = Number(r.product.basePrice)
  const value = qty * cost
  const b = byBranch.get(r.branch.name) ?? { cost: 0, sale: 0 }
  b.cost += value; b.sale += qty * price
  byBranch.set(r.branch.name, b)
  const flags = []
  if (qty >= 1_000_000) flags.push('CANTIDAD ENORME')
  if (cost >= 100_000) flags.push('COSTO ENORME')
  if (price > 0 && cost > price) flags.push('COSTO > PRECIO')
  return { ...r, qty, cost, price, value, flags }
})

const total = enriched.reduce((s, r) => s + r.value, 0)
console.log('=== Costo total del inventario (productos activos) ===')
for (const [name, v] of byBranch) console.log(`  ${name.padEnd(28)} costo ${fmt(v.cost).padStart(22)}   venta ${fmt(v.sale).padStart(22)}`)
console.log(`  ${'TODAS'.padEnd(28)} costo ${fmt(total).padStart(22)}\n`)

const flagged = enriched.filter(r => r.flags.length)
const flaggedValue = flagged.reduce((s, r) => s + r.value, 0)
console.log(`=== ${flagged.length} fila(s) sospechosa(s) suman ${fmt(flaggedValue)} (${total ? ((flaggedValue / total) * 100).toFixed(1) : 0}% del total) ===`)
console.log(`    Sin ellas el costo total sería ${fmt(total - flaggedValue)}\n`)

const top = [...enriched].sort((a, b) => b.value - a.value).slice(0, 25)
console.log('=== 25 productos que más pesan en el costo total ===')
for (const r of top) {
  const vars = r.product.variations.map(v => `${v.name} x${Number(v.conversionFactor)} @${fmt(v.price)}`).join('; ')
  console.log(`${fmt(r.value).padStart(22)} | ${r.product.name} [${r.branch.name}] cant=${r.qty} costo=${fmt(r.cost)} precio=${fmt(r.price)}${r.flags.length ? '  <<< ' + r.flags.join(', ') : ''}`)
  if (vars) console.log(`${' '.repeat(25)}presentaciones: ${vars}`)
}

const toExplain = [...flagged].sort((a, b) => b.value - a.value).slice(0, 15)
if (toExplain.length) console.log('\n=== Detalle de las filas sospechosas (últimos movimientos y cambios de costo) ===')
for (const r of toExplain) {
  console.log(`\n--- ${r.product.name} [${r.branch.name}] — ${r.flags.join(', ')} — aporta ${fmt(r.value)}`)
  const moves = await prisma.stockMovement.findMany({
    where: { productId: r.product.id, branchId: r.branchId },
    orderBy: { createdAt: 'desc' }, take: 6,
    select: { createdAt: true, type: true, quantity: true, quantityBefore: true, quantityAfter: true, reason: true, referenceId: true, unitCost: true, performedBy: { select: { name: true } } },
  })
  for (const m of moves) {
    console.log(`    ${m.createdAt.toISOString().slice(0, 16).replace('T', ' ')} ${m.type.padEnd(10)} ${String(Number(m.quantityBefore)).padStart(10)} -> ${String(Number(m.quantityAfter)).padEnd(14)} ${m.performedBy?.name ?? ''} | ${m.referenceId ?? ''} ${m.unitCost != null ? 'costo ' + fmt(m.unitCost) : ''} ${m.reason ?? ''}`)
  }
  const costChanges = await prisma.priceHistory.findMany({
    where: { productId: r.product.id, field: 'Cost' }, orderBy: { createdAt: 'desc' }, take: 3,
    select: { createdAt: true, oldValue: true, newValue: true, changedBy: { select: { name: true } } },
  })
  for (const c of costChanges) {
    console.log(`    costo cambiado ${c.createdAt.toISOString().slice(0, 16).replace('T', ' ')}: ${fmt(c.oldValue)} -> ${fmt(c.newValue)} por ${c.changedBy?.name ?? '?'}`)
  }
}

await prisma.$disconnect()
