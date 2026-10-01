/**
 * Full wipe of all Customer rows — for reloading a client's customer data
 * from scratch instead of patching it with find-duplicate-imports.ts.
 *
 * Refuses to delete anything if a real Sale, a real Quotation, or a branch's
 * "Cliente por defecto" still points at an existing customer — Customer has
 * no cascading delete anywhere (onDelete: NoAction on every relation to it),
 * so a blind DELETE would otherwise just fail loudly mid-statement with a
 * foreign key error; this checks first and explains why instead.
 *
 * Usage:
 *   npx tsx scripts/wipe-customers.ts            (report only, deletes nothing)
 *   npx tsx scripts/wipe-customers.ts --delete    (actually deletes — only if the report came back clean)
 */
import { prisma } from '../src/lib/prisma.js'

const shouldDelete = process.argv.includes('--delete')

async function main() {
  const totalCustomers = await prisma.customer.count()
  const salesWithCustomer = await prisma.sale.count({ where: { customerId: { not: null } } })
  const quotationsWithCustomer = await prisma.quotation.count()
  const branchesWithDefault = await prisma.branch.count({ where: { defaultCustomerId: { not: null } } })

  console.log(`Clientes actuales: ${totalCustomers}`)
  console.log(`Ventas con cliente asignado: ${salesWithCustomer}`)
  console.log(`Cotizaciones (siempre tienen cliente): ${quotationsWithCustomer}`)
  console.log(`Sucursales con cliente por defecto configurado: ${branchesWithDefault}`)

  if (salesWithCustomer > 0 || quotationsWithCustomer > 0 || branchesWithDefault > 0) {
    console.log('\n❌ No se puede borrar todo — hay datos reales que dependen de clientes existentes.')
    console.log('   Revisa a mano, o usa find-duplicate-imports.ts para limpiar solo los duplicados en vez de borrar todo.')
    await prisma.$disconnect()
    return
  }

  console.log('\n✅ Nada depende de los clientes actuales — es seguro borrar todo.')
  if (shouldDelete) {
    const result = await prisma.customer.deleteMany({})
    console.log(`✅ Borrados: ${result.count} clientes.`)
  } else {
    console.log('(Corre de nuevo con --delete para borrarlos de verdad.)')
  }
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
