/**
 * Deletes InventoryCount (+ their InventoryCountItem rows) older than 3
 * months. Conteos are a point-in-time snapshot used to reconcile stock —
 * once an old one's adjustments have already been applied (they post to
 * StockMovement/Inventory independently, see inventory-counts.ts), the count
 * record itself has no ongoing purpose and keeping every one forever just
 * grows the table. Meant to run periodically (e.g. a monthly cron via SSH —
 * there's no in-app scheduler) rather than once.
 *
 * Anchored on createdAt, not completedAt: an abandoned IN_PROGRESS count from
 * 4+ months ago is equally stale and should go too.
 *
 * Usage:
 *   npx tsx scripts/cleanup-old-inventory-counts.ts            (report only, deletes nothing)
 *   npx tsx scripts/cleanup-old-inventory-counts.ts --apply    (actually deletes)
 */
import { prisma } from '../src/lib/prisma.js'

const shouldApply = process.argv.includes('--apply')
const RETENTION_MONTHS = 3

async function main() {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - RETENTION_MONTHS)

  const stale = await prisma.inventoryCount.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { id: true, branchId: true, status: true, createdAt: true, _count: { select: { items: true } } },
    orderBy: { createdAt: 'asc' },
  })

  if (stale.length === 0) {
    console.log(`No inventory counts older than ${RETENTION_MONTHS} months (cutoff ${cutoff.toISOString()}).`)
    return
  }

  console.log(`Found ${stale.length} inventory count(s) older than ${RETENTION_MONTHS} months (cutoff ${cutoff.toISOString()}):`)
  for (const c of stale) {
    console.log(`  - ${c.id} | branch ${c.branchId} | ${c.status} | ${c.createdAt.toISOString()} | ${c._count.items} item(s)`)
  }

  if (!shouldApply) {
    console.log('\nDry run only — rerun with --apply to delete these.')
    return
  }

  const ids = stale.map(c => c.id)
  const { count: itemsDeleted } = await prisma.inventoryCountItem.deleteMany({ where: { countId: { in: ids } } })
  const { count: countsDeleted } = await prisma.inventoryCount.deleteMany({ where: { id: { in: ids } } })
  console.log(`\nDeleted ${countsDeleted} count(s) and ${itemsDeleted} item(s).`)
}

main()
  .catch(err => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
