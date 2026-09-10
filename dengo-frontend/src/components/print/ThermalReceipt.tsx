// Printer-only rendering of a sale, sized for a thermal roll instead of the
// on-screen confirmation modal. Kept as its own component (not reused from
// the modal markup) because a thermal layout — single narrow column, tiny
// font, no side-by-side grids — is different enough from the screen preview
// that trying to share one layout for both ends up compromising both.
//
// Visually hidden on screen (`hidden print:block`), shown only when printing;
// the modal it sits next to gets `print:hidden` so exactly one of the two
// renders on paper. `widthMm` still drives the `@page` size hint (some
// drivers honor it, some don't), but the content itself renders at 100%
// width rather than a fixed `${widthMm}mm` — GDI thermal drivers routinely
// don't translate an exact mm figure 1:1 onto the physical page (observed:
// a declared 58mm rendering at ~60-70% of a measured ~55mm roll), so a
// relative width that just fills whatever page the driver actually hands
// back is the only way to reliably use the full roll.
//
// Section order follows the standard Guatemalan receipt layout the client
// asked to match: membrete (logo + company) → datos de la tienda → datos del
// documento (recibo/factura, número, fecha, caja) → datos del cliente →
// detalle → totales → agradecimiento → slogan → redes sociales.
//
// One shared social-media name prints once, under the Facebook/Instagram/
// TikTok icons grouped together — the client uses the same handle on all
// three, so there's no per-network field to fill in separately.

import { Facebook, Instagram } from 'lucide-react'
import { SiTiktok } from 'react-icons/si'

export interface ThermalReceiptItem {
  id: string
  productName: string
  variationName?: string
  quantity: number
  unitPrice: number
  discount: number // percent, 0-100
  total: number
}

export interface ThermalReceiptData {
  invoiceNumber: string
  branchName: string
  branchAddress?: string | null
  branchPhone?: string | null
  logo?: string
  companyName?: string
  companyTaxId?: string | null
  companyTagline?: string | null
  socialMediaName?: string | null
  registerLabel?: string
  createdAt: string
  items: ThermalReceiptItem[]
  subtotal: number
  total: number
  paymentMethodLabel: string
  cashReceived?: number
  change?: number
  cardReference?: string | null
  transferReference?: string | null
  customerName?: string
  customerNit?: string
  requiresInvoice?: boolean
  invoiceSeries?: string | null
  invoiceSeqNumber?: number | null
  buyerNit?: string | null
  buyerName?: string | null
  felStatus?: string | null
  pendingSync?: boolean
  // Full clientRequestId (see POS.tsx) — printed so a receipt handed out
  // before syncing can still be traced to its real correlativo later:
  // search sales by this exact string once back online.
  offlineRef?: string
}

export default function ThermalReceipt({ data, widthMm }: { data: ThermalReceiptData; widthMm: number }) {
  const originalSubtotal = data.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
  const discountTotal = originalSubtotal - data.subtotal
  const isCertified = data.felStatus === 'CERTIFIED'
  const row = { display: 'flex' as const, justifyContent: 'space-between' as const }

  return (
    <div id="thermal-receipt-content" className="hidden print:block" style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: '15px', lineHeight: 1.45, color: '#000' }}>
      <style>{`@page { size: ${widthMm}mm auto; margin: 0; } @media print { body { margin: 0; } }`}</style>

      {/* ── Membrete: logo + nombre de la empresa ── */}
      <div style={{ textAlign: 'center', marginBottom: '4px' }}>
        {data.logo && <img src={data.logo} alt="" style={{ maxHeight: '44px', maxWidth: '80%', margin: '0 auto 2px', objectFit: 'contain' }} />}
        <div style={{ fontWeight: 'bold', fontSize: '18px' }}>{data.companyName || 'DENGO POS'}</div>
      </div>

      {/* ── Datos de la tienda ── */}
      <div style={{ textAlign: 'center', marginBottom: '4px' }}>
        <div>{data.branchName}</div>
        {data.branchAddress && <div>{data.branchAddress}</div>}
        {data.branchPhone && <div>Tel. {data.branchPhone}</div>}
      </div>

      {/* ── Datos del documento: recibo/factura, número, fecha, caja ── */}
      <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '3px 0', margin: '3px 0' }}>
        {data.requiresInvoice ? (
          <>
            <div style={{ textAlign: 'center', fontWeight: 'bold' }}>FACTURA {isCertified ? 'ELECTRÓNICA' : '(no certificada)'}</div>
            <div>Serie: {data.invoiceSeries} No. {data.invoiceSeqNumber}</div>
            {data.companyTaxId && <div>Emisor NIT: {data.companyTaxId}</div>}
            {!isCertified && <div style={{ fontSize: '12px' }}>* Pendiente de certificación FEL</div>}
          </>
        ) : (
          <>
            <div style={{ textAlign: 'center', fontWeight: 'bold' }}>RECIBO</div>
            <div>No. {data.invoiceNumber}</div>
          </>
        )}
        <div>{new Date(data.createdAt).toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short' })}</div>
        {data.registerLabel && <div>{data.registerLabel}</div>}
        {data.pendingSync && (
          <div style={{ fontSize: '12px', textAlign: 'center' }}>
            * Pendiente de sincronizar — este número es temporal
            {data.offlineRef && <div style={{ wordBreak: 'break-all' }}>Ref: {data.offlineRef}</div>}
          </div>
        )}
      </div>

      {/* ── Datos del cliente ── */}
      {(data.requiresInvoice ? data.buyerName : data.customerName) && (
        <div style={{ marginBottom: '3px' }}>
          <div>Cliente: {data.requiresInvoice ? data.buyerName : data.customerName}</div>
          {data.requiresInvoice ? (
            data.buyerNit && <div>NIT: {data.buyerNit}</div>
          ) : (
            data.customerNit && <div>NIT: {data.customerNit}</div>
          )}
        </div>
      )}

      {/* ── Detalle ── */}
      <div style={{ borderTop: '1px dashed #000', paddingTop: '3px' }}>
        {data.items.map(item => {
          const original = item.unitPrice * item.quantity
          return (
            <div key={item.id} style={{ marginBottom: '4px' }}>
              <div style={{ wordBreak: 'break-word' }}>
                {item.productName}{item.variationName && item.variationName !== 'Pieza' ? ` (${item.variationName})` : ''}
              </div>
              <div style={row}>
                <span>{item.quantity} x Q{item.unitPrice.toFixed(2)}{item.discount > 0 ? ` -${item.discount}%` : ''}</span>
                <span>Q{item.total.toFixed(2)}</span>
              </div>
              {item.discount > 0 && (
                <div style={{ textAlign: 'right', fontSize: '12px', textDecoration: 'line-through' }}>Q{original.toFixed(2)}</div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Totales ── */}
      <div style={{ borderTop: '1px dashed #000', marginTop: '3px', paddingTop: '3px' }}>
        {discountTotal > 0.005 && (
          <>
            <div style={row}><span>Subtotal original</span><span>Q{originalSubtotal.toFixed(2)}</span></div>
            <div style={row}><span>Descuento</span><span>-Q{discountTotal.toFixed(2)}</span></div>
          </>
        )}
        <div style={{ ...row, fontWeight: 'bold', fontSize: '18px' }}>
          <span>TOTAL</span><span>Q{data.total.toFixed(2)}</span>
        </div>
        <div style={row}><span>Método</span><span>{data.paymentMethodLabel}</span></div>
        {data.cardReference && <div style={row}><span>Ref. tarjeta</span><span>{data.cardReference}</span></div>}
        {data.transferReference && <div style={row}><span>Ref. transferencia</span><span>{data.transferReference}</span></div>}
        {data.cashReceived != null && (
          <>
            <div style={row}><span>Efectivo</span><span>Q{data.cashReceived.toFixed(2)}</span></div>
            {data.change != null && <div style={row}><span>Cambio</span><span>Q{data.change.toFixed(2)}</span></div>}
          </>
        )}
      </div>

      {/* ── Agradecimiento, slogan y redes sociales ── */}
      <div style={{ textAlign: 'center', marginTop: '8px' }}>¡Gracias por su compra!</div>
      {data.companyTagline && (
        <div style={{ textAlign: 'center', fontStyle: 'italic', fontSize: '13px', marginTop: '2px' }}>{data.companyTagline}</div>
      )}
      {data.socialMediaName && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', fontSize: '13px', marginTop: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Facebook size={14} />
            <Instagram size={14} />
            <SiTiktok size={13} />
          </div>
          <span>{data.socialMediaName}</span>
        </div>
      )}
    </div>
  )
}
