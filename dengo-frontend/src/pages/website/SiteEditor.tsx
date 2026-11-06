import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Reorder } from 'framer-motion'
import { GripVertical, ImagePlus, Loader2, ExternalLink, ChevronDown, Plus, Trash2, Eye, EyeOff, Info } from 'lucide-react'
import { api } from '../../lib/api'
import { readAndCompressImageFile } from '../../lib/imageCompress'
import type { Block, BlockType, SiteConfig } from './types'

const BLOCK_INFO: Record<BlockType, { label: string; hint: string }> = {
  hero: { label: 'Portada', hint: 'Título grande, foto y botones de contacto' },
  features: { label: 'Razones para elegirte', hint: 'Tres o cuatro puntos fuertes' },
  about: { label: 'Nuestra historia', hint: 'El texto de "Historia" de arriba' },
  offers: { label: 'Ofertas', hint: 'Las ofertas vigentes con su botón de cupón' },
  categories: { label: 'Lo que encontrarás', hint: 'Las categorías de tu catálogo' },
  gallery: { label: 'Galería', hint: 'Fotos de tus tiendas' },
  branches: { label: 'Sucursales', hint: 'Dirección, horario, mapa' },
  contact: { label: 'Contacto', hint: 'WhatsApp, teléfono y redes' },
  cta: { label: 'Llamado final', hint: 'Una frase y un botón' },
}
const THEMES: { id: string; label: string; hint: string }[] = [
  { id: 'clasico', label: 'Clásico', hint: 'Cálido y cercano, tipografía serif' },
  { id: 'moderno', label: 'Moderno', hint: 'Limpio, sans-serif, mucho aire' },
  { id: 'editorial', label: 'Editorial', hint: 'Contrastes fuertes, títulos enormes' },
]

type Branch = { id: string; name: string }

export default function SiteEditor() {
  const [cfg, setCfg] = useState<SiteConfig | null>(null)
  const [branches, setBranches] = useState<Branch[]>([])
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [openBlock, setOpenBlock] = useState<string | null>(null)

  useEffect(() => {
    api.get<SiteConfig>('/api/website/config').then(setCfg).catch(e => toast.error(e.message))
    api.get<Branch[]>('/api/branches').then(setBranches).catch(() => {})
  }, [])

  if (!cfg) return <div className="h-96 rounded-xl bg-white animate-pulse" />

  const set = <K extends keyof SiteConfig>(k: K, v: SiteConfig[K]) => { setCfg(c => (c ? { ...c, [k]: v } : c)); setDirty(true) }
  const setBlock = (id: string, patch: Partial<Block>) => set('sections', cfg.sections.map(b => (b.id === id ? { ...b, ...patch } : b)))
  const setProps = (id: string, props: Record<string, unknown>) => set('sections', cfg.sections.map(b => (b.id === id ? { ...b, props: { ...b.props, ...props } } : b)))
  const custom = cfg.site !== 'plantilla'

  async function image(k: 'heroImage' | 'logo', file?: File) {
    if (!file) return
    try { set(k, await readAndCompressImageFile(file, k === 'logo' ? 600 : 2000, 0.85, k === 'logo' ? 'png' : 'jpeg')) } catch { toast.error('No se pudo leer la imagen') }
  }

  async function save() {
    if (!cfg) return
    setSaving(true)
    try {
      const body: Partial<SiteConfig> = { ...cfg }
      delete body.id; delete body.themes
      const updated = await api.put<SiteConfig>('/api/website/config', body)
      setCfg(c => (c ? { ...c, ...updated } : c))
      setDirty(false)
      toast.success('Página guardada. Los cambios se ven en el sitio en un minuto.')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo guardar') } finally { setSaving(false) }
  }

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-5 items-start">
      <div className="space-y-5">
        <Card title="General">
          <div className="grid sm:grid-cols-2 gap-3">
            <Text label="Nombre del negocio" value={cfg.businessName} onChange={v => set('businessName', v)} />
            <Text label="Frase corta" value={cfg.tagline} onChange={v => set('tagline', v)} placeholder="Ej. Todo para la escuela desde 1998" />
          </div>
          <div className="grid sm:grid-cols-[auto_1fr_1fr] gap-4 items-end">
            <ImageField label="Logo" value={cfg.logo} onPick={f => image('logo', f)} onClear={() => set('logo', null)} square />
            <ColorField label="Color principal" value={cfg.primaryColor ?? '#1E4D68'} onChange={v => set('primaryColor', v)} />
            <ColorField label="Color de acento" value={cfg.accentColor ?? '#E07A5F'} onChange={v => set('accentColor', v)} />
          </div>
        </Card>

        {custom ? (
          <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900 flex gap-3">
            <Info size={18} className="flex-shrink-0 mt-0.5" />
            <p>Tu página tiene un <strong>diseño a la medida</strong> ({cfg.site}). Los textos, fotos, ofertas, sucursales y contacto de esta pantalla sí se reflejan en ella; el estilo y el orden de las secciones son parte del diseño.</p>
          </div>
        ) : (
          <Card title="Estilo">
            <div className="grid sm:grid-cols-3 gap-2">
              {THEMES.map(t => (
                <button key={t.id} type="button" onClick={() => set('theme', t.id)} aria-pressed={cfg.theme === t.id}
                  className={`text-left p-3 rounded-xl border-2 transition-colors ${cfg.theme === t.id ? 'border-primary-500 bg-primary-50/60' : 'border-gray-200 hover:border-gray-300'}`}>
                  <p className="font-semibold text-sm">{t.label}</p><p className="text-xs text-gray-500">{t.hint}</p>
                </button>
              ))}
            </div>
          </Card>
        )}

        <Card title="Portada">
          <Text label="Título" value={cfg.heroTitle} onChange={v => set('heroTitle', v)} placeholder="Ej. Útiles, papelería y regalos en Cubulco" />
          <Text label="Texto debajo del título" value={cfg.heroSubtitle} onChange={v => set('heroSubtitle', v)} multiline />
          <ImageField label="Foto de portada" value={cfg.heroImage} onPick={f => image('heroImage', f)} onClear={() => set('heroImage', null)} />
        </Card>

        <Card title="Historia">
          <Text label="Quiénes son, desde cuándo, qué los hace distintos" value={cfg.about} onChange={v => set('about', v)} multiline rows={6} />
        </Card>

        {!custom && (
          <Card title="Secciones" hint="Arrastra para ordenar. El ojo las muestra u oculta.">
            <Reorder.Group axis="y" values={cfg.sections} onReorder={v => set('sections', v)} className="space-y-2">
              {cfg.sections.map(b => (
                <Reorder.Item key={b.id} value={b} className="bg-white rounded-lg border border-gray-200">
                  <div className="flex items-center gap-2 px-2 py-2">
                    <GripVertical size={18} className="text-gray-300 cursor-grab active:cursor-grabbing flex-shrink-0" />
                    <button type="button" onClick={() => setOpenBlock(o => (o === b.id ? null : b.id))} className="flex-1 text-left min-w-0">
                      <p className={`text-sm font-medium ${b.enabled ? 'text-gray-900' : 'text-gray-400 line-through'}`}>{BLOCK_INFO[b.type].label}</p>
                      <p className="text-xs text-gray-500 truncate">{BLOCK_INFO[b.type].hint}</p>
                    </button>
                    <button type="button" onClick={() => setBlock(b.id, { enabled: !b.enabled })} aria-label={b.enabled ? 'Ocultar sección' : 'Mostrar sección'} title={b.enabled ? 'Ocultar' : 'Mostrar'}
                      className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100">{b.enabled ? <Eye size={16} /> : <EyeOff size={16} />}</button>
                    <ChevronDown size={16} className={`text-gray-400 transition-transform ${openBlock === b.id ? 'rotate-180' : ''}`} />
                  </div>
                  {openBlock === b.id && <BlockProps block={b} onChange={props => setProps(b.id, props)} />}
                </Reorder.Item>
              ))}
            </Reorder.Group>
          </Card>
        )}

        <Card title="Contacto y redes">
          <div className="grid sm:grid-cols-3 gap-3">
            <Text label="WhatsApp" value={cfg.whatsapp} onChange={v => set('whatsapp', v)} placeholder="5555-1234" />
            <Text label="Teléfono" value={cfg.phone} onChange={v => set('phone', v)} />
            <Text label="Correo" value={cfg.email} onChange={v => set('email', v)} />
            <Text label="Facebook (enlace)" value={cfg.facebook} onChange={v => set('facebook', v)} />
            <Text label="Instagram (enlace)" value={cfg.instagram} onChange={v => set('instagram', v)} />
            <Text label="TikTok (enlace)" value={cfg.tiktok} onChange={v => set('tiktok', v)} />
          </div>
          <div>
            <p className="label">Sucursales que se muestran</p>
            <div className="flex flex-wrap gap-1.5">
              <Chip active={cfg.branchIds.length === 0} onClick={() => set('branchIds', [])}>Todas</Chip>
              {branches.map(b => <Chip key={b.id} active={cfg.branchIds.includes(b.id)} onClick={() => set('branchIds', cfg.branchIds.includes(b.id) ? cfg.branchIds.filter(x => x !== b.id) : [...cfg.branchIds, b.id])}>{b.name}</Chip>)}
            </div>
          </div>
        </Card>

        <Card title="Botón «Ingresar»" hint="La página muestra un botón para que tu equipo y los maestros inicien sesión ahí mismo. Cada quien entra a donde le toca según su usuario. Deja vacío lo que no quieras mostrar.">
          <div className="grid sm:grid-cols-2 gap-3">
            <Text label="Dirección del sistema (POS)" value={cfg.posUrl} onChange={v => set('posUrl', v)} placeholder={window.location.origin} />
            <Text label="Dirección del portal de maestros" value={cfg.portalUrl} onChange={v => set('portalUrl', v)} placeholder="https://maestros.tunegocio.com" />
          </div>
          {!cfg.posUrl && (
            <button type="button" onClick={() => set('posUrl', window.location.origin)} className="text-sm text-primary-700 font-medium">Usar la dirección de este sistema ({window.location.origin})</button>
          )}
        </Card>

        <Card title="Google y redes sociales" hint="Cómo se ve tu página en Google y al compartirla por WhatsApp.">
          <Text label="Título" value={cfg.seoTitle} onChange={v => set('seoTitle', v)} placeholder={cfg.businessName ?? ''} />
          <Text label="Descripción" value={cfg.seoDescription} onChange={v => set('seoDescription', v)} multiline placeholder="Una o dos frases sobre tu negocio" />
          <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
            <p className="text-[13px] text-emerald-800 truncate">{cfg.publicUrl || 'tudominio.com'}</p>
            <p className="text-lg text-blue-800 leading-tight truncate">{cfg.seoTitle || cfg.businessName || 'Tu negocio'}</p>
            <p className="text-sm text-gray-600 line-clamp-2">{cfg.seoDescription || cfg.tagline || 'Escribe una descripción para que la gente sepa qué encontrará.'}</p>
          </div>
        </Card>
      </div>

      <aside className="lg:sticky lg:top-4 space-y-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div><p className="font-semibold text-gray-900">Publicada</p><p className="text-xs text-gray-500">{cfg.published ? 'Visible para todos' : 'Muestra "Próximamente"'}</p></div>
            <button type="button" role="switch" aria-checked={cfg.published} aria-label="Publicada" onClick={() => set('published', !cfg.published)}
              className={`relative w-12 h-7 rounded-full transition-colors ${cfg.published ? 'bg-emerald-500' : 'bg-gray-300'}`}>
              <span className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${cfg.published ? 'translate-x-5' : ''}`} />
            </button>
          </div>
          <Text label="Dirección de la página" value={cfg.publicUrl} onChange={v => set('publicUrl', v)} placeholder="https://tunegocio.com" />
          {cfg.publicUrl && (
            <a href={`${cfg.publicUrl.replace(/\/$/, '')}${cfg.published ? '' : '/?preview=1'}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 h-10 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <ExternalLink size={15} /> Ver la página
            </a>
          )}
          <button type="button" onClick={save} disabled={saving || !dirty} className="btn-primary w-full h-11 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform">
            {saving && <Loader2 size={16} className="animate-spin" />} {dirty ? 'Guardar cambios' : 'Sin cambios'}
          </button>
        </div>
        <p className="text-xs text-gray-500 px-1">Diseño: <strong>{cfg.site === 'plantilla' ? 'plantilla de bloques' : `a la medida (${cfg.site})`}</strong>. Las ofertas se administran en la pestaña "Ofertas".</p>
      </aside>
    </div>
  )
}

function BlockProps({ block, onChange }: { block: Block; onChange: (p: Record<string, unknown>) => void }) {
  const p = block.props as { title?: string; subtitle?: string; text?: string; buttonLabel?: string; items?: { title: string; text: string }[]; images?: { src: string; caption?: string }[] }
  return (
    <div className="px-4 pb-4 pt-1 space-y-3 border-t border-gray-100">
      {block.type !== 'hero' && <Text label="Título de la sección" value={p.title ?? ''} onChange={v => onChange({ title: v })} />}
      {(block.type === 'offers' || block.type === 'cta') && <Text label="Subtítulo" value={p.subtitle ?? ''} onChange={v => onChange({ subtitle: v })} />}
      {block.type === 'cta' && <Text label="Texto del botón" value={p.buttonLabel ?? ''} onChange={v => onChange({ buttonLabel: v })} placeholder="Escríbenos por WhatsApp" />}
      {block.type === 'features' && (
        <div className="space-y-2">
          {(p.items ?? []).map((it, i) => (
            <div key={i} className="grid grid-cols-[1fr_2fr_auto] gap-2">
              <input className="input" value={it.title} onChange={e => onChange({ items: (p.items ?? []).map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} placeholder="Título" />
              <input className="input" value={it.text} onChange={e => onChange({ items: (p.items ?? []).map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} placeholder="Descripción" />
              <button type="button" aria-label="Quitar" onClick={() => onChange({ items: (p.items ?? []).filter((_, j) => j !== i) })} className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"><Trash2 size={15} /></button>
            </div>
          ))}
          {(p.items ?? []).length < 6 && <button type="button" onClick={() => onChange({ items: [...(p.items ?? []), { title: '', text: '' }] })} className="text-sm text-primary-700 font-medium flex items-center gap-1"><Plus size={14} /> Agregar punto</button>}
        </div>
      )}
      {block.type === 'gallery' && (
        <div className="grid grid-cols-3 gap-2">
          {(p.images ?? []).map((img, i) => (
            <div key={i} className="relative aspect-[4/3] rounded-lg overflow-hidden border">
              <img src={img.src} alt="" className="w-full h-full object-cover" />
              <button type="button" aria-label="Quitar foto" onClick={() => onChange({ images: (p.images ?? []).filter((_, j) => j !== i) })} className="absolute top-1 right-1 w-7 h-7 rounded-full bg-white/90 flex items-center justify-center shadow"><Trash2 size={13} /></button>
            </div>
          ))}
          {(p.images ?? []).length < 24 && (
            <label className="aspect-[4/3] rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-xs text-gray-500 cursor-pointer hover:border-primary-400">
              <ImagePlus size={18} /> Agregar
              <input type="file" accept="image/*" multiple className="sr-only" onChange={async e => {
                const files = Array.from(e.target.files ?? []).slice(0, 12)
                const added = await Promise.all(files.map(f => readAndCompressImageFile(f, 1600, 0.82).then(src => ({ src })).catch(() => null)))
                onChange({ images: [...(p.images ?? []), ...added.filter((x): x is { src: string } => !!x)] })
              }} />
            </label>
          )}
        </div>
      )}
    </div>
  )
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
      <div><h3 className="font-semibold text-gray-900">{title}</h3>{hint && <p className="text-xs text-gray-500">{hint}</p>}</div>
      {children}
    </section>
  )
}

function Text({ label, value, onChange, placeholder, multiline, rows = 3 }: { label: string; value: string | null; onChange: (v: string) => void; placeholder?: string; multiline?: boolean; rows?: number }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      {multiline
        ? <textarea rows={rows} className="input w-full mt-1" value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
        : <input className="input w-full mt-1" value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} />}
    </label>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      <span className="mt-1 flex items-center gap-2 h-10 px-2 rounded-lg border border-gray-200">
        <input type="color" value={value} onChange={e => onChange(e.target.value)} className="w-7 h-7 rounded border-0 bg-transparent cursor-pointer" />
        <span className="font-mono text-sm text-gray-700 uppercase">{value}</span>
      </span>
    </label>
  )
}

function ImageField({ label, value, onPick, onClear, square }: { label: string; value: string | null; onPick: (f?: File) => void; onClear: () => void; square?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-600 mb-1">{label}</p>
      {value ? (
        <div className={`relative rounded-lg overflow-hidden border bg-gray-50 ${square ? 'w-20 h-20' : 'h-44'}`}>
          <img src={value} alt="" className={`w-full h-full ${square ? 'object-contain p-1' : 'object-cover'}`} />
          <button type="button" onClick={onClear} className="absolute top-1 right-1 px-2 py-0.5 rounded bg-white/90 text-[11px] font-medium shadow">Quitar</button>
        </div>
      ) : (
        <label className={`flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-300 text-gray-500 text-xs cursor-pointer hover:border-primary-400 hover:text-primary-700 ${square ? 'w-20 h-20' : 'h-32'}`}>
          <ImagePlus size={18} />{square ? '' : 'Subir foto'}
          <input type="file" accept="image/*" className="sr-only" onChange={e => onPick(e.target.files?.[0])} />
        </label>
      )}
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`px-2.5 py-1 rounded-full text-xs font-medium border ${active ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>{children}</button>
}
