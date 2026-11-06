// Sale → DTE. The certifier recomputes everything from the lines, so the
// lines must add up to exactly what the customer paid:
//
//   line i:  qty × unitPrice − discount_i
//   discount_i = (manual line discount) + (coupon discount on that line)
//                + (its share of the sale's header discount)
//
// SaleItem.total already has the manual discount applied but not the coupon
// (SaleItem.promoDiscount) nor the header discount (Sale.discount, an amount);
// Sale.total has all three. Rounding leftovers go to the largest line so the
// sum matches Sale.total to the cent.

import type { DteDocument, DteLine, DteReceiver, DteType } from './types.js'
import { isSmallTaxpayerType, type FelConfig } from './config.js'
import { looksLikeRealNit, normalizeNit } from '../nit.js'

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export interface BuildSaleInput {
  id: string
  invoiceNumber: string
  invoiceSeries: string | null
  invoiceSeqNumber: number | null
  createdAt: Date
  total: unknown
  discount: unknown
  /** IVA added on top (quotation conversions); POS prices already include it and leave this 0. */
  tax?: unknown
  buyerNit: string | null
  buyerName: string | null
  notes?: string | null
  customer?: { nit: string | null; name: string; email: string | null; address: string | null } | null
  branch: { name: string; city?: string | null }
  items: {
    quantity: unknown
    unitPrice: unknown
    total: unknown
    promoDiscount?: unknown
    customName?: string | null
    product?: { name: string } | null
    variation?: { name: string; isDefault?: boolean | null } | null
  }[]
}

export interface BuildOptions {
  type?: DteType
  /** Credit/debit notes. */
  parentUuid?: string
  memo?: string
  /** Who the document is billed to when it isn't the sale's buyer (portal orders → the school). */
  receiverOverride?: { nit: string; name: string; address?: string | null; email?: string | null }
  /** Emission date; defaults to the sale's date. */
  issuedAt?: Date
}

export class DteBuildError extends Error {}

export function lineDescription(i: BuildSaleInput['items'][number]): string {
  const base = i.product?.name ?? i.customName ?? 'Producto'
  return i.variation && !i.variation.isDefault ? `${base} (${i.variation.name})` : base
}

export function gtLocalIso(d: Date): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d).map(p => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}:${parts.second}`
}

export function buildReceiver(sale: BuildSaleInput, cfg: FelConfig, override?: BuildOptions['receiverOverride']): DteReceiver {
  const nit = override?.nit ?? sale.buyerNit ?? sale.customer?.nit ?? null
  const name = (override?.name ?? sale.buyerName ?? sale.customer?.name ?? '').trim()
  const address = {
    street: (override?.address ?? sale.customer?.address)?.trim() || 'Ciudad',
    city: sale.branch.city?.trim() || 'Guatemala',
    state: 'Guatemala',
    zip: '01001',
    country: 'GT',
  }
  const email = cfg.sendEmail ? (override?.email ?? sale.customer?.email ?? null) : null
  if (looksLikeRealNit(nit)) {
    const clean = normalizeNit(nit)
    // 13 digits and no check letter: a DPI (CUI), not a NIT.
    const kind = /^\d{13}$/.test(clean) ? 'CUI' : 'NIT'
    return { kind, taxId: clean, name: name || 'Cliente', address, email }
  }
  if (!cfg.allowCf) throw new DteBuildError('Se necesita un NIT válido para facturar (FEL_ALLOW_CF está desactivado)')
  if (Number(sale.total) >= cfg.cfMaxTotal) throw new DteBuildError(`Desde Q${cfg.cfMaxTotal.toFixed(2)} la SAT exige NIT o CUI del comprador`)
  return { kind: 'CF', taxId: 'CF', name: name && !/^consumidor final$/i.test(name) ? name : 'Consumidor Final', address, email }
}

/**
 * Sales converted from a quotation can carry IVA on top of the line prices
 * (Sale.tax > 0, total = subtotal − discount + tax). The DTE wants prices with
 * IVA included, so those lines are scaled up by this factor; POS sales give 1.
 */
export function ivaOnTopFactor(sale: Pick<BuildSaleInput, 'total' | 'discount' | 'tax' | 'items'>): number {
  const header = r2(Number(sale.discount ?? 0))
  const netSum = r2(sale.items.reduce((s, i) => s + Number(i.total) - Number(i.promoDiscount ?? 0), 0))
  const total = r2(Number(sale.total))
  const base = r2(netSum - header)
  if (Math.abs(base - total) < 0.005 || base <= 0) return 1
  if (Number(sale.tax ?? 0) > 0 && Math.abs(r2(base + Number(sale.tax)) - total) < 0.02) return total / base
  throw new DteBuildError(`No cuadra el total de la factura (productos ${base} vs total ${total})`)
}

/**
 * What each sale line really cost the customer after every discount (manual,
 * coupon and its share of the header discount), in the order of sale.items.
 * Credit notes use it so a returned unit is credited at what was paid for it.
 */
export function saleLineNets(sale: Pick<BuildSaleInput, 'total' | 'discount' | 'tax' | 'items'>): number[] {
  const k = ivaOnTopFactor(sale)
  const header = r2(Number(sale.discount ?? 0) * k)
  const nets = sale.items.map(i => r2((Number(i.total) - Number(i.promoDiscount ?? 0)) * k))
  const netSum = r2(nets.reduce((s, x) => s + x, 0))
  if (netSum <= 0) return nets.map(() => 0)
  const shares = nets.map(n => r2(header * n / netSum))
  const biggest = nets.reduce((b, n, k) => (n > nets[b]! ? k : b), 0)
  shares[biggest] = r2(shares[biggest]! + (header - r2(shares.reduce((s, x) => s + x, 0))))
  const out = nets.map((n, k) => r2(n - shares[k]!))
  const diff = r2(out.reduce((s, x) => s + x, 0) - r2(Number(sale.total)))
  if (diff !== 0) out[biggest] = r2(out[biggest]! - diff)
  return out
}

export function buildLines(sale: BuildSaleInput): DteLine[] {
  const total = r2(Number(sale.total))
  const k = ivaOnTopFactor(sale)
  const header = r2(Number(sale.discount ?? 0) * k)
  const raw = sale.items.map(i => {
    const qty = Number(i.quantity)
    const unitPrice = r2(Number(i.unitPrice) * k)
    const net = r2((Number(i.total) - Number(i.promoDiscount ?? 0)) * k)
    return { i, qty, unitPrice, net }
  })
  const netSum = r2(raw.reduce((s, l) => s + l.net, 0))
  if (raw.length === 0) throw new DteBuildError('La venta no tiene productos')
  if (netSum <= 0) throw new DteBuildError('El total de la venta es cero')

  // Share the header discount in proportion to each line, last cents to the biggest line.
  const shares = raw.map(l => r2(header * l.net / netSum))
  const biggest = raw.reduce((b, l, k) => (l.net > raw[b]!.net ? k : b), 0)
  shares[biggest] = r2(shares[biggest]! + (header - r2(shares.reduce((s, x) => s + x, 0))))

  const lines: DteLine[] = raw.map((l, k) => {
    const finalNet = r2(l.net - shares[k]!)
    let qty = l.qty
    let unitPrice = l.unitPrice
    let description = lineDescription(l.i)
    // SAT wants whole quantities; a fractional one is billed as a single line.
    if (!Number.isInteger(qty)) {
      description = `${description} (${qty} u. × Q${unitPrice.toFixed(2)})`
      unitPrice = r2(l.qty * l.unitPrice)
      qty = 1
    }
    let discount = r2(qty * unitPrice - finalNet)
    if (discount < 0) {
      // Charged more than the list price (price override): bill the actual price.
      unitPrice = r2(finalNet / qty)
      discount = r2(qty * unitPrice - finalNet)
      if (discount < 0) { unitPrice = r2(unitPrice + 0.01); discount = r2(qty * unitPrice - finalNet) }
    }
    return { description: description.slice(0, 500), qty, unitPrice, discount, type: 'B', withoutIva: false }
  })

  // Final cent check against what was actually charged.
  const sum = r2(lines.reduce((s, l) => s + l.qty * l.unitPrice - l.discount, 0))
  const diff = r2(sum - total)
  if (diff !== 0) {
    const l = lines[biggest]!
    l.discount = r2(l.discount + diff)
    if (l.discount < 0 || l.discount > l.qty * l.unitPrice) throw new DteBuildError(`No cuadra el total de la factura (${sum} vs ${total})`)
  }
  return lines
}

export function buildDteForSale(sale: BuildSaleInput, cfg: FelConfig, opts: BuildOptions = {}): DteDocument {
  const type = opts.type ?? cfg.docType
  const lines = buildLines(sale)
  const total = r2(lines.reduce((s, l) => s + l.qty * l.unitPrice - l.discount, 0))
  const totalTax = isSmallTaxpayerType(type) ? 0 : r2(total * cfg.ivaRate / (1 + cfg.ivaRate))
  const internal = sale.invoiceSeries && sale.invoiceSeqNumber != null ? `${sale.invoiceSeries}-${sale.invoiceSeqNumber}` : sale.invoiceNumber
  return {
    type,
    currency: 'GTQ',
    issuedAt: gtLocalIso(opts.issuedAt ?? sale.createdAt),
    externalId: internal,
    lines,
    total,
    totalTax,
    receiver: buildReceiver(sale, cfg, opts.receiverOverride),
    customFields: [
      { name: 'Venta', value: sale.invoiceNumber },
      { name: 'Sucursal', value: sale.branch.name },
    ],
    ...(opts.parentUuid ? { parentUuid: opts.parentUuid } : {}),
    ...(opts.memo ? { memo: opts.memo } : {}),
  }
}
