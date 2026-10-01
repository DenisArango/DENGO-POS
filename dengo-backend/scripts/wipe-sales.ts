/**
 * Full reset of all transactional/operational data — sales, cash register
 * sessions, quotations, stock transfers, stock-movement history, and the
 * portal-order chain that hangs off quotations. Leaves every piece of
 * "configuración" untouched: Branches, Users/Roles, Products, Categories,
 * Suppliers, cash register DEFINITIONS (the fixed named list per branch —
 * only actual opened/closed sessions are wiped), inventory quantities.
 * Customers are NOT touched here either — this script exists specifically
 * to clear what blocks wipe-customers.ts (real sales/quotations, and each
 * branch's "cliente por defecto" pointer), so you can reload customers
 * clean afterward.
 *
 * Deletes in dependency order (every FK in this schema is NoAction, nothing
 * cascades) inside one transaction — either it all goes through or nothing
 * does:
 *   PortalOrderGrade/PortalMessage/PortalOrderItem → PortalOrder →
 *   QuotationItem → Quotation → CreditPayment → SaleItem → Sale →
 *   CashMovement → CashRegister → StockMovement → TransferItem → Transfer
 * Branch.defaultCustomerId is cleared too (not deleted — the branch row
 * itself is config and stays), since it would otherwise block the
 * customer wipe that's the whole point of running this.
 *
 * Usage:
 *   npx tsx scripts/wipe-sales.ts            (report only, deletes nothing)
 *   npx tsx scripts/wipe-sales.ts --delete    (actually deletes)
 */
import { prisma } from '../src/lib/prisma.js'

const shouldDelete = process.argv.includes('--delete')

async function main() {
  const counts = {
    ventas: await prisma.sale.count(),
    itemsDeVenta: await prisma.saleItem.count(),
    abonos: await prisma.creditPayment.count(),
    cotizaciones: await prisma.quotation.count(),
    sesionesDeCaja: await prisma.cashRegister.count(),
    movimientosDeCaja: await prisma.cashMovement.count(),
    movimientosDeInventario: await prisma.stockMovement.count(),
    traslados: await prisma.transfer.count(),
    pedidosDePortal: await prisma.portalOrder.count(),
  }

  console.log('Se va a borrar:')
  for (const [label, n] of Object.entries(counts)) console.log(`  ${label}: ${n}`)
  console.log('\nSe deja intacto: sucursales, usuarios/roles, productos, categorías, proveedores, existencias (inventario), cajas registradoras DEFINIDAS (solo se borran las sesiones abiertas/cerradas).')
  console.log('También se limpia el "cliente por defecto" de cada sucursal, para que luego puedas borrar/recargar clientes sin que nada lo bloquee.')

  if (!shouldDelete) {
    console.log('\n(Corre de nuevo con --delete para borrar de verdad.)')
    await prisma.$disconnect()
    return
  }

  await prisma.$transaction([
    prisma.branch.updateMany({ data: { defaultCustomerId: null } }),
    prisma.portalOrderGrade.deleteMany({}),
    prisma.portalMessage.deleteMany({}),
    prisma.portalOrderItem.deleteMany({}),
    prisma.portalOrder.deleteMany({}),
    prisma.quotationItem.deleteMany({}),
    prisma.quotation.deleteMany({}),
    prisma.creditPayment.deleteMany({}),
    prisma.saleItem.deleteMany({}),
    prisma.sale.deleteMany({}),
    prisma.cashMovement.deleteMany({}),
    prisma.cashRegister.deleteMany({}),
    prisma.stockMovement.deleteMany({}),
    prisma.transferItem.deleteMany({}),
    prisma.transfer.deleteMany({}),
  ])

  console.log('\n✅ Listo — ventas, cajas, cotizaciones, traslados y movimientos de inventario borrados. La configuración quedó intacta.')
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
