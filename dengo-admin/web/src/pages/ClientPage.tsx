import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { toast } from 'sonner'
import {
  ArrowLeft, RotateCw, DatabaseBackup, FileSpreadsheet, ExternalLink, Cpu, Timer, HeartPulse, Repeat, HardDrive, PauseCircle,
  Receipt, Globe, Network, Download, Archive, ArchiveRestore, TerminalSquare, UserRound, Save, X, CheckCircle2, XCircle, Sparkles,
  ShoppingCart, GraduationCap, AlertTriangle, Wrench,
} from 'lucide-react'
import { api, startJob, type ClientDetail, type Backup, type License } from '../lib/api'
import { usePoll } from '../lib/usePoll'
import { money, bytes, duration, since, dayLabel, dateTime, plural } from '../lib/format'
import { Tile, IconBadge, StatusPill, CountUp, Bars, Meter, Toggle, Field, Spinner, ConfirmButton, Skeleton, CopyButton } from '../components/ui'
import JobView from '../components/JobView'

function Stat({ icon: Icon, label, value }: { icon: typeof Cpu; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/[0.07] p-3">
      <p className="flex items-center gap-1.5 text-[12px] text-ink-200"><Icon className="h-3.5 w-3.5 text-coral-300" />{label}</p>
      <p className="mt-1 font-display text-[18px] font-bold tabular text-white">{value}</p>
    </div>
  )
}

export default function ClientPage() {
  const { name } = useParams()
  const { data: c, reload, loading, error } = usePoll<ClientDetail>(`/api/clients/${name}`, 20000)
  const backups = usePoll<{ backups: Backup[] }>(`/api/clients/${name}/backups`, 0)
  const [job, setJob] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const run = async (key: string, path: string, json?: unknown, method = 'POST') => {
    setBusy(key)
    try { const { jobId } = await startJob(path, json, method); setJob(jobId); window.scrollTo({ top: 0, behavior: 'smooth' }) } catch (e) { toast.error((e as Error).message) } finally { setBusy(null) }
  }
  const patchLicense = async (patch: Partial<License>) => {
    try { await api(`/api/clients/${name}/license`, { method: 'PATCH', json: patch }); await reload(); toast.success('Guardado: el sistema del cliente lo toma en unos segundos') } catch (e) { toast.error((e as Error).message) }
  }

  if (loading && !c) return <div className="mx-auto max-w-[1440px]"><Skeleton className="mb-6 h-12 w-80" /><div className="grid gap-5 md:grid-cols-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-56" />)}</div></div>
  if (!c) return <Tile hover={false} className="mx-auto max-w-xl p-8"><p className="text-rose-700">{error ?? 'No existe ese cliente'}</p><Link to="/" className="btn-soft mt-4">Volver</Link></Tile>
  const m = c.metrics
  const lic = m?.license

  return (
    <div className="mx-auto max-w-[1440px]">
      <Link to="/" className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-600 hover:text-coral-600"><ArrowLeft className="h-4 w-4" />Clientes</Link>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="h-display text-[34px] leading-none">{c.displayName}</h1>
            <StatusPill status={c.status} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-600">
            {c.domain && <a className="inline-flex items-center gap-1 font-mono hover:text-coral-600" href={`https://pos.${c.domain}`} target="_blank" rel="noreferrer">pos.{c.domain}<ExternalLink className="h-3 w-3" /></a>}
            {c.domain && c.web && <a className="inline-flex items-center gap-1 font-mono hover:text-coral-600" href={`https://${c.domain}`} target="_blank" rel="noreferrer">{c.domain}<ExternalLink className="h-3 w-3" /></a>}
            <span>Cliente desde {new Date(c.createdAt).toLocaleDateString('es-GT', { month: 'long', year: 'numeric' })}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/clientes/${c.name}/migracion`} className="btn-soft"><FileSpreadsheet className="h-4 w-4 text-emerald-600" />Migrar datos</Link>
          <button className="btn-soft" disabled={!!busy || c.archived} onClick={() => run('backup', `/api/clients/${c.name}/actions/backup`)}>{busy === 'backup' ? <Spinner /> : <DatabaseBackup className="h-4 w-4 text-teal-600" />}Respaldar</button>
          <button className="btn-ink" disabled={!!busy || c.archived} onClick={() => run('restart', `/api/clients/${c.name}/actions/restart`)}>{busy === 'restart' ? <Spinner /> : <RotateCw className="h-4 w-4" />}Reiniciar</button>
        </div>
      </header>

      {c.inferred && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl bg-sky-50 p-4 text-[13px] text-sky-900 ring-1 ring-sky-500/15">
          <Wrench className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Este cliente se configuró antes del panel: sus datos se leen de su <span className="font-mono">.env</span>. Guarda su ficha abajo para completarla. Su Caddy sigue escrito a mano en <span className="font-mono">/etc/caddy/Caddyfile</span>.</p>
        </div>
      )}

      <AnimatePresence>
        {job && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-5 overflow-hidden">
            <div className="relative">
              <button onClick={() => { setJob(null); void reload(); void backups.reload() }} className="absolute -top-1 right-0 z-10 rounded-lg p-1.5 text-ink-500 hover:bg-white" aria-label="Cerrar"><X className="h-4 w-4" /></button>
              <JobView id={job} compact />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-6 xl:grid-cols-12">
        {/* Ventas */}
        <Tile hover={false} className="p-6 md:col-span-6 xl:col-span-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[13px] font-semibold text-ink-500">Vendido hoy</p>
              <p className="font-display text-[52px] font-bold leading-none tracking-tight">{m ? <CountUp value={m.totalToday} format={money} /> : '—'}</p>
              <p className="mt-1.5 text-[13px] text-ink-500">{m ? `${m.salesToday} ventas · última ${since(m.lastSaleAt)}` : c.metricsError}</p>
            </div>
            {m && (
              <div className="grid grid-cols-3 gap-2 text-center">
                {[['Productos', m.products], ['Usuarios', m.users], ['Tiendas', m.branches.length]].map(([k, v]) => (
                  <div key={k} className="well min-w-[88px] px-3 py-2"><p className="font-display text-[22px] font-bold"><CountUp value={v as number} /></p><p className="text-[11px] font-semibold text-ink-500">{k}</p></div>
                ))}
              </div>
            )}
          </div>
          {m && (
            <>
              {m.salesByDay.some(d => d.total) ? (
                <>
                  <div className="mt-6"><Bars data={m.salesByDay} height={120} /></div>
                  <div className="mt-2 flex justify-between text-[11px] text-ink-500">{m.salesByDay.filter((_, i) => i % 3 === 0 || i === 13).map(d => <span key={d.day}>{dayLabel(d.day)}</span>)}</div>
                </>
              ) : (
                <div className="mt-5 flex items-center gap-3 rounded-2xl bg-ice/70 px-4 py-3 text-[13px] text-ink-600 shadow-well">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-ink-300" />
                  Sin ventas en los últimos 14 días{m.lastSaleAt ? ` · la última fue ${since(m.lastSaleAt)}` : ' · todavía no ha vendido'}
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-1.5">{m.branches.map(b => <span key={b.code} className="rounded-lg bg-ink-50 px-2 py-1 text-[12px] font-medium text-ink-700">{b.name} <span className="font-mono text-ink-400">{b.code}</span></span>)}</div>
            </>
          )}
        </Tile>

        {/* Proceso */}
        <Tile ink hover={false} className="p-6 md:col-span-6 xl:col-span-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-[18px] font-bold">Proceso</h3>
            <span className="rounded-lg bg-white/10 px-2 py-1 font-mono text-[12px]">{c.name}</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <Stat icon={HeartPulse} label="Respuesta" value={c.health.ok ? `${c.health.ms ?? 0} ms` : 'sin respuesta'} />
            <Stat icon={Timer} label="Arriba hace" value={c.proc?.uptimeMs ? duration(c.proc.uptimeMs) : '—'} />
            <Stat icon={Cpu} label="Memoria" value={c.proc ? bytes(c.proc.memory) : '—'} />
            <Stat icon={Repeat} label="Reinicios" value={String(c.proc?.restarts ?? '—')} />
            <Stat icon={HardDrive} label="Base de datos" value={m ? bytes(m.dbSizeBytes) : '—'} />
            <Stat icon={Network} label="Puerto API" value={String(c.apiPort)} />
          </div>
          {c.web && <p className="mt-3 text-[12px] text-ink-200">Página web: {c.webProc ? `${c.webProc.status} · ${bytes(c.webProc.memory)}` : 'sin proceso'} · puerto {c.webPort}</p>}
        </Tile>

        {/* Módulos e IA */}
        <Tile hover={false} className="p-6 md:col-span-6 xl:col-span-5">
          <h3 className="mb-4 font-display text-[18px] font-bold">Módulos</h3>
          {lic ? (
            <div className="space-y-2.5">
              {([
                ['posEnabled', 'Sistema POS', ShoppingCart, 'ink'],
                ['maestrosEnabled', 'Portal de maestros', GraduationCap, 'teal'],
                ['pageEnabled', 'Portal con marca', Globe, 'sky'],
                ['aiEnabled', 'Inteligencia artificial', Sparkles, 'coral'],
              ] as const).map(([k, label, icon, tone]) => (
                <div key={k} className="flex items-center gap-3">
                  <span className={lic[k] ? '' : 'opacity-45 grayscale'}><IconBadge icon={icon} tone={tone} size="sm" /></span>
                  <span className="flex-1 text-[14px] font-semibold text-ink-900">{label}</span>
                  <Toggle label={label} checked={lic[k]} onChange={v => void patchLicense({ [k]: v })} />
                </div>
              ))}
              {lic.aiEnabled && <AiLimit lic={lic} used={m!.aiUsedThisMonth} onSave={v => patchLicense({ aiMonthlyLimit: v })} />}
            </div>
          ) : <p className="text-[13px] text-ink-500">No se pudo leer la licencia.</p>}
        </Tile>

        {/* Suspensión */}
        <SuspendTile lic={lic ?? null} onSave={patchLicense} />

        {/* FEL */}
        <FelTile c={c} onSaved={(jobId) => setJob(jobId)} />

        {/* Dominio */}
        <Tile hover={false} className="p-6 md:col-span-6 xl:col-span-6">
          <div className="mb-4 flex items-center gap-3">
            <IconBadge icon={Network} tone="sky" size="sm" />
            <h3 className="font-display text-[18px] font-bold">Dominio y HTTPS</h3>
            <span className={`ml-auto rounded-full px-2.5 py-1 text-[12px] font-semibold ${c.caddy === 'manual' ? 'bg-slate-100 text-slate-700' : c.caddyPending ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>
              {c.caddy === 'manual' ? 'Caddy a mano' : c.caddyPending ? 'Pendiente' : 'Aplicado'}
            </span>
          </div>
          {c.dns.length ? (
            <ul className="space-y-2">
              {c.dns.map(d => (
                <li key={d.host} className="flex items-center gap-3 rounded-xl bg-ice/70 px-3 py-2.5">
                  {d.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-rose-500" />}
                  <span className="font-mono text-[13px] text-ink-900">{d.host}</span>
                  <span className="ml-auto font-mono text-[12px] text-ink-500">{d.addresses.join(', ') || 'sin registro A'}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-[13px] text-ink-500">Sin dominio en la ficha.</p>}
          {c.caddy === 'managed' && (
            <button className="btn-soft mt-4" disabled={!!busy} onClick={() => run('caddy', `/api/clients/${c.name}/actions/caddy`)}><Globe className="h-4 w-4 text-sky-600" />Aplicar dominio en Caddy</button>
          )}
        </Tile>

        {/* Respaldos */}
        <Tile hover={false} className="p-6 md:col-span-6 xl:col-span-6">
          <div className="mb-4 flex items-center gap-3">
            <IconBadge icon={DatabaseBackup} tone="teal" size="sm" />
            <h3 className="font-display text-[18px] font-bold">Respaldos</h3>
            <span className="ml-auto text-[12px] text-ink-500">{plural(backups.data?.backups.length ?? 0, 'archivo', 'archivos')}</span>
          </div>
          {backups.data?.backups.length ? (
            <ul className="max-h-[220px] space-y-1.5 overflow-auto pr-1">
              {backups.data.backups.map(b => (
                <li key={b.file} className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition hover:bg-ink-50">
                  <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-800">{b.file}</span>
                  <span className="shrink-0 text-[12px] tabular text-ink-500">{bytes(b.size)} · {dateTime(b.at)}</span>
                  <a href={`/api/backups/${b.file}`} className="rounded-lg p-1.5 text-ink-500 hover:bg-white hover:text-coral-600" aria-label="Descargar"><Download className="h-4 w-4" /></a>
                </li>
              ))}
            </ul>
          ) : <p className="text-[13px] text-ink-500">Sin respaldos todavía. Se hacen solos antes de cada despliegue, migración o archivo.</p>}
        </Tile>

        {/* Logs */}
        <LogsTile name={c.name} />

        {/* Ficha */}
        <ProfileTile c={c} onSaved={reload} />

        {/* Zona peligrosa */}
        <Tile hover={false} className="p-6 ring-rose-500/15 md:col-span-6 xl:col-span-5">
          <div className="mb-3 flex items-center gap-3"><IconBadge icon={c.archived ? ArchiveRestore : Archive} tone={c.archived ? 'emerald' : 'rose'} size="sm" /><h3 className="font-display text-[18px] font-bold">{c.archived ? 'Cliente archivado' : 'Archivar cliente'}</h3></div>
          <p className="mb-4 text-[13px] text-ink-600">
            {c.archived ? 'Su base y su carpeta siguen intactas. Reactivarlo arranca otra vez su proceso y su dominio.'
              : 'Hace un respaldo final, detiene sus procesos y quita su dominio de Caddy. La base y los respaldos se conservan; nada se borra.'}
          </p>
          {c.archived
            ? <button className="btn-ink" disabled={!!busy} onClick={() => run('unarchive', `/api/clients/${c.name}/actions/unarchive`)}><ArchiveRestore className="h-4 w-4" />Reactivar</button>
            : <ConfirmButton confirm="Sí, archivar" busy={busy === 'archive'} onConfirm={() => run('archive', `/api/clients/${c.name}/actions/archive`)}><Archive className="h-4 w-4 text-rose-600" />Archivar</ConfirmButton>}
        </Tile>
      </div>
    </div>
  )
}

function AiLimit({ lic, used, onSave }: { lic: License; used: number; onSave: (v: number | null) => Promise<void> }) {
  const [v, setV] = useState<string>(lic.aiMonthlyLimit === null ? '' : String(lic.aiMonthlyLimit))
  useEffect(() => setV(lic.aiMonthlyLimit === null ? '' : String(lic.aiMonthlyLimit)), [lic.aiMonthlyLimit])
  const dirty = v !== (lic.aiMonthlyLimit === null ? '' : String(lic.aiMonthlyLimit))
  return (
    <div className="well mt-3 p-4">
      <div className="mb-2 flex items-center justify-between text-[13px]"><span className="font-semibold text-ink-800">Uso de IA este mes</span><span className="tabular text-ink-600">{used} de {lic.aiMonthlyLimit ?? 'sin límite'}</span></div>
      <Meter value={used} max={lic.aiMonthlyLimit} />
      <div className="mt-3 flex items-center gap-2">
        <input className="input w-28 font-mono" inputMode="numeric" value={v} placeholder="sin límite" onChange={e => setV(e.target.value.replace(/\D/g, ''))} aria-label="Límite mensual" />
        <span className="text-[12px] text-ink-500">consultas/mes (vacío = sin límite)</span>
        {dirty && <button className="btn-primary ml-auto px-3 py-2" onClick={() => void onSave(v === '' ? null : Number(v))}><Save className="h-4 w-4" />Guardar</button>}
      </div>
    </div>
  )
}

function SuspendTile({ lic, onSave }: { lic: License | null; onSave: (p: Partial<License>) => Promise<void> }) {
  const [msg, setMsg] = useState(lic?.suspendedMessage ?? '')
  useEffect(() => setMsg(lic?.suspendedMessage ?? ''), [lic?.suspendedMessage])
  const on = !!lic?.suspended
  return (
    <motion.div layout className={`relative rounded-tile p-6 shadow-tile ring-1 transition-colors md:col-span-6 xl:col-span-3 ${on ? 'bg-gradient-to-br from-amber-300 to-amber-500 ring-amber-600/30' : 'tile'}`}>
      <div className="mb-3 flex items-center justify-between">
        <span className={on ? 'text-amber-950' : ''}><IconBadge icon={PauseCircle} tone={on ? 'slate' : 'amber'} size="sm" /></span>
        <Toggle label="Suspender servicio" checked={on} disabled={!lic} onChange={v => void onSave({ suspended: v, suspendedMessage: msg.trim() || null })} />
      </div>
      <h3 className={`font-display text-[18px] font-bold ${on ? 'text-amber-950' : ''}`}>{on ? 'Servicio suspendido' : 'Suspender servicio'}</h3>
      <p className={`mt-1 text-[13px] ${on ? 'text-amber-950/80' : 'text-ink-600'}`}>{on ? 'POS, portal y página muestran el aviso. Los datos siguen intactos.' : 'Por falta de pago, por ejemplo. Se reactiva con el mismo interruptor.'}</p>
      <textarea className="input mt-3 h-20 resize-none text-[13px]" maxLength={300} value={msg} onChange={e => setMsg(e.target.value)} placeholder="Mensaje opcional para el cliente" />
      {on && msg !== (lic?.suspendedMessage ?? '') && <button className="btn-ink mt-2 w-full" onClick={() => void onSave({ suspendedMessage: msg.trim() || null })}>Actualizar mensaje</button>}
    </motion.div>
  )
}

function FelTile({ c, onSaved }: { c: ClientDetail; onSaved: (jobId: string) => void }) {
  const [f, setF] = useState(c.fel)
  const [enabled, setEnabled] = useState(c.fel.provider === 'digifact')
  const [busy, setBusy] = useState(false)
  useEffect(() => { setF(c.fel); setEnabled(c.fel.provider === 'digifact') }, [c.fel])
  const save = async () => {
    setBusy(true)
    try { const { jobId } = await startJob(`/api/clients/${c.name}/fel`, { enabled, fel: enabled ? f : null }, 'PATCH'); onSaved(jobId); toast.success('FEL guardado; reiniciando el cliente') } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <Tile hover={false} className="p-6 md:col-span-6 xl:col-span-4">
      <div className="mb-4 flex items-center gap-3">
        <IconBadge icon={Receipt} tone="emerald" size="sm" />
        <h3 className="font-display text-[18px] font-bold">Factura electrónica</h3>
        <span className="ml-auto"><Toggle label="FEL" checked={enabled} onChange={setEnabled} /></span>
      </div>
      {enabled ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="NIT"><input className="input font-mono" value={f.nit} onChange={e => setF({ ...f, nit: e.target.value })} /></Field>
          <Field label="Establecimiento"><input className="input font-mono" value={f.establishment} onChange={e => setF({ ...f, establishment: e.target.value })} /></Field>
          <Field label="Frases"><input className="input font-mono" value={f.frases} onChange={e => setF({ ...f, frases: e.target.value })} /></Field>
          <Field label="Tipo"><select className="input" value={f.docType} onChange={e => setF({ ...f, docType: e.target.value as 'FACT' | 'FPEQ' })}><option value="FACT">General</option><option value="FPEQ">Pequeño</option></select></Field>
          <Field label="Ambiente" className="col-span-2">
            <div className="flex gap-2">
              {(['test', 'production'] as const).map(e => (
                <button key={e} type="button" onClick={() => setF({ ...f, env: e })} className={`flex-1 rounded-xl px-3 py-2 text-[13px] font-semibold transition ${f.env === e ? (e === 'production' ? 'bg-emerald-600 text-white shadow-md' : 'bg-amber-400 text-amber-950 shadow-md') : 'bg-ice text-ink-600 shadow-well'}`}>{e === 'test' ? 'Pruebas' : 'Producción'}</button>
              ))}
            </div>
          </Field>
        </div>
      ) : <p className="text-[13px] text-ink-500">Apagado: el POS no muestra «Generar factura». Los datos guardados se conservan.</p>}
      <button className="btn-ink mt-4 w-full" disabled={busy} onClick={save}>{busy ? <Spinner /> : <Save className="h-4 w-4" />}Guardar y reiniciar</button>
    </Tile>
  )
}

function LogsTile({ name }: { name: string }) {
  const [kind, setKind] = useState<'error' | 'out'>('error')
  const { data, loading, reload } = usePoll<{ lines: string[]; missing: boolean; file: string }>(`/api/clients/${name}/logs?kind=${kind}&lines=200`, 0)
  return (
    <div className="overflow-hidden rounded-tile shadow-lift ring-1 ring-black/20 md:col-span-6 xl:col-span-12" style={{ background: 'linear-gradient(180deg,#0f2733,#0b1f2a)' }}>
      <div className="flex flex-wrap items-center gap-3 border-b border-white/5 px-5 py-3">
        <TerminalSquare className="h-4 w-4 text-coral-300" />
        <h3 className="font-display text-[16px] font-bold text-white">Logs</h3>
        <div className="ml-2 flex rounded-lg bg-white/5 p-0.5">
          {(['error', 'out'] as const).map(k => <button key={k} onClick={() => setKind(k)} className={`rounded-md px-3 py-1 text-[12px] font-semibold transition ${kind === k ? 'bg-white/15 text-white' : 'text-ink-300 hover:text-white'}`}>{k === 'error' ? 'Errores' : 'Salida'}</button>)}
        </div>
        <button onClick={() => void reload()} className="ml-auto flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-semibold text-ink-200 hover:bg-white/10"><RotateCw className="h-3.5 w-3.5" />Actualizar</button>
        {data?.lines.length ? <CopyButton text={data.lines.join('\n')} /> : null}
      </div>
      <div className={`overflow-auto p-4 font-mono text-[12px] leading-[1.6] text-ink-100 ${data?.missing ? 'h-auto' : 'h-[260px]'}`}>
        {loading && !data ? <Spinner className="h-4 w-4 text-ink-300" />
          : data?.missing ? <p className="text-ink-400">No hay archivo de log todavía ({data.file}).</p>
          : data?.lines.map((l, i) => <div key={i} className={`whitespace-pre-wrap break-words ${/error|fail|✖|ERR/i.test(l) ? 'text-rose-300' : /warn|lenta/i.test(l) ? 'text-amber-200' : ''}`}>{l}</div>)}
      </div>
    </div>
  )
}

function ProfileTile({ c, onSaved }: { c: ClientDetail; onSaved: () => void }) {
  const [p, setP] = useState({ displayName: c.displayName, domain: c.domain ?? '', contact: { name: c.contact.name ?? '', phone: c.contact.phone ?? '', email: c.contact.email ?? '' }, notes: c.notes, web: c.web })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try { await api(`/api/clients/${c.name}/profile`, { method: 'PATCH', json: { ...p, domain: p.domain || null } }); toast.success('Ficha guardada'); onSaved() } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <Tile hover={false} className="p-6 md:col-span-6 xl:col-span-7">
      <div className="mb-4 flex items-center gap-3"><IconBadge icon={UserRound} tone="ink" size="sm" /><h3 className="font-display text-[18px] font-bold">Ficha</h3>
        {c.inferred && <span className="ml-auto flex items-center gap-1 text-[12px] font-semibold text-sky-700"><AlertTriangle className="h-3.5 w-3.5" />sin guardar</span>}</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre visible"><input className="input" value={p.displayName} onChange={e => setP({ ...p, displayName: e.target.value })} /></Field>
        <Field label="Dominio"><input className="input font-mono" value={p.domain} onChange={e => setP({ ...p, domain: e.target.value })} /></Field>
        <Field label="Contacto"><input className="input" value={p.contact.name} onChange={e => setP({ ...p, contact: { ...p.contact, name: e.target.value } })} /></Field>
        <Field label="Teléfono"><input className="input" value={p.contact.phone} onChange={e => setP({ ...p, contact: { ...p.contact, phone: e.target.value } })} /></Field>
        <Field label="Correo"><input className="input" value={p.contact.email} onChange={e => setP({ ...p, contact: { ...p.contact, email: e.target.value } })} /></Field>
        <Field label="Notas"><input className="input" value={p.notes} onChange={e => setP({ ...p, notes: e.target.value })} /></Field>
      </div>
      <button className="btn-ink mt-4" disabled={busy} onClick={save}>{busy ? <Spinner /> : <Save className="h-4 w-4" />}Guardar ficha</button>
    </Tile>
  )
}
