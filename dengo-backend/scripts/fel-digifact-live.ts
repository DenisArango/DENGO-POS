// Prueba en vivo contra Digifact (usa las variables DIGIFACT_* del .env).
// Certifica una factura a NIT, una nota de crédito sobre ella, anula la factura
// y baja el PDF. ¡Solo en el ambiente de pruebas! (consume DTE en producción)
//
//   npx tsx scripts/fel-digifact-live.ts [NIT receptor | CUI:<13 dígitos>]
import '../src/config.js'
import { writeFileSync } from 'node:fs'
import { felConfig } from '../src/lib/fel/config.js'
import { digifactProvider } from '../src/lib/fel/providers/digifact.js'
import { gtLocalIso } from '../src/lib/fel/build.js'
import type { DteDocument } from '../src/lib/fel/types.js'

const cfg = felConfig(process.env)
if (cfg.environment === 'production') { console.error('DIGIFACT_ENV=production: esta prueba consume DTE reales. Abortado.'); process.exit(1) }
const p = digifactProvider(cfg)
const ctx = { entityId: cfg.digifact.establishment, establishment: { code: cfg.digifact.establishment, name: 'SUCURSAL DE PRUEBA', address: 'Ciudad', city: 'Guatemala' } }
console.log('URL:', cfg.digifact.baseUrl, '· NIT', cfg.digifact.nit, '· est.', ctx.entityId, '· frases', cfg.digifact.frases)

await p.credits(ctx); console.log('✓ login')
const arg = process.argv[2] ?? cfg.digifact.nit
const isCui = arg.toUpperCase().startsWith('CUI:')
const nit = isCui ? arg.slice(4) : arg
const who = isCui ? { name: 'Receptor con CUI' } : await p.lookupTaxId('NIT', nit, ctx); console.log(`✓ ${isCui ? 'CUI' : 'NIT'}`, nit, '→', who.name)
console.log('  CUI →', await p.lookupTaxId('CUI', '2563457890101', ctx))

const fact: DteDocument = {
  type: 'FACT', currency: 'GTQ', issuedAt: gtLocalIso(new Date()), externalId: `LIVE-${Date.now()}`,
  lines: [
    { description: 'Cuaderno universitario', qty: 3, unitPrice: 25, discount: 5, type: 'B', withoutIva: false },
    { description: 'Lapicero azul', qty: 2, unitPrice: 3.5, discount: 0, type: 'B', withoutIva: false },
  ],
  total: 77, totalTax: 8.25,
  receiver: { kind: isCui ? 'CUI' : 'NIT', taxId: nit, name: who.name ?? 'Cliente', address: { street: 'Ciudad', city: 'Guatemala', state: 'Guatemala', zip: '01001', country: 'GT' }, email: null },
  customFields: [{ name: 'Venta', value: 'V-LIVE' }, { name: 'Sucursal', value: 'Prueba' }],
}
const c = await p.certify(fact, ctx)
console.log(c.ok ? `✓ FACT ${c.serie}-${c.number} ${c.uuid}` : `✗ FACT ${c.errors.join(' | ')}`)
if (!c.ok) process.exit(1)

const nc = await p.certify({ ...fact, type: 'NCRE', externalId: `NC-${Date.now()}`, parentUuid: c.uuid!, memo: 'Devolución de un cuaderno',
  lines: [{ description: 'Cuaderno universitario', qty: 1, unitPrice: 23.33, discount: 0, type: 'B', withoutIva: false }], total: 23.33, totalTax: 2.5 }, ctx)
console.log(nc.ok ? `✓ NCRE ${nc.serie}-${nc.number} ${nc.uuid}` : `✗ NCRE ${nc.errors.join(' | ')}`)

const g = await p.get(c.uuid!, ctx); console.log(g.ok ? `✓ get ${g.serie}-${g.number} cert ${g.certifiedAt?.toISOString()}` : `✗ get ${g.errors}`)
const pdf = await p.pdf!(c.uuid!, ctx)
if (pdf) { writeFileSync(process.env.PDF_OUT ?? 'fel-digifact-live.pdf', pdf); console.log('✓ PDF', pdf.length, 'bytes') } else console.log('✗ PDF')
const v = await p.void(c.uuid!, 'Prueba de integración DENGO', ctx); console.log(v.ok ? '✓ anulada' : `✗ anular ${v.errors}`)
