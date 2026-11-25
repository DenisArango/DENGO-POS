export {}
// Prueba de punta a punta contra un panel corriendo (ADMIN_MODE=simulate + Postgres local):
//   npx tsx server/scripts/e2e-provision.ts [clave] [falla]
// Con «falla» manda una sucursal con código inválido a nivel de base para forzar el deshacer.
const BASE = process.env.ADMIN_URL ?? 'http://127.0.0.1:4900'
const pw = process.argv[2] ?? 'dengo-admin-dev'

const login = await fetch(`${BASE}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: pw }) })
const cookie = login.headers.get('set-cookie')!.split(';')[0]!
const call = async (path: string, init: RequestInit = {}) => {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { 'content-type': 'application/json', cookie, ...(init.headers ?? {}) } })
  return { status: r.status, body: await r.json() as any }
}

const body = {
  displayName: 'Librería El Búho', domain: 'https://www.libreriaelbuho.com',
  contact: { name: 'Ana', phone: '5555 1234', email: 'ana@buho.gt' },
  admin: { name: 'Ana Pérez', email: 'ana@buho.gt' },
  branches: [{ name: 'Central', code: 'CEN' }, { name: 'Zona 10', code: 'Z10' }],
  modules: { pos: true, maestros: false, page: true, fel: true, ai: true }, aiMonthlyLimit: 200,
  fel: { nit: '1234567-8', frases: '1:1', docType: 'FACT', establishment: '1', env: 'test' },
  web: true,
}
console.log('plan', (await call('/api/clients/plan', { method: 'POST', body: JSON.stringify(body) })).body)
const start = await call('/api/clients', { method: 'POST', body: JSON.stringify(body) })
console.log('start', start.status, start.body)
let job: any
for (let i = 0; i < 120; i++) {
  job = (await call(`/api/jobs/${start.body.jobId}`)).body
  if (job.status !== 'running') break
  await new Promise(r => setTimeout(r, 1500))
}
console.log('status', job.status, job.error ?? '')
for (const s of job.steps) console.log(` ${s.status.padEnd(9)} ${s.title}${s.note ? ` — ${s.note}` : ''}`)
console.log('result', job.result)
const again = await call('/api/clients', { method: 'POST', body: JSON.stringify(body) })
console.log('repetir alta', again.status)
await new Promise(r => setTimeout(r, 2500))
const j2 = (await call(`/api/jobs/${again.body.jobId}`)).body
console.log('repetida →', j2.status, j2.error)
