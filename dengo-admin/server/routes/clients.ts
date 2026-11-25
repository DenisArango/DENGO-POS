import type { FastifyInstance } from 'fastify'
import type { Config } from '../config.js'
import { listClients, readClient, maskEnv, type ClientRecord } from '../lib/registry.js'
import { pm2List, health, type Pm2Proc } from '../lib/pm2.js'
import { clientMetrics, type ClientMetrics } from '../lib/clientdb.js'
import { checkDns, serverInfo } from '../lib/system.js'
import { shellFor } from '../lib/runtime.js'

const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('tiempo agotado')), ms))])

// Metrics hit each client's database: keep them 15 s so the dashboard can poll.
const metricsCache = new Map<string, { at: number; value: ClientMetrics | null; error: string | null }>()
async function metricsFor(r: ClientRecord, fresh = false) {
  const hit = metricsCache.get(r.file.name)
  if (!fresh && hit && Date.now() - hit.at < 15_000) return hit
  let value: ClientMetrics | null = null
  let error: string | null = null
  if (r.env.DATABASE_URL) {
    try { value = await withTimeout(clientMetrics(r.env.DATABASE_URL), 8000) } catch (e) { error = (e as Error).message }
  } else error = 'Sin DATABASE_URL'
  const out = { at: Date.now(), value, error }
  metricsCache.set(r.file.name, out)
  return out
}
export const forgetMetrics = (name: string) => metricsCache.delete(name)

export type ClientStatus = 'online' | 'down' | 'suspended' | 'archived' | 'stopped'

export function summarize(r: ClientRecord, procs: Pm2Proc[], h: { ok: boolean; uptime?: number; ms?: number }, m: Awaited<ReturnType<typeof metricsFor>>) {
  const proc = procs.find(p => p.name === r.file.name) ?? null
  const webProc = procs.find(p => p.name === `${r.file.name}-web`) ?? null
  const status: ClientStatus = r.file.archived ? 'archived'
    : m.value?.license?.suspended ? 'suspended'
    : proc?.status === 'stopped' ? 'stopped'
    : h.ok ? 'online' : 'down'
  return {
    ...r.file,
    inferred: r.inferred,
    status,
    proc, webProc,
    health: h,
    metrics: m.value,
    metricsError: m.error,
  }
}

export async function clientRoutes(app: FastifyInstance, { config }: { config: Config }) {
  const sh = shellFor(config)

  app.get('/api/clients', async () => {
    const [records, procs] = await Promise.all([listClients(config), pm2List(config, sh)])
    const clients = await Promise.all(records.map(async (r) => {
      const proc = procs.find(p => p.name === r.file.name)
      const [h, m] = await Promise.all([health(config, r.file.apiPort, proc?.status === 'online'), metricsFor(r)])
      return summarize(r, procs, h, m)
    }))
    return { mode: config.mode, clients }
  })

  app.get<{ Params: { name: string } }>('/api/clients/:name', async (req, reply) => {
    const r = await readClient(config, req.params.name)
    if (!r) return reply.status(404).send({ error: 'No existe ese cliente' })
    const procs = await pm2List(config, sh)
    const proc = procs.find(p => p.name === r.file.name)
    const [h, m] = await Promise.all([health(config, r.file.apiPort, proc?.status === 'online'), metricsFor(r, true)])
    const dns = r.file.domain
      ? await Promise.all([`pos.${r.file.domain}`, ...(r.file.web ? [r.file.domain, `www.${r.file.domain}`] : [])].map(hn => checkDns(hn, config.serverIp)))
      : []
    const e = r.env
    return {
      ...summarize(r, procs, h, m),
      env: maskEnv(e),
      fel: {
        provider: e.FEL_PROVIDER ?? 'none',
        nit: e.DIGIFACT_NIT ?? '',
        frases: e.DIGIFACT_FRASES ?? '1:1',
        docType: e.FEL_DOC_TYPE ?? 'FACT',
        establishment: e.DIGIFACT_ESTABLISHMENT ?? '1',
        env: e.DIGIFACT_ENV ?? 'test',
        sellerName: e.DIGIFACT_SELLER_NAME ?? '',
        allowCf: e.FEL_ALLOW_CF === 'true',
        sendEmail: e.FEL_SEND_EMAIL === 'true',
      },
      dns,
    }
  })

  app.get('/api/server', async () => {
    const [info, procs] = await Promise.all([serverInfo(config, sh), pm2List(config, sh)])
    return { ...info, procs }
  })
}
