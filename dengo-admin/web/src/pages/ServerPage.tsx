import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { Server, Rocket, KeyRound, CheckCircle2, CircleDashed, Cpu, HardDrive, Activity, Timer, Download, AlertTriangle, RefreshCw } from 'lucide-react'
import { startJob, type ServerInfo, type Backup } from '../lib/api'
import { usePoll } from '../lib/usePoll'
import { bytes, duration, dateTime } from '../lib/format'
import { Tile, IconBadge, CopyButton, ConfirmButton, Skeleton } from '../components/ui'
import JobView from '../components/JobView'

interface Globals { anthropicKey: string; anthropicModel: string; anthropicAnalystModel: string; digifactUser: string; digifactPassword: string; serverIp: string; root: string; mode: string }

export default function ServerPage() {
  const { data: s } = usePoll<ServerInfo>('/api/server', 15000)
  const globals = usePoll<Globals>('/api/globals', 0)
  const backups = usePoll<{ backups: Backup[] }>('/api/backups', 0)
  const [job, setJob] = useState<string | null>(null)
  const [acceptDataLoss, setAccept] = useState(false)
  useEffect(() => { if (location.hash === '#desplegar') document.getElementById('desplegar')?.scrollIntoView({ behavior: 'smooth' }) }, [])

  const go = async (path: string, json?: unknown) => {
    try { const { jobId } = await startJob(path, json); setJob(jobId); window.scrollTo({ top: 0, behavior: 'smooth' }) } catch (e) { toast.error((e as Error).message) }
  }
  const done = s?.setup.filter(x => x.ok).length ?? 0

  return (
    <div className="mx-auto max-w-[1300px]">
      <header className="mb-6 flex items-center gap-4">
        <IconBadge icon={Server} tone="ink" size="lg" />
        <div>
          <h1 className="h-display text-[32px] leading-none">Servidor</h1>
          <p className="mt-1.5 text-[14px] text-ink-600">{s ? <>{s.hostname} · Node {s.node} · raíz <span className="font-mono text-[13px]">{s.root}</span></> : 'Cargando…'}</p>
        </div>
      </header>

      {job && <div className="mb-5"><JobView id={job} compact /></div>}

      <div className="grid gap-5 xl:grid-cols-12">
        <Tile hover={false} className="p-6 xl:col-span-7">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-[18px] font-bold">Preparación (una sola vez)</h3>
            {s && <span className="text-[13px] font-semibold tabular text-ink-600">{done}/{s.setup.length}</span>}
          </div>
          {s ? (
            <ul className="space-y-2.5">
              {s.setup.map((x, i) => (
                <motion.li key={x.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                  className={`rounded-2xl p-3.5 ${x.ok ? 'bg-emerald-50/60' : 'bg-amber-50 ring-1 ring-amber-500/20'}`}>
                  <div className="flex items-center gap-3">
                    {x.ok ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <CircleDashed className="h-5 w-5 text-amber-600" />}
                    <span className={`text-[14px] font-semibold ${x.ok ? 'text-ink-800' : 'text-amber-950'}`}>{x.label}</span>
                  </div>
                  {!x.ok && (
                    <div className="ml-8 mt-2 flex items-start gap-2 rounded-xl bg-ink-950 p-3">
                      <pre className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-[12px] leading-relaxed text-ink-100">{x.hint}</pre>
                      <span className="shrink-0 [&_button]:text-ink-200 [&_button:hover]:bg-white/10"><CopyButton text={x.hint} /></span>
                    </div>
                  )}
                </motion.li>
              ))}
            </ul>
          ) : <Skeleton className="h-64" />}
        </Tile>

        <Tile ink hover={false} className="p-6 xl:col-span-5">
          <h3 className="mb-4 font-display text-[18px] font-bold">Máquina</h3>
          {s ? (
            <div className="grid grid-cols-2 gap-2.5">
              {[
                [Cpu, 'Memoria libre', `${bytes(s.memFree)} de ${bytes(s.memTotal)}`],
                [HardDrive, 'Disco libre', `${bytes(s.diskFree)} de ${bytes(s.diskTotal)}`],
                [Activity, 'Carga (1/5/15)', s.load.map(l => l.toFixed(2)).join(' · ')],
                [Timer, 'Encendido hace', duration(s.uptimeSec * 1000)],
              ].map(([Icon, k, v]) => {
                const I = Icon as typeof Cpu
                return <div key={k as string} className="rounded-xl bg-white/[0.07] p-3"><p className="flex items-center gap-1.5 text-[12px] text-ink-200"><I className="h-3.5 w-3.5 text-coral-300" />{k as string}</p><p className="mt-1 text-[14px] font-semibold tabular text-white">{v as string}</p></div>
              })}
            </div>
          ) : <Skeleton className="h-40 bg-white/10" />}
          <h4 className="mb-2 mt-5 text-[13px] font-semibold text-ink-100">Procesos pm2</h4>
          <ul className="space-y-1.5">
            {s?.procs.map(p => (
              <li key={p.name} className="flex items-center gap-3 rounded-xl bg-white/[0.05] px-3 py-2 text-[13px]">
                <span className={`h-2 w-2 rounded-full ${p.status === 'online' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                <span className="min-w-0 flex-1 truncate font-mono text-white">{p.name}</span>
                <span className="tabular text-ink-200">{bytes(p.memory)}</span>
                <span className="tabular text-ink-300">↻{p.restarts}</span>
              </li>
            ))}
          </ul>
        </Tile>

        <Tile hover={false} className="p-6 xl:col-span-7">
          <div id="desplegar" className="mb-3 flex items-center gap-3"><IconBadge icon={Rocket} tone="coral" /><div><h3 className="font-display text-[18px] font-bold">Desplegar versión nueva</h3><p className="text-[13px] text-ink-500">Para todos los clientes a la vez</p></div></div>
          <ol className="mb-4 grid gap-1.5 text-[13px] text-ink-700 sm:grid-cols-2">
            {['git pull de la rama del servidor', 'Respaldo de la base de cada cliente', 'Tablas nuevas en cada base', 'Compilar backend, POS y página', 'Reiniciar a todos', 'Revisar que todos respondan'].map((t, i) => (
              <li key={t} className="flex items-center gap-2"><span className="flex h-5 w-5 items-center justify-center rounded-md bg-ink-100 text-[11px] font-bold text-ink-600">{i + 1}</span>{t}</li>
            ))}
          </ol>
          <label className="mb-4 flex items-start gap-3 rounded-2xl bg-amber-50 p-3.5 text-[13px] text-amber-950 ring-1 ring-amber-500/20">
            <input type="checkbox" className="mt-0.5 accent-amber-600" checked={acceptDataLoss} onChange={e => setAccept(e.target.checked)} />
            <span><b>Aceptar avisos de Prisma</b> (--accept-data-loss). Márcalo solo si un despliegue anterior se detuvo por un índice único nuevo y ya revisaste el log. Los respaldos se hacen antes.</span>
          </label>
          <ConfirmButton className="btn-primary" confirm="Sí, desplegar a todos" onConfirm={() => go('/api/deploy', { acceptDataLoss })}><Rocket className="h-4 w-4" />Desplegar</ConfirmButton>
        </Tile>

        <Tile hover={false} className="p-6 xl:col-span-5">
          <div className="mb-3 flex items-center gap-3"><IconBadge icon={KeyRound} tone="teal" /><div><h3 className="font-display text-[18px] font-bold">Claves globales</h3><p className="text-[13px] text-ink-500">Se editan en el .env del panel</p></div></div>
          {globals.data && (
            <dl className="space-y-2 text-[13px]">
              {[['Anthropic', globals.data.anthropicKey || 'sin clave'], ['Modelo', globals.data.anthropicModel], ['Analista', globals.data.anthropicAnalystModel], ['Digifact usuario', globals.data.digifactUser || 'sin usuario'], ['Digifact clave', globals.data.digifactPassword || 'sin clave'], ['IP del servidor', globals.data.serverIp || 'sin IP']].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 rounded-xl bg-ice/70 px-3 py-2"><dt className="text-ink-600">{k}</dt><dd className={`font-mono ${/^sin /.test(v) ? 'text-amber-700' : 'text-ink-900'}`}>{v}</dd></div>
              ))}
            </dl>
          )}
          <p className="mt-3 flex items-start gap-2 text-[12px] text-ink-500"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />Después de cambiarlas: reinicia el panel y pásalas a todos los clientes.</p>
          <ConfirmButton className="btn-soft mt-3" confirm="Sí, pasar y reiniciar" onConfirm={() => go('/api/globals/propagate')}><RefreshCw className="h-4 w-4 text-teal-600" />Pasar a todos los clientes</ConfirmButton>
        </Tile>

        <Tile hover={false} className="p-6 xl:col-span-12">
          <h3 className="mb-3 font-display text-[18px] font-bold">Todos los respaldos</h3>
          {backups.data?.backups.length ? (
            <div className="grid gap-x-6 sm:grid-cols-2">
              {backups.data.backups.slice(0, 30).map(b => (
                <a key={b.file} href={`/api/backups/${b.file}`} className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition hover:bg-ink-50">
                  <Download className="h-4 w-4 text-ink-400" />
                  <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-800">{b.file}</span>
                  <span className="shrink-0 text-[12px] tabular text-ink-500">{bytes(b.size)} · {dateTime(b.at)}</span>
                </a>
              ))}
            </div>
          ) : <p className="text-[13px] text-ink-500">Aún no hay respaldos.</p>}
        </Tile>
      </div>
    </div>
  )
}
