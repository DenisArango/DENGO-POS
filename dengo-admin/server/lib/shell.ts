import { spawn } from 'node:child_process'
import type { Mode } from '../config.js'

export interface ShOpts {
  cwd?: string
  env?: Record<string, string>
  input?: string
  onLine?: (line: string) => void
  /** Run for real even in simulate mode (only for read-only or sandbox-safe commands). */
  always?: boolean
}
export interface ShResult { code: number; out: string }

/** Programs that touch the real server: in simulate mode they're only logged. */
const SIMULATED = new Set(['pm2', 'sudo', 'systemctl', 'caddy', 'git', 'npm', 'pg_dump', 'psql', 'gzip', 'bash'])

export type Sh = (cmd: string, args: string[], opts?: ShOpts) => Promise<ShResult>

export function makeShell(mode: Mode, simHook?: (cmd: string, args: string[]) => ShResult | void): Sh {
  return (cmd, args, opts = {}) => {
    const shown = `$ ${[cmd, ...args].map(a => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}`
    opts.onLine?.(shown)
    if (mode === 'simulate' && !opts.always && SIMULATED.has(cmd)) {
      const r = simHook?.(cmd, args) ?? { code: 0, out: '' }
      if (r.out) r.out.split('\n').forEach(l => opts.onLine?.(l))
      opts.onLine?.('  (simulado)')
      return Promise.resolve(r)
    }
    return new Promise((resolve) => {
      const child = spawn(cmd, args, {
        cwd: opts.cwd, env: { ...process.env, ...opts.env }, shell: process.platform === 'win32',
      })
      let out = ''
      let buf = ''
      const feed = (chunk: Buffer) => {
        const s = chunk.toString()
        out += s
        buf += s
        const parts = buf.split(/\r?\n/)
        buf = parts.pop() ?? ''
        for (const p of parts) if (p.trim()) opts.onLine?.(p)
      }
      child.stdout.on('data', feed)
      child.stderr.on('data', feed)
      if (opts.input !== undefined) { child.stdin.write(opts.input); child.stdin.end() }
      child.on('error', (e) => { opts.onLine?.(`! ${e.message}`); resolve({ code: 127, out }) })
      child.on('close', (code) => { if (buf.trim()) opts.onLine?.(buf); resolve({ code: code ?? 1, out }) })
    })
  }
}

/** Throws with the command's tail when it fails. */
export async function must(sh: Sh, cmd: string, args: string[], opts?: ShOpts): Promise<string> {
  const r = await sh(cmd, args, opts)
  if (r.code !== 0) throw new Error(`«${cmd} ${args.slice(0, 3).join(' ')}» terminó con código ${r.code}`)
  return r.out
}
