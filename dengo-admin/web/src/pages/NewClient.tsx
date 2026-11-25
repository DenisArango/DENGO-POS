import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { toast } from 'sonner'
import {
  Building2, Globe, Store, UserRound, Blocks, Receipt, ClipboardCheck, ArrowLeft, ArrowRight, Plus, Trash2, Rocket,
  ShoppingCart, GraduationCap, Sparkles, Check, Wand2, Database, Network, FolderTree, AlertTriangle,
} from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { Tile, IconBadge, Field, Toggle, Spinner, type Tone } from '../components/ui'

interface Form {
  displayName: string; domain: string; contact: { name: string; phone: string; email: string }; notes: string
  admin: { name: string; email: string; password: string }
  branches: { name: string; code: string }[]
  modules: { pos: boolean; maestros: boolean; page: boolean; fel: boolean; ai: boolean }
  aiMonthlyLimit: number | null
  fel: { nit: string; frases: string; docType: 'FACT' | 'FPEQ'; establishment: string; env: 'test' | 'production'; sellerName: string; allowCf: boolean; sendEmail: boolean }
  web: boolean; applyCaddy: boolean
}

const EMPTY: Form = {
  displayName: '', domain: '', contact: { name: '', phone: '', email: '' }, notes: '',
  admin: { name: '', email: '', password: '' },
  branches: [{ name: 'Tienda Central', code: 'CENTRAL' }],
  modules: { pos: true, maestros: false, page: false, fel: false, ai: true },
  aiMonthlyLimit: 100,
  fel: { nit: '', frases: '1:1', docType: 'FACT', establishment: '1', env: 'test', sellerName: '', allowCf: false, sendEmail: false },
  web: false, applyCaddy: true,
}

const STEPS: { id: string; title: string; hint: string; icon: typeof Building2; tone: Tone }[] = [
  { id: 'negocio', title: 'Negocio', hint: 'Nombre y contacto', icon: Building2, tone: 'ink' },
  { id: 'dominio', title: 'Dominio', hint: 'POS y página web', icon: Globe, tone: 'sky' },
  { id: 'sucursales', title: 'Sucursales', hint: 'Tiendas con su código', icon: Store, tone: 'teal' },
  { id: 'admin', title: 'Administrador', hint: 'Primer usuario', icon: UserRound, tone: 'emerald' },
  { id: 'modulos', title: 'Módulos e IA', hint: 'Qué contrató', icon: Blocks, tone: 'coral' },
  { id: 'fel', title: 'Facturación', hint: 'Digifact', icon: Receipt, tone: 'amber' },
  { id: 'revisar', title: 'Revisar y crear', hint: 'Último vistazo', icon: ClipboardCheck, tone: 'ink' },
]

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)
const cleanDomain = (v: string) => v.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '')
const isDomain = (v: string) => /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(cleanDomain(v))

function stepErrors(f: Form, step: number): Record<string, string> {
  const e: Record<string, string> = {}
  if (step === 0 && f.displayName.trim().length < 2) e.displayName = 'Escribe el nombre del negocio'
  if (step === 0 && f.contact.email && !isEmail(f.contact.email)) e.contactEmail = 'Correo inválido'
  if (step === 1 && !isDomain(f.domain)) e.domain = 'Escribe un dominio como libreriael.com'
  if (step === 2) {
    f.branches.forEach((b, i) => {
      if (b.name.trim().length < 2) e[`b${i}name`] = 'Nombre'
      if (!/^[A-Za-z0-9_-]{1,20}$/.test(b.code)) e[`b${i}code`] = 'Letras/números'
    })
    const codes = f.branches.map(b => b.code.toUpperCase())
    if (new Set(codes).size !== codes.length) e.branches = 'Hay códigos repetidos'
  }
  if (step === 3) {
    if (f.admin.name.trim().length < 2) e.adminName = 'Escribe el nombre'
    if (!isEmail(f.admin.email)) e.adminEmail = 'Correo inválido'
    if (f.admin.password && f.admin.password.length < 8) e.adminPassword = 'Mínimo 8 caracteres'
  }
  if (step === 5 && f.modules.fel) {
    if (f.fel.nit.replace(/\W/g, '').length < 5) e.nit = 'NIT del emisor'
    if (!/^\d+:\d+(,\s*\d+:\d+)*$/.test(f.fel.frases)) e.frases = 'Formato 1:1 o 1:1,2:1'
    if (!f.fel.establishment.trim()) e.establishment = 'Código de establecimiento'
  }
  return e
}

const slugCode = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 8) || 'SUC'

export default function NewClient() {
  const nav = useNavigate()
  const [f, setF] = useState<Form>(EMPTY)
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const [tried, setTried] = useState(false)
  const [plan, setPlan] = useState<{ name: string; db: string; domain: string; apiPort: number; webPort: number | null } | null>(null)
  const [serverIssues, setServerIssues] = useState<{ path: string; message: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [defaults, setDefaults] = useState<{ hasAnthropicKey: boolean; hasDigifact: boolean; mode: string } | null>(null)
  useEffect(() => { void api('/api/provision/defaults').then(setDefaults).catch(() => {}) }, [])

  const errors = useMemo(() => (tried ? stepErrors(f, step) : {}), [f, step, tried])
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF(p => ({ ...p, [k]: v }))
  const payload = () => ({
    ...f, domain: cleanDomain(f.domain),
    admin: { ...f.admin, password: f.admin.password || undefined },
    fel: f.modules.fel ? f.fel : null,
    modules: { ...f.modules, page: f.modules.page || f.web },
  })

  const go = (to: number) => {
    if (to > step) {
      for (let s = step; s < to; s++) {
        if (Object.keys(stepErrors(f, s)).length) { setStep(s); setTried(true); return }
      }
    }
    setTried(false); setDir(to > step ? 1 : -1); setStep(to)
  }

  useEffect(() => {
    if (step !== STEPS.length - 1) return
    setPlan(null); setServerIssues([])
    api('/api/clients/plan', { method: 'POST', json: payload() }).then(setPlan).catch((e: ApiError) => setServerIssues(e.data?.issues ?? [{ path: '', message: e.message }]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  const create = async () => {
    setBusy(true)
    try {
      const { jobId } = await api<{ jobId: string }>('/api/clients', { method: 'POST', json: payload() })
      toast.success('Alta en marcha')
      nav(`/trabajos/${jobId}`)
    } catch (e) {
      const err = e as ApiError
      setServerIssues(err.data?.issues ?? [{ path: '', message: err.message }])
      toast.error(err.message)
    } finally { setBusy(false) }
  }

  const S = STEPS[step]!
  return (
    <div className="mx-auto max-w-[1180px]">
      <header className="mb-7">
        <h1 className="h-display text-[34px] leading-none">Nuevo cliente</h1>
        <p className="mt-2 text-[14px] text-ink-600">Crea su base, su carpeta y su <span className="font-mono text-[13px]">.env</span>, lo arranca y le pone su dominio. Si algo falla, se deshace solo.</p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        <Tile hover={false} className="h-fit p-3 lg:sticky lg:top-8">
          <ol>
            {STEPS.map((s, i) => {
              const state = i < step ? 'done' : i === step ? 'now' : 'next'
              return (
                <li key={s.id}>
                  <button onClick={() => go(i)} className={`relative flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition ${state === 'now' ? '' : 'hover:bg-ink-50'}`}>
                    {state === 'now' && <motion.span layoutId="wiz-now" className="absolute inset-0 rounded-xl bg-ice shadow-well" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
                    <span className="relative">
                      {state === 'done'
                        ? <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-emerald-500 text-white shadow-md"><Check className="h-4 w-4" strokeWidth={3} /></span>
                        : <span className={state === 'next' ? 'opacity-45 grayscale' : ''}><IconBadge icon={s.icon} tone={s.tone} size="sm" /></span>}
                    </span>
                    <span className="relative min-w-0">
                      <span className={`block text-[14px] font-semibold ${state === 'next' ? 'text-ink-500' : 'text-ink-900'}`}>{s.title}</span>
                      <span className="block truncate text-[12px] text-ink-500">{s.hint}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </Tile>

        <Tile hover={false} className="overflow-hidden">
          <div className="flex items-center gap-3 border-b border-ink-900/[0.06] px-7 py-5">
            <IconBadge icon={S.icon} tone={S.tone} />
            <div>
              <h2 className="font-display text-[22px] font-bold leading-tight">{S.title}</h2>
              <p className="text-[13px] text-ink-500">Paso {step + 1} de {STEPS.length}</p>
            </div>
            <div className="ml-auto hidden h-2 w-40 overflow-hidden rounded-full bg-ink-100 shadow-well sm:block">
              <motion.div animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }} className="h-full rounded-full bg-gradient-to-r from-ink-500 to-coral-500" />
            </div>
          </div>

          <div className="relative min-h-[420px] px-7 py-6">
            <AnimatePresence mode="wait" custom={dir}>
              <motion.div key={step} custom={dir}
                initial={{ opacity: 0, x: dir * 36 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir * -36 }}
                transition={{ type: 'spring', stiffness: 360, damping: 32 }}>
                {step === 0 && (
                  <div className="grid gap-5 md:grid-cols-2">
                    <Field label="Nombre del negocio" hint="Así aparece en el panel, el POS y la factura" error={errors.displayName} className="md:col-span-2">
                      <input className="input text-[16px]" autoFocus value={f.displayName} onChange={e => set('displayName', e.target.value)} placeholder="Librería El Búho" />
                    </Field>
                    <Field label="Persona de contacto"><input className="input" value={f.contact.name} onChange={e => set('contact', { ...f.contact, name: e.target.value })} /></Field>
                    <Field label="Teléfono"><input className="input" value={f.contact.phone} onChange={e => set('contact', { ...f.contact, phone: e.target.value })} placeholder="5555 1234" /></Field>
                    <Field label="Correo de contacto" error={errors.contactEmail}><input className="input" value={f.contact.email} onChange={e => set('contact', { ...f.contact, email: e.target.value })} /></Field>
                    <Field label="Notas" hint="Solo las ves tú"><input className="input" value={f.notes} onChange={e => set('notes', e.target.value)} placeholder="Plan, fecha de cobro…" /></Field>
                  </div>
                )}

                {step === 1 && (
                  <div className="space-y-6">
                    <Field label="Dominio del cliente" hint="El que compró el cliente, sin www" error={errors.domain}>
                      <input className="input font-mono text-[15px]" autoFocus value={f.domain} onChange={e => set('domain', e.target.value)} placeholder="libreriaelbuho.com" />
                    </Field>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="well p-4">
                        <p className="label mb-2">Sistema POS</p>
                        <p className="font-mono text-[15px] text-ink-900">https://pos.{cleanDomain(f.domain) || 'dominio.com'}</p>
                        <p className="mt-2 text-[12px] text-ink-500">Siempre se crea.</p>
                      </div>
                      <div className={`well p-4 transition ${f.web ? '' : 'opacity-60'}`}>
                        <div className="mb-2 flex items-center justify-between"><p className="label">Página web pública</p><Toggle label="Página web" checked={f.web} onChange={v => set('web', v)} /></div>
                        <p className="font-mono text-[15px] text-ink-900">https://{cleanDomain(f.domain) || 'dominio.com'}</p>
                        <p className="mt-2 text-[12px] text-ink-500">Arranca su proceso de página y la deja sin publicar hasta que el cliente la revise.</p>
                      </div>
                    </div>
                    <p className="flex items-start gap-2 rounded-xl bg-sky-50 p-3 text-[13px] text-sky-900 ring-1 ring-sky-500/15">
                      <Network className="mt-0.5 h-4 w-4 shrink-0" />El registro A de {f.web ? 'los dos nombres' : <span className="font-mono">pos.</span>} debe apuntar a la IP del servidor. Si todavía no apunta, el alta igual termina y el dominio se aplica después desde la ficha.
                    </p>
                  </div>
                )}

                {step === 2 && (
                  <div>
                    <p className="mb-4 text-[14px] text-ink-600">La primera es la sucursal principal. El código es corto y se usa en la plantilla de inventario.</p>
                    <div className="space-y-2.5">
                      <AnimatePresence initial={false}>
                        {f.branches.map((b, i) => (
                          <motion.div key={i} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 30 }} className="flex items-start gap-2.5">
                            <span className={`mt-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold ${i === 0 ? 'bg-coral-500 text-white' : 'bg-ink-100 text-ink-600'}`}>{i + 1}</span>
                            <div className="flex-1"><input className={`input ${errors[`b${i}name`] ? 'ring-rose-400' : ''}`} value={b.name} placeholder="Nombre de la sucursal"
                              onChange={e => { const n = [...f.branches]; const auto = !b.code || b.code === slugCode(b.name); n[i] = { name: e.target.value, code: auto ? slugCode(e.target.value) : b.code }; set('branches', n) }} /></div>
                            <div className="w-36"><input className={`input font-mono uppercase ${errors[`b${i}code`] ? 'ring-rose-400' : ''}`} value={b.code} placeholder="CÓDIGO" maxLength={20}
                              onChange={e => { const n = [...f.branches]; n[i] = { ...b, code: e.target.value.toUpperCase() }; set('branches', n) }} /></div>
                            <button className="mt-1 rounded-xl p-2.5 text-ink-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30" disabled={f.branches.length === 1}
                              onClick={() => set('branches', f.branches.filter((_, j) => j !== i))} aria-label="Quitar sucursal"><Trash2 className="h-4 w-4" /></button>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                    {errors.branches && <p className="mt-2 text-[13px] text-rose-600">{errors.branches}</p>}
                    <button className="btn-soft mt-4" onClick={() => set('branches', [...f.branches, { name: '', code: '' }])}><Plus className="h-4 w-4" />Otra sucursal</button>
                  </div>
                )}

                {step === 3 && (
                  <div className="grid gap-5 md:grid-cols-2">
                    <Field label="Nombre" error={errors.adminName}><input className="input" autoFocus value={f.admin.name} onChange={e => set('admin', { ...f.admin, name: e.target.value })} /></Field>
                    <Field label="Correo (usuario)" error={errors.adminEmail}><input className="input" value={f.admin.email} onChange={e => set('admin', { ...f.admin, email: e.target.value })} /></Field>
                    <Field label="Contraseña" hint="Déjala vacía y se genera una segura; la verás una sola vez al terminar" error={errors.adminPassword} className="md:col-span-2">
                      <div className="flex gap-2">
                        <input className="input font-mono" value={f.admin.password} onChange={e => set('admin', { ...f.admin, password: e.target.value })} placeholder="(se genera sola)" />
                        <button type="button" className="btn-soft shrink-0" onClick={() => set('admin', { ...f.admin, password: '' })}><Wand2 className="h-4 w-4 text-coral-500" />Generar</button>
                      </div>
                    </Field>
                  </div>
                )}

                {step === 4 && (
                  <div className="space-y-3">
                    {([
                      ['pos', 'Sistema POS', 'Ventas, caja, inventario y reportes', ShoppingCart, 'ink'],
                      ['maestros', 'Portal de maestros', 'Pedidos de listas escolares', GraduationCap, 'teal'],
                      ['page', 'Portal con marca', 'Inicio de sesión del portal con la marca del cliente', Globe, 'sky'],
                      ['ai', 'Inteligencia artificial', 'Analista de datos y recomendaciones en reportes', Sparkles, 'coral'],
                    ] as const).map(([k, title, desc, icon, tone]) => (
                      <div key={k} className={`flex items-center gap-4 rounded-2xl p-4 transition ${f.modules[k] ? 'bg-white shadow-tile ring-1 ring-ink-900/[0.06]' : 'bg-ice/60'}`}>
                        <span className={f.modules[k] ? '' : 'opacity-50 grayscale'}><IconBadge icon={icon} tone={tone} /></span>
                        <div className="min-w-0 flex-1"><p className="text-[15px] font-semibold text-ink-900">{title}</p><p className="text-[13px] text-ink-500">{desc}</p></div>
                        <Toggle label={title} checked={f.modules[k]} onChange={v => set('modules', { ...f.modules, [k]: v })} />
                      </div>
                    ))}
                    <AnimatePresence>
                      {f.modules.ai && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                          <div className="well mt-1 flex flex-wrap items-center gap-4 p-4">
                            <span className="text-[14px] font-semibold text-ink-800">Consultas de IA al mes</span>
                            <input type="range" min={10} max={1000} step={10} disabled={f.aiMonthlyLimit === null} value={f.aiMonthlyLimit ?? 1000}
                              onChange={e => set('aiMonthlyLimit', Number(e.target.value))} className="flex-1 accent-coral-500" aria-label="Límite mensual de IA" />
                            <span className="w-16 text-right font-display text-[20px] font-bold tabular">{f.aiMonthlyLimit ?? '∞'}</span>
                            <label className="flex items-center gap-2 text-[13px] text-ink-700"><input type="checkbox" className="accent-coral-500" checked={f.aiMonthlyLimit === null} onChange={e => set('aiMonthlyLimit', e.target.checked ? null : 100)} />Sin límite</label>
                          </div>
                          {defaults && !defaults.hasAnthropicKey && <p className="mt-2 text-[12px] text-amber-700">El panel no tiene ANTHROPIC_API_KEY: la IA quedará encendida pero sin clave hasta que la pongas en Servidor.</p>}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {step === 5 && (
                  <div className="space-y-5">
                    <div className={`flex items-center gap-4 rounded-2xl p-4 ${f.modules.fel ? 'bg-white shadow-tile ring-1 ring-ink-900/[0.06]' : 'bg-ice/60'}`}>
                      <IconBadge icon={Receipt} tone="emerald" />
                      <div className="flex-1"><p className="text-[15px] font-semibold">Factura electrónica con Digifact</p><p className="text-[13px] text-ink-500">Usa tu usuario de Digifact; los folios y el plazo se asignan en su portal.</p></div>
                      <Toggle label="FEL" checked={f.modules.fel} onChange={v => set('modules', { ...f.modules, fel: v })} />
                    </div>
                    {f.modules.fel ? (
                      <div className="grid gap-5 md:grid-cols-3">
                        <Field label="NIT del emisor" error={errors.nit}><input className="input font-mono" value={f.fel.nit} onChange={e => set('fel', { ...f.fel, nit: e.target.value })} placeholder="1234567-8" /></Field>
                        <Field label="Frases del RTU" hint="tipo:escenario, separadas por coma" error={errors.frases}><input className="input font-mono" value={f.fel.frases} onChange={e => set('fel', { ...f.fel, frases: e.target.value })} /></Field>
                        <Field label="Establecimiento SAT" error={errors.establishment}><input className="input font-mono" value={f.fel.establishment} onChange={e => set('fel', { ...f.fel, establishment: e.target.value })} /></Field>
                        <Field label="Tipo de contribuyente">
                          <select className="input" value={f.fel.docType} onChange={e => set('fel', { ...f.fel, docType: e.target.value as 'FACT' | 'FPEQ' })}>
                            <option value="FACT">General (IVA 12 %)</option><option value="FPEQ">Pequeño contribuyente</option>
                          </select>
                        </Field>
                        <Field label="Ambiente">
                          <select className="input" value={f.fel.env} onChange={e => set('fel', { ...f.fel, env: e.target.value as 'test' | 'production' })}>
                            <option value="test">Pruebas</option><option value="production">Producción</option>
                          </select>
                        </Field>
                        <Field label="Razón social" hint="Vacío = se consulta por NIT"><input className="input" value={f.fel.sellerName} onChange={e => set('fel', { ...f.fel, sellerName: e.target.value })} /></Field>
                        <label className="flex items-center gap-3 text-[14px] text-ink-800"><Toggle label="Consumidor final" checked={f.fel.allowCf} onChange={v => set('fel', { ...f.fel, allowCf: v })} />Facturar a CF sin NIT</label>
                        <label className="flex items-center gap-3 text-[14px] text-ink-800"><Toggle label="Correo" checked={f.fel.sendEmail} onChange={v => set('fel', { ...f.fel, sendEmail: v })} />Enviar PDF al correo del cliente</label>
                      </div>
                    ) : <p className="text-[14px] text-ink-500">Sin FEL: el POS no muestra «Generar factura». Se puede activar después desde la ficha.</p>}
                    {f.modules.fel && defaults && !defaults.hasDigifact && <p className="text-[12px] text-amber-700">El panel no tiene DIGIFACT_USER/PASSWORD: ponlos en su .env antes de facturar.</p>}
                  </div>
                )}

                {step === 6 && (
                  <div className="space-y-5">
                    {serverIssues.length > 0 && (
                      <div className="rounded-2xl bg-rose-50 p-4 ring-1 ring-rose-500/20">
                        <p className="mb-1 flex items-center gap-2 font-semibold text-rose-800"><AlertTriangle className="h-4 w-4" />Hay que corregir</p>
                        <ul className="list-disc pl-6 text-[13px] text-rose-700">{serverIssues.map((x, i) => <li key={i}>{x.message}</li>)}</ul>
                      </div>
                    )}
                    <div className="grid gap-4 md:grid-cols-3">
                      {[
                        { icon: FolderTree, tone: 'teal' as Tone, label: 'Carpeta y proceso', value: plan?.name },
                        { icon: Database, tone: 'ink' as Tone, label: 'Base de datos', value: plan?.db },
                        { icon: Network, tone: 'sky' as Tone, label: 'Puertos', value: plan ? `API ${plan.apiPort}${plan.webPort ? ` · web ${plan.webPort}` : ''}` : undefined },
                      ].map(x => (
                        <div key={x.label} className="well flex items-center gap-3 p-4">
                          <IconBadge icon={x.icon} tone={x.tone} size="sm" />
                          <div className="min-w-0"><p className="label">{x.label}</p>{x.value ? <p className="truncate font-mono text-[14px] text-ink-900">{x.value}</p> : <Spinner className="mt-1 h-4 w-4 text-ink-400" />}</div>
                        </div>
                      ))}
                    </div>
                    <dl className="grid gap-x-8 gap-y-3 rounded-2xl bg-white p-5 text-[14px] shadow-tile ring-1 ring-ink-900/[0.06] md:grid-cols-2">
                      {[
                        ['Negocio', f.displayName],
                        ['POS', `pos.${cleanDomain(f.domain)}`],
                        ['Página web', f.web ? cleanDomain(f.domain) : 'No'],
                        ['Sucursales', f.branches.map(b => `${b.name} (${b.code})`).join(', ')],
                        ['Administrador', `${f.admin.name} · ${f.admin.email}`],
                        ['Módulos', [f.modules.pos && 'POS', f.modules.maestros && 'Maestros', (f.modules.page || f.web) && 'Portal con marca', f.modules.ai && `IA (${f.aiMonthlyLimit ?? 'sin límite'}/mes)`].filter(Boolean).join(' · ')],
                        ['Facturación', f.modules.fel ? `Digifact ${f.fel.env === 'test' ? 'pruebas' : 'producción'} · NIT ${f.fel.nit} · ${f.fel.docType}` : 'Sin FEL'],
                      ].map(([k, v]) => <div key={k}><dt className="label">{k}</dt><dd className="mt-0.5 text-ink-900">{v}</dd></div>)}
                    </dl>
                    <label className="flex items-center gap-3 rounded-2xl bg-ice/60 p-4 text-[14px] text-ink-800">
                      <Toggle label="Aplicar dominio" checked={f.applyCaddy} onChange={v => set('applyCaddy', v)} />
                      Configurar el dominio en Caddy ahora (si el DNS ya apunta al servidor)
                    </label>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="flex items-center justify-between border-t border-ink-900/[0.06] bg-ice/40 px-7 py-4">
            <button className="btn-soft" disabled={step === 0} onClick={() => go(step - 1)}><ArrowLeft className="h-4 w-4" />Atrás</button>
            {step < STEPS.length - 1
              ? <button className="btn-ink" onClick={() => go(step + 1)}>Siguiente<ArrowRight className="h-4 w-4" /></button>
              : <button className="btn-primary px-6" disabled={busy || !plan || serverIssues.length > 0} onClick={create}>{busy ? <Spinner /> : <Rocket className="h-4 w-4" />}Crear cliente</button>}
          </div>
        </Tile>
      </div>
    </div>
  )
}
