import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import bcrypt from 'bcryptjs'
import * as XLSX from 'xlsx'
import AdmZip from 'adm-zip'
import { buildApp } from './app.js'
import { loadConfig } from './config.js'
import { makeShell } from './lib/shell.js'
import { JobManager } from './jobs/engine.js'
import { clientOpsRoutes } from './routes/client-ops.js'
import { extractImages, batchStamp, BATCH_RE } from './routes/migration.js'
import { validateTemplate, buildTemplate } from '../../dengo-backend/scripts/plantilla-spec.js'

process.env.NODE_ENV = 'test'
const cfg = () => loadConfig({
  ADMIN_MODE: 'simulate', ADMIN_PASSWORD_HASH: bcrypt.hashSync('clave-correcta-123', 4), SESSION_SECRET: 'x'.repeat(40),
  DENGO_ROOT: mkdtempSync(join(tmpdir(), 'dadm-min-')),
})
const login = async (app: Awaited<ReturnType<typeof buildApp>>) =>
  (await app.inject({ method: 'POST', url: '/api/login', payload: { password: 'clave-correcta-123' } })).cookies.find(c => c.name === 'dadm')!.value

test('M8: cerrar sesión invalida la cookie', async () => {
  const app = await buildApp(cfg(), [async (a) => { a.get('/api/clients', async () => ({ ok: true })) }])
  const cookie = await login(app)
  assert.equal((await app.inject({ method: 'GET', url: '/api/clients', cookies: { dadm: cookie } })).statusCode, 200)
  await app.inject({ method: 'POST', url: '/api/logout', cookies: { dadm: cookie } })
  assert.equal((await app.inject({ method: 'GET', url: '/api/clients', cookies: { dadm: cookie } })).statusCode, 401)
})

test('M9: un trabajo que quedó «en curso» al reiniciar el panel se marca interrumpido', () => {
  const c = cfg()
  mkdirSync(join(c.adminDir, 'jobs'), { recursive: true })
  const stale = { id: '20261125-aaaaaaaa', kind: 'deploy', title: 'x', client: null, status: 'running', startedAt: new Date().toISOString(), endedAt: null, steps: [{ id: 's', title: 's', status: 'running' }], lines: [], error: null }
  writeFileSync(join(c.adminDir, 'jobs', `${stale.id}.json`), JSON.stringify(stale))
  const m = new JobManager(c, makeShell('simulate'))
  const j = m.get(stale.id)!
  assert.equal(j.status, 'failed')
  assert.match(j.error ?? '', /interrump/i)
  assert.equal(j.steps[0]!.status, 'failed')
})

test('M10: la ficha rechaza un puerto web que ya usa otro cliente', async () => {
  const c = cfg()
  for (const [n, port] of [['Uno', 3001], ['Dos', 3002]] as const) {
    mkdirSync(join(c.clientsDir, n), { recursive: true })
    writeFileSync(join(c.clientsDir, n, '.env'), `PORT=${port}\nDATABASE_URL=postgresql://u@localhost/x\n`)
  }
  const app = await buildApp(c, [clientOpsRoutes])
  const cookie = await login(app)
  const r = await app.inject({ method: 'PATCH', url: '/api/clients/Dos/profile', cookies: { dadm: cookie }, payload: { web: true, webPort: 3001 } })
  assert.equal(r.statusCode, 400)
  const ok = await app.inject({ method: 'PATCH', url: '/api/clients/Dos/profile', cookies: { dadm: cookie }, payload: { web: true, webPort: 4405 } })
  assert.equal(ok.statusCode, 200)
})

test('M4: cantidades negativas son error; filas de ejemplo de la plantilla avisan', () => {
  const wb = XLSX.read(buildTemplate())
  XLSX.utils.sheet_add_aoa(wb.Sheets['Inventario']!, [['CUA-100', -5, 2]], { origin: -1 })
  const v = validateTemplate(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer)
  assert.ok(v.errors.some(e => e.sheet === 'Inventario' && /negativ/i.test(e.message)))
  assert.ok(v.warnings.some(w => /ejemplo/i.test(w.message)))
})

test('M5: dos lotes en el mismo segundo tienen ids distintos y válidos', () => {
  const a = batchStamp(), b = batchStamp()
  assert.notEqual(a, b)
  assert.match(a, BATCH_RE)
})

test('M6: el zip respeta límites y no pisa fotos con el mismo nombre', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dadm-zip-'))
  const zip = new AdmZip()
  zip.addFile('a/LAP-01.jpg', Buffer.from('uno'))
  zip.addFile('b/LAP-01.jpg', Buffer.from('dos'))
  zip.addFile('GRANDE.jpg', Buffer.alloc(30 * 1024 * 1024))
  const r = extractImages(zip.toBuffer(), dir)
  assert.equal(r.saved, 1)
  assert.equal(readFileSync(join(dir, 'LAP-01.jpg'), 'utf8'), 'uno')
  assert.deepEqual(readdirSync(dir), ['LAP-01.jpg'])
  assert.equal(r.duplicates, 1)
  assert.equal(r.tooBig, 1)
})
