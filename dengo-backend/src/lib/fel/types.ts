// Provider-neutral shapes for Guatemala FEL (Factura Electrónica en Línea).
// Everything outside lib/fel talks in these types; only the provider files
// know a certifier's wire format.

export type FelStatus = 'NONE' | 'PENDING' | 'CERTIFIED' | 'FAILED'
export type FelEnvironment = 'mock' | 'stage' | 'production'

/** SAT document types (FELplex "type"). */
export type DteType = 'FACT' | 'FCAM' | 'FPEQ' | 'FCAP' | 'FESP' | 'NABN' | 'RDON' | 'RECI' | 'NDEB' | 'NCRE' | 'FAPE' | 'FCPE'

export interface DteLine {
  description: string
  /** SAT expects whole units here; fractional quantities are folded into one line (see build.ts). */
  qty: number
  /** Unit price with IVA included, as charged. */
  unitPrice: number
  /** Discount amount for the whole line (not per unit, not a percentage). */
  discount: number
  type: 'B' | 'S' // bien | servicio
  withoutIva: boolean
}

export interface DteAddress {
  street: string | null
  city: string | null
  state: string | null
  zip: string | null
  country: string | null
}

export interface DteReceiver {
  kind: 'NIT' | 'CUI' | 'CF'
  /** Digits (and a final K) for NIT, 13 digits for CUI, "CF" for consumidor final. */
  taxId: string
  name: string
  address: DteAddress
  email: string | null
}

export interface DteDocument {
  type: DteType
  currency: 'GTQ' | 'USD'
  /** Guatemala local time, YYYY-MM-DDTHH:mm:ss. SAT rejects issue dates more than 5 days before certification. */
  issuedAt: string
  /** Our own reference, shown on FELplex reports. */
  externalId: string
  lines: DteLine[]
  total: number
  totalTax: number
  receiver: DteReceiver
  customFields: { name: string; value: string }[]
  /** Credit/debit notes: the FELplex id of the invoice they correct. */
  parentUuid?: string
  memo?: string
}

export interface FelContext {
  /** FELplex "empresa" id — one per SAT establishment. */
  entityId: string
}

export interface CertifyResult {
  ok: boolean
  /** Certifier's own id for the document (needed to annul or re-fetch it). */
  uuid?: string | undefined
  serie?: string | undefined
  number?: string | undefined
  /** SAT número de autorización. */
  authorization?: string | undefined
  certifiedAt?: Date | undefined
  certifierName?: string | undefined
  certifierNit?: string | undefined
  pdfUrl?: string | undefined
  xmlUrl?: string | undefined
  errors: string[]
  /**
   * True only when the request never reached the certifier (DNS, refused
   * connection, 5xx before processing). A timeout is NOT retryable: the DTE
   * may have been certified anyway, and retrying would issue a duplicate.
   */
  retryable: boolean
}

export interface VoidResult {
  ok: boolean
  errors: string[]
}

export interface TaxIdLookup {
  found: boolean
  taxId: string
  name?: string | undefined
  address?: Partial<DteAddress> | undefined
  email?: string | undefined
}

export interface FelProvider {
  readonly name: 'mock' | 'felplex'
  readonly environment: FelEnvironment
  certify(doc: DteDocument, ctx: FelContext): Promise<CertifyResult>
  void(uuid: string, reason: string, ctx: FelContext): Promise<VoidResult>
  get(uuid: string, ctx: FelContext): Promise<CertifyResult>
  lookupTaxId(kind: 'NIT' | 'CUI', id: string, ctx: FelContext): Promise<TaxIdLookup>
  /** DTEs left in the plan, or null when the provider doesn't say. */
  credits(ctx: FelContext): Promise<number | null>
}
