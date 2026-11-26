import pg from 'pg'
import type { Config } from '../config.js'

/** Runs fn on a connection with the panel's PG_ADMIN_URL (a role with CREATEDB + CREATEROLE). */
export async function adminDb<T>(c: Config, fn: (db: pg.Client) => Promise<T>): Promise<T> {
  if (!c.pgAdminUrl) throw new Error('Falta PG_ADMIN_URL en el .env del panel')
  const db = new pg.Client({ connectionString: c.pgAdminUrl, connectionTimeoutMillis: 5000 })
  await db.connect()
  try { return await fn(db) } finally { await db.end().catch(() => {}) }
}

// Names come from dbName() (a-z, 0-9, _), so quoting them as identifiers is safe; checked again here.
const ident = (s: string) => {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(s)) throw new Error(`Nombre de base inválido: ${s}`)
  return `"${s}"`
}
const literal = (s: string) => {
  if (!/^[A-Za-z0-9._~-]{16,128}$/.test(s)) throw new Error('Contraseña de base inválida')
  return `'${s}'`
}

/** Whether a database or a role with this name already exists. */
export async function clientDbExists(c: Config, name: string): Promise<boolean> {
  return adminDb(c, async (db) => {
    const r = await db.query('SELECT 1 FROM pg_database WHERE datname = $1 UNION ALL SELECT 1 FROM pg_roles WHERE rolname = $1', [name])
    return (r.rowCount ?? 0) > 0
  })
}

/**
 * The client's own login role and its database, owned by that role (as Variedades Dayana has it:
 * one user per client, so no client can read another's data). The panel's role keeps membership
 * in the new role so it can drop the database again when an alta is undone.
 */
export async function createClientDb(c: Config, name: string, password: string) {
  await adminDb(c, async (db) => {
    await db.query(`CREATE ROLE ${ident(name)} LOGIN PASSWORD ${literal(password)}`)
    try {
      await db.query(`GRANT ${ident(name)} TO CURRENT_USER`)
      await db.query(`CREATE DATABASE ${ident(name)} OWNER ${ident(name)} ENCODING 'UTF8'`)
    } catch (e) {
      await db.query(`DROP ROLE IF EXISTS ${ident(name)}`).catch(() => {})
      throw e
    }
  })
}

export async function dropClientDb(c: Config, name: string) {
  await adminDb(c, async (db) => {
    await db.query(`DROP DATABASE IF EXISTS ${ident(name)} WITH (FORCE)`)
    await db.query(`DROP ROLE IF EXISTS ${ident(name)}`)
  })
}
