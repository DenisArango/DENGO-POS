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

const realVariationItems = items.filter(i => Number(i.variation?.conversionFactor ?? 1) !== 1)

if (realVariationItems.length === 0) {
  console.log(`No se encontraron ventas con variaciones de factor != 1 en los últimos ${days} días.`)
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
