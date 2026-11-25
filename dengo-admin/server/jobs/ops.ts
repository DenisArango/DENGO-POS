import { readFile, writeFile, readdir, stat } from 'node:fs/promises'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join } from 'node:path'
import type { Config } from '../config.js'
import type { Step, StepCtx } from './engine.js'
import { listClients, readClient, writeClientFile, type ClientRecord } from '../lib/registry.js'
import { updateEnv, plainDbUrl } from '../lib/env-file.js'
import { applyCaddy, renderClientCaddy } from '../lib/caddy.js'
import { checkDns } from '../lib/system.js'
import { health } from '../lib/pm2.js'
import { aiEnv } from '../lib/client-env.js'

const stamp = () => {
  const d = new Date(Date.now() - 6 * 3600_000) // hora de Guatemala
  return d.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-')
}

export const BACKUP_RE = /^([A-Za-z][A-Za-z0-9_-]*)-(\d{8}-\d{4})(-[a-z]+)?\.sql\.gz$/

/** pg_dump | gzip of one client into backups/<Name>-<fecha>[-motivo].sql.gz. Returns the file. */
export async function backupClient(c: Config, ctx: StepCtx, r: ClientRecord, reason = ''): Promise<string> {
  mkdirSync(c.backupsDir, { recursive: true })
  const out = join(c.backupsDir, `${r.file.name}-${stamp()}${reason ? `-${reason}` : ''}.sql.gz`)
  const url = r.env.DATABASE_URL
  if (!url) throw new Error(`${r.file.name} no tiene DATABASE_URL`)
  // pg_dump from the system, or (like dayana-web-activar.sh) from a Postgres image of the server's major version
  const script = [
    'set -o pipefail',
    'if command -v pg_dump >/dev/null 2>&1; then DUMP() { pg_dump "$@"; }',
    "else V=$(docker run --rm --network host postgres:16-alpine psql \"$PGURL\" -XtAc 'SHOW server_version' | cut -d. -f1 | tr -dc 0-9)",
    '  DUMP() { docker run --rm --network host "postgres:${V:-16}-alpine" pg_dump "$@"; }; fi',
    'DUMP "$PGURL" --no-owner --no-privileges | gzip > "$OUT"',
  ].join('\n')
  const res = await ctx.sh('bash', ['-c', script], { env: { PGURL: plainDbUrl(url), OUT: out } })
  if (res.code !== 0) throw new Error(`El respaldo de ${r.file.name} falló`)
  if (c.mode === 'simulate') writeFileSync(out, gzipSync(`-- respaldo simulado de ${r.file.name}\n`))
  const size = (await stat(out)).size
  if (size < 20) throw new Error(`El respaldo de ${r.file.name} salió vacío`)
  ctx.log(`  ${r.file.name} → ${out} (${(size / 1024).toFixed(0)} KB)`)
  return out
}

export async function listBackups(c: Config, name?: string) {
  if (!existsSync(c.backupsDir)) return []
  const files = (await readdir(c.backupsDir)).filter(f => BACKUP_RE.test(f) && (!name || f.startsWith(`${name}-`)))
  const out = await Promise.all(files.map(async f => ({ file: f, client: BACKUP_RE.exec(f)![1]!, size: (await stat(join(c.backupsDir, f))).size, at: (await stat(join(c.backupsDir, f))).mtime.toISOString() })))
  return out.filter(b => !name || b.client === name).sort((a, b) => b.at.localeCompare(a.at))
}

const procNames = (r: ClientRecord) => [r.file.name, ...(r.file.web ? [`${r.file.name}-web`] : [])]

/** The backend reads its .env: restart it with a clean environment (--update-env with only the
 * shell's allowlist) so stale variables saved in pm2 never override it. A -web process keeps
 * the environment it was started with (HOST/PORT/DENGO_API), so no --update-env there. */
const restartArgs = (name: string) => (name.endsWith('-web') ? ['restart', name] : ['restart', name, '--update-env'])

async function waitHealthy(c: Config, ctx: StepCtx, r: ClientRecord, seconds = 25) {
  for (let i = 0; i < seconds; i++) {
    const h = await health(c, r.file.apiPort, true)
    if (h.ok) { ctx.log(`  ${r.file.name} en línea (${h.ms} ms)`); return }
    await new Promise(res => setTimeout(res, 1000))
  }
  throw new Error(`${r.file.name} no respondió en ${seconds} s`)
}

export function restartSteps(c: Config, r: ClientRecord): Step[] {
  return [
    { id: 'restart', title: 'Reiniciar procesos', run: async (ctx) => {
      for (const n of procNames(r)) {
        const x = await ctx.sh('pm2', restartArgs(n))
        if (x.code !== 0) throw new Error(`pm2 no pudo reiniciar ${n}`)
      }
    } },
    { id: 'health', title: 'Esperar a que responda', run: ctx => waitHealthy(c, ctx, r) },
  ]
}

export function backupSteps(c: Config, r: ClientRecord): Step[] {
  return [{ id: 'backup', title: 'Respaldar la base de datos', run: async (ctx) => { await backupClient(c, ctx, r, 'manual') } }]
}

/** Writes the client's Caddy file from cliente.json (when DNS points here). */
export function caddySteps(c: Config, r: ClientRecord): Step[] {
  return [{
    id: 'caddy', title: 'Aplicar dominio en Caddy',
    run: async (ctx) => {
      if (r.file.caddy === 'manual') throw new Error('Este cliente tiene su Caddy escrito a mano en /etc/caddy/Caddyfile. Pásalo al panel primero (ver ficha).')
      if (!r.file.domain) throw new Error('El cliente no tiene dominio')
      const hosts = [`pos.${r.file.domain}`, ...(r.file.web ? [r.file.domain, `www.${r.file.domain}`] : [])]
      const checks = await Promise.all(hosts.map(h => checkDns(h, c.serverIp)))
      for (const ch of checks) ctx.log(`  DNS ${ch.host} → ${ch.addresses.join(', ') || 'sin registro'} ${ch.ok ? '✓' : '✗'}`)
      if (c.mode !== 'simulate' && checks.some(ch => !ch.ok)) throw new Error(`El DNS todavía no apunta a ${c.serverIp}`)
      await applyCaddy(c, ctx.sh, r.file.name, renderClientCaddy(r.file.name, { domain: r.file.domain, apiPort: r.file.apiPort, web: r.file.web, webPort: r.file.webPort, frontendDist: c.frontendDist }))
      await writeClientFile(c, { ...r.file, caddyPending: false })
    },
  }]
}

export function archiveSteps(c: Config, r: ClientRecord): Step[] {
  return [
    { id: 'backup', title: 'Respaldo final', run: async (ctx) => { await backupClient(c, ctx, r, 'archivo') } },
    { id: 'stop', title: 'Detener y quitar procesos', run: async (ctx) => {
      for (const n of procNames(r)) await ctx.sh('pm2', ['delete', n])
      await ctx.sh('pm2', ['save'])
    } },
    { id: 'caddy', title: 'Quitar dominio de Caddy', run: async (ctx) => {
      if (r.file.caddy === 'manual') { ctx.warn('Su bloque está en /etc/caddy/Caddyfile: quítalo a mano'); return }
      await applyCaddy(c, ctx.sh, r.file.name, null)
    } },
    { id: 'save', title: 'Marcar como archivado', run: async () => { await writeClientFile(c, { ...r.file, archived: true, caddyPending: r.file.caddy === 'managed' }) } },
  ]
}

export function unarchiveSteps(c: Config, r: ClientRecord): Step[] {
  const backend = join(c.appDir, 'dengo-backend')
  return [
    { id: 'start', title: 'Arrancar procesos', run: async (ctx) => {
      const x = await ctx.sh('pm2', ['start', join(backend, 'dist', 'index.js'), '--name', r.file.name, '--cwd', r.dir])
      if (x.code !== 0) throw new Error('pm2 no pudo arrancar el proceso')
      if (r.file.web && r.file.webPort) {
        const web = join(c.appDir, 'dengo-web')
        await ctx.sh('pm2', ['start', join(web, 'dist', 'server', 'entry.mjs'), '--name', `${r.file.name}-web`, '--cwd', web],
          { env: { HOST: '127.0.0.1', PORT: String(r.file.webPort), DENGO_API: `http://127.0.0.1:${r.file.apiPort}` } })
      }
      await ctx.sh('pm2', ['save'])
    } },
    { id: 'health', title: 'Esperar a que responda', run: ctx => waitHealthy(c, ctx, r) },
    { id: 'save', title: 'Quitar marca de archivado', run: async () => { await writeClientFile(c, { ...r.file, archived: false }) } },
    ...(r.file.caddy === 'managed' ? caddySteps(c, { ...r, file: { ...r.file, archived: false } }).map(s => ({ ...s, run: async (ctx: StepCtx) => {
      try { await s.run(ctx) } catch (e) { ctx.warn(`${(e as Error).message}: aplícalo desde la ficha`) }
    } })) : []),
  ]
}

/** Rewrites keys in a client's .env (keeps everything else as it is). */
export async function patchClientEnv(r: ClientRecord, updates: Record<string, string | null>) {
  const p = join(r.dir, '.env')
  await writeFile(p, updateEnv(await readFile(p, 'utf8'), updates), { mode: 0o600 })
}

/** Global Anthropic/Digifact keys from the panel's .env → every active client, then restart them. */
export function propagateSteps(c: Config): Step[] {
  return [
    { id: 'write', title: 'Escribir las claves globales en cada cliente', run: async (ctx) => {
      ctx.secret(c.globals.anthropicKey); ctx.secret(c.globals.digifactPassword)
      const clients = (await listClients(c)).filter(r => !r.file.archived)
      for (const r of clients) {
        const up: Record<string, string> = { ...aiEnv(c) }
        if (r.env.FEL_PROVIDER === 'digifact') Object.assign(up, { DIGIFACT_USER: c.globals.digifactUser, DIGIFACT_PASSWORD: c.globals.digifactPassword })
        await patchClientEnv(r, up)
        ctx.log(`  ${r.file.name}: ${Object.keys(up).join(', ')}`)
      }
      ctx.data.clients = clients.map(r => r.file.name)
    } },
    { id: 'restart', title: 'Reiniciar clientes', run: async (ctx) => {
      for (const name of ctx.data.clients as string[]) {
        const r = await readClient(c, name)
        if (!r) continue
        await ctx.sh('pm2', restartArgs(name))
        await waitHealthy(c, ctx, r)
      }
    } },
  ]
}

/** New version for everyone: pull, back up every base, push schema to each, build, restart, check. */
export function deploySteps(c: Config, opts: { acceptDataLoss?: boolean } = {}): Step[] {
  const app = c.appDir
  const backend = join(app, 'dengo-backend')
  const active = async () => (await listClients(c)).filter(r => !r.file.archived)
  const npm = async (ctx: StepCtx, dir: string, args: string[]) => {
    const r = await ctx.sh('npm', args, { cwd: dir })
    if (r.code !== 0) throw new Error(`npm ${args.join(' ')} falló en ${dir.split(/[\\/]/).pop()}`)
  }
  return [
    { id: 'pull', title: 'Traer la versión nueva (git pull)', run: async (ctx) => {
      const r = await ctx.sh('git', ['pull', '--ff-only'], { cwd: app })
      if (r.code !== 0) throw new Error('git pull falló (¿cambios locales en el servidor?)')
    } },
    { id: 'backup', title: 'Respaldar la base de cada cliente', run: async (ctx) => {
      for (const r of await active()) await backupClient(c, ctx, r, 'deploy')
    } },
    { id: 'deps', title: 'Dependencias del backend', run: ctx => npm(ctx, backend, ['install', '--no-audit', '--no-fund']) },
    { id: 'schema', title: 'Tablas nuevas en cada base (prisma db push)', run: async (ctx) => {
      for (const r of await active()) {
        ctx.log(`  ${r.file.name}`)
        // --accept-data-loss only when asked: Prisma warns on every new unique index, even over an empty column
        const args = ['prisma', 'db', 'push', '--skip-generate', ...(opts.acceptDataLoss ? ['--accept-data-loss'] : [])]
        const x = await ctx.sh('npx', args, { cwd: backend, env: { DATABASE_URL: r.env.DATABASE_URL ?? '' } })
        if (x.code !== 0) throw new Error(`db push falló en ${r.file.name}. Si el aviso es de un índice único nuevo, revisa el log y repite marcando «Aceptar avisos de Prisma» (los respaldos ya están hechos)`)
      }
      const g = await ctx.sh('npx', ['prisma', 'generate'], { cwd: backend })
      if (g.code !== 0) throw new Error('prisma generate falló')
    } },
    { id: 'build-backend', title: 'Compilar backend', run: ctx => npm(ctx, backend, ['run', 'build']) },
    { id: 'build-pos', title: 'Compilar POS', run: async (ctx) => {
      await npm(ctx, join(app, 'dengo-frontend'), ['install', '--no-audit', '--no-fund'])
      await npm(ctx, join(app, 'dengo-frontend'), ['run', 'build'])
    } },
    { id: 'build-web', title: 'Compilar página web', run: async (ctx) => {
      if (!(await active()).some(r => r.file.web)) return 'skipped'
      await npm(ctx, join(app, 'dengo-web'), ['install', '--no-audit', '--no-fund'])
      await npm(ctx, join(app, 'dengo-web'), ['run', 'build'])
    } },
    { id: 'restart', title: 'Reiniciar a todos los clientes', run: async (ctx) => {
      for (const r of await active()) for (const n of procNames(r)) await ctx.sh('pm2', restartArgs(n))
      await ctx.sh('pm2', ['save'])
    } },
    { id: 'health', title: 'Revisar que todos respondan', run: async (ctx) => {
      const bad: string[] = []
      for (const r of await active()) { try { await waitHealthy(c, ctx, r, 30) } catch { bad.push(r.file.name) } }
      if (bad.length) throw new Error(`No responden: ${bad.join(', ')}`)
    } },
  ]
}
