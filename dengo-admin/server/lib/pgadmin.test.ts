// Needs a real Postgres: TEST_PG_ADMIN_URL=postgresql://dengo_admin_test:…@localhost:5434/postgres
// (a role with only CREATEDB + CREATEROLE, like the server's). Skipped without it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'
import { loadConfig } from '../config.js'
import { createClientDb, dropClientDb, clientDbExists } from './pgadmin.js'
import { databaseUrl } from './client-env.js'

const url = process.env.TEST_PG_ADMIN_URL
const c = loadConfig({
  ADMIN_MODE: 'simulate', ADMIN_PASSWORD_HASH: 'x', SESSION_SECRET: 'y', DENGO_ROOT: mkdtempSync(join(tmpdir(), 'dadm-pg-')),
  PG_ADMIN_URL: url ?? '', DB_HOST: 'localhost', DB_PORT: url ? new URL(url).port : '5432',
})

test('cada cliente tiene su propio usuario dueño de su base, y deshacer borra los dos', { skip: !url && 'sin TEST_PG_ADMIN_URL' }, async () => {
  const name = `zz_prueba_${Date.now().toString(36)}`
  const password = 'clave-de-prueba-0123456789'
  assert.equal(await clientDbExists(c, name), false)
  await createClientDb(c, name, password)
  assert.equal(await clientDbExists(c, name), true)

  // the client's own user can create tables in its own database
  const db = new pg.Client({ connectionString: databaseUrl(c, name, name, password).split('?')[0] })
  await db.connect()
  await db.query('CREATE TABLE t (id int)')
  const who = await db.query('SELECT current_user u, (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = current_database()) o')
  await db.end()
  assert.equal(who.rows[0].u, name)
  assert.equal(who.rows[0].o, name)

  await dropClientDb(c, name)
  assert.equal(await clientDbExists(c, name), false)
})
