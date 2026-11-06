// Self-test of the sale → DTE builder and the FELplex body (no network, no DB).
// npx tsx scripts/fel-selftest.ts
import { buildDteForSale, saleLineNets, DteBuildError } from '../src/lib/fel/build.js'
import { felConfig } from '../src/lib/fel/config.js'
import { toFelplexBody } from '../src/lib/fel/providers/felplex.js'
import { mockProvider } from '../src/lib/fel/providers/mock.js'

const cfg = felConfig({ FEL_PROVIDER: 'mock' } as any)
let fails = 0
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); if (!ok) fails++ }
const sum = (d: any) => Math.round(d.lines.reduce((s: number, l: any) => s + l.qty * l.unitPrice - l.discount, 0) * 100) / 100
const base = { id: 's1', invoiceNumber: 'VDC1-120', invoiceSeries: 'A', invoiceSeqNumber: 7, createdAt: new Date('2026-11-05T16:31:40Z'), buyerNit: '1607421', buyerName: 'John Doe', customer: null, branch: { name: 'Central Zona 1', city: 'Guatemala' } }

// 1. The coupon sale of the demo: 2 cuadernos (15% coupon on them) + calculadora → Q194.75
const s1 = { ...base, total: 194.75, discount: 0, items: [
  { quantity: 2, unitPrice: 17.5, total: 35, promoDiscount: 5.25, product: { name: 'Cuaderno espiral 100 hojas rayado' } },
  { quantity: 1, unitPrice: 165, total: 165, promoDiscount: null, product: { name: 'Calculadora científica fx-82' } },
] }
const d1 = buildDteForSale(s1 as any, cfg)
check('cupón: líneas suman el total', sum(d1) === 194.75, `${sum(d1)}`)
check('cupón: descuento en la línea del cuaderno', d1.lines[0]!.discount === 5.25)
check('IVA incluido 12/112', d1.totalTax === 20.87, `${d1.totalTax}`)
check('fecha de emisión en hora de Guatemala', d1.issuedAt === '2026-11-05T10:31:40', d1.issuedAt)

// 2. Manual 15% on one line + header discount Q10 split across lines
const s2 = { ...base, total: 241.34, discount: 10, items: [
  { quantity: 3, unitPrice: 33.33, total: 84.99, promoDiscount: 0, product: { name: 'Marcador' } },   // 99.99 − 15%
  { quantity: 1, unitPrice: 166.35, total: 166.35, product: { name: 'Mochila' } },
] }
const d2 = buildDteForSale(s2 as any, cfg)
check('manual + general: suma exacta', sum(d2) === 241.34, `${sum(d2)}`)
check('manual + general: ningún descuento negativo', d2.lines.every(l => l.discount >= 0))
const nets2 = saleLineNets(s2 as any)
check('netos por línea suman el total', Math.round(nets2.reduce((a, b) => a + b, 0) * 100) / 100 === 241.34, nets2.join(' + '))

// 3. Fractional quantity and an over-list price
const s3 = { ...base, total: 63.75, discount: 0, items: [
  { quantity: 2.5, unitPrice: 12.5, total: 31.25, product: { name: 'Listón por metro' } },
  { quantity: 1, unitPrice: 30, total: 32.5, product: { name: 'Precio cambiado al alza' } },
] }
const d3 = buildDteForSale(s3 as any, cfg)
check('cantidad fraccionaria → 1 línea entera', d3.lines[0]!.qty === 1 && d3.lines[0]!.unitPrice === 31.25)
check('precio mayor al de lista: se factura el cobrado', d3.lines[1]!.unitPrice === 32.5 && d3.lines[1]!.discount === 0)
check('fraccionaria: suma exacta', sum(d3) === 63.75, `${sum(d3)}`)

// 3b. Quotation conversion with IVA on top: 32 + 50 + 9.84 IVA = 91.84
const sQ = { ...base, total: 91.84, discount: 0, tax: 9.84, items: [
  { quantity: 1, unitPrice: 32, total: 32, product: { name: 'Cuaderno' } },
  { quantity: 1, unitPrice: 50, total: 50, customName: 'Rotulación especial' },
] }
const dQ = buildDteForSale(sQ as any, cfg)
check('IVA aparte (cotización): precios con IVA y suma exacta', sum(dQ) === 91.84 && dQ.lines[0]!.unitPrice === 35.84, `${dQ.lines.map(l => l.unitPrice).join(' + ')} = ${sum(dQ)}`)
check('IVA aparte: IVA del documento', dQ.totalTax === 9.84, `${dQ.totalTax}`)

// 4. Receivers
check('CUI de 13 dígitos se envía como CUI', buildDteForSale({ ...s1, buyerNit: '2234062201234' } as any, cfg).receiver.kind === 'CUI')
let cfErr = ''
try { buildDteForSale({ ...s1, buyerNit: 'CF' } as any, cfg) } catch (e) { cfErr = (e as Error).message }
check('sin NIT y FEL_ALLOW_CF=false → error claro', cfErr.includes('NIT'), cfErr)
const cfgCf = felConfig({ FEL_PROVIDER: 'mock', FEL_ALLOW_CF: 'true' } as any)
check('CF permitido bajo el límite', buildDteForSale({ ...s1, buyerNit: 'CF', buyerName: '' } as any, cfgCf).receiver.name === 'Consumidor Final')
let bigErr = ''
try { buildDteForSale({ ...s1, buyerNit: 'CF', total: 2600, items: [{ quantity: 1, unitPrice: 2600, total: 2600, product: { name: 'X' } }] } as any, cfgCf) } catch (e) { bigErr = (e as Error).message }
check('CF desde Q2,500 → exige NIT', bigErr.includes('2500'), bigErr)

// 5. Small taxpayer: no IVA amount
const dPeq = buildDteForSale(s1 as any, felConfig({ FEL_PROVIDER: 'mock', FEL_DOC_TYPE: 'FPEQ' } as any))
check('pequeño contribuyente: FPEQ sin IVA', dPeq.type === 'FPEQ' && dPeq.totalTax === 0)

// 6. FELplex body follows their documented field names
const b = toFelplexBody(d1) as any
const keys = ['type', 'currency', 'datetime_issue', 'external_id', 'items', 'total', 'total_tax', 'emails', 'to_cf', 'to', 'exempt_phrase', 'custom_fields']
check('cuerpo FELplex: campos de la documentación', keys.every(k => k in b), Object.keys(b).join(','))
check('cuerpo FELplex: ítem', ['qty', 'type', 'price', 'description', 'without_iva', 'discount', 'is_discount_percentage', 'taxes'].every(k => k in b.items[0]))
check('cuerpo FELplex: receptor', b.to.tax_code_type === 'NIT' && b.to.tax_code === '1607421' && b.to_cf === 0)
const nc = toFelplexBody({ ...d1, type: 'NCRE', parentUuid: 'E4A0191A-9B3B-4AD2-A38F-AA593CF48B62', memo: 'Devolución' }) as any
check('nota de crédito: parent_invoice_id y memo', nc.parent_invoice_id === 'E4A0191A-9B3B-4AD2-A38F-AA593CF48B62' && nc.memo === 'Devolución')

// 7. Simulator answers like FELplex
const r = await mockProvider().certify(d1, { entityId: 'mock' })
check('simulador certifica', r.ok && !!r.uuid && !!r.authorization && !!r.serie && !!r.number)
const bad = await mockProvider().certify({ ...d1, total: 999 }, { entityId: 'mock' })
check('simulador rechaza total que no cuadra', !bad.ok && bad.errors[0]!.includes('RCP348'))

void DteBuildError
console.log(fails ? `\n${fails} FALLA(S)` : '\nTodo OK')
process.exit(fails ? 1 : 0)
