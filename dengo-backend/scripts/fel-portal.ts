const API = 'http://localhost:3001'
async function call(method: string, path: string, token: string, body?: unknown) {
  const r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const t = await r.text(); let j: any; try { j = JSON.parse(t) } catch { j = t }
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${JSON.stringify(j)}`)
  return j
}
const login = await fetch(API + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@dengo.gt', password: 'Admin1234!' }) }).then(r => r.json())
const tk = login.token
const SALE = 'cmw3caw39005w11h1in37zau0'
const prev = await call('GET', `/api/fel/sales/${SALE}/preview`, tk).catch(e => ({ error: e.message }))
console.log('preview (antes de facturar):', JSON.stringify(prev).slice(0, 160))
const gen = await call('POST', `/api/sales/${SALE}/generate-invoice`, tk, {})
console.log('factura:', gen.felStatus, '| comprador:', gen.buyerName, gen.buyerNit, '| SAT', gen.felSatSerie, gen.felSatNumber, '| total', gen.total)
const old = await call('POST', '/api/fel/sales/cmw18iz0s000cnnfzg3bn576m/certify', tk, {})
console.log('VNU-9209 reintento:', JSON.stringify(old))
