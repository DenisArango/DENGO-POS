import { readdir, readFile, writeFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Config } from '../config.js'
import { parseEnv } from './env-file.js'
import { splitPascal } from './names.js'
import { pm2List } from './pm2.js'
import { shellFor } from './runtime.js'

export interface Contact { name?: string; phone?: string; email?: string }

/** clients/<Name>/cliente.json — what the panel knows about a client beyond its .env. */
export interface ClientFile {
  name: string
  displayName: string
  domain: string | null
  apiPort: number
  web: boolean
  webPort: number | null
  contact: Contact
  notes: string
  createdAt: string
  archived: boolean
  /** managed = its Caddy blocks live in caddy/<Name>.caddy; manual = in the main Caddyfile (older clients). */
  caddy: 'managed' | 'manual'
  /** Caddy blocks not applied yet because DNS didn't point here. */
  caddyPending: boolean
  dbName: string | null
}

export interface ClientRecord {
  file: ClientFile
  env: Record<string, string>
  inferred: boolean
  dir: string
}

export const dbFromUrl = (u: string | undefined): string | null => {
  if (!u) return null
  const m = /^[a-z]+:\/\/[^/]+\/([^/?]+)/i.exec(u)
  return m ? m[1]! : null
}

/** Domain from CORS_ORIGIN (https://pos.cliente.com → cliente.com) for clients set up by hand. */
function domainFromEnv(env: Record<string, string>): string | null {
  const first = (env.CORS_ORIGIN ?? '').split(',').map(s => s.trim()).find(s => s.startsWith('https://'))
  if (!first) return null
  return first.replace(/^https:\/\//, '').replace(/\/.*$/, '').replace(/^(pos|www)\./, '')
}

export const validClientName = (name: string) => /^[A-Za-z][A-Za-z0-9_-]{0,59}$/.test(name)

export async function readClient(c: Config, name: string): Promise<ClientRecord | null> {
  if (!validClientName(name)) return null
  const dir = join(c.clientsDir, name)
  const envPath = join(dir, '.env')
  if (!existsSync(envPath)) return null
  const env = parseEnv(await readFile(envPath, 'utf8'))
  const jsonPath = join(dir, 'cliente.json')
  if (existsSync(jsonPath)) {
    const file = JSON.parse(await readFile(jsonPath, 'utf8')) as ClientFile
    return { file: { ...file, name, apiPort: Number(env.PORT ?? file.apiPort), dbName: dbFromUrl(env.DATABASE_URL) ?? file.dbName }, env, inferred: false, dir }
  }
  const created = (await stat(envPath)).birthtime.toISOString()
  return {
    file: {
      name, displayName: splitPascal(name), domain: domainFromEnv(env), apiPort: Number(env.PORT ?? 0),
      web: false, webPort: null, contact: {}, notes: '', createdAt: created, archived: false,
      caddy: 'manual', caddyPending: false, dbName: dbFromUrl(env.DATABASE_URL),
    },
    env, inferred: true, dir,
  }
}

export async function listClients(c: Config): Promise<ClientRecord[]> {
  if (!existsSync(c.clientsDir)) return []
  const dirs = (await readdir(c.clientsDir, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name)
  const out: ClientRecord[] = []
  for (const d of dirs.sort()) {
    const r = await readClient(c, d)
    if (r) out.push(r)
  }
  return out
}

export async function writeClientFile(c: Config, file: ClientFile) {
  await writeFile(join(c.clientsDir, file.name, 'cliente.json'), JSON.stringify(file, null, 2) + '\n')
}

/** Ports any client claims (backend and web, `except` one client), for the allocator and the ficha.
 * Also every PORT a pm2 process was started with: older clients (no cliente.json) only record their
 * web port there, so a stopped web process would otherwise look free. */
export async function takenPorts(c: Config, except?: string): Promise<Set<number>> {
  const s = new Set<number>()
  for (const r of await listClients(c)) {
    if (r.file.name === except) continue
    if (r.file.apiPort) s.add(r.file.apiPort)
    if (r.file.webPort) s.add(r.file.webPort)
  }
  for (const p of await pm2List(c, shellFor(c))) {
    if (except && (p.name === except || p.name === `${except}-web`)) continue
    if (p.port) s.add(p.port)
  }
  return s
}

const SECRET = /(KEY|SECRET|PASSWORD|TOKEN)$/
/** The .env for the browser: secrets masked to their last 4 characters. */
export function maskEnv(env: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(env).map(([k, v]) => {
    if (k === 'DATABASE_URL') return [k, v.replace(/:[^:@/]+@/, ':••••@')]
    return [k, SECRET.test(k) && v ? `••••${v.slice(-4)}` : v]
  }))
}
