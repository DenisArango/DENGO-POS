import { useEffect, useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import { X, Undo2, Minus, AlertTriangle, KeyRound, ExternalLink, PartyPopper, TerminalSquare } from 'lucide-react'
import type { Job, JobStep } from '../lib/api'
import { useJob } from '../lib/useJob'
import { duration } from '../lib/format'
import { CopyButton, Spinner, Tile } from './ui'

/** The check draws itself as a stroke, like a hand ticking the step. */
function DrawnCheck() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <motion.path d="M5 12.5l4.2 4.2L19 7" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.38, ease: [0.65, 0, 0.35, 1], delay: 0.08 }} />
    </svg>
  )
}

function StepDot({ s }: { s: JobStep }) {
  const base = 'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-white'
  if (s.status === 'running') return (
    <span className={`${base} bg-sky-500 text-white shadow-[0_0_0_6px_rgba(14,165,233,.15)]`}>
      <span className="absolute inset-0 rounded-full bg-sky-400 animate-ping2" /><Spinner className="relative h-4 w-4" />
    </span>
  )
  const map: Record<string, [string, ReactNode]> = {
    ok: ['bg-emerald-500 text-white', <DrawnCheck key="c" />],
    warning: ['bg-amber-400 text-amber-950', <AlertTriangle key="w" className="h-4 w-4" />],
    failed: ['bg-rose-500 text-white', <X key="x" className="h-4 w-4" strokeWidth={3} />],
    undone: ['bg-amber-100 text-amber-700', <Undo2 key="u" className="h-4 w-4" />],
    skipped: ['bg-ink-100 text-ink-400', <Minus key="m" className="h-4 w-4" />],
    pending: ['bg-ink-100 text-ink-300', <span key="p" className="h-2 w-2 rounded-full bg-ink-300" />],
  }
  const [cls, icon] = map[s.status] ?? map.pending!
  return (
    <motion.span key={s.status} initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }} className={`${base} ${cls}`}>
      {icon}
    </motion.span>
  )
}

const STATUS_TEXT: Record<Job['status'], { t: string; c: string }> = {
  running: { t: 'En curso', c: 'bg-sky-50 text-sky-700 ring-sky-600/20' },
  ok: { t: 'Terminado', c: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  failed: { t: 'Falló', c: 'bg-rose-50 text-rose-700 ring-rose-600/20' },
  rolled_back: { t: 'Falló y se deshizo', c: 'bg-amber-50 text-amber-800 ring-amber-600/25' },
}

function Confetti() {
  const reduce = useReducedMotion()
  if (reduce) return null
  const colors = ['#E07A5F', '#1E4D68', '#10b981', '#f59e0b', '#86adc7']
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-0 overflow-visible">
      {Array.from({ length: 26 }, (_, i) => (
        <motion.span key={i} className="absolute top-0 h-2.5 w-1.5 rounded-sm" style={{ left: `${8 + (i * 84) / 26}%`, background: colors[i % colors.length] }}
          initial={{ y: -10, opacity: 1, rotate: 0 }} animate={{ y: 220 + (i % 5) * 30, opacity: 0, rotate: (i % 2 ? 1 : -1) * 260 }}
          transition={{ duration: 1.6 + (i % 4) * 0.2, ease: [0.2, 0.7, 0.3, 1], delay: (i % 6) * 0.04 }} />
      ))}
    </div>
  )
}

/** The live job: step ribbon on the left, terminal on the right, one-time result below. */
export default function JobView({ id, compact = false }: { id: string; compact?: boolean }) {
  const { job, lost } = useJob(id)
  const term = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  useEffect(() => {
    const el = term.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [job?.lines?.length])

  if (!job) return <Tile className="p-8" hover={false}><div className="flex items-center gap-3 text-ink-500"><Spinner /> Conectando con el trabajo…</div></Tile>
  const done = job.status !== 'running'
  const okCount = job.steps.filter(s => s.status === 'ok' || s.status === 'warning' || s.status === 'skipped').length
  const pct = (okCount / Math.max(job.steps.length, 1)) * 100
  const st = STATUS_TEXT[job.status]
  const r = job.result

  return (
    <div className="grid gap-5 xl:grid-cols-12">
      <motion.div className="xl:col-span-5" animate={job.status === 'ok' ? { y: -4 } : { y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}>
      <Tile hover={false} className={`relative h-full p-6 transition-shadow duration-500 ${job.status === 'ok' ? 'shadow-lift ring-emerald-500/25' : ''}`}>
        {job.status === 'ok' && job.kind === 'provision' && <Confetti />}
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="h-display text-[22px] leading-tight">{job.title}</h2>
            <p className="mt-1 text-[13px] text-ink-500">
              {new Date(job.startedAt).toLocaleString('es-GT')}{job.endedAt ? ` · ${duration(new Date(job.endedAt).getTime() - new Date(job.startedAt).getTime())}` : ''}
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 ${st.c}`}>{st.t}</span>
        </div>
        <div className="mb-6 h-2 overflow-hidden rounded-full bg-ink-100 shadow-well">
          <motion.div animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 90, damping: 20 }}
            className={`h-full rounded-full ${job.status === 'ok' ? 'bg-emerald-500' : job.status === 'running' ? 'bg-gradient-to-r from-sky-400 to-coral-500' : 'bg-amber-400'}`} />
        </div>
        <ol className="relative">
          <span aria-hidden className="absolute bottom-4 left-4 top-4 w-px bg-ink-100" />
          {job.steps.map((s, i) => (
            <motion.li key={s.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }} className="relative flex gap-3 pb-4 last:pb-0">
              <StepDot s={s} />
              <div className="min-w-0 pt-1">
                <p className={`text-[14px] font-semibold ${s.status === 'pending' ? 'text-ink-400' : s.status === 'failed' ? 'text-rose-700' : 'text-ink-900'}`}>{s.title}</p>
                {s.note && <p className={`mt-0.5 text-[12px] ${s.status === 'failed' ? 'text-rose-600' : 'text-amber-700'}`}>{s.note}</p>}
                {s.status === 'undone' && <p className="mt-0.5 text-[12px] text-amber-700">Deshecho</p>}
              </div>
              {s.ms !== undefined && s.status !== 'pending' && <span className="ml-auto shrink-0 pt-1.5 text-[11px] tabular text-ink-400">{s.ms < 1000 ? `${s.ms} ms` : `${(s.ms / 1000).toFixed(1)} s`}</span>}
            </motion.li>
          ))}
        </ol>
        {job.status === 'rolled_back' && (
          <p className="mt-5 rounded-xl bg-amber-50 p-3 text-[13px] text-amber-900 ring-1 ring-amber-500/20">Se deshizo lo que alcanzó a hacerse: no quedó nada a medias. Corrige el problema y vuelve a intentarlo.</p>
        )}
      </Tile>
      </motion.div>

      <div className="flex min-w-0 flex-col gap-5 xl:col-span-7">
        <AnimatePresence>
          {done && r && (r.adminPassword || r.credentials || r.posUrl || r.summary) && (
            <motion.div initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 22 }}>
              <Tile hover={false} className="p-6 ring-2 ring-emerald-400/40">
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-md"><PartyPopper className="h-5 w-5" /></span>
                  <div>
                    <h3 className="font-display text-[18px] font-bold">{job.kind === 'provision' ? 'Cliente listo' : 'Resultado'}</h3>
                    {(r.adminPassword || r.credentials) && <p className="text-[13px] text-amber-700">Las contraseñas se muestran solo ahora: no se guardan en ningún lado.</p>}
                  </div>
                </div>
                {r.adminPassword && (
                  <div className="well mb-3 flex flex-wrap items-center gap-x-6 gap-y-2 p-4">
                    <KeyRound className="h-5 w-5 text-coral-500" />
                    <span className="text-[13px] text-ink-600">Administrador <b className="font-mono text-ink-900">{r.adminEmail}</b></span>
                    <span className="font-mono text-[15px] font-semibold text-ink-950">{r.adminPassword}</span>
                    <CopyButton text={`${r.adminEmail} / ${r.adminPassword}`} />
                  </div>
                )}
                {Array.isArray(r.credentials) && r.credentials.length > 0 && (
                  <div className="well mb-3 p-4">
                    <div className="mb-2 flex items-center justify-between"><span className="text-[13px] font-semibold text-ink-700">Contraseñas temporales de empleados</span><CopyButton text={r.credentials.join('\n')} label="Copiar todas" /></div>
                    <ul className="space-y-1 font-mono text-[13px] text-ink-900">{r.credentials.map((c: string) => <li key={c}>{c}</li>)}</ul>
                  </div>
                )}
                {r.summary && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {Object.entries(r.summary as Record<string, { nuevos: number; existentes: number }>).map(([k, v]) => (
                      <div key={k} className="rounded-xl bg-ice p-3 shadow-well">
                        <p className="text-[12px] font-semibold capitalize text-ink-500">{k}</p>
                        <p className="font-display text-[20px] font-bold text-ink-950">{v.nuevos}</p>
                        <p className="text-[11px] text-ink-500">{k === 'inventario' ? 'cantidades' : `nuevos · ${v.existentes} ya estaban`}</p>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {r.posUrl && <a className="btn-soft" href={r.posUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />Abrir POS</a>}
                  {r.webUrl && <a className="btn-soft" href={r.webUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />Abrir página</a>}
                  {r.client && <Link className="btn-ink" to={`/clientes/${r.client}`}>Ir a la ficha</Link>}
                </div>
              </Tile>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="overflow-hidden rounded-tile shadow-lift ring-1 ring-black/20" style={{ background: 'linear-gradient(180deg,#0f2733,#0b1f2a)' }}>
          <div className="flex items-center gap-2 border-b border-white/5 px-4 py-2.5">
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]" /><span className="h-3 w-3 rounded-full bg-[#febc2e]" /><span className="h-3 w-3 rounded-full bg-[#28c840]" />
            <span className="ml-2 flex items-center gap-1.5 text-[12px] font-medium text-ink-300"><TerminalSquare className="h-3.5 w-3.5" />Lo que está haciendo el servidor</span>
            {!done && <span className="ml-auto flex items-center gap-1.5 text-[12px] text-emerald-300"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />en vivo</span>}
          </div>
          <div ref={term} onScroll={e => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40 }}
            className={`overflow-auto p-4 font-mono text-[12.5px] leading-[1.65] ${compact ? 'h-[300px]' : 'h-[480px]'}`}>
            {(job.lines ?? []).map((l, i) => {
              const t = l.text
              const cls = t.startsWith('▸') ? 'mt-2 font-semibold text-coral-300'
                : t.startsWith('$') ? 'text-sky-300'
                : t.startsWith('✖') || t.startsWith('!') ? 'text-rose-300'
                : t.startsWith('↩') ? 'text-amber-300'
                : /✓|✅|en línea/i.test(t) ? 'text-emerald-300'
                : t.includes('(simulado)') ? 'text-ink-400 italic'
                : 'text-ink-100'
              return <div key={i} className={`whitespace-pre-wrap break-words ${cls}`}>{t}</div>
            })}
            {!done && <span className="inline-block h-4 w-2 animate-pulse bg-coral-400 align-middle" />}
            {lost && !done && <div className="mt-2 text-amber-300">Se perdió la conexión con el log; recarga la página para seguirlo.</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
