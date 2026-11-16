// Read-only diagnostic — does NOT modify any data.
//
// Finds sales in the last N days that used a real variation (conversionFactor
// != 1) and checks whether the matching StockMovement actually decremented
// stock by quantity * conversionFactor, or just by the raw quantity (the bug
// we're hunting). Run on the server with:
//   node scripts/check-variation-conversion.mjs [days]
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const days = Number(process.argv[2] ?? 14)
const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

const items = await prisma.saleItem.findMany({
  where: {
    variationId: { not: null },
    sale: { createdAt: { gte: since } },
  },
  include: {
    sale: { select: { id: true, invoiceNumber: true, createdAt: true, branchId: true, isVoided: true } },
    product: { select: { name: true } },
    variation: { select: { id: true, name: true, conversionFactor: true } },
  },
  orderBy: { sale: { createdAt: 'desc' } },
})

// ── 1) Presentaciones guardadas con factor 1 que parecen traer varias unidades
// (precio distinto del base, o nombre de empaque/número). Venderlas descuenta
// solo 1 unidad base: la causa más común de "la variación se vende como base".
const suspicious = await prisma.productVariation.findMany({
  where: { conversionFactor: 1, product: { isActive: true } },
  select: { id: true, name: true, price: true, createdAt: true, product: { select: { name: true, basePrice: true } }, _count: { select: { saleItems: true } } },
})
const PACK = /(caja|paquete|pqt|resma|docena|ciento|fardo|blister|bolsa|display|six|x\s*\d+|\d+\s*(u|und|unid|hojas|pzas|piezas))/i
const flagged = suspicious.filter(v => PACK.test(v.name) || Math.abs(Number(v.price) - Number(v.product.basePrice)) > 0.009)
console.log(`Presentaciones con factor 1 que parecen traer varias unidades: ${flagged.length}`)
for (const v of flagged) {
  console.log(`  ${v.product.name} → "${v.name}" | precio Q${Number(v.price).toFixed(2)} (base Q${Number(v.product.basePrice).toFixed(2)}) | ventas: ${v._count.saleItems} | creada ${v.createdAt.toISOString().slice(0, 10)}`)
}
console.log('')

const realVariationItems = items.filter(i => Number(i.variation?.conversionFactor ?? 1) !== 1)

if (realVariationItems.length === 0) {
  console.log(`No se encontraron ventas con variaciones de factor != 1 en los últimos ${days} días.`)
  await prisma.$disconnect()
  process.exit(0)
}

console.log(`Revisando ${realVariationItems.length} línea(s) de venta con variación de conversión != 1 (últimos ${days} días)\n`)

let mismatches = 0
for (const item of realVariationItems) {
  const convFactor = Number(item.variation.conversionFactor)
  const qty = Number(item.quantity)
  const expectedDelta = qty * convFactor

  const movement = await prisma.stockMovement.findFirst({
    where: { referenceId: item.sale.id, productId: item.productId, type: 'SALE' },
  })

  const actualDelta = movement ? Number(movement.quantity) : null
  const ok = actualDelta === expectedDelta

  if (!ok) mismatches++

  console.log(
    `${ok ? 'OK  ' : 'MISMATCH'} | Factura ${item.sale.invoiceNumber ?? item.sale.id} | ${item.product.name} (${item.variation.name}, factor x${convFactor}) | ` +
    `cantidad vendida: ${qty} | esperado: -${expectedDelta} unidades base | movimiento real: ${movement ? `-${actualDelta}` : 'NO ENCONTRADO'}` +
    `${item.sale.isVoided ? ' [VENTA ANULADA]' : ''}`
  )
}

console.log(`\n${mismatches} de ${realVariationItems.length} líneas con discrepancia.`)
await prisma.$disconnect()
