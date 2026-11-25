import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import bcrypt from 'bcryptjs'
import * as XLSX from 'xlsx'
import { buildApp } from './app.js'
import { loadConfig } from './config.js'
import { makeShell } from './lib/shell.js'
import { applyCaddy, caddyFile } from './lib/caddy.js'
import { provisionRoutes } from './routes/provision.js'
import { validateTemplate } from '../../dengo-backend/scripts/plantilla-spec.js'

process.env.NODE_ENV = 'test'
const cfg = (extra: Record<string, string> = {}) => loadConfig({
  ADMIN_MODE: 'simulate', ADMIN_PASSWORD_HASH: bcrypt.hashSync('clave-correcta-123', 4), SESSION_SECRET: 'x'.repeat(40),
  DENGO_ROOT: mkdtempSync(join(tmpdir(), 'dadm-fix-')), ...extra,
})

test('C1: los procesos hijos no heredan PORT ni secretos del panel', async () => {
  process.env.PORT = '4900'
  process.env.PG_ADMIN_URL = 'postgresql://secreto'
  process.env.SESSION_SECRET = 'secreto-del-panel'
  const sh = makeShell('real')
  const script = join(mkdtempSync(join(tmpdir(), 'dadm-env-')), 'env.js')
  writeFileSync(script, 'console.log(JSON.stringify([process.env.PORT ?? null, process.env.PG_ADMIN_URL ?? null, process.env.SESSION_SECRET ?? null, process.env.EXTRA ?? null]))')
  const r = await sh('node', [script], { env: { EXTRA: 'si' } })
  assert.deepEqual(JSON.parse(r.out.trim()), [null, null, null, 'si'])
  delete process.env.PORT; delete process.env.PG_ADMIN_URL; delete process.env.SESSION_SECRET
})

test('C2: una ruta /api codificada no se salta el login', async () => {
  const app = await buildApp(cfg(), [async (a) => { a.get('/api/clients', async () => ({ clients: [] })) }])
  for (const url of ['/%61pi/clients', '/ap%69/clients', '/api/clients']) {
    assert.equal((await app.inject({ method: 'GET', url })).statusCode, 401, url)
  }
})

test('I1: dos altas a la vez no corren en paralelo', async () => {
  // an unreachable Postgres keeps the first alta in its first step for a few seconds
  const app = await buildApp(cfg({ PG_ADMIN_URL: 'postgresql://x:y@10.255.255.1:5432/postgres' }), [provisionRoutes])
  const login = await app.inject({ method: 'POST', url: '/api/login', payload: { password: 'clave-correcta-123' } })
  const cookie = login.cookies.find(c => c.name === 'dadm')!.value
  const body = (n: string) => ({
    displayName: n, domain: `${n.toLowerCase().replace(/\W/g, '')}.com`, admin: { name: 'Ana', email: 'a@b.com' },
    branches: [{ name: 'Central', code: 'CEN' }], modules: { pos: true, maestros: false, page: false, fel: false, ai: false },
    aiMonthlyLimit: 10, web: false,
  })
  const a = await app.inject({ method: 'POST', url: '/api/clients', cookies: { dadm: cookie }, payload: body('Cliente Uno') })
  const b = await app.inject({ method: 'POST', url: '/api/clients', cookies: { dadm: cookie }, payload: body('Cliente Dos') })
  assert.equal(a.statusCode, 202)
  assert.equal(b.statusCode, 409)
})

test('I2: si falla la recarga de Caddy, el archivo nuevo no se queda', async () => {
  const c = cfg()
  const reloadFails = makeShell('simulate', (cmd, args) => (cmd === 'sudo' && args.includes('reload') ? { code: 1, out: 'sudo: a password is required' } : undefined))
  await assert.rejects(applyCaddy(c, reloadFails, 'Cli', 'BLOQUE'))
  assert.equal(existsSync(caddyFile(c, 'Cli')), false)
})

test('I3: códigos de barras numéricos se leen completos, sin notación científica', () => {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['SKU', 'Código de barras', 'Nombre', 'Categoría', 'Precio'],
    ['A1', 7401234567890, 'Uno', 'X', 10], ['A2', 7401234567891, 'Dos', 'X', 12.5],
  ]), 'Productos')
  const v = validateTemplate(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer)
  assert.deepEqual(v.errors, [])
  assert.deepEqual(v.data.productos.map(r => r.barcode), ['7401234567890', '7401234567891'])
  assert.equal(v.data.productos[1]!.price, '12.5')
})
