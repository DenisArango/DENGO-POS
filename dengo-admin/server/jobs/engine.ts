import { randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Config } from '../config.js'
import type { Sh, ShOpts } from '../lib/shell.js'

export type StepStatus = 'pending' | 'running' | 'ok' | 'failed' | 'skipped' | 'undone' | 'warning'
export type JobStatus = 'running' | 'ok' | 'failed' | 'rolled_back'

export interface StepCtx {
  config: Config
  log: (line: string) => void
  /** The shell with its output going to the job log. */
  sh: Sh
  /** Shared between steps (ports chosen, paths created…). */
  data: Record<string, any>
  /** Shown once in the UI when the job ends (e.g. first passwords). Never saved to disk. */
  result: Record<string, any>
  /** Marks the running step as done-with-a-warning (e.g. DNS not pointing yet) instead of ok. */
  warn: (note: string) => void
}

export interface Step {
  id: string
  title: string
  run: (ctx: StepCtx) => Promise<void | 'skipped'>
  undo?: (ctx: StepCtx) => Promise<void>
}

export interface JobLine { t: number; text: string }
export interface JobView {
  id: string
  kind: string
  title: string
  client: string | null
  status: JobStatus
  startedAt: string
  endedAt: string | null
  steps: { id: string; title: string; status: StepStatus; note?: string; ms?: number }[]
  lines: JobLine[]
  error: string | null
  result?: Record<string, any>
}

export type JobEvent =
  | { type: 'line'; line: JobLine }
  | { type: 'step'; index: number; step: JobView['steps'][number] }
  | { type: 'done'; job: JobView }

interface Running { view: JobView; listeners: Set<(e: JobEvent) => void> }

const MAX_LINES = 6000

export class JobManager {
  private jobs = new Map<string, Running>()
  private locks = new Map<string, string>() // client name or '*' → job id
  private dir: string

  constructor(private config: Config, private sh: Sh) {
    this.dir = join(config.adminDir, 'jobs')
  }

  /** Who holds the lock that would block a job on `client` (null = global job). */
  busy(client: string | null): string | null {
    if (this.locks.has('*')) return this.locks.get('*')!
    if (client === null) return this.locks.size ? [...this.locks.values()][0]! : null
    return this.locks.get(client) ?? null
  }

  start(opts: { kind: string; title: string; client: string | null; steps: Step[]; data?: Record<string, any> }): JobView {
    const holder = this.busy(opts.client)
    if (holder) throw Object.assign(new Error('Ya hay un trabajo en curso para este cliente. Espera a que termine.'), { statusCode: 409, jobId: holder })
    const id = `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomBytes(4).toString('hex')}`
    const view: JobView = {
      id, kind: opts.kind, title: opts.title, client: opts.client, status: 'running',
      startedAt: new Date().toISOString(), endedAt: null,
      steps: opts.steps.map(s => ({ id: s.id, title: s.title, status: 'pending' })), lines: [], error: null,
    }
    const run: Running = { view, listeners: new Set() }
    this.jobs.set(id, run)
    this.locks.set(opts.client ?? '*', id)
    void this.execute(run, opts.steps, opts.data ?? {}).finally(() => this.locks.delete(opts.client ?? '*'))
    return view
  }

  get(id: string): JobView | null {
    const r = this.jobs.get(id)
    if (r) return r.view
    try { return JSON.parse(readFileSync(join(this.dir, `${id.replace(/[^\w-]/g, '')}.json`), 'utf8')) } catch { return null }
  }

  /** Recent jobs, newest first: in-memory ones plus the saved history. */
  list(limit = 30): Omit<JobView, 'lines'>[] {
    const seen = new Map<string, Omit<JobView, 'lines'>>()
    for (const r of this.jobs.values()) { const { lines: _l, result: _r, ...rest } = r.view; seen.set(rest.id, rest) }
    try {
      for (const f of readdirSync(this.dir).filter(f => f.endsWith('.json')).sort().reverse().slice(0, limit)) {
        const id = f.slice(0, -5)
        if (seen.has(id)) continue
        try { const { lines: _l, ...rest } = JSON.parse(readFileSync(join(this.dir, f), 'utf8')) as JobView; seen.set(id, rest) } catch { /* skip */ }
      }
    } catch { /* no history yet */ }
    return [...seen.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit)
  }

  subscribe(id: string, fn: (e: JobEvent) => void): () => void {
    const r = this.jobs.get(id)
    if (!r) return () => {}
    r.listeners.add(fn)
    return () => r.listeners.delete(fn)
  }

  private emit(r: Running, e: JobEvent) {
    for (const fn of r.listeners) { try { fn(e) } catch { /* listener gone */ } }
  }

  private async execute(r: Running, steps: Step[], data: Record<string, any>) {
    const v = r.view
    const log = (text: string) => {
      const line = { t: Date.now(), text }
      v.lines.push(line)
      if (v.lines.length > MAX_LINES) v.lines.splice(0, v.lines.length - MAX_LINES)
      this.emit(r, { type: 'line', line })
    }
    let warnNote: string | null = null
    const ctx: StepCtx = {
      config: this.config, log, data, result: {},
      sh: (cmd, args, opts: ShOpts = {}) => this.sh(cmd, args, { ...opts, onLine: (l) => { log(l); opts.onLine?.(l) } }),
      warn: (note) => { warnNote = note },
    }
    const setStep = (i: number, patch: Partial<JobView['steps'][number]>) => {
      Object.assign(v.steps[i]!, patch)
      this.emit(r, { type: 'step', index: i, step: v.steps[i]! })
    }
    this.save(v)

    const done: number[] = []
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i]!
      setStep(i, { status: 'running' })
      log(`▸ ${s.title}`)
      const t0 = Date.now()
      warnNote = null
      try {
        const out = await s.run(ctx)
        const ms = Date.now() - t0
        if (out === 'skipped') setStep(i, { status: 'skipped', ms })
        else if (warnNote) setStep(i, { status: 'warning', note: warnNote, ms })
        else setStep(i, { status: 'ok', ms })
        done.push(i)
      } catch (e) {
        const msg = (e as Error).message || String(e)
        setStep(i, { status: 'failed', note: msg, ms: Date.now() - t0 })
        log(`✖ ${msg}`)
        v.error = msg
        const undoable = done.filter(j => steps[j]!.undo)
        if (undoable.length) {
          log('↩ Deshaciendo lo que se alcanzó a hacer…')
          for (const j of [...done].reverse()) {
            const u = steps[j]!.undo
            if (!u) continue
            try { await u(ctx); setStep(j, { status: 'undone' }) } catch (ue) { log(`! No se pudo deshacer «${steps[j]!.title}»: ${(ue as Error).message}`) }
          }
          v.status = 'rolled_back'
        } else v.status = 'failed'
        return this.finish(r, ctx)
      }
    }
    v.status = 'ok'
    this.finish(r, ctx)
  }

  private finish(r: Running, ctx: StepCtx) {
    r.view.endedAt = new Date().toISOString()
    r.view.result = Object.keys(ctx.result).length ? ctx.result : undefined
    this.save(r.view)
    this.emit(r, { type: 'done', job: r.view })
    // keep finished jobs in memory a while so the UI can still read the one-time result
    setTimeout(() => this.jobs.delete(r.view.id), 30 * 60_000).unref?.()
  }

  private save(v: JobView) {
    try {
      mkdirSync(this.dir, { recursive: true })
      const { result: _secret, ...rest } = v
      writeFileSync(join(this.dir, `${v.id}.json`), JSON.stringify(rest))
    } catch { /* history is best-effort */ }
  }
}

/** Resolves when the job ends (tests and chained jobs). */
export function waitJob(m: JobManager, id: string): Promise<JobView> {
  return new Promise((resolve) => {
    const v = m.get(id)
    if (v && v.status !== 'running') return resolve(v)
    const off = m.subscribe(id, (e) => { if (e.type === 'done') { off(); resolve(e.job) } })
  })
}
