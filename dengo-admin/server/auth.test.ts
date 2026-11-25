import { test } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { buildApp } from './app.js'
import { loadConfig } from './config.js'

process.env.NODE_ENV = 'test'
const config = loadConfig({ ADMIN_MODE: 'simulate', ADMIN_PASSWORD_HASH: bcrypt.hashSync('clave-correcta-123', 4), SESSION_SECRET: 'x'.repeat(40), DENGO_ROOT: './sandbox-test' })

test('login correcto da cookie y abre /api/*', async () => {
  const app = await buildApp(config, [async (a) => { a.get('/api/clients', async () => ({ clients: [] })) }])
  const res = await app.inject({ method: 'POST', url: '/api/login', payload: { password: 'clave-correcta-123' } })
  assert.equal(res.statusCode, 200)
  const cookie = res.cookies.find(c => c.name === 'dadm')
  assert.ok(cookie)
  const list = await app.inject({ method: 'GET', url: '/api/clients', cookies: { dadm: cookie!.value } })
  assert.equal(list.statusCode, 200)
})

test('contraseña incorrecta → 401', async () => {
  const app = await buildApp(config)
  const res = await app.inject({ method: 'POST', url: '/api/login', payload: { password: 'otra' } })
  assert.equal(res.statusCode, 401)
})

test('sin cookie /api/clients → 401; cookie falsificada → 401', async () => {
  const app = await buildApp(config, [async (a) => { a.get('/api/clients', async () => ({ clients: [] })) }])
  assert.equal((await app.inject({ method: 'GET', url: '/api/clients' })).statusCode, 401)
  assert.equal((await app.inject({ method: 'GET', url: '/api/clients', cookies: { dadm: String(Date.now() + 1e9) } })).statusCode, 401)
})
