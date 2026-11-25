import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { toast } from 'sonner'
import { ArrowLeft, Download, FileSpreadsheet, Images, UploadCloud, SearchCheck, DatabaseZap, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { api, startJob, type ClientDetail } from '../lib/api'
import { usePoll } from '../lib/usePoll'
import { dateTime } from '../lib/format'
import { Tile, IconBadge, Spinner, Field, ConfirmButton } from '../components/ui'
import JobView from '../components/JobView'

interface Issue { sheet: string; row: number | null; column: string | null; message: string }
interface Validation { errors: Issue[]; warnings: Issue[]; counts: Record<string, number>; sheetsFound: string[] }
interface Batch { batch: string; format: 'dengo' | 'loyverse'; files: Record<string, string>; images: number; branch?: string; createdAt: string; lastRun?: { dry: boolean; ok: boolean; at: string } }

const SHEET_LABEL: Record<string, string> = { sucursales: 'Sucursales', categorias: 'Categorías', productos: 'Productos', inventario: 'Inventario', clientes: 'Clientes', proveedores: 'Proveedores', empleados: 'Empleados' }
const LOY = [['items', 'Artículos'], ['inventory', 'Inventario'], ['customers', 'Clientes'], ['suppliers', 'Proveedores'], ['employees', 'Empleados']] as const

function Drop({ label, accept, file, onFile, icon: Icon, hint }: { label: string; accept: string; file: File | null; onFile: (f: File | null) => void; icon: typeof FileSpreadsheet; hint: string }) {
  const ref = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  return (
    <div
      onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}
      onClick={() => ref.current?.click()} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && ref.current?.click()}
      className={`relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition ${over ? 'scale-[1.01] border-coral-400 bg-coral-50' : file ? 'border-emerald-400/70 bg-emerald-50/60' : 'border-ink-200 bg-ice/50 hover:border-ink-300 hover:bg-ice'}`}>
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={e => onFile(e.target.files?.[0] ?? null)} />
      <motion.span animate={over ? { y: -4, scale: 1.08 } : { y: 0, scale: 1 }}><Icon className={`h-8 w-8 ${file ? 'text-emerald-600' : 'text-ink-400'}`} /></motion.span>
      <span className="text-[14px] font-semibold text-ink-900">{file ? file.name : label}</span>
      <span className="text-[12px] text-ink-500">{file ? `${(file.size / 1024).toFixed(0)} KB` : hint}</span>
      {file && <button type="button" onClick={e => { e.stopPropagation(); onFile(null) }} className="absolute right-2 top-2 rounded-lg p-1 text-ink-400 hover:bg-white hover:text-rose-600" aria-label="Quitar"><X className="h-4 w-4" /></button>}
    </div>
  )
}

export default function Migration() {
  const { name } = useParams()
  const client = usePoll<ClientDetail>(`/api/clients/${name}`, 0)
  const batches = usePoll<{ batches: Batch[] }>(`/api/clients/${name}/migrations`, 0)
  const [format, setFormat] = useState<'dengo' | 'loyverse'>('dengo')
  const [file, setFile] = useState<File | null>(null)
  const [zip, setZip] = useState<File | null>(null)
  const [loy, setLoy] = useState<Record<string, File | null>>({})
  const [branch, setBranch] = useState('')
  const [busy, setBusy] = useState(false)
  const [current, setCurrent] = useState<{ batch: string; validation: Validation | null } | null>(null)
  const [job, setJob] = useState<string | null>(null)

  const upload = async () => {
    const fd = new FormData()
    fd.append('format', format)
    if (format === 'dengo') { if (file) fd.append('file', file); if (zip) fd.append('images', zip) }
    else { if (branch) fd.append('branch', branch); for (const [k, f] of Object.entries(loy)) if (f) fd.append(k, f) }
    setBusy(true); setJob(null)
    try {
      const r = await api<{ batch: string; validation: Validation | null }>(`/api/clients/${name}/migrations`, { method: 'POST', body: fd })
      setCurrent(r); void batches.reload()
      if (r.validation?.errors.length) toast.error(`${r.validation.errors.length} errores en la plantilla`)
      else toast.success('Archivo recibido')
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }
  const run = async (batch: string, dry: boolean) => {
    try { const { jobId } = await startJob(`/api/clients/${name}/migrations/${batch}/run`, { dry }); setJob(jobId) } catch (e) { toast.error((e as Error).message) }
  }

  const v = current?.validation
  const grouped = v ? Object.entries(v.errors.reduce<Record<string, Issue[]>>((a, e) => ((a[e.sheet] ??= []).push(e), a), {})) : []
  const ready = format === 'dengo' ? !!file : Object.values(loy).some(Boolean)

  return (
    <div className="mx-auto max-w-[1300px]">
      <Link to={`/clientes/${name}`} className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-600 hover:text-coral-600"><ArrowLeft className="h-4 w-4" />{client.data?.displayName ?? name}</Link>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          <IconBadge icon={FileSpreadsheet} tone="emerald" size="lg" />
          <div>
            <h1 className="h-display text-[32px] leading-none">Migrar datos</h1>
            <p className="mt-1.5 text-[14px] text-ink-600">Primero se revisa sin escribir nada; luego se importa con respaldo previo. Nunca duplica.</p>
          </div>
        </div>
        <a href="/api/template.xlsx" className="btn-primary"><Download className="h-4 w-4" />Descargar plantilla DENGO</a>
      </header>

      <div className="grid gap-5 xl:grid-cols-12">
        <Tile hover={false} className="p-6 xl:col-span-7">
          <div className="mb-5 inline-flex rounded-xl bg-ice p-1 shadow-well">
            {(['dengo', 'loyverse'] as const).map(f => (
              <button key={f} onClick={() => setFormat(f)} className={`relative rounded-lg px-4 py-2 text-[13px] font-semibold transition ${format === f ? 'text-ink-950' : 'text-ink-500 hover:text-ink-800'}`}>
                {format === f && <motion.span layoutId="fmt" className="absolute inset-0 rounded-lg bg-white shadow-tile" />}
                <span className="relative">{f === 'dengo' ? 'Plantilla DENGO' : 'Exportación de Loyverse'}</span>
              </button>
            ))}
          </div>
          <AnimatePresence mode="wait">
            {format === 'dengo' ? (
              <motion.div key="d" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid gap-4 md:grid-cols-2">
                <Drop label="Plantilla llena (.xlsx)" accept=".xlsx,.xls" file={file} onFile={setFile} icon={FileSpreadsheet} hint="Arrastra aquí o haz clic" />
                <Drop label="Fotos (.zip, opcional)" accept=".zip" file={zip} onFile={setZip} icon={Images} hint="Cada foto con el SKU o código de barras" />
              </motion.div>
            ) : (
              <motion.div key="l" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                <Field label="Sucursal de estos archivos" hint="Loyverse exporta inventario por sucursal: un lote por tienda"><input className="input" value={branch} onChange={e => setBranch(e.target.value)} placeholder="Tienda Central" /></Field>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {LOY.map(([k, label]) => <Drop key={k} label={label} accept=".xlsx,.xls,.csv" file={loy[k] ?? null} onFile={f => setLoy(p => ({ ...p, [k]: f }))} icon={FileSpreadsheet} hint=".xlsx" />)}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="mt-5 flex items-center gap-3">
            <button className="btn-ink shrink-0 whitespace-nowrap" disabled={!ready || busy} onClick={upload}>{busy ? <Spinner /> : <UploadCloud className="h-4 w-4" />}Subir y validar</button>
            <p className="flex items-center gap-1.5 text-[12px] text-ink-500"><Info className="h-3.5 w-3.5" />¿Viene de Avances u otro sistema? Conviértelo a la plantilla en una sesión con Claude.</p>
          </div>
        </Tile>

        <Tile hover={false} className="p-6 xl:col-span-5">
          <h3 className="mb-3 font-display text-[18px] font-bold">Cómo llenar la plantilla</h3>
          <ul className="space-y-2.5 text-[13px] text-ink-700">
            {[
              'No cambies nombres de hojas ni columnas; las que llevan * son obligatorias.',
              'Borra las filas de ejemplo. Las hojas que no tengas, déjalas vacías.',
              'Números sin «Q» ni comas de miles: 1250.50.',
              'Inventario: una columna por CÓDIGO de sucursal con la cantidad.',
              'Saldo pendiente de un cliente se carga como «Saldo migrado» y le activa el crédito.',
              'Fotos en un .zip aparte, cada una con el SKU o el código de barras de su producto.',
            ].map((t, i) => <li key={i} className="flex gap-2.5"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-coral-500" />{t}</li>)}
          </ul>
        </Tile>

        <AnimatePresence>
          {current && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="xl:col-span-12">
              <Tile hover={false} className="p-6">
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  {v ? (v.errors.length ? <IconBadge icon={AlertTriangle} tone="rose" /> : <IconBadge icon={CheckCircle2} tone="emerald" />) : <IconBadge icon={FileSpreadsheet} tone="ink" />}
                  <div>
                    <h3 className="font-display text-[18px] font-bold">{v ? (v.errors.length ? `${v.errors.length} errores por corregir` : 'La plantilla está bien') : 'Archivos de Loyverse recibidos'}</h3>
                    <p className="font-mono text-[12px] text-ink-500">lote {current.batch}</p>
                  </div>
                  <div className="ml-auto flex gap-2">
                    <button className="btn-soft" disabled={!!v?.errors.length} onClick={() => run(current.batch, true)}><SearchCheck className="h-4 w-4 text-sky-600" />Revisar sin escribir</button>
                    <ConfirmButton className="btn-primary" confirm="Sí, importar" onConfirm={() => run(current.batch, false)}><DatabaseZap className="h-4 w-4" />Importar</ConfirmButton>
                  </div>
                </div>
                {v && (
                  <>
                    <div className="mb-4 flex flex-wrap gap-2">
                      {Object.entries(v.counts).map(([k, n]) => <span key={k} className={`rounded-xl px-3 py-1.5 text-[13px] font-semibold ${n ? 'bg-ink-700 text-white' : 'bg-ice text-ink-400'}`}>{SHEET_LABEL[k] ?? k} <span className="tabular opacity-80">{n}</span></span>)}
                    </div>
                    {grouped.map(([sheet, list]) => (
                      <div key={sheet} className="mb-3 overflow-hidden rounded-2xl ring-1 ring-rose-500/20">
                        <p className="bg-rose-50 px-4 py-2 text-[13px] font-semibold text-rose-800">{sheet} · {list.length}</p>
                        <table className="w-full text-[13px]"><tbody>
                          {list.slice(0, 50).map((e, i) => (
                            <tr key={i} className="border-t border-rose-500/10">
                              <td className="w-20 px-4 py-1.5 font-mono text-ink-500">{e.row ? `fila ${e.row}` : '—'}</td>
                              <td className="w-40 px-2 py-1.5 font-semibold text-ink-700">{e.column ?? ''}</td>
                              <td className="px-2 py-1.5 text-ink-900">{e.message}</td>
                            </tr>
                          ))}
                        </tbody></table>
                      </div>
                    ))}
                    {v.warnings.length > 0 && (
                      <div className="rounded-2xl bg-amber-50 p-4 text-[13px] text-amber-900 ring-1 ring-amber-500/20">
                        <p className="mb-1 font-semibold">Avisos ({v.warnings.length})</p>
                        <ul className="space-y-0.5">{v.warnings.slice(0, 20).map((w, i) => <li key={i}>{w.sheet}{w.row ? ` fila ${w.row}` : ''}: {w.message}</li>)}</ul>
                      </div>
                    )}
                  </>
                )}
              </Tile>
            </motion.div>
          )}
        </AnimatePresence>

        {job && <div className="xl:col-span-12"><JobView id={job} compact /></div>}

        <Tile hover={false} className="p-6 xl:col-span-12">
          <h3 className="mb-3 font-display text-[18px] font-bold">Lotes anteriores</h3>
          {batches.data?.batches.length ? (
            <ul className="divide-y divide-ink-900/[0.05]">
              {batches.data.batches.map(b => (
                <li key={b.batch} className="flex flex-wrap items-center gap-3 py-2.5">
                  <span className="font-mono text-[13px] text-ink-800">{b.batch}</span>
                  <span className="rounded-lg bg-ink-50 px-2 py-0.5 text-[12px] font-semibold text-ink-700">{b.format === 'dengo' ? 'Plantilla' : 'Loyverse'}</span>
                  <span className="text-[12px] text-ink-500">{Object.keys(b.files).length} {Object.keys(b.files).length === 1 ? "archivo" : "archivos"}{b.images ? ` · ${b.images} fotos` : ''}</span>
                  {b.lastRun && <span className={`text-[12px] font-semibold ${b.lastRun.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{b.lastRun.dry ? 'Revisado' : 'Importado'} {dateTime(b.lastRun.at)}</span>}
                  <span className="ml-auto flex gap-1.5">
                    <button className="btn-soft px-3 py-1.5 text-[12px]" onClick={() => run(b.batch, true)}>Revisar</button>
                    <ConfirmButton className="btn-soft px-3 py-1.5 text-[12px]" confirm="¿Importar?" onConfirm={() => run(b.batch, false)}>Importar</ConfirmButton>
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="text-[13px] text-ink-500">Sin lotes. Cada subida queda guardada en la carpeta migracion/ del cliente.</p>}
        </Tile>
      </div>
    </div>
  )
}
