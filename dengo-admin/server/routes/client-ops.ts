import type { FastifyInstance, FastifyReply } from 'fastify'
import { createReadStream, existsSync } from 'node:fs'
import { open, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import type { Config } from '../config.js'
import { services } from '../lib/services.js'
import { readClient, writeClientFile, type ClientRecord } from '../lib/registry.js'
import { withClientDb, readLicense } from '../lib/clientdb.js'
import { felEnv } from '../lib/client-env.js'
import { normalizeDomain } from '../lib/names.js'
import type { Step } from '../jobs/engine.js'
import { forgetMetrics } from './clients.js'
import {
  restartSteps, backupSteps, caddySteps, archiveSteps, unarchiveSteps, propagateSteps, deploySteps,
  patchClientEnv, listBackups, BACKUP_RE,
} from '../jobs/ops.js'

const licenseSchema = z.object({
  posEnabled: z.boolean(), maestrosEnabled: z.boolean(), pageEnabled: z.boolean(), aiEnabled: z.boolean(),
  aiMonthlyLimit: z.number().int().min(0).max(100_000).nullable(),
  suspended: z.boolean(), suspendedMessage: z.string().trim().max(300).nullable(),
}).partial()

const COLS: Record<string, string> = {
  posEnabled: 'POS_ENABLED', maestrosEnabled: 'MAESTROS_ENABLED', pageEnabled: 'PAGE_ENABLED', aiEnabled: 'AI_ENABLED',
  aiMonthlyLimit: 'AI_MONTHLY_LIMIT', suspended: 'SUSPENDED', suspendedMessage: 'SUSPENDED_MESSAGE',
}

const felSchema = z.object({
  enabled: z.boolean(),
  fel: z.object({
    nit: z.string().trim().min(5).max(20),
    frases: z.string().trim().regex(/^\d+:\d+(,\s*\d+:\d+)*$/),
    docType: z.enum(['FACT', 'FPEQ']),
    establishment: z.string().trim().min(1).max(5),
    env: z.enum(['test', 'production']),
    sellerName: z.string().max(200).optional(),
    allowCf: z.boolean().optional(),
    sendEmail: z.boolean().optional(),
  }).nullable(),
})

const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  domain: z.string().trim().max(190).nullable(),
  contact: z.object({ name: z.string().max(120).optional(), phone: z.string().max(40).optional(), email: z.string().max(150).optional() }),
  notes: z.string().max(2000),
  web: z.boolean(),
  webPort: z.number().int().min(1024).max(65535).nullable(),
  caddy: z.enum(['managed', 'manual']),
}).partial()

const ACTIONS = ['restart', 'backup', 'caddy', 'archive', 'unarchive'] as const

export async function clientOpsRoutes(app: FastifyInstance, { config }: { config: Config }) {
  const { jobs } = services(config)

  const load = async (name: string, reply: FastifyReply): Promise<ClientRecord | null> => {
    const r = await readClient(config, name)
    if (!r) { reply.status(404).send({ error: 'No existe ese cliente' }); return null }
    return r
  }
  const startJob = (reply: FastifyReply, kind: string, title: string, client: string | null, steps: Step[]) => {
    try {
      const j = jobs.start({ kind, title, client, steps })
      return reply.status(202).send({ jobId: j.id })
    } catch (e: any) {
      return reply.status(e.statusCode ?? 500).send({ error: e.message, jobId: e.jobId })
    }
  }

  // Modules, AI and suspension: straight into the client's LICENSE_CONFIG (its backend picks it up within 15 s).
  app.patch<{ Params: { name: string } }>('/api/clients/:name/license', async (req, reply) => {
    const r = await load(req.params.name, reply); if (!r) return
    const body = licenseSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Datos inválidos' })
    const entries = Object.entries(body.data).filter(([, v]) => v !== undefined)
    if (!entries.length) return reply.status(400).send({ error: 'Nada que cambiar' })
    const license = await withClientDb(r.env.DATABASE_URL!, async (db) => {
      const sets = entries.map(([k], i) => `"${COLS[k]}" = $${i + 1}`).join(', ')
      const u = await db.query(`UPDATE "LICENSE_CONFIG" SET ${sets}, "UPDATED_AT" = now()`, entries.map(([, v]) => v))
      if (!u.rowCount) throw new Error('El cliente no tiene licencia (¿se corrió el seed?)')
      return readLicense(db)
    })
    forgetMetrics(r.file.name)
    return { license }
  })

  // FEL (Digifact): the .env holds the certifier data, the licence shows/hides «factura»; then restart.
  app.patch<{ Params: { name: string } }>('/api/clients/:name/fel', async (req, reply) => {
    const r = await load(req.params.name, reply); if (!r) return
    const body = felSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Revisa los datos de FEL' })
    if (body.data.enabled && !body.data.fel) return reply.status(400).send({ error: 'Faltan los datos de FEL' })
    if (jobs.busy(r.file.name)) return reply.status(409).send({ error: 'Hay un trabajo en curso para este cliente' })
    const keys = ['FEL_PROVIDER', 'DIGIFACT_ENV', 'DIGIFACT_NIT', 'DIGIFACT_USER', 'DIGIFACT_PASSWORD', 'DIGIFACT_ESTABLISHMENT', 'DIGIFACT_FRASES', 'DIGIFACT_SELLER_NAME', 'FEL_DOC_TYPE', 'FEL_ALLOW_CF', 'FEL_SEND_EMAIL']
    const next = felEnv(config, body.data.enabled, body.data.fel)
    // turning FEL off keeps the client's data in the .env (only the provider goes to none)
    await patchClientEnv(r, body.data.enabled ? Object.fromEntries(keys.map(k => [k, next[k] ?? null])) : { FEL_PROVIDER: 'none' })
    await withClientDb(r.env.DATABASE_URL!, db => db.query('UPDATE "LICENSE_CONFIG" SET "FEL_ENABLED" = $1, "UPDATED_AT" = now()', [body.data.enabled]))
    forgetMetrics(r.file.name)
    return startJob(reply, 'restart', `FEL de ${r.file.displayName}: reinicio`, r.file.name, restartSteps(config, r))
  })

  // Ficha: name, contact, notes, domain… (also how an older client gets its cliente.json).
  app.patch<{ Params: { name: string } }>('/api/clients/:name/profile', async (req, reply) => {
    const r = await load(req.params.name, reply); if (!r) return
    const body = profileSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Datos inválidos' })
    const next = { ...r.file, ...body.data }
    if (body.data.domain !== undefined) {
      const d = body.data.domain ? normalizeDomain(body.data.domain) : null
      if (body.data.domain && !d) return reply.status(400).send({ error: 'Dominio inválido' })
      if (d !== r.file.domain && next.caddy === 'managed') next.caddyPending = true
      next.domain = d
    }
    await writeClientFile(config, next)
    forgetMetrics(r.file.name)
    return { client: next }
  })

  app.post<{ Params: { name: string; action: string } }>('/api/clients/:name/actions/:action', async (req, reply) => {
    const r = await load(req.params.name, reply); if (!r) return
    const a = req.params.action as (typeof ACTIONS)[number]
    if (!ACTIONS.includes(a)) return reply.status(404).send({ error: 'Acción desconocida' })
    if (a !== 'unarchive' && r.file.archived && a !== 'backup') return reply.status(400).send({ error: 'El cliente está archivado' })
    if (a === 'archive' || a === 'unarchive') {
      if (r.inferred) await writeClientFile(config, r.file) // freeze the inferred ficha first
    }
    const n = r.file.displayName
    const map = {
      restart: () => startJob(reply, 'restart', `Reiniciar ${n}`, r.file.name, restartSteps(config, r)),
      backup: () => startJob(reply, 'backup', `Respaldar ${n}`, r.file.name, backupSteps(config, r)),
      caddy: () => startJob(reply, 'caddy', `Dominio de ${n} en Caddy`, r.file.name, caddySteps(config, r)),
      archive: () => startJob(reply, 'archive', `Archivar ${n}`, r.file.name, archiveSteps(config, r)),
      unarchive: () => startJob(reply, 'unarchive', `Reactivar ${n}`, r.file.name, unarchiveSteps(config, r)),
    }
    return map[a]()
  })

  // Tail of the pm2 logs (error or out).
  app.get<{ Params: { name: string }; Querystring: { kind?: string; lines?: string } }>('/api/clients/:name/logs', async (req, reply) => {
    const r = await load(req.params.name, reply); if (!r) return
    const kind = req.query.kind === 'out' ? 'out' : 'error'
    const want = Math.min(Math.max(Number(req.query.lines) || 200, 10), 2000)
    const suffix = req.query.kind === 'web' ? '-web-error' : `-${kind}`
    const file = join(homedir(), '.pm2', 'logs', `${r.file.name}${suffix}.log`)
    if (!existsSync(file)) return { file, lines: [], missing: true }
    const size = (await stat(file)).size
    const len = Math.min(size, want * 400)
    const fh = await open(file, 'r')
    const buf = Buffer.alloc(len)
    await fh.read(buf, 0, len, size - len)
    await fh.close()
    return { file, lines: buf.toString('utf8').split('\n').slice(-want), missing: false }
  })

  app.get<{ Params: { name: string } }>('/api/clients/:name/backups', async (req) => ({ backups: await listBackups(config, req.params.name) }))
  app.get('/api/backups', async () => ({ backups: await listBackups(config) }))

  app.get<{ Params: { file: string } }>('/api/backups/:file', async (req, reply) => {
    if (!BACKUP_RE.test(req.params.file)) return reply.status(400).send({ error: 'Archivo inválido' })
    const p = join(config.backupsDir, req.params.file)
    if (!existsSync(p)) return reply.status(404).send({ error: 'No existe' })
    reply.header('content-type', 'application/gzip').header('content-disposition', `attachment; filename="${req.params.file}"`)
    return reply.send(createReadStream(p))
  })

  app.post('/api/deploy', async (req, reply) => {
    const acceptDataLoss = (req.body as { acceptDataLoss?: unknown } | null)?.acceptDataLoss === true
    return startJob(reply, 'deploy', `Desplegar versión nueva a todos${acceptDataLoss ? ' (aceptando avisos de Prisma)' : ''}`, null, deploySteps(config, { acceptDataLoss }))
  })
  app.post('/api/globals/propagate', async (_req, reply) => startJob(reply, 'propagate', 'Claves globales → todos los clientes', null, propagateSteps(config)))

  app.get('/api/globals', async () => ({
    anthropicKey: config.globals.anthropicKey ? `••••${config.globals.anthropicKey.slice(-4)}` : '',
    anthropicModel: config.globals.anthropicModel,
    anthropicAnalystModel: config.globals.anthropicAnalystModel,
    digifactUser: config.globals.digifactUser,
    digifactPassword: config.globals.digifactPassword ? '••••••' : '',
    serverIp: config.serverIp,
    root: config.root,
    mode: config.mode,
  }))
}
