// Full-page (letter) print for a Cotización — unlike the thermal receipts
// elsewhere in components/print, this is meant to look like a real business
// document: a wide letterhead banner across the top (if the branch uploaded
// one in Configuración → Tiendas), the logo + company info below it, then
// the quotation itself. Same "true sibling of the page, print:hidden on
// everything else" pattern as ThermalReceipt/ThermalTransferSlip so printing
// shows only this, not a second blank page.
export interface QuotationPrintItem {
  productName: string
  quantity: number
  unitPrice: number
  discount?: number
  total: number
}

export interface QuotationPrintData {
  quotationNumber: string
  createdAt: string
  validUntil: string
  customerName: string
  customerNit?: string
  customerPhone?: string
  customerEmail?: string
  items: QuotationPrintItem[]
  subtotal: number
  discount: number
  tax: number
  total: number
  notes?: string
  letterhead?: string
  logo?: string
  companyName?: string
  companyTaxId?: string
  companyTagline?: string
  companyWebsite?: string
  branchAddress?: string
  branchPhone?: string
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es-GT', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return iso
  }
}

export function QuotationPrint({ data }: { data: QuotationPrintData }) {
  return (
    <div id="quotation-print-content" className="hidden print:block" style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'Arial, Helvetica, sans-serif', color: '#1f2937', fontSize: '13px' }}>
      <style>{'@page { size: letter; margin: 14mm; } @media print { body { margin: 0; } }'}</style>

      {data.letterhead && (
        <img src={data.letterhead} alt="" style={{ width: '100%', maxHeight: '140px', objectFit: 'contain', marginBottom: '14px' }} />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #1f2937', paddingBottom: '10px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {data.logo && <img src={data.logo} alt="" style={{ height: '56px', width: '56px', objectFit: 'contain' }} />}
          <div>
            <div style={{ fontSize: '17px', fontWeight: 'bold' }}>{data.companyName || 'DENGO POS'}</div>
            {data.companyTagline && <div style={{ fontSize: '11px', color: '#6b7280' }}>{data.companyTagline}</div>}
            {data.companyTaxId && <div style={{ fontSize: '11px', color: '#6b7280' }}>NIT: {data.companyTaxId}</div>}
            {data.branchAddress && <div style={{ fontSize: '11px', color: '#6b7280' }}>{data.branchAddress}</div>}
            {(data.branchPhone || data.companyWebsite) && (
              <div style={{ fontSize: '11px', color: '#6b7280' }}>
                {data.branchPhone}{data.branchPhone && data.companyWebsite ? ' · ' : ''}{data.companyWebsite}
              </div>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '20px', fontWeight: 'bold', letterSpacing: '1px' }}>COTIZACIÓN</div>
          <div style={{ fontSize: '13px', color: '#374151' }}>No. {data.quotationNumber}</div>
          <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>Fecha: {formatDate(data.createdAt)}</div>
          <div style={{ fontSize: '11px', color: '#6b7280' }}>Válida hasta: {formatDate(data.validUntil)}</div>
        </div>
      </div>

      <div style={{ marginBottom: '16px', fontSize: '12px' }}>
        <div style={{ fontWeight: 'bold', color: '#374151', marginBottom: '3px' }}>Cliente</div>
        <div>{data.customerName}</div>
        {data.customerNit && <div>NIT: {data.customerNit}</div>}
        {(data.customerPhone || data.customerEmail) && (
          <div>{data.customerPhone}{data.customerPhone && data.customerEmail ? ' · ' : ''}{data.customerEmail}</div>
        )}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <thead>
          <tr style={{ borderTop: '1px solid #9ca3af', borderBottom: '1px solid #9ca3af', background: '#f3f4f6' }}>
            <th style={{ textAlign: 'left', padding: '6px' }}>Descripción</th>
            <th style={{ textAlign: 'right', padding: '6px', width: '60px' }}>Cant.</th>
            <th style={{ textAlign: 'right', padding: '6px', width: '90px' }}>Precio unit.</th>
            <th style={{ textAlign: 'right', padding: '6px', width: '90px' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #e5e7eb' }}>
              <td style={{ padding: '6px' }}>{item.productName}</td>
              <td style={{ padding: '6px', textAlign: 'right' }}>{item.quantity}</td>
              <td style={{ padding: '6px', textAlign: 'right' }}>Q{item.unitPrice.toFixed(2)}</td>
              <td style={{ padding: '6px', textAlign: 'right', fontWeight: 'bold' }}>Q{item.total.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
        <div style={{ width: '220px', fontSize: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}><span>Subtotal:</span><span>Q{data.subtotal.toFixed(2)}</span></div>
          {data.discount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: '#dc2626' }}><span>Descuento:</span><span>-Q{data.discount.toFixed(2)}</span></div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}><span>IVA (12%):</span><span>Q{data.tax.toFixed(2)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderTop: '2px solid #1f2937', fontWeight: 'bold', fontSize: '14px' }}><span>Total:</span><span>Q{data.total.toFixed(2)}</span></div>
        </div>
      </div>

      {data.notes && (
        <div style={{ marginTop: '14px', fontSize: '11px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '4px', padding: '8px' }}>
          <strong>Notas: </strong>{data.notes}
        </div>
      )}

      <div style={{ marginTop: '24px', fontSize: '10px', color: '#9ca3af', textAlign: 'center' }}>
        Esta cotización es válida hasta la fecha indicada arriba — precios sujetos a cambio después de esa fecha.
      </div>
    </div>
  )
}
