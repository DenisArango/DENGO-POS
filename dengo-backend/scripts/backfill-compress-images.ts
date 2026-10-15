/**
 * Recompresses images already sitting in the database — product photos,
 * branch logos, and quotation letterheads — the same way the browser now
 * does it for new uploads (see dengo-frontend/src/lib/imageCompress.ts):
 * downscaled to a sane max dimension and re-encoded as JPEG. A raw phone
 * photo saved before that client-side fix shipped can be several MB; that
 * much text being parsed/serialized on every read or write of the row is
 * what was blocking the backend's single event-loop thread for hundreds of
 * ms to seconds (showing up to cashiers as general app-wide lag). The
 * client-side fix only compresses what's uploaded from now on — this is the
 * one-time catch-up for everything saved before it.
 *
 * Uses `sharp` (server-side; there's no browser/canvas here) — same target
 * sizes as the client: product photos & logos capped at 1280px, the wider
 * quotation letterhead at 1600px, both JPEG quality 82.
 *
 * Only rewrites a row when the recompressed version is at least 10% smaller
 * — skips images that are already small/optimized instead of needlessly
 * touching rows and losing a little quality for no real gain.
 *
 * Usage:
 *   npx tsx scripts/backfill-compress-images.ts            (report only, writes nothing)
 *   npx tsx scripts/backfill-compress-images.ts --apply    (actually updates)
 */
import sharp from 'sharp'
import { prisma } from '../src/lib/prisma.js'

const shouldApply = process.argv.includes('--apply')
const JPEG_QUALITY = 82
const MIN_SAVINGS_PCT = 10

function dataUrlToBuffer(dataUrl: string): Buffer | null {
  const match = /^data:image\/[^;]+;base64,(.+)$/.exec(dataUrl)
  if (!match) return null
  return Buffer.from(match[1]!, 'base64')
}

async function recompress(dataUrl: string, maxDimension: number): Promise<{ dataUrl: string; before: number; after: number } | null> {
  const buf = dataUrlToBuffer(dataUrl)
  if (!buf) return null // not a data: URL we recognize (ej. an external http(s) URL) — leave alone
  const before = buf.length
  try {
    const out = await sharp(buf)
      .resize({ width: maxDimension, height: maxDimension, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' }) // JPEG has no alpha — matches the client's white-fill for transparent PNGs
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer()
    const after = out.length
    return { dataUrl: `data:image/jpeg;base64,${out.toString('base64')}`, before, after }
  } catch (e) {
    console.log(`  (no se pudo procesar — se deja igual: ${e instanceof Error ? e.message : e})`)
    return null
  }
}

function fmtKB(bytes: number): string {
  return `${(bytes / 1024).toFixed(0)}KB`
}

async function processField<T extends { id: string; name?: string }>(
  label: string,
  rows: (T & { value: string | null })[],
  maxDimension: number,
  applyUpdate: (id: string, newValue: string) => Promise<void>,
) {
  let touched = 0, skippedSmallGain = 0, skippedUnrecognized = 0
  let totalBefore = 0, totalAfter = 0

  for (const row of rows) {
    if (!row.value) continue
    const result = await recompress(row.value, maxDimension)
    if (!result) { skippedUnrecognized++; continue }
    const { dataUrl, before, after } = result
    const savingsPct = before > 0 ? ((before - after) / before) * 100 : 0

    if (savingsPct < MIN_SAVINGS_PCT) {
      skippedSmallGain++
      continue
    }

    touched++
    totalBefore += before
    totalAfter += after
    console.log(`${shouldApply ? 'Actualizando' : '[reporte]'} ${label} — ${row.name ?? row.id}: ${fmtKB(before)} → ${fmtKB(after)} (-${savingsPct.toFixed(0)}%)`)
    if (shouldApply) await applyUpdate(row.id, dataUrl)
  }

  console.log(`\n${label}: ${touched} ${shouldApply ? 'actualizadas' : 'se actualizarían'}, ${skippedSmallGain} sin ganancia suficiente (ya optimizadas), ${skippedUnrecognized} no reconocidas (ej. URL externa) — ${rows.filter(r => r.value).length} con imagen en total.`)
  if (touched > 0) {
    console.log(`  Peso total: ${fmtKB(totalBefore)} → ${fmtKB(totalAfter)} (ahorro de ${fmtKB(totalBefore - totalAfter)})`)
  }
  return { touched, totalBefore, totalAfter }
}

async function main() {
  const products = await prisma.product.findMany({ where: { imageUrl: { not: null } }, select: { id: true, name: true, imageUrl: true } })
  const branches = await prisma.branch.findMany({ select: { id: true, name: true, logo: true, quotationLetterhead: true } })

  console.log(`Productos con imagen: ${products.length}`)
  console.log(`Sucursales: ${branches.length}\n`)

  const r1 = await processField(
    'Fotos de producto',
    products.map(p => ({ id: p.id, name: p.name, value: p.imageUrl })),
    1280,
    (id, dataUrl) => prisma.product.update({ where: { id }, data: { imageUrl: dataUrl } }).then(() => {}),
  )

  console.log()
  const r2 = await processField(
    'Logos de sucursal',
    branches.map(b => ({ id: b.id, name: b.name, value: b.logo })),
    1280,
    (id, dataUrl) => prisma.branch.update({ where: { id }, data: { logo: dataUrl } }).then(() => {}),
  )

  console.log()
  const r3 = await processField(
    'Membretes de cotización',
    branches.map(b => ({ id: b.id, name: b.name, value: b.quotationLetterhead })),
    1600,
    (id, dataUrl) => prisma.branch.update({ where: { id }, data: { quotationLetterhead: dataUrl } }).then(() => {}),
  )

  const totalBefore = r1.totalBefore + r2.totalBefore + r3.totalBefore
  const totalAfter = r1.totalAfter + r2.totalAfter + r3.totalAfter
  console.log(`\n${shouldApply ? '✅ Listo' : 'Resumen'} — ${r1.touched + r2.touched + r3.touched} imagen(es) ${shouldApply ? 'recomprimidas' : 'se recomprimirían'}, ahorro total: ${fmtKB(totalBefore - totalAfter)}`)
  if (!shouldApply) console.log('\nEsto fue solo un reporte — nada se guardó. Vuelve a correr con --apply para aplicar los cambios.')
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
