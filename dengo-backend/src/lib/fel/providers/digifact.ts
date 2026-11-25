// Digifact — Guatemala NUC API.
// Reference: https://documentacion.digifact.com/gt/api  (NUC JSON: /gt/nuc/json, examples: /gt/nuc/ejemplos)
//
//   Auth:     POST {base}/login/get_token  { Username: "GT.<NIT 12 digits>.<user>", Password }  → { Token } (30 days)
//             The token goes as-is in the Authorization header (no "Bearer").
//   Certify:  POST {base}/v2/transform/nuc_json?TAXID=<12>&FORMAT=XML&USERNAME=<user>   body: NUC JSON
//             → { code: 1, authNumber, batch (serie), serial (número), enrolledTimeStamp, responseData1 (XML b64) }
//   Annul:    POST {base}/CancelFelGT  { Taxid, Autorizacion, IdReceptor, FechaEmisionDocumentoAnular, MotivoAnulacion, Username }
//   Fetch:    GET  {base}/GetDocument?AUTHNUMBER&TAXID&FORMAT=XML|PDF&USERNAME → RESPONSE[0].ResponseData1/3 (b64)
//   NIT:      GET  {base}/Shared?COUNTRY=GT&TAXID&DATA1=SHARED_GETINFONITcom&DATA2=NIT|<nit>&USERNAME
//
// Verified against the test environment on 2026-11-24 (certify, fetch, annul, NIT lookup).
// Digifact keeps the identifying data of a document (serie, número, receptor,
// fecha de emisión) and annulments / credit notes need it back, so we read it
// from the certified XML instead of storing more columns.
//
// The PDF is not a public link: Digifact returns it as a file, so the link we
// store is our own signed one (doc-link.ts), served by GET /api/fel/doc/:uuid.pdf.

import { randomUUID } from 'node:crypto'
import type { CertifyResult, DteDocument, DteLine, FelContext, FelProvider, TaxIdLookup, VoidResult } from '../types.js'
import { isSmallTaxpayerType, type FelConfig } from '../config.js'
import { felDocPdfPath } from '../doc-link.js'

class Unreachable extends Error {}
class TimedOut extends Error {}

const CERTIFIER_NAME = 'DIGIFACT SERVICIOS, SOCIEDAD ANONIMA'
const CERTIFIER_NIT = '77454820'

const tokens = new Map<string, { token: string; exp: number }>()
const sellerNames = new Map<string, string>()

const f6 = (n: number) => (Math.round((n + Number.EPSILON) * 1e6) / 1e6).toFixed(6)
const r6 = (n: number) => Math.round((n + Number.EPSILON) * 1e6) / 1e6

/** What a certified DTE says about itself (from its XML). */
export interface DigifactDocInfo {
  type: string | null
  serie: string | null
  number: string | null
  issuedAt: string | null
  certifiedAt: string | null
  receiverId: string | null
}

export function digifactProvider(cfg: FelConfig): FelProvider {
  const dg = cfg.digifact
  const taxId12 = dg.nit.padStart(12, '0')

  function checkCreds() {
    if (!dg.nit || !dg.user || !dg.password) throw new Error('Faltan DIGIFACT_NIT, DIGIFACT_USER o DIGIFACT_PASSWORD en el .env')
  }

  async function raw(method: string, path: string, opts: { body?: unknown; token?: string; timeoutMs?: number } = {}) {
    const ctrl = new AbortController()
    const timeoutMs = opts.timeoutMs ?? cfg.timeoutMs
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    let res: Response
    try {
      res = await fetch(`${dg.baseUrl}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(opts.token ? { Authorization: opts.token } : {}),
        },
        ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
        signal: ctrl.signal,
      })
    } catch (err: any) {
      if (err?.name === 'AbortError') throw new TimedOut(`Digifact no respondió en ${Math.round(timeoutMs / 1000)} s`)
      throw new Unreachable(`No se pudo conectar con Digifact: ${err?.cause?.code ?? err?.message ?? err}`)
    } finally {
      clearTimeout(timer)
    }
    const text = await res.text()
    let json: any = null
    try { json = text ? JSON.parse(text) : null } catch { json = null }
    return { status: res.status, json, text }
  }

  async function token(force = false): Promise<string> {
    checkCreds()
    const key = `${dg.baseUrl}|${taxId12}|${dg.user}`
    const cached = tokens.get(key)
    if (!force && cached && cached.exp - Date.now() > 3600_000) return cached.token
    // A login that never got an answer can be repeated safely.
    const r = await raw('POST', '/login/get_token', { body: { Username: `GT.${taxId12}.${dg.user}`, Password: dg.password }, timeoutMs: 20_000 })
    const t = r.json?.Token ?? r.json?.token
    if (!t) {
      throw new Error(`Digifact rechazó el usuario (${r.status}): ${errorsOf(r.json, r.text).join('; ')} — revisa DIGIFACT_NIT, DIGIFACT_USER, DIGIFACT_PASSWORD y que sean del ambiente correcto`)
    }
    tokens.set(key, { token: t, exp: jwtExp(t) ?? Date.now() + 24 * 3600_000 })
    return t
  }

  /** Authenticated call; a 401 (token expired) is retried once with a new token — nothing was processed. */
  async function call(method: string, path: string, body?: unknown) {
    let r = await raw(method, path, { body, token: await token() })
    if (r.status === 401) r = await raw(method, path, { body, token: await token(true) })
    return r
  }

  const q = (params: Record<string, string>) => new URLSearchParams(params).toString()

  async function getDocument(uuid: string, format: string) {
    const r = await call('GET', `/GetDocument?${q({ AUTHNUMBER: uuid, TAXID: taxId12, FORMAT: format, USERNAME: dg.user })}`)
    return { r, doc: Array.isArray(r.json?.RESPONSE) ? r.json.RESPONSE[0] ?? null : null }
  }

  async function docInfo(uuid: string): Promise<DigifactDocInfo | null> {
    const { doc } = await getDocument(uuid, 'XML')
    if (!doc?.ResponseData1) return null
    return parseDteXml(Buffer.from(doc.ResponseData1, 'base64').toString('utf8'))
  }

  async function lookupNit(nit: string): Promise<{ name: string; address?: string; city?: string; state?: string } | null> {
    const r = await call('GET', `/Shared?${q({ COUNTRY: 'GT', TAXID: taxId12, DATA1: 'SHARED_GETINFONITcom', DATA2: `NIT|${nit}`, USERNAME: dg.user })}`)
    const first = Array.isArray(r.json?.RESPONSE) ? r.json.RESPONSE[0] : null
    if (!first?.NOMBRE) return null
    return { name: String(first.NOMBRE), address: first.Direccion ?? undefined, city: first.MUNICIPIO ?? undefined, state: first.DEPARTAMENTO ?? undefined }
  }

  async function sellerName(): Promise<string> {
    if (dg.sellerName) return dg.sellerName
    const cached = sellerNames.get(dg.nit)
    if (cached) return cached
    const found = await lookupNit(dg.nit)
    if (!found) throw new Error(`No se encontró el NIT emisor ${dg.nit} en la SAT; pon la razón social en DIGIFACT_SELLER_NAME`)
    sellerNames.set(dg.nit, found.name)
    return found.name
  }

  return {
    name: 'digifact',
    environment: cfg.environment,
    supportsContingency: true,

    async certify(doc: DteDocument, ctx: FelContext): Promise<CertifyResult> {
      let body
      try {
        const parent = doc.parentUuid ? await docInfo(doc.parentUuid) : null
        if (doc.parentUuid && !parent) return { ok: false, errors: [`No se encontró en Digifact la factura original ${doc.parentUuid}`], retryable: false }
        body = toDigifactBody(doc, cfg, ctx, await sellerName(), parent ? { ...parent, uuid: doc.parentUuid! } : null)
      } catch (err: any) {
        // Nothing was certified yet: a failure to log in or read data is safe to retry.
        return { ok: false, errors: [err.message], retryable: err instanceof Unreachable || err instanceof TimedOut }
      }
      let r
      try {
        r = await call('POST', `/v2/transform/nuc_json?${q({ TAXID: taxId12, FORMAT: 'XML', USERNAME: dg.user })}`, body)
      } catch (err: any) {
        // A timeout may still have produced a DTE: never auto-retry it.
        return { ok: false, errors: [err.message], retryable: err instanceof Unreachable }
      }
      if (r.status >= 500 && !r.json) return { ok: false, errors: [`Digifact respondió ${r.status}`], retryable: true }
      if (r.status === 401 || r.status === 403) return { ok: false, errors: [`Digifact rechazó las credenciales (${r.status})`], retryable: false }
      return parseCertify(r.json, r.text)
    },

    async void(uuid: string, reason: string): Promise<VoidResult> {
      try {
        const info = await docInfo(uuid)
        if (!info?.issuedAt) return { ok: false, errors: [`No se encontró en Digifact el documento ${uuid}`] }
        const r = await call('POST', '/CancelFelGT', {
          Taxid: taxId12,
          Autorizacion: uuid,
          IdReceptor: info.receiverId || 'CF',
          FechaEmisionDocumentoAnular: info.issuedAt.slice(0, 19),
          MotivoAnulacion: (reason || 'Anulación').slice(0, 250),
          Username: dg.user,
        })
        const ok = String(r.json?.Codigo ?? r.json?.code ?? '') === '1'
        return { ok, errors: ok ? [] : errorsOf(r.json, r.text) }
      } catch (err: any) {
        return { ok: false, errors: [err.message] }
      }
    },

    async get(uuid: string): Promise<CertifyResult> {
      try {
        const info = await docInfo(uuid)
        if (!info) return { ok: false, errors: [`No se encontró en Digifact el documento ${uuid}`], retryable: false }
        return {
          ok: true,
          uuid,
          authorization: uuid,
          serie: info.serie ?? undefined,
          number: info.number ?? undefined,
          certifiedAt: info.certifiedAt ? parseGtDate(info.certifiedAt) : undefined,
          certifierName: CERTIFIER_NAME,
          certifierNit: CERTIFIER_NIT,
          pdfUrl: felDocPdfPath(uuid),
          errors: [],
          retryable: false,
        }
      } catch (err: any) {
        return { ok: false, errors: [err.message], retryable: true }
      }
    },

    async lookupTaxId(kind, id): Promise<TaxIdLookup> {
      const clean = id.replace(/[\s-]/g, '').toUpperCase()
      // Digifact documents the lookup for NIT only.
      if (kind !== 'NIT') return { found: false, taxId: clean }
      const found = await lookupNit(clean)
      if (!found) return { found: false, taxId: clean }
      return {
        found: true,
        taxId: clean,
        name: found.name,
        address: { street: found.address ?? null, city: found.city ?? null, state: found.state ?? null },
      }
    },

    async credits(): Promise<number | null> {
      // No balance endpoint: the DTE bolsón is managed in Digifact's portal.
      // Logging in is the connection test.
      await token(true)
      return null
    },

    async xml(uuid: string): Promise<string | null> {
      const { doc } = await getDocument(uuid, 'XML')
      return doc?.ResponseData1 ? Buffer.from(doc.ResponseData1, 'base64').toString('utf8') : null
    },

    async pdf(uuid: string): Promise<Buffer | null> {
      const { doc } = await getDocument(uuid, 'PDF')
      return doc?.ResponseData3 ? Buffer.from(doc.ResponseData3, 'base64') : null
    },
  }
}

/** DteDocument → NUC JSON. Lines carry prices with IVA included, as charged. */
export function toDigifactBody(
  doc: DteDocument,
  cfg: FelConfig,
  ctx: FelContext,
  sellerName: string,
  parent: (DigifactDocInfo & { uuid: string }) | null,
) {
  const dg = cfg.digifact
  const small = isSmallTaxpayerType(doc.type) || dg.afiliacion === 'PEQ'
  const est = ctx.establishment
  const rate = cfg.ivaRate

  const items = doc.lines.map((l: DteLine, k) => {
    const net = r6(l.qty * l.unitPrice - l.discount)
    const taxable = r6(net / (1 + rate))
    const tax = r6(net - taxable)
    return {
      line: {
        Number: String(k + 1),
        Codes: null,
        Type: l.type === 'S' ? 'Servicio' : 'Bien',
        Description: l.description,
        Qty: f6(l.qty),
        UnitOfMeasure: 'UNI',
        Price: f6(l.unitPrice),
        Discounts: l.discount > 0 ? { Discount: [{ Amount: f6(l.discount) }] } : null,
        Taxes: small ? null : { Tax: [{ Code: '1', Description: 'IVA', TaxableAmount: f6(taxable), Amount: f6(tax) }] },
        Totals: { TotalItem: f6(net) },
      },
      tax,
      net,
    }
  })
  const totalTax = r6(items.reduce((s, i) => s + i.tax, 0))
  const total = r6(items.reduce((s, i) => s + i.net, 0))

  const r = doc.receiver
  const buyer: Record<string, unknown> = {
    TaxID: r.kind === 'CF' ? 'CF' : r.taxId,
    ...(r.kind === 'CUI' ? { TaxIDType: 'CUI' } : {}),
    Name: r.name,
    ...(r.email ? { Contact: { EmailList: { Email: [r.email] } } } : {}),
    AddressInfo: {
      Address: r.address.street || 'Ciudad',
      City: r.address.zip || '01001',
      District: r.address.city || 'Guatemala',
      State: r.address.state || 'Guatemala',
      Country: r.address.country || 'GT',
    },
  }

  const info = [
    { Name: 'REFERENCIA_INTERNA', Data: null, Value: doc.externalId },
    ...doc.customFields.map(c => ({ Name: c.name.toUpperCase().replace(/[^A-Z0-9_]/g, '_'), Data: null, Value: c.value })),
    ...(doc.memo && !parent ? [{ Name: 'OBSERVACIONES', Data: null, Value: doc.memo }] : []),
  ]
  const additional: any[] = [{
    Code: randomUUID().toUpperCase(),
    Type: 'ADENDA',
    AditionalData: { Data: [{ Name: 'INFORMACION_ADICIONAL', Info: info }] },
    AditionalInfo: [{ Name: 'VALIDAR_REFERENCIA_INTERNA', Data: null, Value: 'NO_VALIDAR' }],
  }]
  if (parent) {
    additional.push({
      Code: doc.type,
      Type: 'COMPLEMENTO',
      AditionalInfo: [
        { Name: 'NumeroAutorizacionDocumentoOrigen', Data: null, Value: parent.uuid },
        { Name: 'FechaEmisionDocumentoOrigen', Data: null, Value: (parent.issuedAt ?? '').slice(0, 10) },
        { Name: 'MotivoAjuste', Data: null, Value: (doc.memo || 'Devolución').slice(0, 250) },
        { Name: 'NumeroDocumentoOrigen', Data: null, Value: parent.number ?? '' },
        { Name: 'SerieDocumentoOrigen', Data: null, Value: parent.serie ?? '' },
      ],
    })
  }

  return {
    Version: '1.00',
    CountryCode: 'GT',
    Header: {
      DocType: doc.type, IssuedDateTime: `${doc.issuedAt}-06:00`, AdditionalIssueType: null, ExchangeRate: null, Currency: doc.currency,
      // Verified on the test environment: lands as DatosGenerales@NumeroAcceso in the certified XML.
      ...(doc.accessNumber ? { AdditionalIssueDocInfo: [{ Name: 'NumeroAcceso', Data: null, Value: doc.accessNumber }] } : {}),
    },
    Seller: {
      TaxID: dg.nit,
      TaxIDAdditionalInfo: [{ Name: 'AfiliacionIVA', Data: null, Value: dg.afiliacion }],
      Name: sellerName,
      AdditionlInfo: dg.frases.flatMap(([tipo, esc]) => [
        { Name: 'TipoFrase', Data: tipo, Value: tipo },
        { Name: 'Escenario', Data: tipo, Value: esc },
      ]),
      BranchInfo: {
        Code: est?.code || dg.establishment,
        Name: est?.name || sellerName,
        AddressInfo: {
          Address: est?.address || 'Ciudad',
          City: '01001',
          District: est?.city || 'Guatemala',
          State: 'Guatemala',
          Country: 'GT',
        },
      },
    },
    Buyer: buyer,
    Items: items.map(i => i.line),
    Totals: {
      TotalTaxes: small ? null : { TotalTax: [{ Description: 'IVA', Amount: f6(totalTax) }] },
      GrandTotal: { InvoiceTotal: f6(total) },
    },
    AdditionalDocumentInfo: { AdditionalInfo: additional },
  }
}

function parseCertify(json: any, text: string): CertifyResult {
  if (String(json?.code ?? '') === '1' && json.authNumber) {
    const uuid = String(json.authNumber)
    return {
      ok: true,
      uuid,
      authorization: uuid,
      serie: json.batch ? String(json.batch) : undefined,
      number: json.serial ? String(json.serial) : undefined,
      certifiedAt: json.enrolledTimeStamp ? parseGtDate(json.enrolledTimeStamp) : new Date(),
      certifierName: CERTIFIER_NAME,
      certifierNit: CERTIFIER_NIT,
      pdfUrl: felDocPdfPath(uuid),
      xml: json.responseData1 ? Buffer.from(String(json.responseData1), 'base64').toString('utf8') : undefined,
      errors: [],
      retryable: false,
    }
  }
  return { ok: false, errors: errorsOf(json, text), retryable: false }
}

export function parseDteXml(xml: string): DigifactDocInfo {
  const attr = (name: string) => xml.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? null
  const auth = xml.match(/<(?:\w+:)?NumeroAutorizacion\b([^>]*)>/)?.[1] ?? ''
  return {
    type: attr('Tipo'),
    serie: auth.match(/Serie="([^"]*)"/)?.[1] ?? null,
    number: auth.match(/Numero="([^"]*)"/)?.[1] ?? null,
    issuedAt: attr('FechaHoraEmision'),
    certifiedAt: xml.match(/<(?:\w+:)?FechaHoraCertificacion>([^<]+)</)?.[1] ?? null,
    receiverId: attr('IDReceptor'),
  }
}

/** Digifact answers in Guatemala time, sometimes without an offset. */
function parseGtDate(s: string): Date {
  const iso = String(s).trim().replace(' ', 'T')
  return /[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? new Date(iso) : new Date(`${iso}-06:00`)
}

function jwtExp(t: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(t.split('.')[1] ?? '', 'base64url').toString('utf8'))
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null
  } catch { return null }
}

/**
 * Digifact's errors come as a long "****** Mensaje ******" text block; keep the
 * SAT message (e.g. "FEL_RCP305 El establecimiento no existe …") and drop the
 * technical trace.
 */
export function errorsOf(json: any, text: string): string[] {
  const desc: string = String(json?.description ?? json?.Descripcion ?? '')
  const msg: string = String(json?.message ?? json?.Mensaje ?? '')
  const core = desc.match(/\*+\s*Mensaje\s*\*+\s*([\s\S]*?)(?:\n\s*\n|Descripci[oó]n:|$)/)?.[1]?.trim()
  const out = [core || desc.split('******')[0]?.trim() || '', core ? '' : msg].map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean)
  if (!out.length && Array.isArray(json?.REQUEST_DATA)) {
    const rd = json.REQUEST_DATA[0]
    if (rd?.Mensaje) out.push(String(rd.Mensaje))
  }
  return out.length ? out : [text?.slice(0, 300) || 'Digifact rechazó el documento sin indicar el motivo']
}
