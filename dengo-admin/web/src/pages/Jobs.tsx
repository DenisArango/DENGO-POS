import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { ListChecks } from 'lucide-react'
import { usePoll } from '../lib/usePoll'
import type { Job } from '../lib/api'
import { dateTime, duration } from '../lib/format'
import { Tile, IconBadge, Skeleton } from '../components/ui'
import { JobIcon } from './Dashboard'

const KIND: Record<string, string> = {
  provision: 'Alta', restart: 'Reinicio', backup: 'Respaldo', caddy: 'Dominio', archive: 'Archivo', unarchive: 'Reactivación',
  deploy: 'Despliegue', propagate: 'Claves', migration: 'Importación', 'migration-dry': 'Revisión',
}

export default function Jobs() {
  const { data, loading } = usePoll<{ jobs: Job[] }>('/api/jobs', 5000)
  return (
    <div className="mx-auto max-w-[1100px]">
      <header className="mb-7 flex items-center gap-4">
        <IconBadge icon={ListChecks} tone="sky" size="lg" />
        <div>
          <h1 className="h-display text-[32px] leading-none">Trabajos</h1>
          <p className="mt-1.5 text-[14px] text-ink-600">Todo lo que el panel ejecutó en el servidor, con su log.</p>
        </div>
      </header>
      <Tile hover={false} className="overflow-hidden">
        {loading && !data ? <div className="p-6"><Skeleton className="h-64" /></div> : (
          <table className="w-full text-left text-[14px]">
            <thead className="bg-ice/70 text-[12px] uppercase tracking-[0.05em] text-ink-500">
              <tr><th className="px-5 py-3 font-semibold">Trabajo</th><th className="px-3 py-3 font-semibold">Tipo</th><th className="px-3 py-3 font-semibold">Inicio</th><th className="px-5 py-3 text-right font-semibold">Duración</th></tr>
            </thead>
            <tbody>
              {data?.jobs.map((j, i) => (
                <motion.tr key={j.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.015 }} className="border-t border-ink-900/[0.05] transition hover:bg-ink-50/60">
                  <td className="px-5 py-3"><Link to={`/trabajos/${j.id}`} className="flex items-center gap-3 font-semibold text-ink-900 hover:text-coral-600"><JobIcon status={j.status} />{j.title}</Link>
                    {j.error && <p className="ml-7 mt-0.5 text-[12px] text-rose-600">{j.error}</p>}</td>
                  <td className="px-3 py-3"><span className="rounded-lg bg-ink-50 px-2 py-1 text-[12px] font-semibold text-ink-700">{KIND[j.kind] ?? j.kind}</span></td>
                  <td className="px-3 py-3 text-ink-600">{dateTime(j.startedAt)}</td>
                  <td className="px-5 py-3 text-right tabular text-ink-600">{j.endedAt ? duration(new Date(j.endedAt).getTime() - new Date(j.startedAt).getTime()) : '…'}</td>
                </motion.tr>
              ))}
              {!data?.jobs.length && <tr><td colSpan={4} className="px-5 py-10 text-center text-ink-500">Todavía no hay trabajos.</td></tr>}
            </tbody>
          </table>
        )}
      </Tile>
    </div>
  )
}
