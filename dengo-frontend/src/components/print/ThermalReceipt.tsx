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

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
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
  /** Website coupon applied to the sale. */
  coupon?: { label: string; code: string; amount: number }
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
  /** SAT data of the certified DTE (lib/fel on the backend). */
  felSatSerie?: string | null
  felSatNumber?: string | null
  felAuthNumber?: string | null
  felCertifiedAt?: string | null
  felCertifierName?: string | null
  felCertifierNit?: string | null
  felEnvironment?: string | null
  felDocType?: string | null
  /**
   * FEL contingency (SAT "Reglas y validaciones" 4.1): the certifier couldn't
   * be reached, so this is a "Documento en contingencia" carrying its Número
   * de Acceso; the customer gets the certified DTE from the SAT's site.
   */
  felAccessNumber?: string | null
  felIssuedAt?: string | null
  /** Printed text of the emisor's frases (e.g. "Sujeto a pagos trimestrales ISR"). */
  felPhrases?: string[]
  /** Emisor's legal name and NIT as registered at the SAT. */
  felEmisorName?: string | null
  felEmisorNit?: string | null
  pendingSync?: boolean
  // Full clientRequestId (see POS.tsx) — printed so a receipt handed out
  // before syncing can still be traced to its real correlativo later:
  // search sales by this exact string once back online.
  offlineRef?: string
}

const DTE_NAMES: Record<string, string> = {
  FACT: 'FACTURA', FCAM: 'FACTURA CAMBIARIA', FPEQ: 'FACTURA PEQUEÑO CONTRIBUYENTE',
  FAPE: 'FACTURA PEQUEÑO CONTRIBUYENTE RÉGIMEN ELECTRÓNICO', FCAP: 'FACTURA CAMBIARIA PEQUEÑO CONTRIBUYENTE',
}

const VERIFIER = 'https://portal.sat.gob.gt/portal/verificador-integrado/'

/** SAT verification QR (Reglas y validaciones 2.22) for the document, as a data URL. */
function useSatQr(url: string | null): string | null {
  const [img, setImg] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    if (!url) { setImg(null); return }
    QRCode.toDataURL(url, { margin: 0, width: 240, errorCorrectionLevel: 'M' }).then(d => { if (alive) setImg(d) }).catch(() => setImg(null))
    return () => { alive = false }
  }, [url])
  return img
}

export default function ThermalReceipt({ data, widthMm }: { data: ThermalReceiptData; widthMm: number }) {
  const originalSubtotal = data.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
  const discountTotal = originalSubtotal - data.subtotal
  const isCertified = data.felStatus === 'CERTIFIED'
  const isTestDte = isCertified && data.felEnvironment !== 'production'
  // Not certified yet but handed over with an access number: SAT contingency document.
  const isContingency = !!data.requiresInvoice && !isCertified && !!data.felAccessNumber
  const emisorNit = data.felEmisorNit || data.companyTaxId || ''
  const receptorId = (data.buyerNit || 'CF').replace(/[\s-]/g, '').toUpperCase()
  const qrUrl = !data.requiresInvoice || !emisorNit ? null
    : isCertified && data.felSatSerie && data.felSatNumber
      ? `${VERIFIER}?tipo=autorizacion&documento=FEL&emisor=${encodeURIComponent(emisorNit)}&serie=${encodeURIComponent(data.felSatSerie)}&numero=${encodeURIComponent(data.felSatNumber)}`
      : isContingency
        ? `${VERIFIER}?tipo=contingencia&numero=${data.felAccessNumber}&emisor=${encodeURIComponent(emisorNit)}&receptor=${encodeURIComponent(receptorId)}&monto=${data.total.toFixed(2)}`
        : null
  const qr = useSatQr(qrUrl)
  const row = { display: 'flex' as const, justifyContent: 'space-between' as const }

  return (
    <div id="thermal-receipt-content" className="hidden print:block" style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: '15px', lineHeight: 1.45, color: '#000' }}>
      <style>{`@page { size: ${widthMm}mm auto; margin: 0; } @media print { body { margin: 0; } }`}</style>

      {/* ── Membrete: logo + nombre de la empresa ── */}
      <div style={{ textAlign: 'center', marginBottom: '4px' }}>
        {data.logo && <img src={data.logo} alt="" style={{ maxHeight: '44px', maxWidth: '80%', margin: '0 auto 2px', objectFit: 'contain' }} />}
        <div style={{ fontWeight: 'bold', fontSize: '18px' }}>{data.companyName || data.branchName}</div>
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
            {isCertified ? (
              <>
                <div style={{ textAlign: 'center', fontWeight: 'bold' }}>DOCUMENTO TRIBUTARIO ELECTRÓNICO</div>
                <div style={{ textAlign: 'center', fontWeight: 'bold' }}>{DTE_NAMES[data.felDocType ?? 'FACT'] ?? 'FACTURA'}</div>
                {isTestDte && <div style={{ textAlign: 'center', fontWeight: 'bold' }}>** PRUEBA — SIN VALIDEZ FISCAL **</div>}
                <div>Serie: {data.felSatSerie}</div>
                <div>Número: {data.felSatNumber}</div>
              </>
            ) : isContingency ? (
              <>
                {/* SAT 4.1: titled "Documento en contingencia", with the Número de Acceso and
                    without serie, número or autorización (those come with the certification). */}
                <div style={{ textAlign: 'center', fontWeight: 'bold' }}>DOCUMENTO EN CONTINGENCIA</div>
                <div style={{ textAlign: 'center', fontWeight: 'bold' }}>{DTE_NAMES[data.felDocType ?? 'FACT'] ?? 'FACTURA'}</div>
                <div style={{ textAlign: 'center' }}>Número de acceso:</div>
                <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '18px', letterSpacing: '1px' }}>{data.felAccessNumber}</div>
              </>
            ) : (
              <>
                <div style={{ textAlign: 'center', fontWeight: 'bold' }}>FACTURA (no certificada)</div>
                <div>Serie: {data.invoiceSeries} No. {data.invoiceSeqNumber}</div>
                <div style={{ fontSize: '12px' }}>* Pendiente de certificación FEL. Solicite su factura certificada.</div>
              </>
            )}
            {data.felEmisorName && <div>{data.felEmisorName}</div>}
            {emisorNit && <div>Emisor NIT: {emisorNit}</div>}
            {(isCertified || isContingency) && data.felPhrases?.map(p => <div key={p}>{p}</div>)}
            {isContingency && data.felIssuedAt && (
              <div>Fecha y hora emisión: {new Date(data.felIssuedAt).toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short' })}</div>
            )}
          </>
        ) : (
          <>
            <div style={{ textAlign: 'center', fontWeight: 'bold' }}>RECIBO</div>
            <div>No. {data.invoiceNumber}</div>
          </>
        )}
        {!isContingency && <div>{new Date(data.createdAt).toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short' })}</div>}
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
        {data.coupon && data.coupon.amount > 0 && (
          <>
            <div style={row}><span>Cupón {data.coupon.code}</span><span>-Q{data.coupon.amount.toFixed(2)}</span></div>
            <div style={{ fontSize: '11px' }}>{data.coupon.label}</div>
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

      {/* ── Certificación FEL (datos que exige la SAT en la representación impresa) ── */}
      {data.requiresInvoice && isCertified && (
        <div style={{ borderTop: '1px dashed #000', marginTop: '6px', paddingTop: '4px', fontSize: '12px', wordBreak: 'break-all' }}>
          <div>No. de autorización:</div>
          <div style={{ fontWeight: 'bold' }}>{data.felAuthNumber}</div>
          {data.felCertifiedAt && <div>Fecha de certificación: {new Date(data.felCertifiedAt).toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'medium' })}</div>}
          {data.felCertifierName && <div>Certificador: {data.felCertifierName}</div>}
          {data.felCertifierNit && <div>NIT certificador: {data.felCertifierNit}</div>}
          {data.felAccessNumber && <div>No. de acceso: {data.felAccessNumber}</div>}
          {qr && <img src={qr} alt="" style={{ width: '110px', height: '110px', margin: '6px auto 0', display: 'block' }} />}
        </div>
      )}

      {/* ── Contingencia: pie que exige la SAT ── */}
      {isContingency && (
        <div style={{ borderTop: '1px dashed #000', marginTop: '6px', paddingTop: '4px', fontSize: '12px', textAlign: 'center' }}>
          {qr && <img src={qr} alt="" style={{ width: '110px', height: '110px', margin: '0 auto 4px', display: 'block' }} />}
          <div style={{ fontWeight: 'bold' }}>Emisión en contingencia, obtenga su DTE certificado en el sitio www.sat.gob.gt/fel</div>
        </div>
      )}

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
