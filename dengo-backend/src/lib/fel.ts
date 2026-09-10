// Guatemala FEL (Factura Electrónica en Línea) integration point.
//
// No certifier is connected yet (no Infile/Digifact/Megaprint/etc. account).
// This module exists so the rest of the app (sale creation, receipts,
// reports) can already treat "factura" as a first-class concept — series,
// sequential numbering, buyer NIT/name — without waiting on that contract.
// When a certifier is chosen, `certifyInvoice` below is the only function
// that needs a real implementation; nothing else in the codebase should need
// to change.

export type FelStatus = 'NONE' | 'PENDING' | 'CERTIFIED' | 'FAILED'

export interface FelCertificationInput {
  saleId: string
  series: string
  seqNumber: number
  buyerNit: string
  buyerName: string
  total: number
  items: { description: string; quantity: number; unitPrice: number; total: number }[]
}

export interface FelCertificationResult {
  status: FelStatus
  uuid?: string
  authNumber?: string
  certifiedAt?: Date
  error?: string
}

/**
 * Sends a sale to the FEL certifier and returns its response. Until a real
 * certifier is wired in (see the TODO below), this always returns PENDING —
 * the invoice has a valid internal series+number and can be printed/handed
 * to the customer, it just isn't yet a SAT-certified DTE. Sales never fail
 * or block on this: certification is attempted best-effort, asynchronously
 * from the cashier's point of view.
 */
export async function certifyInvoice(input: FelCertificationInput): Promise<FelCertificationResult> {
  // TODO: integrate a real certifier (Infile / Digifact / Megaprint / etc.)
  // once the client has an account. Typical shape: POST the DTE XML/JSON to
  // the certifier's API, get back { uuid, authNumber, certifiedAt } on
  // success or a rejection reason on failure — map that directly to the
  // fields below, no other part of the app needs to change.
  void input
  return { status: 'PENDING' }
}
