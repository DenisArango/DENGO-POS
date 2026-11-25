import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Config } from '../config.js'
import type { Sh, ShResult } from './shell.js'

export interface Pm2Proc {
  name: string
  status: string // online | stopped | errored | launching
  memory: number // bytes
  cpu: number
  restarts: number
  uptimeMs: number
  cwd: string
}

// ── Simulated pm2 (ADMIN_MODE=simulate): a JSON file stands in for the process list ──
const simFile = (c: Config) => join(c.adminDir, 'sim-pm2.json')
function simRead(c: Config): Pm2Proc[] {
  try { return JSON.parse(readFileSync(simFile(c), 'utf8')) } catch { return [] }
}
function simWrite(c: Config, list: Pm2Proc[]) {
  mkdirSync(c.adminDir, { recursive: true })
  writeFileSync(simFile(c), JSON.stringify(list, null, 2))
}

/** Keeps the simulated process list in step with the pm2 commands a job "runs". */
export function pm2SimHook(c: Config) {
  return (cmd: string, args: string[]): ShResult | void => {
    if (cmd !== 'pm2') return
    const list = simRead(c)
    const name = args.includes('--name') ? args[args.indexOf('--name') + 1] : undefined
    if (args[0] === 'start' && name) {
      const cwd = args.includes('--cwd') ? args[args.indexOf('--cwd') + 1]! : ''
      simWrite(c, [...list.filter(p => p.name !== name), { name, status: 'online', memory: Math.round(160e6 + Math.random() * 90e6), cpu: 1, restarts: 0, uptimeMs: 0, cwd }])
    } else if (args[0] === 'delete') {
      simWrite(c, list.filter(p => p.name !== args[1]))
    } else if (args[0] === 'stop') {
      simWrite(c, list.map(p => (p.name === args[1] ? { ...p, status: 'stopped' } : p)))
    } else if (args[0] === 'restart') {
      simWrite(c, list.map(p => (args[1] === 'all' || p.name === args[1] ? { ...p, status: 'online', restarts: p.restarts + 1, uptimeMs: 0 } : p)))
    }
  }
}

export async function pm2List(c: Config, sh: Sh): Promise<Pm2Proc[]> {
  if (c.mode === 'simulate') {
    return simRead(c).map(p => ({ ...p, uptimeMs: p.status === 'online' ? 3_600_000 * 7 : 0 }))
  }
  const r = await sh('pm2', ['jlist'])
  if (r.code !== 0) return []
  try {
    const raw = JSON.parse(r.out.slice(r.out.indexOf('['))) as any[]
    return raw.map(p => ({
      name: p.name,
      status: p.pm2_env?.status ?? 'unknown',
      memory: p.monit?.memory ?? 0,
      cpu: p.monit?.cpu ?? 0,
      restarts: p.pm2_env?.restart_time ?? 0,
      uptimeMs: p.pm2_env?.status === 'online' ? Date.now() - (p.pm2_env?.pm_uptime ?? Date.now()) : 0,
      cwd: p.pm2_env?.pm_cwd ?? '',
    }))
  } catch { return [] }
}

/** GET /api/health of a client backend; in simulate mode, online pm2 = healthy. */
export async function health(c: Config, port: number, procOnline: boolean): Promise<{ ok: boolean; uptime?: number; ms?: number }> {
  if (c.mode === 'simulate') return procOnline ? { ok: true, uptime: 25200, ms: 4 } : { ok: false }
  const t = Date.now()
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(3000) })
    if (!r.ok) return { ok: false }
    const j = (await r.json()) as { uptime?: number }
    return { ok: true, uptime: j.uptime, ms: Date.now() - t }
  } catch { return { ok: false } }
}
