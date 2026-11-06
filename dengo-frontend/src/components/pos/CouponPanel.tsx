import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Ticket, X, Loader2, ScanLine, AlertCircle } from 'lucide-react'
import type { useCoupon } from '../../hooks/useCoupon'

type Coupon = ReturnType<typeof useCoupon>

// The coupon row inside the POS totals card: "Aplicar cupón" opens a small
// field that takes a scanner (QR or barcode) or a typed code; once applied it
// shows who the coupon belongs to, the offer and the discount.
export default function CouponPanel({ coupon, hasManualDiscountOnEligible }: { coupon: Coupon; hasManualDiscountOnEligible: boolean }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (open) inputRef.current?.focus() }, [open])

  async function submit() {
    const v = value.trim()
    if (!v) return
    const r = await coupon.apply(v)
    if (r) { setOpen(false); setValue('') }
  }

  const info = coupon.info

  if (coupon.code && info) {
    return (
      <div className={`mb-2 rounded-lg border px-3 py-2.5 ${coupon.applies ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
        <div className="flex items-start gap-2.5">
          <Ticket size={18} className={`mt-0.5 flex-shrink-0 ${coupon.applies ? 'text-emerald-600' : 'text-amber-600'}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-gray-800 truncate">{info.promotion.name}</p>
              {coupon.applies && (
                <span className="text-sm font-bold text-emerald-700 tabular-nums whitespace-nowrap">
                  {coupon.busy ? <Loader2 size={14} className="inline animate-spin" /> : `-Q${coupon.total.toFixed(2)}`}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-600">{info.promotion.summary} · Cupón {info.coupon.display}</p>
            <p className="text-xs text-gray-500">{info.coupon.name} · {info.coupon.phone}</p>
            {!coupon.applies && info.message && <p className="text-xs font-medium text-amber-800 mt-1">{info.message}</p>}
            {coupon.applies && !info.promotion.allowManualDiscount && hasManualDiscountOnEligible && (
              <p className="text-xs font-medium text-amber-800 mt-1 flex items-center gap-1"><AlertCircle size={12} /> Esta oferta no se combina con descuentos manuales: quítalos de los productos de la oferta.</p>
            )}
          </div>
          <button type="button" onClick={coupon.remove} aria-label="Quitar cupón" title="Quitar cupón"
            className="w-8 h-8 -mr-1 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white/70 active:scale-95 transition">
            <X size={16} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mb-2">
      <AnimatePresence initial={false} mode="wait">
        {open ? (
          <motion.form key="field" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
            onSubmit={e => { e.preventDefault(); void submit() }} className="flex items-center gap-2">
            <div className="relative flex-1">
              <ScanLine size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input ref={inputRef} value={value} onChange={e => setValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); setValue('') } }}
                placeholder="Escanea o escribe el cupón"
                className="w-full pl-8 pr-2 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 uppercase tracking-wide" />
            </div>
            <button type="submit" disabled={coupon.busy || !value.trim()}
              className="h-9 px-3 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50 active:scale-[0.97] transition">
              {coupon.busy ? <Loader2 size={16} className="animate-spin" /> : 'Aplicar'}
            </button>
            <button type="button" onClick={() => { setOpen(false); setValue('') }} aria-label="Cancelar"
              className="h-9 w-9 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"><X size={16} /></button>
          </motion.form>
        ) : (
          <motion.button key="btn" type="button" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}
            onClick={() => setOpen(true)}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-gray-300 text-sm font-medium text-gray-600 hover:border-primary-400 hover:text-primary-700 hover:bg-primary-50/50 active:scale-[0.99] transition">
            <Ticket size={16} /> Aplicar cupón
          </motion.button>
        )}
      </AnimatePresence>
      {coupon.error && <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1"><AlertCircle size={12} /> {coupon.error}</p>}
    </div>
  )
}
