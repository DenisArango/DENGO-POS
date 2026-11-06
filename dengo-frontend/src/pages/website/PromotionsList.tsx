import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Tag, Pencil, Globe, EyeOff, Calendar, Ticket, Star, Copy } from 'lucide-react'
import { api } from '../../lib/api'
import PromotionEditor from './PromotionEditor'
import { type Promotion, PROMO_TYPE_LABEL, fmtDate } from './types'

function statusOf(p: Promotion) {
  const now = Date.now()
  if (!p.isActive) return { label: 'Inactiva', cls: 'bg-gray-100 text-gray-600' }
  if (p.startsAt && new Date(p.startsAt).getTime() > now) return { label: 'Programada', cls: 'bg-sky-50 text-sky-700' }
  if (p.endsAt && new Date(p.endsAt).getTime() < now) return { label: 'Vencida', cls: 'bg-amber-50 text-amber-700' }
  return { label: 'Vigente', cls: 'bg-emerald-50 text-emerald-700' }
}

export default function PromotionsList() {
  const [rows, setRows] = useState<Promotion[] | null>(null)
  const [editing, setEditing] = useState<Promotion | 'new' | null>(null)
  const [filter, setFilter] = useState<'all' | 'live' | 'off'>('all')

  const load = () => api.get<Promotion[]>('/api/website/promotions').then(setRows).catch(e => toast.error(e.message))
  useEffect(() => { void load() }, [])

  const shown = (rows ?? []).filter(p => filter === 'all' ? true : filter === 'live' ? p.live : !p.live)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {([['all', 'Todas'], ['live', 'Vigentes'], ['off', 'No vigentes']] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setFilter(id)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${filter === id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
              {label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setEditing('new')} className="btn-primary flex items-center gap-2 h-10 px-4 rounded-lg active:scale-[0.97] transition-transform">
          <Plus size={18} /> Nueva oferta
        </button>
      </div>

      {rows === null ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map(i => <div key={i} className="h-44 rounded-xl bg-white animate-pulse" />)}</div>
      ) : shown.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center">
          <Tag size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="font-medium text-gray-700">{rows.length === 0 ? 'Aún no tienes ofertas' : 'No hay ofertas en este filtro'}</p>
          <p className="text-sm text-gray-500 mt-1">Crea una oferta, publícala en tu página y tus clientes obtienen su cupón para canjearlo en caja.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map(p => {
            const st = statusOf(p)
            const conv = p.issued ? Math.round(((p.redeemed ?? 0) / p.issued) * 100) : 0
            return (
              <motion.article key={p.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                className="group bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-[border-color,box-shadow] overflow-hidden flex flex-col">
                {p.image && <img src={p.image} alt="" loading="lazy" decoding="async" className="h-28 w-full object-cover" />}
                <div className="p-4 flex-1 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate flex items-center gap-1.5">{p.featured && <Star size={14} className="text-amber-500 fill-amber-400 flex-shrink-0" />}{p.name}</h3>
                      <p className="text-sm text-gray-600">{p.summary}</p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${st.cls}`}>{st.label}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                    <span>{PROMO_TYPE_LABEL[p.type]}</span>
                    <span className="flex items-center gap-1"><Calendar size={12} />{p.startsAt || p.endsAt ? `${fmtDate(p.startsAt)} – ${fmtDate(p.endsAt)}` : 'Sin fecha límite'}</span>
                    <span className="flex items-center gap-1">{p.showOnWebsite ? <><Globe size={12} />En la página</> : <><EyeOff size={12} />Oculta en la página</>}</span>
                    {!p.allowManualDiscount && <span>No combina con descuentos</span>}
                  </div>
                  <div className="mt-auto pt-3 flex items-end justify-between border-t border-gray-100">
                    <div className="flex gap-4 text-sm">
                      <div><p className="text-xs text-gray-500">Cupones</p><p className="font-semibold tabular-nums">{p.issued ?? 0}{p.maxCoupons ? <span className="text-gray-400 font-normal">/{p.maxCoupons}</span> : null}</p></div>
                      <div><p className="text-xs text-gray-500">Canjeados</p><p className="font-semibold tabular-nums">{p.redeemed ?? 0} <span className="text-gray-400 font-normal text-xs">({conv}%)</span></p></div>
                    </div>
                    <div className="flex gap-1">
                      <button type="button" title="Copiar enlace de la oferta" aria-label="Copiar enlace"
                        onClick={() => { void navigator.clipboard?.writeText(`/ofertas/${p.slug}`); toast.success('Ruta copiada: /ofertas/' + p.slug) }}
                        className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 active:scale-95 transition"><Copy size={16} /></button>
                      <button type="button" onClick={() => setEditing(p)} title="Editar" aria-label="Editar oferta"
                        className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 active:scale-95 transition"><Pencil size={16} /></button>
                    </div>
                  </div>
                </div>
              </motion.article>
            )
          })}
        </div>
      )}

      <p className="text-xs text-gray-400 flex items-center gap-1.5"><Ticket size={12} /> Cada persona recibe un cupón único con su nombre y teléfono. En caja se escanea o se escribe en "Aplicar cupón".</p>

      <AnimatePresence>
        {editing && (
          <PromotionEditor
            key={editing === 'new' ? 'new' : editing.id}
            promotion={editing === 'new' ? null : editing}
            onClose={() => setEditing(null)}
            onSaved={() => { setEditing(null); void load() }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
