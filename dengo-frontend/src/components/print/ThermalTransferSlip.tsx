// Printer-only checklist for a stock transfer — handed to whoever receives
// the shipment at the destination branch so they can physically tick off
// each item as it's unloaded ("qué llegó y qué no"), same thermal-width
// pattern as ThermalReceipt.tsx / ThermalCashCloseReport.tsx.

export interface ThermalTransferData {
  code: string
  fromBranchName: string
  toBranchName: string
  createdAt: string
  requestedByName?: string
  notes?: string
  logo?: string
  companyName?: string
  items: { productName: string; productCode?: string; quantity: number }[]
}

export function ThermalTransferSlip({ data, widthMm }: { data: ThermalTransferData; widthMm: number }) {
  return (
    <div id="thermal-receipt-content" className="hidden print:block" style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: '15px', lineHeight: 1.45, color: '#000' }}>
      <style>{`@page { size: ${widthMm}mm auto; margin: 0; } @media print { body { margin: 0; } }`}</style>

      <div style={{ textAlign: 'center', marginBottom: '4px' }}>
        {data.logo && <img src={data.logo} alt="" style={{ maxHeight: '44px', maxWidth: '80%', margin: '0 auto 2px', objectFit: 'contain' }} />}
        <div style={{ fontWeight: 'bold', fontSize: '18px' }}>{data.companyName || 'DENGO POS'}</div>
      </div>

      <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '3px 0', margin: '3px 0', textAlign: 'center', fontWeight: 'bold' }}>
        TRASLADO DE MERCANCIA
      </div>

      <div>Codigo: {data.code}</div>
      <div>Fecha: {new Date(data.createdAt).toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short' })}</div>
      {data.requestedByName && <div>Enviado por: {data.requestedByName}</div>}
      <div style={{ marginTop: '3px' }}>De: {data.fromBranchName}</div>
      <div style={{ fontWeight: 'bold' }}>A: {data.toBranchName}</div>

      {data.notes && (
        <div style={{ marginTop: '3px', fontSize: '13px' }}>Notas: {data.notes}</div>
      )}

      <div style={{ borderTop: '1px dashed #000', margin: '5px 0 3px', paddingTop: '3px', fontWeight: 'bold', textAlign: 'center' }}>
        MARCAR AL RECIBIR
      </div>

      {data.items.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', padding: '3px 0', borderBottom: '1px dotted #999' }}>
          <span style={{ border: '1px solid #000', width: '16px', height: '16px', flexShrink: 0, marginTop: '2px' }} />
          <div style={{ flex: 1 }}>
            <div>{item.productName}</div>
            {item.productCode && <div style={{ fontSize: '12px', color: '#444' }}>{item.productCode}</div>}
          </div>
          <div style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>x{item.quantity}</div>
        </div>
      ))}

      <div style={{ marginTop: '10px', fontSize: '13px' }}>
        <div>Recibido por: ________________________</div>
        <div style={{ marginTop: '8px' }}>Fecha / hora: ______________________</div>
        <div style={{ marginTop: '8px' }}>Observaciones:</div>
        <div style={{ marginTop: '14px', borderTop: '1px solid #000' }} />
        <div style={{ marginTop: '10px', borderTop: '1px solid #000' }} />
      </div>

      <div style={{ textAlign: 'center', marginTop: '6px' }}>— Fin —</div>
    </div>
  )
}
