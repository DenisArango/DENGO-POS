// End-to-end FEL check against the running API (FEL_PROVIDER=mock, demo DB).
// npx tsx scripts/fel-e2e.ts
const API = 'http://localhost:3001'
const CENTRAL = 'cmvtxvvzj00007zd5m6bn27p4'
const REGISTER = process.env.REG ?? 'e7ba14ac-5803-498a-84d2-7ad0a8651eab'
const CALC = '6e560f7f-8040-48c9-9a84-2aaa0bf824a9'
const CUAD = 'dcdff1b9-02dc-46e1-ac87-868be453665d'

let token = ''
async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const text = await res.text()
  let json: any; try { json = JSON.parse(text) } catch { json = text }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${typeof json === 'string' ? json : JSON.stringify(json)}`)
  return json
}
let fails = 0
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); if (!ok) fails++ }

token = (await call('POST', '/api/auth/login', { email: 'admin@dengo.gt', password: 'Admin1234!' })).token

const st = await call('GET', '/api/fel/status')
check('estado: proveedor simulador', st.config.provider === 'mock', JSON.stringify(st.counts))

const nit = await call('GET', '/api/fel/tax-id/NIT/1607421')
check('búsqueda de NIT', nit.found === true && !!nit.name, nit.name)
let badNit = ''
try { await call('GET', '/api/fel/tax-id/NIT/12345678') } catch (e) { badNit = (e as Error).message }
check('NIT con dígito verificador malo → 400', badNit.includes('400'))

// Sale: 3 cuadernos (one 10% off) + 1 calculadora, header discount Q5, with factura
const items = [
  { productId: CUAD, quantity: 3, unitPrice: 17.5, discount: 0.1, total: 47.25 },
  { productId: CALC, quantity: 1, unitPrice: 165, discount: 0, total: 165 },
]
const subtotal = 212.25, discount = 5, total = 207.25
const sale = await call('POST', '/api/sales', {
  branchId: CENTRAL, cashRegisterId: REGISTER, customerId: 'cmvtxvzi80016pn9waokgwolz', items, subtotal, tax: 0, discount, total,
  paymentMethod: 'CASH', saleType: 'CASH', cashAmount: total, requiresInvoice: true, buyerNit: '1607421', buyerName: 'John Doe',
  clientRequestId: `fel-e2e-${Date.now()}`,
})
check('venta con factura certificada al cobrar', sale.felStatus === 'CERTIFIED', `${sale.felSatSerie}-${sale.felSatNumber} aut ${sale.felAuthNumber}`)
check('respuesta trae datos para el ticket', !!sale.felAuthNumber && sale.felEnvironment === 'mock' && sale.felDocType === 'FACT')

// Edit lock
let editErr = ''
try { await call('PUT', `/api/sales/${sale.id}`, { total: 1, subtotal: 1 }) } catch (e) { editErr = (e as Error).message }
check('no se puede editar el monto de una venta certificada', editErr.includes('nota de crédito'))

// Credit note: return 1 cuaderno
const cn0 = await call('GET', `/api/fel/sales/${sale.id}/credit-notes`)
const cuadLine = cn0.lines.find((l: any) => l.description.startsWith('Cuaderno'))
check('líneas acreditables', cn0.lines.length === 2 && cuadLine.remainingQty === 3, `cuaderno pagado ${cuadLine.paid} (${cuadLine.unitNet.toFixed(4)} c/u)`)
const stockBefore = Number((await call('GET', `/api/inventory?branchId=${CENTRAL}&search=7401000100017`)).items?.[0]?.quantity ?? NaN)
const cn = await call('POST', `/api/fel/sales/${sale.id}/credit-notes`, { reason: 'Devolución de 1 cuaderno dañado', returnStock: true, items: [{ saleItemId: cuadLine.saleItemId, quantity: 1 }] })
check('nota de crédito certificada', cn.fel.status === 'CERTIFIED' && cn.note.felStatus === 'CERTIFIED', `NC-${cn.note.number} −Q${cn.note.total}`)
check('monto acreditado = lo pagado por 1 cuaderno', Math.abs(Number(cn.note.total) - cuadLine.unitNet) < 0.011, `${cn.note.total}`)
let over = ''
try { await call('POST', `/api/fel/sales/${sale.id}/credit-notes`, { reason: 'De más', items: [{ saleItemId: cuadLine.saleItemId, quantity: 3 }] }) } catch (e) { over = (e as Error).message }
check('no deja acreditar más de lo vendido', over.includes('solo quedan 2'), over.slice(0, 90))
const stockAfter = Number((await call('GET', `/api/inventory?branchId=${CENTRAL}&search=7401000100017`)).items?.[0]?.quantity ?? NaN)
if (Number.isFinite(stockBefore)) check('el cuaderno regresó al inventario', stockAfter === stockBefore + 1, `${stockBefore} → ${stockAfter}`)

// Void → annul at SAT
const v = await call('DELETE', `/api/sales/${sale.id}`, { reason: 'Prueba FEL' })
const after = await call('GET', `/api/sales/${sale.id}`)
check('anular venta anula la factura', after.felVoidStatus === 'VOIDED', v.message)

// Rejection path (simulated SAT error): stays FAILED with the reason, sale still done
const rej = await call('POST', '/api/sales', {
  branchId: CENTRAL, cashRegisterId: REGISTER, customerId: 'cmvtxvzi80016pn9waokgwolz', items: [{ productId: CALC, quantity: 1, unitPrice: 165, discount: 0, total: 165 }], subtotal: 165, tax: 0, discount: 0, total: 165,
  paymentMethod: 'CASH', saleType: 'CASH', cashAmount: 165, requiresInvoice: true, buyerNit: '1607421', buyerName: 'RECHAZAR prueba', clientRequestId: `fel-e2e-r-${Date.now()}`,
})
check('rechazo de SAT: venta hecha, factura FAILED con motivo', rej.felStatus === 'FAILED' && /RCP302/.test(rej.felError ?? ''), rej.felError)
const retry = await call('POST', `/api/fel/sales/${rej.id}/certify`, {})
check('reintento manual vuelve a fallar igual (motivo real)', retry.status === 'FAILED')
await call('DELETE', `/api/sales/${rej.id}`, { reason: 'Prueba FEL' })

console.log(fails ? `\n${fails} FALLA(S)` : '\nTodo OK')
process.exit(fails ? 1 : 0)
