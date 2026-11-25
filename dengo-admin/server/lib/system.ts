import os from 'node:os'
import { statfs, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve4 } from 'node:dns/promises'
import type { Config } from '../config.js'
import type { Sh } from './shell.js'

/** Whether host resolves to this server's IP (Caddy can only get a certificate if it does). */
export async function checkDns(host: string, serverIp: string): Promise<{ host: string; ok: boolean; addresses: string[] }> {
  try {
    const addresses = await resolve4(host)
    return { host, ok: !!serverIp && addresses.includes(serverIp), addresses }
  } catch {
    return { host, ok: false, addresses: [] }
  }
}

export interface ServerInfo {
  mode: Config['mode']
  hostname: string
  memTotal: number
  memFree: number
  load: number[]
  cpus: number
  diskTotal: number
  diskFree: number
  uptimeSec: number
  node: string
  root: string
  serverIp: string
  setup: { id: string; label: string; ok: boolean; hint: string }[]
}

/** Machine status plus the one-time setup checklist (Caddy import, sudoers, Postgres, folders). */
export async function serverInfo(c: Config, sh: Sh): Promise<ServerInfo> {
  let diskTotal = 0, diskFree = 0
  try {
    const s = await statfs(existsSync(c.root) ? c.root : process.cwd())
    diskTotal = s.blocks * s.bsize
    diskFree = s.bavail * s.bsize
  } catch { /* unsupported */ }

  const sim = c.mode === 'simulate'
  const caddyfile = sim ? '' : await readFile('/etc/caddy/Caddyfile', 'utf8').catch(() => '')
  const importLine = `import ${c.caddyDir}/*.caddy`
  const sudo = sim ? { code: 0, out: '' } : await sh('sudo', ['-n', '-l'])
  const pgOk = await pgReachable(c)

  const setup = [
    { id: 'folders', label: 'Carpetas de DENGO', ok: existsSync(c.clientsDir), hint: `mkdir -p ${c.clientsDir} ${c.backupsDir} ${c.caddyDir}` },
    { id: 'app', label: 'Código en app/', ok: existsSync(`${c.appDir}/dengo-backend/package.json`), hint: `git clone <repo> ${c.appDir}` },
    { id: 'caddy-import', label: 'Caddy importa los bloques del panel', ok: sim || caddyfile.includes(importLine), hint: `Agrega al final de /etc/caddy/Caddyfile:\n${importLine}` },
    { id: 'sudoers', label: 'Permiso para validar y recargar Caddy', ok: sim || (sudo.code === 0 && /caddy/.test(sudo.out) && /systemctl reload caddy/.test(sudo.out)),
      hint: `sudo visudo -f /etc/sudoers.d/dengo-admin\n${os.userInfo().username} ALL=(root) NOPASSWD: /usr/bin/caddy validate --config /etc/caddy/Caddyfile, /usr/bin/systemctl reload caddy` },
    { id: 'pg', label: 'PostgreSQL (rol con CREATEDB)', ok: pgOk, hint: 'Revisa PG_ADMIN_URL en el .env del panel' },
    { id: 'server-ip', label: 'IP pública configurada', ok: !!c.serverIp, hint: 'SERVER_IP=<ip del servidor> en el .env del panel' },
    { id: 'globals', label: 'Claves de Anthropic y Digifact', ok: !!c.globals.anthropicKey && !!c.globals.digifactUser, hint: 'ANTHROPIC_API_KEY, DIGIFACT_USER y DIGIFACT_PASSWORD en el .env del panel' },
  ]

  return {
    mode: c.mode, hostname: os.hostname(), memTotal: os.totalmem(), memFree: os.freemem(), load: os.loadavg(), cpus: os.cpus().length,
    diskTotal, diskFree, uptimeSec: os.uptime(), node: process.version, root: c.root, serverIp: c.serverIp, setup,
  }
}

async function pgReachable(c: Config): Promise<boolean> {
  if (!c.pgAdminUrl) return false
  const { default: pg } = await import('pg')
  const db = new pg.Client({ connectionString: c.pgAdminUrl, connectionTimeoutMillis: 3000 })
  try {
    await db.connect()
    const r = await db.query('SELECT rolcreatedb OR rolsuper AS ok FROM pg_roles WHERE rolname = current_user')
    return !!r.rows[0]?.ok
  } catch { return false } finally { await db.end().catch(() => {}) }
}
