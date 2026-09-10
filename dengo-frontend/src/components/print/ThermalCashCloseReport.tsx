// Printer-only rendering of a cash-register close, sized for a thermal roll
// — same reasoning as ThermalReceipt.tsx (POS sale receipt): a narrow single
// column instead of the on-screen report layout. Two separate print jobs
// share this file:
//   - "summary": the full close report (opening/close times, cashier, sales
//     by payment method, cash count and difference) — what a manager keeps.
//   - "reconciliation": the optional Total Programa / Total Excel / Diferencia
//     slip, only meaningful when Branch.salesReconciliationEnabled and an
//     external total has been entered — see CashRegister.tsx.
// CashRegister.tsx renders whichever variant is being printed into the same
// `#thermal-receipt-content` print target POS.tsx's receipt also uses (only
// one page is ever mounted at a time, so there's no id collision).

export interface ThermalCashCloseData {
  registerLabel: string // e.g. "Caja 1 #1"
  branchName: string
  logo?: string
  companyName?: string
  cashierName?: string
  closedByName?: string
  openedAt: string
  closedAt: string
  salesCount: number
  cash: number
  card: number
  transfer: number
  credit: number
  creditPaymentsCash: number
  total: number
  initialAmount: number
  expectedAmount: number
  finalAmount: number
  difference: number
  // Set when this close was queued offline — expectedAmount/difference are
  // placeholders (0) until the real close syncs, so print a note instead of
  // a misleading "Q0.00 / cuadrada perfecta".
  pendingSync?: boolean
  // Excel/external reconciliation — shown as its own line entered by the
  // employee, alongside Efectivo Entregado, but NOT folded into the
  // Diferencia Entre Programa y Entrega below (that stays cash-only: see
  // calcBalance/expectedAmount in CashRegister.tsx).
  salesReconciliationEnabled?: boolean
  externalSalesTotal?: number
}

export interface ThermalReconciliationData {
  registerLabel: string
  branchName: string
  logo?: string
  companyName?: string
  closedAt: string
  programTotal: number
  externalTotal: number
  difference: number
}

function Header({ logo, companyName, branchName, registerLabel }: { logo?: string; companyName?: string; branchName: string; registerLabel: string }) {
  return (
    <div style={{ textAlign: 'center', marginBottom: '4px' }}>
      {logo && <img src={logo} alt="" style={{ maxHeight: '44px', maxWidth: '80%', margin: '0 auto 2px', objectFit: 'contain' }} />}
      <div style={{ fontWeight: 'bold', fontSize: '18px' }}>{companyName || 'DENGO POS'}</div>
      <div>{branchName}</div>
      <div>{registerLabel}</div>
    </div>
  )
}

export function ThermalCashCloseReport({ data, widthMm }: { data: ThermalCashCloseData; widthMm: number }) {
  const row = (label: string, value: string, bold = false) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: bold ? 'bold' : 'normal' }}>
      <span>{label}</span><span>{value}</span>
    </div>
  )

  return (
    <div id="thermal-receipt-content" className="hidden print:block" style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: '15px', lineHeight: 1.45, color: '#000' }}>
      <style>{`@page { size: ${widthMm}mm auto; margin: 0; } @media print { body { margin: 0; } }`}</style>

      <Header logo={data.logo} companyName={data.companyName} branchName={data.branchName} registerLabel={data.registerLabel} />

      <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '3px 0', margin: '3px 0' }}>
        <div style={{ textAlign: 'center', fontWeight: 'bold' }}>CIERRE DE CAJA</div>
        <div>Fecha: {new Date(data.closedAt).toLocaleDateString('es-GT', { dateStyle: 'long' })}</div>
        <div>Horario: {new Date(data.openedAt).toLocaleTimeString('es-GT', { timeStyle: 'short' })} – {new Date(data.closedAt).toLocaleTimeString('es-GT', { timeStyle: 'short' })}</div>
        {data.cashierName && <div>Empleado: {data.cashierName}</div>}
        {data.closedByName && data.closedByName !== data.cashierName && <div>Cerrado por: {data.closedByName}</div>}
      </div>

      <div style={{ marginBottom: '3px' }}>
        <div style={{ fontWeight: 'bold' }}>VENTAS DEL DIA ({data.salesCount})</div>
        {row('Pagos en Efectivo', `Q${data.cash.toFixed(2)}`)}
        {row('Pagos con Transferencia', `Q${data.transfer.toFixed(2)}`)}
        {row('Pagos con Tarjeta', `Q${data.card.toFixed(2)}`)}
        {data.credit > 0 && row('Creditos (no cobrado)', `Q${data.credit.toFixed(2)}`)}
        {row('Total de Ventas del Dia', `Q${data.total.toFixed(2)}`, true)}
        {data.creditPaymentsCash > 0 && (
          <div style={{ fontSize: '12px' }}>* incl. abonos en efectivo Q{data.creditPaymentsCash.toFixed(2)}</div>
        )}
      </div>

      <div style={{ border: '1px solid #000', padding: '3px 4px', margin: '3px 0' }}>
        {data.salesReconciliationEnabled && data.externalSalesTotal != null &&
          row('Total Excel', `Q${data.externalSalesTotal.toFixed(2)}`)}
        {row('Efectivo Entregado', `Q${data.finalAmount.toFixed(2)}`)}
      </div>

      <div>
        {row(
          data.pendingSync ? 'Diferencia Entre Programa y Entrega (est.)' : 'Diferencia Entre Programa y Entrega',
          `${data.difference > 0 ? '+' : ''}Q${data.difference.toFixed(2)}`,
          true
        )}
        {data.pendingSync && (
          <div style={{ fontSize: '12px', marginTop: '2px' }}>* Cierre sin conexión — estimado con lo que el dispositivo sabía en ese momento, se confirma al sincronizar</div>
        )}
      </div>

      <div style={{ textAlign: 'center', marginTop: '6px' }}>— Fin del reporte —</div>
    </div>
  )
}

export function ThermalReconciliationSlip({ data, widthMm }: { data: ThermalReconciliationData; widthMm: number }) {
  const row = (label: string, value: string, bold = false) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: bold ? 'bold' : 'normal' }}>
      <span>{label}</span><span>{value}</span>
    </div>
  )

  return (
    <div id="thermal-receipt-content" className="hidden print:block" style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: '15px', lineHeight: 1.45, color: '#000' }}>
      <style>{`@page { size: ${widthMm}mm auto; margin: 0; } @media print { body { margin: 0; } }`}</style>

      <Header logo={data.logo} companyName={data.companyName} branchName={data.branchName} registerLabel={data.registerLabel} />

      <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '3px 0', margin: '3px 0', textAlign: 'center', fontWeight: 'bold' }}>
        CONCILIACION DE VENTAS
      </div>
      <div>{new Date(data.closedAt).toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short' })}</div>

      <div style={{ marginTop: '4px' }}>
        {row('Total Programa', `Q${data.programTotal.toFixed(2)}`)}
        {row('Total Excel', `Q${data.externalTotal.toFixed(2)}`)}
        <div style={{ borderTop: '1px dashed #000', marginTop: '2px', paddingTop: '2px' }} />
        {row('Diferencia', `${data.difference > 0 ? '+' : ''}Q${data.difference.toFixed(2)}`, true)}
      </div>

      {Math.abs(data.difference) > 0.005 && (
        <div style={{ fontSize: '12px', marginTop: '3px' }}>
          {data.difference > 0
            ? '* El programa registra más que el Excel.'
            : '* El Excel registra más que el programa.'}
        </div>
      )}
    </div>
  )
}
