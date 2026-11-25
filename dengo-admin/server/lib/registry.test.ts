import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pascalName, dbName, normalizeDomain } from './names.js'
import { parseEnv, updateEnv, renderEnv } from './env-file.js'
import { nextFreePort } from './ports.js'
import { listClients, maskEnv, takenPorts } from './registry.js'
import { loadConfig } from '../config.js'

test('nombres: acentos, ñ, espacios y dígitos iniciales', () => {
  assert.equal(pascalName('Librería Él'), 'LibreriaEl')
  assert.equal(pascalName('variedades dayana'), 'VariedadesDayana')
  assert.equal(pascalName('Piñata & Co.'), 'PinataCo')
  assert.equal(pascalName('3 Hermanos'), 'C3Hermanos')
  assert.equal(dbName('Librería Él'), 'libreria_el')
  assert.equal(dbName('3 Hermanos'), 'c_3_hermanos')
})

test('dominios: limpia protocolo, www y rutas; rechaza basura', () => {
  assert.equal(normalizeDomain('https://www.Cliente.com/'), 'cliente.com')
  assert.equal(normalizeDomain('libreria-el.com.gt'), 'libreria-el.com.gt')
  assert.equal(normalizeDomain('no es dominio'), null)
  assert.equal(normalizeDomain('localhost'), null)
})

test('env: actualizar conserva comentarios y agrega claves nuevas al final', () => {
  const text = '# Base\nDATABASE_URL=postgresql://a\n\n# Puerto\nPORT=3001\n'
  const out = updateEnv(text, { PORT: '3002', NUEVA: 'con espacio', DATABASE_URL: null })
  assert.equal(out, "# Base\n\n# Puerto\nPORT=3002\nNUEVA='con espacio'\n")
  assert.deepEqual(parseEnv(out), { PORT: '3002', NUEVA: 'con espacio' })
  assert.deepEqual(parseEnv(renderEnv([['# A', { X: '1' }], ['# B', { Y: 'a$b' }]])), { X: '1', Y: 'a$b' })
  assert.throws(() => renderEnv([['# C', { Z: "it's" }]]))
})

test('puertos: salta los de clientes y los que ya escuchan', async () => {
  const p = await nextFreePort(3001, new Set([3001, 3002]), async (port) => port === 3003)
  assert.equal(p, 3004)
})

test('registro: cliente sin cliente.json se infiere del .env', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dadm-'))
  mkdirSync(join(root, 'clients', 'VariedadesDayana'), { recursive: true })
  writeFileSync(join(root, 'clients', 'VariedadesDayana', '.env'),
    'PORT=3001\nDATABASE_URL="postgresql://u:secreta@localhost:5432/variedades_dayana?schema=public"\nCORS_ORIGIN=https://pos.variedadesdayana.com\nJWT_SECRET=abcdef123456\n')
  mkdirSync(join(root, 'clients', 'carpeta-sin-env'))
  const c = loadConfig({ ADMIN_MODE: 'simulate', ADMIN_PASSWORD_HASH: 'x', SESSION_SECRET: 'y', DENGO_ROOT: root })
  const list = await listClients(c)
  assert.equal(list.length, 1)
  const d = list[0]!
  assert.equal(d.inferred, true)
  assert.equal(d.file.displayName, 'Variedades Dayana')
  assert.equal(d.file.domain, 'variedadesdayana.com')
  assert.equal(d.file.apiPort, 3001)
  assert.equal(d.file.dbName, 'variedades_dayana')
  assert.equal(d.file.caddy, 'manual')
  assert.deepEqual([...await takenPorts(c)], [3001])
  const masked = maskEnv(d.env)
  assert.equal(masked.JWT_SECRET, '••••3456')
  assert.ok(!masked.DATABASE_URL!.includes('secreta'))
})
