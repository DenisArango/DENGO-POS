import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { X, Percent, BadgeDollarSign, Gift, Tag, Search, Trash2, ImagePlus, Loader2 } from 'lucide-react'
import { api } from '../../lib/api'
import { readAndCompressImageFile } from '../../lib/imageCompress'
import { type Promotion, type PromoType, type PromoScope, money } from './types'

type Branch = { id: string; name: string }
type Category = { id: string; name: string }
type ProductLite = { id: string; name: string; basePrice: number | string; sku?: string | null }

const TYPES: { id: PromoType; label: string; hint: string; icon: typeof Percent }[] = [
  { id: 'PERCENT', label: '% de descuento', hint: 'Ej. 15% en mochilas', icon: Percent },
  { id: 'FIXED', label: 'Monto fijo', hint: 'Ej. Q25 en compras de Q200', icon: BadgeDollarSign },
  { id: 'BUY_X_GET_Y', label: 'Lleva X, paga Y', hint: 'Ej. 3x2 en cuadernos', icon: Gift },
  { id: 'SPECIAL_PRICE', label: 'Precio especial', hint: 'Ej. cuaderno a Q9.99', icon: Tag },
]

// <input type="datetime-local"> works in local wall time; the business is in
// Guatemala (UTC-6, no DST), so convert explicitly instead of trusting the
// device's timezone.
const toLocalInput = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - 6 * 3_600_000).toISOString().slice(0, 16) : '')
const fromLocalInput = (v: string) => (v ? `${v}:00-06:00` : null)
const num = (v: string) => (v.trim() === '' ? null : Number(v))
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))

export default function PromotionEditor({ promotion, onClose, onSaved }: { promotion: Promotion | null; onClose: () => void; onSaved: () => void }) {
  const p = promotion
  const [f, setF] = useState({
    name: p?.name ?? '',
    description: p?.description ?? '',
    terms: p?.terms ?? '',
    image: p?.image ?? null as string | null,
    type: (p?.type ?? 'PERCENT') as PromoType,
    scope: (p?.scope ?? 'ALL') as PromoScope,
    productIds: p?.productIds ?? [] as string[],
    categoryIds: p?.categoryIds ?? [] as string[],
    branchIds: p?.branchIds ?? [] as string[],
    percent: str(p?.percent), amount: str(p?.amount), specialPrice: str(p?.specialPrice),
    buyQty: str(p?.buyQty ?? 3), payQty: str(p?.payQty ?? 2),
    minPurchase: str(p?.minPurchase), maxDiscount: str(p?.maxDiscount),
    allowManualDiscount: p?.allowManualDiscount ?? false,
    startsAt: toLocalInput(p?.startsAt ?? null), endsAt: toLocalInput(p?.endsAt ?? null),
    isActive: p?.isActive ?? true, showOnWebsite: p?.showOnWebsite ?? true, featured: p?.featured ?? false,
    maxCoupons: str(p?.maxCoupons), perPhoneLimit: str(p?.perPhoneLimit ?? 1), couponValidDays: str(p?.couponValidDays),
  })
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(prev => ({ ...prev, [k]: v }))

  const [branches, setBranches] = useState<Branch[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<ProductLite[]>([])
  const [picked, setPicked] = useState<Map<string, ProductLite>>(new Map())
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get<Branch[]>('/api/branches').then(setBranches).catch(() => {})
    api.get<Category[]>('/api/categories').then(setCategories).catch(() => {})
    if (p?.productIds.length) {
      // Names for the products already chosen.
      Promise.all(p.productIds.slice(0, 60).map(id => api.get<ProductLite>(`/api/products/${id}`).catch(() => null)))
        .then(list => setPicked(new Map(list.filter((x): x is ProductLite => !!x).map(x => [x.id, x]))))
    }
  }, [p])

  useEffect(() => {
    if (f.scope !== 'PRODUCT' || search.trim().length < 2) { setProducts([]); return }
    const t = setTimeout(() => {
      api.get<{ data: ProductLite[] } | ProductLite[]>(`/api/products?search=${encodeURIComponent(search.trim())}&limit=12`)
        .then(r => setProducts(Array.isArray(r) ? r : r.data)).catch(() => {})
    }, 250)
    return () => clearTimeout(t)
  }, [search, f.scope])

  const preview = useMemo(() => {
    const q = (v: string) => `Q${Number(v || 0).toFixed(2).replace(/\.00$/, '')}`
    let s = ''
    if (f.type === 'PERCENT') s = `${f.percent || '…'}% de descuento`
    if (f.type === 'FIXED') s = `${q(f.amount)} de descuento`
    if (f.type === 'BUY_X_GET_Y') s = `Lleva ${f.buyQty || '…'}, paga ${f.payQty || '…'}`
    if (f.type === 'SPECIAL_PRICE') s = `Precio especial ${q(f.specialPrice)}`
    const target = f.scope === 'ALL' ? 'en toda la compra' : f.scope === 'CATEGORY' ? `en ${f.categoryIds.length || '…'} categoría(s)` : `en ${f.productIds.length || '…'} producto(s)`
    if (f.minPurchase) s += ` en compras desde ${q(f.minPurchase)}`
    return `${s} ${target}`
  }, [f])

  async function pickImage(file: File | undefined) {
    if (!file) return
    try { set('image', await readAndCompressImageFile(file, 1400, 0.82)) } catch { toast.error('No se pudo leer la imagen') }
  }

  async function save() {
    setSaving(true)
    try {
      const body = {
        name: f.name.trim(), description: f.description.trim() || null, terms: f.terms.trim() || null, image: f.image,
        type: f.type, scope: f.type === 'SPECIAL_PRICE' && f.scope === 'ALL' ? 'PRODUCT' : f.scope,
        productIds: f.productIds, categoryIds: f.categoryIds, branchIds: f.branchIds,
        percent: num(f.percent), amount: num(f.amount), specialPrice: num(f.specialPrice),
        buyQty: num(f.buyQty), payQty: num(f.payQty),
        minPurchase: num(f.minPurchase), maxDiscount: num(f.maxDiscount),
        allowManualDiscount: f.allowManualDiscount,
        startsAt: fromLocalInput(f.startsAt), endsAt: fromLocalInput(f.endsAt),
        isActive: f.isActive, showOnWebsite: f.showOnWebsite, featured: f.featured,
        maxCoupons: num(f.maxCoupons), perPhoneLimit: num(f.perPhoneLimit) ?? 1, couponValidDays: num(f.couponValidDays),
      }
      if (p) await api.put(`/api/website/promotions/${p.id}`, body)
      else await api.post('/api/website/promotions', body)
      toast.success(p ? 'Oferta actualizada' : 'Oferta creada')
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally { setSaving(false) }
  }

  async function remove() {
    if (!p || !confirm(`¿Eliminar la oferta "${p.name}"? Si ya tiene cupones solo se desactiva, para conservar su historial.`)) return
    try {
      const r = await api.delete<{ message?: string }>(`/api/website/promotions/${p.id}`)
      toast.success(r?.message ?? 'Oferta eliminada')
      onSaved()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo eliminar') }
  }

  const toggleIn = (list: string[], id: string) => (list.includes(id) ? list.filter(x => x !== id) : [...list, id])
  const scopeOptions: { id: PromoScope; label: string }[] = f.type === 'SPECIAL_PRICE'
    ? [{ id: 'PRODUCT', label: 'Productos' }, { id: 'CATEGORY', label: 'Categorías' }]
    : [{ id: 'ALL', label: 'Toda la compra' }, { id: 'CATEGORY', label: 'Categorías' }, { id: 'PRODUCT', label: 'Productos' }]
  const scope = f.type === 'SPECIAL_PRICE' && f.scope === 'ALL' ? 'PRODUCT' : f.scope

  return (
    <motion.div className="fixed inset-0 z-50 flex justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <motion.aside role="dialog" aria-modal="true" aria-label={p ? 'Editar oferta' : 'Nueva oferta'}
        initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
        className="relative w-full max-w-xl h-full bg-white shadow-2xl flex flex-col">
        <header className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{p ? 'Editar oferta' : 'Nueva oferta'}</h2>
            <p className="text-sm text-primary-700 font-medium">{preview}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"><X size={20} /></button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          <section className="space-y-3">
            <label className="label" htmlFor="pr-name">Nombre de la oferta *</label>
            <input id="pr-name" className="input w-full" value={f.name} onChange={e => set('name', e.target.value)} placeholder="Ej. Regreso a clases: 15% en útiles" />
          </section>

          <section>
            <p className="label">Tipo de oferta</p>
            <div className="grid grid-cols-2 gap-2">
              {TYPES.map(t => (
                <button key={t.id} type="button" onClick={() => set('type', t.id)} aria-pressed={f.type === t.id}
                  className={`text-left p-3 rounded-xl border-2 transition-colors active:scale-[0.98] ${f.type === t.id ? 'border-primary-500 bg-primary-50/60' : 'border-gray-200 hover:border-gray-300'}`}>
                  <t.icon size={18} className={f.type === t.id ? 'text-primary-600' : 'text-gray-400'} />
                  <p className="font-semibold text-sm text-gray-900 mt-1">{t.label}</p>
                  <p className="text-xs text-gray-500">{t.hint}</p>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              {f.type === 'PERCENT' && <>
                <Field label="Porcentaje *" suffix="%"><input type="number" min={1} max={100} step="0.5" className="input w-full" value={f.percent} onChange={e => set('percent', e.target.value)} /></Field>
                <Field label="Tope de descuento" prefix="Q" hint="Opcional"><input type="number" min={0} step="0.01" className="input w-full" value={f.maxDiscount} onChange={e => set('maxDiscount', e.target.value)} /></Field>
              </>}
              {f.type === 'FIXED' && <Field label="Monto a descontar *" prefix="Q"><input type="number" min={0} step="0.01" className="input w-full" value={f.amount} onChange={e => set('amount', e.target.value)} /></Field>}
              {f.type === 'BUY_X_GET_Y' && <>
                <Field label="Lleva *" suffix="unid."><input type="number" min={2} step="1" className="input w-full" value={f.buyQty} onChange={e => set('buyQty', e.target.value)} /></Field>
                <Field label="Paga *" suffix="unid."><input type="number" min={1} step="1" className="input w-full" value={f.payQty} onChange={e => set('payQty', e.target.value)} /></Field>
                <p className="col-span-2 text-xs text-gray-500 -mt-1">Las unidades más baratas son las que salen gratis.</p>
              </>}
              {f.type === 'SPECIAL_PRICE' && <Field label="Precio de oferta por unidad *" prefix="Q"><input type="number" min={0} step="0.01" className="input w-full" value={f.specialPrice} onChange={e => set('specialPrice', e.target.value)} /></Field>}
              <Field label="Compra mínima" prefix="Q" hint="Opcional"><input type="number" min={0} step="0.01" className="input w-full" value={f.minPurchase} onChange={e => set('minPurchase', e.target.value)} /></Field>
            </div>
          </section>

          <section>
            <p className="label">Aplica a</p>
            <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
              {scopeOptions.map(o => (
                <button key={o.id} type="button" onClick={() => set('scope', o.id)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${scope === o.id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>{o.label}</button>
              ))}
            </div>
            {scope === 'CATEGORY' && (
              <div className="mt-3 flex flex-wrap gap-1.5 max-h-44 overflow-y-auto">
                {categories.map(c => (
                  <button key={c.id} type="button" onClick={() => set('categoryIds', toggleIn(f.categoryIds, c.id))}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${f.categoryIds.includes(c.id) ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>{c.name}</button>
                ))}
              </div>
            )}
            {scope === 'PRODUCT' && (
              <div className="mt-3 space-y-2">
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input className="input w-full pl-9" placeholder="Busca productos por nombre o código" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                {products.length > 0 && (
                  <ul className="border border-gray-200 rounded-lg divide-y max-h-48 overflow-y-auto">
                    {products.map(pr => (
                      <li key={pr.id}>
                        <button type="button" onClick={() => { set('productIds', toggleIn(f.productIds, pr.id)); setPicked(m => new Map(m).set(pr.id, pr)) }}
                          className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 text-left">
                          <span className="truncate">{pr.name}</span>
                          <span className="flex items-center gap-2 text-gray-500 tabular-nums">{money(pr.basePrice)} <input type="checkbox" readOnly checked={f.productIds.includes(pr.id)} className="w-4 h-4" /></span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {f.productIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {f.productIds.map(id => (
                      <span key={id} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-primary-50 text-primary-800 text-xs font-medium">
                        {picked.get(id)?.name ?? 'Producto'}
                        <button type="button" aria-label="Quitar" onClick={() => set('productIds', f.productIds.filter(x => x !== id))} className="w-5 h-5 rounded-full hover:bg-primary-100 flex items-center justify-center"><X size={12} /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <Toggle checked={f.allowManualDiscount} onChange={v => set('allowManualDiscount', v)}
              title="Se combina con descuentos manuales"
              text={f.allowManualDiscount ? 'El cajero puede dar además un descuento o bajar el precio en los productos de la oferta.' : 'Los productos de la oferta se cobran a precio de lista y sin descuentos extra.'} />
          </section>

          <section>
            <p className="label">Vigencia</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Desde" hint="Vacío = ya"><input type="datetime-local" className="input w-full" value={f.startsAt} onChange={e => set('startsAt', e.target.value)} /></Field>
              <Field label="Hasta" hint="Vacío = sin límite"><input type="datetime-local" className="input w-full" value={f.endsAt} onChange={e => set('endsAt', e.target.value)} /></Field>
            </div>
          </section>

          <section>
            <p className="label">Cupones</p>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Total disponible" hint="Vacío = sin límite"><input type="number" min={1} className="input w-full" value={f.maxCoupons} onChange={e => set('maxCoupons', e.target.value)} /></Field>
              <Field label="Por teléfono"><input type="number" min={1} className="input w-full" value={f.perPhoneLimit} onChange={e => set('perPhoneLimit', e.target.value)} /></Field>
              <Field label="Válido por" suffix="días" hint="Desde que lo obtiene"><input type="number" min={1} className="input w-full" value={f.couponValidDays} onChange={e => set('couponValidDays', e.target.value)} /></Field>
            </div>
          </section>

          <section>
            <p className="label">Sucursales</p>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => set('branchIds', [])}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border ${f.branchIds.length === 0 ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}>Todas</button>
              {branches.map(b => (
                <button key={b.id} type="button" onClick={() => set('branchIds', toggleIn(f.branchIds, b.id))}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border ${f.branchIds.includes(b.id) ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-200'}`}>{b.name}</button>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <p className="label">En la página web</p>
            <Toggle checked={f.showOnWebsite} onChange={v => set('showOnWebsite', v)} title="Mostrar en la página" text="Si la ocultas, solo se entregan cupones desde aquí (Cupones → Emitir)." />
            <Toggle checked={f.featured} onChange={v => set('featured', v)} title="Destacada" text="Aparece primero y más grande." />
            <div>
              <label className="label" htmlFor="pr-desc">Descripción</label>
              <textarea id="pr-desc" rows={3} className="input w-full" value={f.description} onChange={e => set('description', e.target.value)} placeholder="Lo que verá el cliente en la página." />
            </div>
            <div>
              <label className="label" htmlFor="pr-terms">Condiciones</label>
              <textarea id="pr-terms" rows={2} className="input w-full" value={f.terms} onChange={e => set('terms', e.target.value)} placeholder="Ej. No acumulable. Válido presentando el cupón en caja." />
            </div>
            <div>
              <p className="label">Imagen</p>
              {f.image ? (
                <div className="relative rounded-xl overflow-hidden border">
                  <img src={f.image} alt="" className="w-full h-40 object-cover" />
                  <button type="button" onClick={() => set('image', null)} className="absolute top-2 right-2 px-2.5 py-1 rounded-lg bg-white/90 text-xs font-medium shadow">Quitar</button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-1 h-28 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 text-sm cursor-pointer hover:border-primary-400 hover:text-primary-700">
                  <ImagePlus size={22} /> Subir imagen
                  <input type="file" accept="image/*" className="sr-only" onChange={e => pickImage(e.target.files?.[0])} />
                </label>
              )}
            </div>
          </section>

          <section>
            <Toggle checked={f.isActive} onChange={v => set('isActive', v)} title="Oferta activa" text="Desactívala para pausarla sin borrarla." />
          </section>
        </div>

        <footer className="px-6 py-4 border-t flex items-center gap-2">
          {p && <button type="button" onClick={remove} className="h-11 px-3 rounded-lg text-red-600 hover:bg-red-50 flex items-center gap-1.5 text-sm font-medium"><Trash2 size={16} /> Eliminar</button>}
          <div className="flex-1" />
          <button type="button" onClick={onClose} className="h-11 px-4 rounded-lg text-gray-600 hover:bg-gray-100 text-sm font-medium">Cancelar</button>
          <button type="button" onClick={save} disabled={saving || f.name.trim().length < 2}
            className="btn-primary h-11 px-5 rounded-lg flex items-center gap-2 disabled:opacity-50 active:scale-[0.97] transition-transform">
            {saving && <Loader2 size={16} className="animate-spin" />} {p ? 'Guardar cambios' : 'Crear oferta'}
          </button>
        </footer>
      </motion.aside>
    </motion.div>
  )
}

function Field({ label, children, prefix, suffix, hint }: { label: string; children: React.ReactNode; prefix?: string; suffix?: string; hint?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600">{label}{hint && <span className="text-gray-400 font-normal"> · {hint}</span>}</span>
      <span className="mt-1 flex items-center gap-1.5">
        {prefix && <span className="text-sm text-gray-500">{prefix}</span>}
        <span className="flex-1">{children}</span>
        {suffix && <span className="text-sm text-gray-500">{suffix}</span>}
      </span>
    </label>
  )
}

function Toggle({ checked, onChange, title, text }: { checked: boolean; onChange: (v: boolean) => void; title: string; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <button type="button" role="switch" aria-checked={checked} aria-label={title} onClick={() => onChange(!checked)}
        className={`relative mt-0.5 w-11 h-6 rounded-full flex-shrink-0 transition-colors ${checked ? 'bg-primary-600' : 'bg-gray-300'}`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${checked ? 'translate-x-5' : ''}`} />
      </button>
      <div>
        <p className="text-sm font-medium text-gray-800">{title}</p>
        <p className="text-xs text-gray-500">{text}</p>
      </div>
    </div>
  )
}
