/**
 * Creates a 0-quantity Inventory row for every (active product, active
 * branch) pair that doesn't have one yet. Until now, a product only ever
 * got an Inventory row the first time stock moved for it at a given branch
 * (an intake, a transfer, a manual adjustment) — one that was created but
 * never stocked anywhere had NO Inventory rows at all, which made it
 * invisible on the Inventario page (its list query is driven FROM the
 * Inventory table via a JOIN, so a product with zero rows has nothing to
 * join against — it should show up with 0, not disappear).
 *
 * POST /api/products now seeds these rows at creation time, so this script
 * is only needed once, to backfill products that already existed before
 * that fix shipped.
 *
 * Usage:
 *   npx tsx scripts/backfill-missing-inventory-rows.ts            (report only, writes nothing)
 *   npx tsx scripts/backfill-missing-inventory-rows.ts --apply    (actually creates the rows)
 */
import { prisma } from '../src/lib/prisma.js'

const shouldApply = process.argv.includes('--apply')

async function main() {
  const [products, branches, existing] = await Promise.all([
    prisma.product.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
    prisma.branch.findMany({ where: { status: 'active' }, select: { id: true, name: true } }),
    prisma.inventory.findMany({ select: { productId: true, branchId: true } }),
  ])

  const existingKeys = new Set(existing.map(i => `${i.productId}:${i.branchId}`))
  const missing: { productId: string; branchId: string }[] = []
  for (const p of products) {
    for (const b of branches) {
      if (!existingKeys.has(`${p.id}:${b.id}`)) missing.push({ productId: p.id, branchId: b.id })
    }
  }

  if (missing.length === 0) {
    console.log('Todos los productos activos ya tienen fila de inventario en todas las sucursales activas.')
    return
  }

  const productById = new Map(products.map(p => [p.id, p]))
  const branchById = new Map(branches.map(b => [b.id, b]))
  console.log(`${missing.length} fila(s) de inventario faltantes encontradas:\n`)
  for (const m of missing) {
    console.log(`${shouldApply ? 'Creando' : '[reporte]'} ${productById.get(m.productId)?.name} — ${branchById.get(m.branchId)?.name} → 0`)
  }

  if (shouldApply) {
    const result = await prisma.inventory.createMany({
      data: missing.map(m => ({ productId: m.productId, branchId: m.branchId, quantity: 0 })),
      skipDuplicates: true,
    })
    console.log(`\nCreadas: ${result.count}`)
  } else {
    console.log(`\nSe crearían: ${missing.length}`)
    console.log('Esto fue solo un reporte — nada se guardó. Vuelve a correr con --apply para aplicar los cambios.')
  }
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
