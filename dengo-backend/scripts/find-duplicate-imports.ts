/**
 * One-off diagnostic + cleanup for the customer-duplication bug in
 * import-loyverse.ts (fixed — see git history): before the fix, re-running
 * --customers= against a file that had already been imported created a full
 * second copy of every customer, with NIT collisions resolved by appending
 * "-2"/"-3"/... instead of recognizing the row as already imported.
 *
 * Usage (read-only report, always run this first):
 *   npx tsx scripts/find-duplicate-imports.ts
 *
 * Usage (actually deletes the confirmed-safe duplicates):
 *   npx tsx scripts/find-duplicate-imports.ts --delete
 *
 * What counts as a "safe" duplicate to auto-delete: two customers with the
 * EXACT SAME name where one's NIT is exactly the other's NIT plus a numeric
 * suffix ("12345678" / "12345678-2"), AND the suffixed one has never been
 * used in a real sale (Sale.customerId) and isn't set as any branch's
 * default customer. Anything that doesn't meet all of that is only
 * reported, never deleted automatically — including genuine same-file NIT
 * collisions between two actually-different people/businesses, which the
 * script (correctly) cannot tell apart from a re-import artifact by name
 * alone if their names also happen to differ.
 *
 * Also reports (and, with --delete, removes) customers whose name is purely
 * numeric — a phone number or internal code that ended up in the name
 * column by mistake during export, not an actual person/business name.
 *
 * Suppliers are checked too (same "exact name repeated" signal), but as a
 * sanity check only — the supplier importer already matched-and-skipped by
 * name from the start, so this should normally report zero.
 */
import { prisma } from '../src/lib/prisma.js'

const shouldDelete = process.argv.includes('--delete')

// Matches "12345678" vs "12345678-2", or "SIN-NIT-C123" vs "SIN-NIT-C123-2".
function isSuffixOf(base: string, maybeSuffixed: string): boolean {
  return new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+$`).test(maybeSuffixed)
}

async function checkCustomers() {
  const customers = await prisma.customer.findMany({
    select: { id: true, name: true, nit: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  const byName = new Map<string, typeof customers>()
  for (const c of customers) {
    const key = c.name.trim().toLowerCase()
    if (!byName.has(key)) byName.set(key, [])
    byName.get(key)!.push(c)
  }

  const safeDuplicateIds: string[] = []
  let groupsWithSameName = 0
  let unclearGroups = 0

  for (const [, group] of byName) {
    if (group.length < 2) continue
    groupsWithSameName++

    // A name-group can contain MULTIPLE distinct people who happen to share
    // the same name (e.g. two different "AGRIPINA" customers, each with
    // their own SIN-NIT placeholder) — each one independently duplicated by
    // the bug. So pair row-by-row (whose NIT is some OTHER row's NIT + "-N")
    // instead of assuming the whole group has a single original — that
    // earlier assumption silently skipped exactly this case.
    const sorted = [...group].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    const pairs: { original: typeof sorted[number]; dupe: typeof sorted[number] }[] = []
    for (const candidate of sorted) {
      const match = sorted.find(c => c.id !== candidate.id && isSuffixOf(c.nit, candidate.nit))
      if (match) pairs.push({ original: match, dupe: candidate })
    }
    const pairedIds = new Set(pairs.flatMap(p => [p.original.id, p.dupe.id]))
    const unmatched = sorted.filter(c => !pairedIds.has(c.id))

    if (pairs.length) {
      console.log(`\n"${sorted[0]!.name}" — ${pairs.length} duplicado(s) identificado(s):`)
      for (const { original, dupe } of pairs) {
        console.log(`   original NIT ${original.nit} (creado ${original.createdAt.toISOString()}) ← duplicado NIT ${dupe.nit} (creado ${dupe.createdAt.toISOString()})`)
      }
      safeDuplicateIds.push(...pairs.map(p => p.dupe.id))
    }
    if (unmatched.length) {
      unclearGroups++
      console.log(`\n⚠️  "${sorted[0]!.name}" — ${unmatched.length} fila(s) con el mismo nombre pero sin un NIT que las relacione (revisar a mano):`)
      for (const c of unmatched) console.log(`   NIT ${c.nit} (creado ${c.createdAt.toISOString()})`)
    }
  }

  console.log(`\n--- Clientes ---`)
  console.log(`Grupos con nombre repetido: ${groupsWithSameName} (${unclearGroups} no siguen el patrón esperado, revisar a mano)`)
  console.log(`Duplicados "seguros" identificados (mismo nombre, NIT = original + sufijo): ${safeDuplicateIds.length}`)

  if (safeDuplicateIds.length === 0) return

  // Safety check: never delete a customer with real sales or that's set as a branch's default.
  const withSales = await prisma.sale.findMany({ where: { customerId: { in: safeDuplicateIds } }, select: { customerId: true }, distinct: ['customerId'] })
  const withSalesSet = new Set(withSales.map(s => s.customerId).filter((id): id is string => !!id))
  const asDefault = await prisma.branch.findMany({ where: { defaultCustomerId: { in: safeDuplicateIds } }, select: { defaultCustomerId: true } })
  const asDefaultSet = new Set(asDefault.map(b => b.defaultCustomerId).filter((id): id is string => !!id))

  const blocked = safeDuplicateIds.filter(id => withSalesSet.has(id) || asDefaultSet.has(id))
  const deletable = safeDuplicateIds.filter(id => !withSalesSet.has(id) && !asDefaultSet.has(id))

  if (blocked.length) {
    console.log(`\n⚠️  ${blocked.length} de esos duplicados NO se van a borrar — ya tienen una venta real o son el cliente por defecto de alguna sucursal. Revísalos a mano.`)
  }
  console.log(`\n${deletable.length} duplicados listos para borrar de forma segura.`)

  if (shouldDelete && deletable.length) {
    const result = await prisma.customer.deleteMany({ where: { id: { in: deletable } } })
    console.log(`✅ Borrados: ${result.count} clientes duplicados.`)
  } else if (deletable.length) {
    console.log('(Corre de nuevo con --delete para borrarlos de verdad — esto fue solo un reporte.)')
  }
}

// Names that are purely numbers (with no letters at all) usually mean a
// phone number, a Loyverse internal code, or some other non-name value
// ended up in the "Nombre (s)" column of the customer export by mistake.
async function checkNumericNames() {
  const customers = await prisma.customer.findMany({ select: { id: true, name: true, nit: true } })
  const numericOnly = customers.filter(c => /^[\d\s.\-()]+$/.test(c.name.trim()) && c.name.trim().length > 0)

  console.log(`\n--- Clientes con nombre solo numérico ---`)
  console.log(`Encontrados: ${numericOnly.length}`)
  for (const c of numericOnly.slice(0, 30)) console.log(`  "${c.name}" (NIT ${c.nit})`)
  if (numericOnly.length > 30) console.log(`  ... y ${numericOnly.length - 30} más`)

  if (numericOnly.length === 0) return

  const ids = numericOnly.map(c => c.id)
  const withSales = await prisma.sale.findMany({ where: { customerId: { in: ids } }, select: { customerId: true }, distinct: ['customerId'] })
  const withSalesSet = new Set(withSales.map(s => s.customerId).filter((id): id is string => !!id))
  const asDefault = await prisma.branch.findMany({ where: { defaultCustomerId: { in: ids } }, select: { defaultCustomerId: true } })
  const asDefaultSet = new Set(asDefault.map(b => b.defaultCustomerId).filter((id): id is string => !!id))

  const blocked = ids.filter(id => withSalesSet.has(id) || asDefaultSet.has(id))
  const deletable = ids.filter(id => !withSalesSet.has(id) && !asDefaultSet.has(id))

  if (blocked.length) {
    console.log(`\n⚠️  ${blocked.length} de esos NO se van a borrar — ya tienen una venta real o son el cliente por defecto de alguna sucursal. Revísalos a mano.`)
  }
  console.log(`${deletable.length} listos para borrar de forma segura.`)

  if (shouldDelete && deletable.length) {
    const result = await prisma.customer.deleteMany({ where: { id: { in: deletable } } })
    console.log(`✅ Borrados: ${result.count} clientes con nombre solo numérico.`)
  } else if (deletable.length) {
    console.log('(Corre de nuevo con --delete para borrarlos de verdad.)')
  }
}

async function checkSuppliers() {
  const suppliers = await prisma.supplier.findMany({ select: { id: true, name: true, code: true, createdAt: true } })
  const byName = new Map<string, typeof suppliers>()
  for (const s of suppliers) {
    const key = s.name.trim().toLowerCase()
    if (!byName.has(key)) byName.set(key, [])
    byName.get(key)!.push(s)
  }
  const dupGroups = [...byName.entries()].filter(([, g]) => g.length > 1)
  console.log(`\n--- Proveedores ---`)
  console.log(`Nombres repetidos: ${dupGroups.length}`)
  for (const [, group] of dupGroups.slice(0, 30)) {
    console.log(`  "${group[0]!.name}" aparece ${group.length} veces (códigos: ${group.map(g => g.code).join(', ')})`)
  }
  if (dupGroups.length > 30) console.log(`  ... y ${dupGroups.length - 30} más`)
}

async function main() {
  console.log(shouldDelete ? '⚠️  MODO BORRADO — se van a eliminar los duplicados confirmados\n' : '🔍 Solo reporte — nada se borra todavía (corre con --delete para borrar)\n')
  await checkCustomers()
  await checkNumericNames()
  await checkSuppliers()
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
