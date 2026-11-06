// FELplex (CARI Latinoamérica) — Guatemala REST API.
// Reference: https://developers.felplex.com (Postman "PUBLIC - FELplex - Documentación"),
// a local copy is in docs/fel/felplex_guatemala.txt.
//
//   Auth:      header X-Authorization: <api_key>; every path is scoped to the "empresa" id
//   Certify:   POST   {base}/api/entity/{empresa}/invoices/await     (synchronous: waits for SAT)
//   Annul:     DELETE {base}/api/entity/{empresa}/invoices/{uuid}    body { reason }
//   Fetch:     GET    {base}/api/entity/{empresa}/invoices/{uuid}
//   NIT / CUI: GET    {base}/api/entity/{empresa}/find/{NIT|CUI}/{id}
//   Credits:   GET    {base}/api/entity/{empresa}/credits           → a number

import type { CertifyResult, DteDocument, FelContext, FelProvider, TaxIdLookup, VoidResult } from '../types.js'
import { apiKeyFor, type FelConfig } from '../config.js'

class Unreachable extends Error {}
class TimedOut extends Error {}

export function felplexProvider(cfg: FelConfig): FelProvider {
  async function call(ctx: FelContext, method: string, path: string, body?: unknown): Promise<{ status: number; json: any; text: string }> {
    const key = apiKeyFor(cfg, ctx.entityId)
    if (!key) throw new Error(`Falta la API Key de FELplex para la empresa ${ctx.entityId} (FELPLEX_API_KEY)`)
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs)
    let res: Response
    try {
      res = await fetch(`${cfg.baseUrl}/api/entity/${encodeURIComponent(ctx.entityId)}${path}`, {
        method,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Authorization': key },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: ctrl.signal,
      })
    } catch (err: any) {
      if (err?.name === 'AbortError') throw new TimedOut(`FELplex no respondió en ${Math.round(cfg.timeoutMs / 1000)} s`)
      throw new Unreachable(`No se pudo conectar con FELplex: ${err?.cause?.code ?? err?.message ?? err}`)
    } finally {
      clearTimeout(timer)
    }
    const text = await res.text()
    let json: any = null
    try { json = text ? JSON.parse(text) : null } catch { json = null }
    return { status: res.status, json, text }
  }

  return {
    name: 'felplex',
    environment: cfg.environment,

    async certify(doc: DteDocument, ctx: FelContext): Promise<CertifyResult> {
      let r
      try {
        r = await call(ctx, 'POST', '/invoices/await', toFelplexBody(doc))
      } catch (err: any) {
        // A timeout may still have produced a DTE on FELplex's side: never
        // auto-retry it (a second request would certify a duplicate).
        return { ok: false, errors: [err.message], retryable: err instanceof Unreachable }
      }
      if (r.status >= 500 && !r.json) return { ok: false, errors: [`FELplex respondió ${r.status}`], retryable: true }
      if (r.status === 401 || r.status === 403) return { ok: false, errors: [authError(r)], retryable: false }
      return parseCertify(r.json, r.text)
    },

    async void(uuid: string, reason: string, ctx: FelContext): Promise<VoidResult> {
      try {
        const r = await call(ctx, 'DELETE', `/invoices/${encodeURIComponent(uuid)}`, { reason: reason.slice(0, 250) || 'Anulación' })
        if (r.status === 401 || r.status === 403) return { ok: false, errors: [authError(r)] }
        const ok = r.json?.success === true
        return { ok, errors: ok ? [] : errorsOf(r.json, r.text) }
      } catch (err: any) {
        return { ok: false, errors: [err.message] }
      }
    },

    async get(uuid: string, ctx: FelContext): Promise<CertifyResult> {
      try {
        const r = await call(ctx, 'GET', `/invoices/${encodeURIComponent(uuid)}`)
        return parseCertify(r.json, r.text)
      } catch (err: any) {
        return { ok: false, errors: [err.message], retryable: true }
      }
    },

    async lookupTaxId(kind, id, ctx): Promise<TaxIdLookup> {
      const clean = id.replace(/[\s-]/g, '').toUpperCase()
      const r = await call(ctx, 'GET', `/find/${kind}/${encodeURIComponent(clean)}`)
      const first = Array.isArray(r.json) ? r.json[0] : r.json && typeof r.json === 'object' && r.json.tax_name ? r.json : null
      if (!first) return { found: false, taxId: clean }
      return {
        found: true,
        taxId: clean,
        name: first.tax_name ?? first.name,
        address: first.address ?? undefined,
        email: Array.isArray(first.emails) && typeof first.emails[0] === 'string' ? first.emails[0] : undefined,
      }
    },

    async credits(ctx): Promise<number | null> {
      const r = await call(ctx, 'GET', '/credits')
      if (r.status === 401 || r.status === 403) throw new Error(authError(r))
      const n = typeof r.json === 'number' ? r.json : Number(r.json?.credits ?? r.text)
      return Number.isFinite(n) ? n : null
    },
  }
}

/** DteDocument → FELplex JSON (field names exactly as in their docs). */
export function toFelplexBody(doc: DteDocument) {
  const cf = doc.receiver.kind === 'CF'
  return {
    type: doc.type,
    currency: doc.currency,
    datetime_issue: doc.issuedAt,
    external_id: doc.externalId,
    items: doc.lines.map(l => ({
      qty: l.qty,
      type: l.type,
      price: l.unitPrice,
      description: l.description,
      without_iva: l.withoutIva ? 1 : 0,
      discount: l.discount,
      is_discount_percentage: 0,
      taxes: { quantity: null, tax_code: null, full_name: null, short_name: null, tax_amount: null, taxable_amount: null },
    })),
    total: doc.total,
    total_tax: doc.totalTax,
    emails: doc.receiver.email ? [{ email: doc.receiver.email }] : [],
    to_cf: cf ? 1 : 0,
    to: {
      tax_code_type: cf ? 'NIT' : doc.receiver.kind,
      tax_code: cf ? 'CF' : doc.receiver.taxId,
      tax_name: doc.receiver.name,
      address: doc.receiver.address,
    },
    exempt_phrase: null,
    custom_fields: doc.customFields,
    ...(doc.parentUuid ? { parent_invoice_id: doc.parentUuid } : {}),
    ...(doc.memo ? { memo: doc.memo } : {}),
  }
}

function parseCertify(json: any, text: string): CertifyResult {
  if (json?.valid === true && json.uuid) {
    const sat = json.sat ?? {}
    return {
      ok: true,
      uuid: String(json.uuid),
      serie: sat.serie != null ? String(sat.serie) : undefined,
      number: sat.no != null ? String(sat.no) : undefined,
      authorization: sat.authorization != null ? String(sat.authorization) : undefined,
      certifiedAt: sat.certification_date ? parseGtDate(sat.certification_date) : new Date(),
      certifierName: json.certifier?.name,
      certifierNit: json.certifier?.tax_code != null ? String(json.certifier.tax_code) : undefined,
      pdfUrl: json.invoice_url,
      xmlUrl: json.invoice_xml,
      errors: [],
      retryable: false,
    }
  }
  return { ok: false, errors: errorsOf(json, text), retryable: false }
}

/** FELplex returns certification dates in Guatemala time without an offset. */
function parseGtDate(s: string): Date {
  const iso = String(s).replace(' ', 'T')
  return /[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? new Date(iso) : new Date(`${iso}-06:00`)
}

function errorsOf(json: any, text: string): string[] {
  const raw = json?.errors ?? json?.error ?? json?.message
  const list = Array.isArray(raw) ? raw : raw ? [raw] : []
  const msgs = list.map((e: any) => (typeof e === 'string' ? e
    : [e?.code ?? e?.codigo, e?.message ?? e?.mensaje ?? e?.description ?? e?.descripcion].filter(Boolean).join(' ') || JSON.stringify(e)))
  return msgs.length ? msgs : [text?.slice(0, 300) || 'FELplex rechazó el documento sin indicar el motivo']
}

function authError(r: { status: number; json: any; text: string }): string {
  return `FELplex rechazó las credenciales (${r.status}): ${errorsOf(r.json, r.text).join('; ')} — revisa FELPLEX_API_KEY, el ID de empresa y que sean del ambiente correcto`
}
