// Fixes inventory rows whose stock is a barcode (>= 1,000,000) because one
// was scanned into a "Nuevo stock" / quantity box. For each row it finds the
// movement that jumped to the huge number and rebuilds the stock as
//   stock before that movement + every real movement after it
// (e.g. 24 -> 2750630985... then sold 2, sold 2, returned 2  =>  22).
// The correction is recorded as an ADJUSTMENT so it shows in the history.
//
// Dry run by default — prints what it would do and changes nothing:
//   node scripts/fix-barcode-quantities.mjs
// Apply:
//   node scripts/fix-barcode-quantities.mjs --apply
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const LIMIT = 1_000_000
const apply = process.argv.includes('--apply')

const rows = await prisma.inventory.findMany({
  where: { quantity: { gte: LIMIT } },
  select: {
    productId: true, branchId: true, quantity: true,
    product: { select: { name: true } },
    branch: { select: { name: true } },
  },
})

if (rows.length === 0) {
  console.log('No hay existencias >= 1,000,000. Nada que corregir.')
  await prisma.$disconnect()
  process.exit(0)
}

const admin = await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true }, select: { id: true, name: true } })
if (!admin) throw new Error('No se encontró un usuario ADMIN activo para registrar la corrección')

console.log(apply ? '=== APLICANDO CORRECCIONES ===' : '=== SIMULACIÓN (no se cambia nada; usa --apply para aplicar) ===')

let pending = 0
for (const row of rows) {
  const label = `${row.product.name} [${row.branch.name}]`
  const movements = await prisma.stockMovement.findMany({
    where: { productId: row.productId, branchId: row.branchId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, type: true, quantityBefore: true, quantityAfter: true, createdAt: true, reason: true },
  })
  // The LAST movement that crossed from a normal number to a huge one.
  const jumpIdx = movements.findLastIndex(m =>
    m.quantityBefore !== null && m.quantityAfter !== null &&
    Number(m.quantityBefore) < LIMIT && Number(m.quantityAfter) >= LIMIT)
  if (jumpIdx === -1) {
    console.log(`\n${label}: no se encontró el movimiento que causó el salto — revisar a mano, NO se corrige.`)
    continue
  }
  const jump = movements[jumpIdx]
  const after = movements.slice(jumpIdx + 1)
  if (after.some(m => m.quantityBefore === null || m.quantityAfter === null)) {
    console.log(`\n${label}: hay movimientos posteriores sin cantidades antes/después — revisar a mano, NO se corrige.`)
    continue
  }
  const laterDelta = after.reduce((s, m) => s + Number(m.quantityAfter) - Number(m.quantityBefore), 0)
  const corrected = Math.max(0, Number(jump.quantityBefore) + laterDelta)
  const current = Number(row.quantity)

  console.log(`\n${label}`)
  console.log(`  Salto: ${jump.createdAt.toISOString().slice(0, 16)} ${jump.type} ${Number(jump.quantityBefore)} -> ${Number(jump.quantityAfter)} (${jump.reason ?? ''})`)
  for (const m of after) {
    console.log(`  Después: ${m.createdAt.toISOString().slice(0, 16)} ${m.type} ${Number(m.quantityAfter) - Number(m.quantityBefore) >= 0 ? '+' : ''}${Number(m.quantityAfter) - Number(m.quantityBefore)}`)
  }
  console.log(`  Stock actual ${current} -> corregido ${corrected}`)
  pending++

  if (!apply) continue
  await prisma.$transaction(async tx => {
    // Only if nothing moved the stock since this script read it.
    const claimed = await tx.inventory.updateMany({
      where: { productId: row.productId, branchId: row.branchId, quantity: row.quantity },
      data: { quantity: corrected },
    })
    if (claimed.count === 0) throw new Error(`${label}: el stock cambió mientras se corregía — vuelve a correr el script`)
    await tx.stockMovement.create({
      data: {
        productId: row.productId,
        branchId: row.branchId,
        type: 'ADJUSTMENT',
        quantity: Math.abs(current - corrected),
        quantityBefore: current,
        quantityAfter: corrected,
        reason: `Corrección: código de barras ingresado como cantidad (movimiento ${jump.id})`,
        referenceId: `BAR-${jump.id}`.slice(0, 36),
        performedById: admin.id,
      },
    })
  })
  console.log('  ✔ corregido')
}

console.log(apply
  ? `\nListo. Ajustes registrados a nombre de ${admin.name}.`
  : `\n${pending} fila(s) por corregir. Revisa los números y corre con --apply.`)
console.log('Recomendado: hacer un conteo físico de estos productos para confirmar la existencia real.')
await prisma.$disconnect()
