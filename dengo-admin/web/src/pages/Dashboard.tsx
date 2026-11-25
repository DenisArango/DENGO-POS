import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import {
  Plus, Rocket, Globe, ShoppingCart, GraduationCap, Receipt, Sparkles, Store, Package, Users, AlertTriangle,
  Cpu, HardDrive, Activity, CheckCircle2, XCircle, Undo2, Loader2, ArrowUpRight, Wrench,
} from 'lucide-react'
import { usePoll } from '../lib/usePoll'
import type { Client, Job, ServerInfo } from '../lib/api'
import { money, bytes, since, plural } from '../lib/format'
import { Tile, IconBadge, StatusPill, CountUp, Bars, Meter, Skeleton } from '../components/ui'

export const MODULES = [
  { key: 'posEnabled', label: 'POS', icon: ShoppingCart, tone: 'bg-ink-600' },
  { key: 'maestrosEnabled', label: 'Maestros', icon: GraduationCap, tone: 'bg-teal-500' },
  { key: 'pageEnabled', label: 'Página', icon: Globe, tone: 'bg-sky-500' },
  { key: 'felEnabled', label: 'FEL', icon: Receipt, tone: 'bg-emerald-500' },
  { key: 'aiEnabled', label: 'IA', icon: Sparkles, tone: 'bg-coral-500' },
] as const

function ClientTile({ c, i, featured = false }: { c: Client; i: number; featured?: boolean }) {
  const nav = useNavigate()
  const m = c.metrics
  const lic = m?.license
  return (
    <Tile as="button" delay={0.04 * i} onClick={() => nav(`/clientes/${c.name}`)} className={`group flex flex-col gap-4 ${featured ? 'p-7 md:col-span-2' : 'p-5'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className={`h-display flex items-center gap-1.5 truncate leading-tight ${featured ? 'text-[28px]' : 'text-[20px]'}`}>{c.displayName}<ArrowUpRight className="h-4 w-4 shrink-0 text-coral-500 opacity-0 transition group-hover:opacity-100" aria-hidden /></h3>
          <p className="mt-0.5 truncate font-mono text-[12px] text-ink-500">{c.domain ? `pos.${c.domain}` : 'sin dominio'}</p>
        </div>
        <StatusPill status={c.status} />
      </div>

      {m ? (
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[12px] font-semibold text-ink-500">Vendido hoy</p>
            <p className={`font-display font-bold leading-none tracking-tight text-ink-950 ${featured ? 'text-[48px]' : 'text-[28px]'}`}><CountUp value={m.totalToday} format={money} /></p>
            <p className="mt-1 text-[12px] text-ink-500">{m.salesToday} ventas · última {since(m.lastSaleAt)}</p>
          </div>
          <div className={featured ? 'w-[58%]' : 'w-[46%]'}><Bars data={m.salesByDay} height={featured ? 92 : 52} /></div>
        </div>
      ) : (
        <p className="flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-[13px] text-rose-700"><AlertTriangle className="h-4 w-4" /> No se pudo leer su base: {c.metricsError}</p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {MODULES.map(mod => {
          const on = lic ? !!lic[mod.key] : false
          return (
            <span key={mod.key} className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition ${on ? `${mod.tone} text-white shadow-sm` : 'bg-ink-50 text-ink-300 line-through decoration-ink-300/60'}`}>
              <mod.icon className="h-3 w-3" />{mod.label}
            </span>
          )
        })}
      </div>

      {m && (
        <div className="grid grid-cols-3 gap-2 border-t border-ink-900/[0.06] pt-3 text-[12px] text-ink-600">
          <span className="flex items-center gap-1.5"><Package className="h-3.5 w-3.5 text-ink-400" />{plural(m.products, 'producto', 'productos')}</span>
          <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-ink-400" />{plural(m.users, 'usuario', 'usuarios')}</span>
          <span className="flex items-center gap-1.5"><Store className="h-3.5 w-3.5 text-ink-400" />{m.branches.length} {m.branches.length === 1 ? 'tienda' : 'tiendas'}</span>
        </div>
      )}
      {lic?.aiEnabled && (
        <div className="-mt-1 flex items-center gap-3 text-[12px] text-ink-600">
          <Sparkles className="h-3.5 w-3.5 text-coral-500" />
          <Meter value={m!.aiUsedThisMonth} max={lic.aiMonthlyLimit} className="flex-1" />
          <span className="tabular whitespace-nowrap">{m!.aiUsedThisMonth}/{lic.aiMonthlyLimit ?? '∞'} IA</span>
        </div>
      )}
    </Tile>
  )
}

export function JobIcon({ status }: { status: Job['status'] }) {
  if (status === 'running') return <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
  if (status === 'ok') return <CheckCircle2 className="h-4 w-4 text-emerald-600" />
  if (status === 'rolled_back') return <Undo2 className="h-4 w-4 text-amber-600" />
  return <XCircle className="h-4 w-4 text-rose-600" />
}

function ServerTile({ s, clients }: { s: ServerInfo | null; clients: Client[] }) {
  if (!s) return <Tile ink className="p-6"><Skeleton className="h-40 bg-white/10" /></Tile>
  const memUsed = s.memTotal - s.memFree
  const diskUsed = s.diskTotal - s.diskFree
  const rows = [
    { icon: Cpu, label: 'Memoria', used: memUsed, total: s.memTotal },
    { icon: HardDrive, label: 'Disco', used: diskUsed, total: s.diskTotal },
  ]
  return (
    <Tile ink delay={0.08} className="overflow-hidden p-6">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-coral-400/20 blur-2xl" />
      <div className="relative flex items-center justify-between">
        <div>
          <h3 className="font-display text-[22px] font-bold leading-tight">Servidor <span className="text-coral-300">{s.hostname}</span></h3>
        </div>
        <Link to="/servidor" className="rounded-lg bg-white/10 px-2.5 py-1.5 text-[12px] font-semibold text-white transition hover:bg-white/20">Ver</Link>
      </div>
      <div className="relative mt-5 space-y-4">
        {rows.map(r => {
          const pct = r.total ? (r.used / r.total) * 100 : 0
          return (
            <div key={r.label}>
              <div className="mb-1.5 flex items-center justify-between text-[13px]">
                <span className="flex items-center gap-2 text-ink-100"><r.icon className="h-4 w-4 text-coral-300" />{r.label}</span>
                <span className="tabular text-white">{bytes(r.used)} <span className="text-ink-300">/ {bytes(r.total)}</span></span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
                <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 90, damping: 18, delay: 0.3 }}
                  className={`h-full rounded-full ${pct > 85 ? 'bg-rose-400' : pct > 70 ? 'bg-amber-300' : 'bg-gradient-to-r from-coral-300 to-coral-500'}`} />
              </div>
            </div>
          )
        })}
        <div className="flex items-center justify-between rounded-xl bg-white/[0.07] px-3 py-2.5 text-[13px]">
          <span className="flex items-center gap-2 text-ink-100"><Activity className="h-4 w-4 text-coral-300" />Carga</span>
          <span className="tabular text-white">{s.load.map(l => l.toFixed(2)).join(' · ')} <span className="text-ink-300">({s.cpus} CPU)</span></span>
        </div>
      </div>
      <div className="relative mt-6">
        <h4 className="mb-3 text-[13px] font-semibold text-ink-100">Memoria por cliente</h4>
        <ul className="space-y-2.5">
          {clients.map((c, i) => {
            const procs = s.procs.filter(p => p.name === c.name || p.name === `${c.name}-web`)
            const mem = procs.reduce((a, p) => a + p.memory, 0)
            const pct = Math.min(100, (mem / (512 * 1024 * 1024)) * 100) // bar full at 512 MB
            return (
              <li key={c.name}>
                <div className="mb-1 flex items-center justify-between gap-3 text-[12px]">
                  <span className="flex min-w-0 items-center gap-2 text-white"><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${c.status === 'online' ? 'bg-emerald-400' : c.status === 'suspended' ? 'bg-amber-300' : 'bg-rose-400'}`} /><span className="truncate">{c.displayName}</span></span>
                  <span className="shrink-0 tabular text-ink-200">{mem ? bytes(mem) : 'sin proceso'}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 90, damping: 18, delay: 0.35 + i * 0.05 }} className="h-full rounded-full bg-ink-200" />
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </Tile>
  )
}

export default function Dashboard() {
  const nav = useNavigate()
  const clients = usePoll<{ clients: Client[] }>('/api/clients', 20000)
  const server = usePoll<ServerInfo>('/api/server', 30000)
  const jobs = usePoll<{ jobs: Job[] }>('/api/jobs', 8000)
  const list = clients.data?.clients ?? []
  const active = list.filter(c => !c.archived)
  const archived = list.filter(c => c.archived)
  const pending = server.data?.setup.filter(x => !x.ok) ?? []
  const online = active.filter(c => c.status === 'online').length
  // the busiest client today leads the board at double width
  const ranked = [...active].sort((a, b) => (b.metrics?.totalToday ?? 0) - (a.metrics?.totalToday ?? 0) || (b.metrics?.products ?? 0) - (a.metrics?.products ?? 0))

  return (
    <div className="mx-auto max-w-[1440px]">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="h-display text-[34px] leading-none">Clientes</h1>
          <p className="mt-2 text-[14px] text-ink-600">
            {clients.loading && !clients.data ? 'Cargando…' : <><b className="text-ink-900">{online}</b> de {active.length} en línea{archived.length ? ` · ${archived.length} archivados` : ''}</>}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/servidor#desplegar" className="btn-soft"><Rocket className="h-4 w-4 text-ink-600" />Desplegar versión</Link>
          <Link to="/nuevo" className="btn-primary"><Plus className="h-4 w-4" />Nuevo cliente</Link>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="grid content-start gap-5 md:grid-cols-2 xl:col-span-8">
          {clients.loading && !clients.data && [0, 1].map(i => <div key={i} className="tile p-5"><Skeleton className="h-52" /></div>)}
          {ranked.map((c, i) => <ClientTile key={c.name} c={c} i={i} featured={i === 0 && ranked.length > 1} />)}
          {!clients.loading && active.length === 0 && (
            <Tile className="flex flex-col items-start gap-4 p-8 md:col-span-2">
              <IconBadge icon={Store} tone="coral" size="lg" />
              <div>
                <h3 className="h-display text-[22px]">Todavía no hay clientes aquí</h3>
                <p className="mt-1 max-w-[52ch] text-[14px] text-ink-600">El panel lee las carpetas de <span className="font-mono text-[13px]">clients/</span> del servidor. Da de alta el primero y aparecerá en este tablero.</p>
              </div>
              <Link to="/nuevo" className="btn-primary"><Plus className="h-4 w-4" />Dar de alta</Link>
            </Tile>
          )}
          <Tile as="button" delay={0.04 * active.length} onClick={() => nav('/nuevo')}
            className="group flex min-h-[160px] flex-col items-center justify-center gap-3 border-2 border-dashed border-coral-300/70 bg-coral-50/40 p-6 text-coral-700 shadow-none">
            <motion.span whileHover={{ rotate: 90 }} transition={{ type: 'spring', stiffness: 300, damping: 15 }}><IconBadge icon={Plus} tone="coral" size="lg" /></motion.span>
            <span className="font-display text-[17px] font-bold">Nuevo cliente</span>
            <span className="text-[13px] text-coral-700/80">Base, dominio, módulos y datos en un solo paso</span>
          </Tile>
        </div>

        <div className="flex flex-col gap-5 xl:col-span-4">
          {pending.length > 0 && (
            <Tile delay={0.05} className="p-5 ring-amber-400/40" hover={false}>
              <div className="flex items-start gap-3">
                <IconBadge icon={Wrench} tone="amber" />
                <div className="min-w-0">
                  <h3 className="font-display text-[16px] font-bold">Falta preparar el servidor</h3>
                  <ul className="mt-2 space-y-1 text-[13px] text-ink-700">
                    {pending.slice(0, 4).map(p => <li key={p.id} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />{p.label}</li>)}
                  </ul>
                  <Link to="/servidor" className="mt-3 inline-flex text-[13px] font-semibold text-amber-800 underline">Ver cómo hacerlo</Link>
                </div>
              </div>
            </Tile>
          )}
          <ServerTile s={server.data} clients={active} />
          <Tile delay={0.12} className="p-5" hover={false}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-[16px] font-bold">Últimos trabajos</h3>
              <Link to="/trabajos" className="text-[13px] font-semibold text-coral-600 hover:text-coral-700">Todos</Link>
            </div>
            {jobs.data?.jobs.length ? (
              <ul className="-mx-2">
                {jobs.data.jobs.slice(0, 6).map(j => (
                  <li key={j.id}>
                    <Link to={`/trabajos/${j.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-ink-50">
                      <JobIcon status={j.status} />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink-800">{j.title}</span>
                      <span className="shrink-0 text-[12px] text-ink-500">{since(j.startedAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="text-[13px] text-ink-500">Aún no se ha corrido ninguno. Las altas, respaldos y despliegues aparecen aquí con su log.</p>}
          </Tile>
          {archived.length > 0 && (
            <Tile delay={0.16} className="p-5" hover={false}>
              <h3 className="mb-2 font-display text-[16px] font-bold">Archivados</h3>
              <ul className="space-y-1">
                {archived.map(c => <li key={c.name}><Link className="text-[13px] font-medium text-ink-700 hover:text-coral-600" to={`/clientes/${c.name}`}>{c.displayName}</Link></li>)}
              </ul>
            </Tile>
          )}
        </div>
      </div>
    </div>
  )
}
