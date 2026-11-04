/**
 * Backfills the per-session totals columns on already-CLOSED cash registers
 * (TOTAL_SALES, SALES_COUNT, CASH_SALES, CARD_SALES, TRANSFER_SALES). Until
 * the close endpoint started writing them (see totalsColumns in
 * routes/cash-registers.ts) every close left them at 0, so Reportes → Flujo
 * de caja and the AI's cash questions showed Q0.00 for every real session.
 *
 * Recomputes each session with the same computeSales() the close itself
 * uses, so the result matches what "Efectivo esperado" showed at close time.
 * Only touches CLOSED sessions; safe to re-run (it just rewrites the same
 * numbers).
 *
 * Usage:
 *   npx tsx scripts/backfill-register-totals.ts            (report only, writes nothing)
 *   npx tsx scripts/backfill-register-totals.ts --apply    (actually updates)
 */
import { prisma } from '../src/lib/prisma.js'
import { computeSales, totalsColumns } from '../src/routes/cash-registers.js'

const shouldApply = process.argv.includes('--apply')

async function main() {
  const sessions = await prisma.cashRegister.findMany({
    where: { status: 'CLOSED' },
    select: { id: true, branchId: true, name: true, openedAt: true, closedAt: true, totalSales: true, salesCount: true },
    orderBy: { openedAt: 'asc' },
  })

  let changed = 0
  let grandTotal = 0
  for (const s of sessions) {
    const cols = totalsColumns(await computeSales(s.branchId, s.openedAt, s.closedAt, s.id))
    if (Math.abs(Number(s.totalSales) - cols.totalSales) < 0.005 && s.salesCount === cols.salesCount) continue
    changed++
    grandTotal += cols.totalSales
    console.log(`${s.openedAt.toISOString().slice(0, 10)}  ${s.name}  Q${Number(s.totalSales).toFixed(2)} → Q${cols.totalSales.toFixed(2)} (${cols.salesCount} ventas)`)
    if (shouldApply) await prisma.cashRegister.update({ where: { id: s.id }, data: cols })
  }

  console.log(`\n${sessions.length} cajas cerradas revisadas, ${changed} con totales distintos (Q${grandTotal.toFixed(2)} en ventas).`)
  console.log(shouldApply ? 'Actualizadas.' : 'Solo reporte — corre con --apply para guardar.')
}

main().finally(() => prisma.$disconnect())
