import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Plus, Ban, X, Loader2, Ticket, Download } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store'
import { type Coupon, type Promotion, money, fmtDate } from './types'

const STATUS: Record<Coupon['effectiveStatus'], { label: string; cls: string }> = {
  ISSUED: { label: 'Pendiente', cls: 'bg-sky-50 text-sky-700' },
  REDEEMED: { label: 'Canjeado', cls: 'bg-emerald-50 text-emerald-700' },
  EXPIRED: { label: 'Vencido', cls: 'bg-amber-50 text-amber-700' },
  VOID: { label: 'Anulado', cls: 'bg-gray-100 text-gray-500' },
}

export default function CouponsList() {
  const navigate = useNavigate()
  const token = useAuthStore(s => s.token)
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [promotionId, setPromotionId] = useState('')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{ total: number; data: Coupon[] } | null>(null)
  const [issuing, setIssuing] = useState(false)

  useEffect(() => { api.get<Promotion[]>('/api/website/promotions').then(setPromotions).catch(() => {}) }, [])

  const load = useCallback(() => {
    const q = new URLSearchParams({ page: String(page), limit: '50' })
    if (promotionId) q.set('promotionId', promotionId)
    if (status) q.set('status', status)
    if (search.trim()) q.set('search', search.trim())
    return api.get<{ total: number; data: Coupon[] }>(`/api/website/coupons?${q}`).then(setData).catch(e => toast.error(e.message))
  }, [page, promotionId, status, search])
  useEffect(() => { const t = setTimeout(() => { void load() }, search ? 250 : 0); return () => clearTimeout(t) }, [load, search])

  async function voidCoupon(c: Coupon) {
    if (!confirm(`¿Anular el cupón ${c.display} de ${c.name}? Ya no se podrá usar.`)) return
    try { await api.post(`/api/website/coupons/${c.id}/void`, {}); toast.success('Cupón anulado'); void load() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo anular') }
  }

  async function exportCsv() {
    const q = new URLSearchParams()
    if (promotionId) q.set('promotionId', promotionId)
    if (status && status !== 'EXPIRED') q.set('status', status)
    q.set('from', '2000-01-01')
    const res = await fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/website/reports/leads.csv?${q}`, { headers: { authorization: `Bearer ${token}` } })
    if (!res.ok) { toast.error('No se pudo exportar'); return }
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a'); a.href = url; a.download = 'cupones.csv'; a.click(); URL.revokeObjectURL(url)
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / 50)) : 1

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input w-full pl-9" placeholder="Buscar por nombre, teléfono o código" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <select className="input" value={promotionId} onChange={e => { setPromotionId(e.target.value); setPage(1) }} aria-label="Oferta">
          <option value="">Todas las ofertas</option>
          {promotions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="input" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }} aria-label="Estado">
          <option value="">Todos los estados</option>
          <option value="ISSUED">Pendientes</option>
          <option value="REDEEMED">Canjeados</option>
          <option value="EXPIRED">Vencidos</option>
          <option value="VOID">Anulados</option>
        </select>
        <button type="button" onClick={exportCsv} className="h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"><Download size={16} /> Exportar</button>
        <button type="button" onClick={() => setIssuing(true)} className="btn-primary h-10 px-4 rounded-lg flex items-center gap-1.5 active:scale-[0.97] transition-transform"><Plus size={16} /> Emitir cupón</button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="text-left font-semibold px-4 py-2.5">Cliente</th>
              <th className="text-left font-semibold px-4 py-2.5">Oferta</th>
              <th className="text-left font-semibold px-4 py-2.5">Código</th>
              <th className="text-left font-semibold px-4 py-2.5">Estado</th>
              <th className="text-left font-semibold px-4 py-2.5">Obtenido</th>
              <th className="text-right font-semibold px-4 py-2.5">Venta</th>
              <th className="px-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data === null ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400"><Loader2 className="inline animate-spin" size={18} /></td></tr>
            ) : data.data.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-500"><Ticket className="mx-auto mb-2 text-gray-300" size={28} />Aún no hay cupones con estos filtros.</td></tr>
            ) : data.data.map(c => {
              const st = STATUS[c.effectiveStatus]
              return (
                <tr key={c.id} className="hover:bg-gray-50/70">
                  <td className="px-4 py-2.5"><p className="font-medium text-gray-900">{c.name}</p><p className="text-xs text-gray-500 tabular-nums">{c.phone}{c.email ? ` · ${c.email}` : ''}</p></td>
                  <td className="px-4 py-2.5 text-gray-700">{c.promotion.name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs tracking-wider text-gray-800">{c.display}<span className="block font-sans tracking-normal text-[11px] text-gray-400">{c.source === 'WEB' ? 'Página web' : 'Emitido en tienda'}</span></td>
                  <td className="px-4 py-2.5"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>{c.expiresAt && c.effectiveStatus === 'ISSUED' && <span className="block text-[11px] text-gray-400 mt-0.5">vence {fmtDate(c.expiresAt)}</span>}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{fmtDate(c.issuedAt, true)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {c.sale ? (
                      <button type="button" onClick={() => navigate(`/reports/sales/${c.sale!.id}`)} className="text-primary-700 hover:underline tabular-nums">
                        {c.sale.invoiceNumber} · {money(c.sale.total)}
                        <span className="block text-[11px] text-emerald-700">-{money(c.discountAmount)} · {c.sale.branch.name}</span>
                      </button>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-2 text-right">
                    {c.status === 'ISSUED' && (
                      <button type="button" onClick={() => voidCoupon(c)} title="Anular cupón" aria-label="Anular cupón" className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"><Ban size={15} /></button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {data && data.total > 50 && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>{data.total} cupones</span>
          <div className="flex gap-1">
            <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 rounded-lg border bg-white disabled:opacity-40">Anterior</button>
            <span className="px-3 py-1.5">{page} / {pages}</span>
            <button type="button" disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 rounded-lg border bg-white disabled:opacity-40">Siguiente</button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {issuing && <IssueModal promotions={promotions.filter(p => p.live)} onClose={() => setIssuing(false)} onDone={() => { setIssuing(false); void load() }} />}
      </AnimatePresence>
    </div>
  )
}

function IssueModal({ promotions, onClose, onDone }: { promotions: Promotion[]; onClose: () => void; onDone: () => void }) {
  const [promotionId, setPromotionId] = useState(promotions[0]?.id ?? '')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ display: string; reused: boolean } | null>(null)

  async function submit() {
    setSaving(true)
    try {
      const r = await api.post<{ display: string; reused: boolean }>('/api/website/coupons', { promotionId, name, phone })
      setResult(r)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo emitir') } finally { setSaving(false) }
  }

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <motion.div role="dialog" aria-modal="true" aria-label="Emitir cupón" initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }} transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
        className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-start justify-between mb-4">
          <div><h3 className="text-lg font-bold">Emitir cupón</h3><p className="text-sm text-gray-500">Para alguien que lo pide en tienda o por teléfono.</p></div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>
        {result ? (
          <div className="text-center py-4">
            <p className="text-sm text-gray-500">{result.reused ? 'Este teléfono ya tenía un cupón de esta oferta:' : 'Cupón emitido:'}</p>
            <p className="text-3xl font-bold font-mono tracking-widest my-3">{result.display}</p>
            <p className="text-xs text-gray-500">Díctalo al cliente o escríbelo en "Aplicar cupón" al cobrar.</p>
            <button type="button" onClick={onDone} className="btn-primary mt-5 h-11 px-6 rounded-lg">Listo</button>
          </div>
        ) : promotions.length === 0 ? (
          <p className="text-sm text-gray-600 py-4">No hay ofertas vigentes. Crea o activa una en "Ofertas".</p>
        ) : (
          <form onSubmit={e => { e.preventDefault(); void submit() }} className="space-y-3">
            <div><label className="label" htmlFor="is-p">Oferta</label>
              <select id="is-p" className="input w-full" value={promotionId} onChange={e => setPromotionId(e.target.value)}>{promotions.map(p => <option key={p.id} value={p.id}>{p.name} — {p.summary}</option>)}</select></div>
            <div><label className="label" htmlFor="is-n">Nombre</label><input id="is-n" className="input w-full" value={name} onChange={e => setName(e.target.value)} autoFocus /></div>
            <div><label className="label" htmlFor="is-t">Teléfono</label><input id="is-t" className="input w-full" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="5555-1234" /></div>
            <button type="submit" disabled={saving || name.trim().length < 2 || phone.replace(/\D/g, '').length < 8} className="btn-primary w-full h-11 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50">
              {saving && <Loader2 size={16} className="animate-spin" />} Emitir
            </button>
          </form>
        )}
      </motion.div>
    </motion.div>
  )
}
