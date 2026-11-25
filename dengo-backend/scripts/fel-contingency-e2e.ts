// End-to-end de contingencia FEL contra dos APIs de la misma BD de demo:
//   DOWN = backend con el certificador inalcanzable (DIGIFACT_BASE_URL a un puerto muerto)
//   UP   = backend con el certificador de pruebas funcionando
// Cubre: venta en línea que cae en contingencia, venta fuera de línea con No. de
// acceso del POS, certificación posterior con NumeroAcceso, plazo de 5 días,
// reporte para el aviso de contingencia y el PDF propio.
//   DOWN=http://localhost:3012 UP=http://localhost:3013 npx tsx scripts/fel-contingency-e2e.ts
import '../src/config.js'
import { prisma } from '../src/lib/prisma.js'
import { parseDte } from '../src/lib/fel/dte-xml.js'

const DOWN = process.env.DOWN ?? 'http://localhost:3012'
const UP = process.env.UP ?? 'http://localhost:3013'
const CENTRAL = 'cmvtxvvzj00007zd5m6bn27p4'
const REGISTER = process.env.REG ?? 'e7ba14ac-5803-498a-84d2-7ad0a8651eab'
const CALC = '6e560f7f-8040-48c9-9a84-2aaa0bf824a9'
const CUSTOMER = 'cmvtxvzi80016pn9waokgwolz'
const BUYER_NIT = process.env.BUYER_NIT ?? '77454820'

let token = ''
async function call(api: string, method: string, path: string, body?: unknown) {
  const res = await fetch(api + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const text = await res.text()
  let json: any; try { json = JSON.parse(text) } catch { json = text }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${typeof json === 'string' ? json : JSON.stringify(json)}`)
  return json
}
let fails = 0
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); if (!ok) fails++ }
const saleBody = (extra: object = {}) => ({
  branchId: CENTRAL, cashRegisterId: REGISTER, customerId: CUSTOMER,
  items: [{ productId: CALC, quantity: 1, unitPrice: 165, discount: 0, total: 165 }], subtotal: 165, tax: 0, discount: 0, total: 165,
  paymentMethod: 'CASH', saleType: 'CASH', cashAmount: 165, requiresInvoice: true, buyerNit: BUYER_NIT, buyerName: 'DIGIFACT SERVICIOS, SOCIEDAD ANONIMA',
  ...extra,
})

token = (await call(UP, 'POST', '/api/auth/login', { email: 'admin@dengo.gt', password: 'Admin1234!' })).token

const info = await call(UP, 'GET', '/api/fel/receipt-info')
check('receipt-info: contingencia soportada y emisor', info.contingency === true && !!info.emisorName && info.phrases.length > 0, `${info.emisorName} · ${info.phrases.join(', ')}`)

// 1. Online sale while the certifier is down → contingency
const s1 = await call(DOWN, 'POST', '/api/sales', saleBody())
check('certificador caído: venta hecha, factura PENDING', s1.felStatus === 'PENDING', s1.felError)
check('se le asignó No. de acceso de 9 dígitos', /^[1-9]\d{8}$/.test(s1.felAccessNumber ?? ''), s1.felAccessNumber)
check('trae fecha de emisión fija', !!s1.felIssuedAt)

// The certifier is back: certify it (manual retry from the UP backend; clear the in-flight guard first).
await prisma.sale.update({ where: { id: s1.id }, data: { felLastAttemptAt: null } })
const r1 = await call(UP, 'POST', `/api/fel/sales/${s1.id}/certify`, {})
check('al volver la conexión se certifica', r1.status === 'CERTIFIED', r1.error)
const s1b = await call(UP, 'GET', `/api/sales/${s1.id}`)
const xml1 = (await prisma.felDocumentXml.findUnique({ where: { uuid: String(s1b.felUuid).toUpperCase() } }))?.xml
const dte1 = xml1 ? parseDte(xml1) : null
check('XML archivado en FEL_DOCUMENT_XML', !!xml1)
check('el DTE lleva el mismo NumeroAcceso', dte1?.accessNumber === s1.felAccessNumber, `${dte1?.accessNumber} vs ${s1.felAccessNumber}`)
check('el DTE conserva la fecha de emisión de la venta', !!dte1 && Math.abs(new Date(`${dte1.issuedAt}-06:00`).getTime() - new Date(s1.felIssuedAt).getTime()) < 1500, `${dte1?.issuedAt} vs ${s1.felIssuedAt}`)

// 2. Offline sale synced later, with the access number the POS printed 2 days ago
const printed = String(100_000_000 + Math.floor(Math.random() * 899_999_999))
const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString()
const s2 = await call(UP, 'POST', '/api/sales', saleBody({ clientRequestId: `cont-e2e-${Date.now()}`, felAccessNumber: printed, felIssuedAt: twoDaysAgo }))
check('venta fuera de línea: certificada al sincronizar', s2.felStatus === 'CERTIFIED', s2.felError)
check('con el No. de acceso impreso por el POS', s2.felAccessNumber === printed, s2.felAccessNumber)
const xml2 = (await prisma.felDocumentXml.findUnique({ where: { uuid: String(s2.felUuid).toUpperCase() } }))?.xml
const dte2 = xml2 ? parseDte(xml2) : null
check('el DTE lleva la fecha de hace 2 días y el acceso', dte2?.accessNumber === printed && dte2?.issuedAt.slice(0, 10) === new Date(new Date(twoDaysAgo).getTime() - 6 * 3600_000).toISOString().slice(0, 10), dte2?.issuedAt)

// 3. Past the SAT's 5 days: not sent, clear error
const old = new Date(Date.now() - 7 * 86_400_000).toISOString()
const s3 = await call(UP, 'POST', '/api/sales', saleBody({ clientRequestId: `cont-e2e-old-${Date.now()}`, felAccessNumber: String(100_000_000 + Math.floor(Math.random() * 899_999_999)), felIssuedAt: old }))
check('contingencia de hace 7 días: FAILED con el plazo vencido', s3.felStatus === 'FAILED' && /plazo de la SAT/.test(s3.felError ?? ''), s3.felError?.slice(0, 90))

// 4. Report for the Aviso de contingencia
const periods = await call(UP, 'GET', '/api/fel/contingencies')
const mine = periods.flatMap((p: any) => p.docs).filter((d: any) => [s1.id, s2.id, s3.id].includes(d.id))
check('reporte de contingencias incluye las 3', mine.length === 3, `${periods.length} periodo(s)`)
const p1 = periods.find((p: any) => p.docs.some((d: any) => d.id === s1.id))
check('periodo con inicio, fin, establecimiento y cantidad', !!p1?.start && !!p1?.end && !!p1?.establishment && p1.count >= 1, `${p1?.start} → ${p1?.end} est ${p1?.establishment}`)
const n = await call(UP, 'POST', '/api/fel/contingencies/notified', { saleIds: p1.docs.map((d: any) => d.id) })
check('marcar aviso presentado', n.updated === p1.docs.length)

// 5. Our branded PDF and the certifier's
const pdf = await fetch(UP + s1b.felPdfUrl)
const head = Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString()
check('PDF propio se genera', pdf.ok && head === '%PDF-', `${pdf.status} ${pdf.headers.get('content-type')}`)
const orig = await fetch(UP + s1b.felPdfUrl + '&original=1')
check('PDF del certificador sigue disponible', orig.ok && (await orig.arrayBuffer()).byteLength > 50_000)

// Clean up: void the test sales (annuls the DTEs on the test environment)
for (const s of [s1, s2, s3]) await call(UP, 'DELETE', `/api/sales/${s.id}`, { reason: 'Prueba contingencia' }).catch(() => {})
const v = await call(UP, 'GET', `/api/sales/${s1.id}`)
check('anular la venta de contingencia anula el DTE', v.felVoidStatus === 'VOIDED')

await prisma.$disconnect()
console.log(fails ? `\n${fails} FALLA(S)` : '\nTodo OK')
process.exit(fails ? 1 : 0)
