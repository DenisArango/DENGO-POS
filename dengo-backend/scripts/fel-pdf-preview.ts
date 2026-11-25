// Vista previa de la factura personalizada: baja el XML de un DTE del
// certificador y lo dibuja con la marca de una sucursal.
//   npx tsx scripts/fel-pdf-preview.ts <autorización> [salida.pdf] [branchId]
//   (LOGO_FILE, INVOICE_COLOR, FOOTER, VOIDED=1 para probar la marca sin tocar la BD)
import '../src/config.js'
import { writeFileSync, readFileSync } from 'node:fs'
import { prisma } from '../src/lib/prisma.js'
import { felConfig } from '../src/lib/fel/config.js'
import { getProvider, contextFor } from '../src/lib/fel/service.js'
import { parseDte } from '../src/lib/fel/dte-xml.js'
import { renderInvoicePdf } from '../src/lib/fel/invoice-pdf.js'

const [uuid, out = 'factura-preview.pdf', branchId] = process.argv.slice(2)
if (!uuid) { console.error('Uso: npx tsx scripts/fel-pdf-preview.ts <autorización> [salida.pdf] [branchId]'); process.exit(1) }
const cfg = felConfig(process.env)
const p = getProvider(cfg)
const xml = await p!.xml!(uuid, contextFor({}, cfg)!)
if (!xml) { console.error('No se encontró el documento'); process.exit(1) }
const b = branchId
  ? await prisma.branch.findUnique({ where: { id: branchId } })
  : await prisma.branch.findFirst({ where: { logo: { not: null } } }) ?? await prisma.branch.findFirst()
const pdf = await renderInvoicePdf(parseDte(xml), {
  logo: process.env.LOGO_FILE ? readFileSync(process.env.LOGO_FILE).toString('base64') : b?.logo ?? null, companyName: b?.companyName ?? null, tagline: b?.companyTagline ?? null, website: b?.companyWebsite ?? null,
  phone: b?.phone || null, email: b?.email || null, color: process.env.INVOICE_COLOR ?? b?.invoiceColor ?? null, footer: process.env.FOOTER ?? b?.invoiceFooter ?? null,
}, { test: cfg.environment !== 'production', voided: process.env.VOIDED === '1' })
writeFileSync(out, pdf)
console.log('PDF:', out, pdf.length, 'bytes · sucursal', b?.name ?? '(ninguna)')
await prisma.$disconnect()
