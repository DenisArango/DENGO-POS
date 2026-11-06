import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'

// A website coupon applied to the current POS sale. The server computes the
// discount (per line) and re-checks it when the sale is saved; this hook
// just keeps it in sync with the cart.

export type CouponLine = { productId: string; variationId?: string; quantity: number; unitPrice: number; discount: number }

export type CouponInfo = {
  coupon: { id: string; code: string; display: string; name: string; phone: string; expiresAt: string | null; customerId: string | null }
  promotion: { id: string; name: string; type: string; scope: string; summary: string; allowManualDiscount: boolean; terms: string | null }
  applies: boolean
  message?: string
  lines?: number[]
  eligible?: boolean[]
  total?: number
}

/** A scan is a coupon (not a product barcode) when it carries CUP- or a /cupon/ URL. */
export function isCouponScan(text: string) {
  return /^CUP-?[A-Z0-9]{4}-?[A-Z0-9]{4}$/i.test(text.trim()) || /\/cupon\/[A-Z0-9-]{8,9}\/?$/i.test(text.trim())
}

export function useCoupon(branchId: string | undefined, lines: CouponLine[]) {
  const [code, setCode] = useState<string | null>(null)
  const [info, setInfo] = useState<CouponInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)
  const linesKey = JSON.stringify(lines)

  const validate = useCallback(async (raw: string, current: CouponLine[]) => {
    if (!branchId) return null
    const mine = ++seq.current
    setBusy(true)
    try {
      const r = await api.post<CouponInfo>('/api/website/coupons/validate', { code: raw, branchId, items: current })
      if (mine !== seq.current) return null
      setInfo(r); setError(null)
      return r
    } catch (e) {
      if (mine !== seq.current) return null
      const msg = e instanceof Error ? e.message : 'No se pudo validar el cupón'
      setError(msg)
      return null
    } finally {
      if (mine === seq.current) setBusy(false)
    }
  }, [branchId])

  /** Scan/typed code. Resolves with the result (or null + error state). */
  const apply = useCallback(async (raw: string) => {
    if (!navigator.onLine) { setError('Los cupones necesitan internet para validarse'); return null }
    const r = await validate(raw, lines)
    if (r) setCode(raw)
    else { setCode(null); setInfo(null) }
    return r
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validate, linesKey])

  const remove = useCallback(() => { seq.current++; setCode(null); setInfo(null); setError(null); setBusy(false) }, [])

  // Cart changed: recompute (debounced) so the discount always matches.
  useEffect(() => {
    if (!code) return
    const t = setTimeout(() => { void validate(code, lines) }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, linesKey, validate])

  // Keeps the last result while re-checking; checkout waits for `busy` to clear.
  const applies = !!info?.applies
  return {
    code, info, busy, error, apply, remove,
    applies,
    lines: applies ? info!.lines ?? [] : [],
    total: applies ? info!.total ?? 0 : 0,
  }
}
