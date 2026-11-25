export {}
// Operaciones sobre un cliente ya creado (correr después de e2e-provision):
//   npx tsx server/scripts/e2e-ops.ts [Cliente]
const BASE = process.env.ADMIN_URL ?? 'http://127.0.0.1:4900'
const name = process.argv[2] ?? 'LibreriaElBuho'
const login = await fetch(`${BASE}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'dengo-admin-dev' }) })
const cookie = login.headers.get('set-cookie')!.split(';')[0]!
const call = async (method: string, path: string, body?: unknown) => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: r.status, body: await r.json().catch(() => null) as any }
}
const wait = async (jobId: string) => {
  for (let i = 0; i < 120; i++) {
    const j = (await call('GET', `/api/jobs/${jobId}`)).body
    if (j.status !== 'running') return j
    await new Promise(r => setTimeout(r, 1000))
  }
}
const job = async (label: string, method: string, path: string, body?: unknown) => {
  const s = await call(method, path, body)
  if (s.status !== 202) return console.log(label, s.status, s.body)
  const j = await wait(s.body.jobId)
  console.log(label, j.status, j.error ?? '', j.steps.map((x: any) => `${x.id}:${x.status}`).join(' '))
}

let r = await call('PATCH', `/api/clients/${name}/license`, { suspended: true, suspendedMessage: 'Pago pendiente', aiMonthlyLimit: 50, maestrosEnabled: true })
console.log('suspender', r.status, r.body.license)
console.log('estado', (await call('GET', `/api/clients/${name}`)).body.status)
r = await call('PATCH', `/api/clients/${name}/license`, { suspended: false })
console.log('reactivar', r.status, r.body.license.suspended)
console.log('licencia vacía', (await call('PATCH', `/api/clients/${name}/license`, {})).status)
await job('respaldo', 'POST', `/api/clients/${name}/actions/backup`)
console.log('respaldos', (await call('GET', `/api/clients/${name}/backups`)).body.backups.length)
await job('fel', 'PATCH', `/api/clients/${name}/fel`, { enabled: true, fel: { nit: '7654321', frases: '1:1,2:1', docType: 'FPEQ', establishment: '2', env: 'production' } })
const d = (await call('GET', `/api/clients/${name}`)).body
console.log('fel ahora', d.fel, 'licencia fel', d.metrics.license.felEnabled)
await job('caddy', 'POST', `/api/clients/${name}/actions/caddy`)
await job('archivar', 'POST', `/api/clients/${name}/actions/archive`)
console.log('estado', (await call('GET', `/api/clients/${name}`)).body.status)
await job('reactivar archivo', 'POST', `/api/clients/${name}/actions/unarchive`)
console.log('estado', (await call('GET', `/api/clients/${name}`)).body.status)
console.log('acción rara', (await call('POST', `/api/clients/${name}/actions/rm-rf`)).status)
console.log('descarga inválida', (await call('GET', '/api/backups/..%2F.env')).status)
console.log('perfil', (await call('PATCH', `/api/clients/VariedadesDayana/profile`, { contact: { name: 'Dayana', phone: '5912 5855' } })).body.client?.contact)
