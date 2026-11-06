// FEL orchestration: certify a sale's factura, annul it, issue credit notes,
// and retry what never reached the certifier. Routes only call these.
//
// Safety rules (a duplicate DTE is a real tax problem, a late one is not):
//  - a document is "claimed" with a conditional update before calling the
//    certifier, so two requests (cashier + background retry) can't both send it;
//  - only failures where the request never reached the certifier are retried
//    automatically; a timeout is left FAILED with a note to check FELplex first.

import { prisma } from '../prisma.js'
import { felConfig, type FelConfig } from './config.js'
import { buildDteForSale, DteBuildError, type BuildOptions, type BuildSaleInput } from './build.js'
import { felplexProvider } from './providers/felplex.js'
import { mockProvider } from './providers/mock.js'
import type { CertifyResult, FelContext, FelProvider } from './types.js'

export function getProvider(cfg: FelConfig = felConfig()): FelProvider | null {
  if (cfg.provider === 'felplex') return felplexProvider(cfg)
  if (cfg.provider === 'mock') return mockProvider()
  return null
}

export function contextFor(branch: { felEntityId?: string | null }, cfg: FelConfig = felConfig()): FelContext | null {
  const entityId = branch.felEntityId?.trim() || cfg.defaultEntityId
  if (cfg.provider === 'mock') return { entityId: entityId ?? 'mock' }
  return entityId ? { entityId } : null
}

const saleForDte = {
  customer: { select: { nit: true, name: true, email: true, address: true } },
  branch: { select: { name: true, city: true, felEntityId: true } },
  items: { include: { product: { select: { name: true } }, variation: { select: { name: true, isDefault: true } } } },
  quotation: { select: { portalOrder: { select: { school: { select: { name: true, nit: true, invoiceName: true, address: true } } } } } },
} as const

/** Portal orders are billed to the school (its NIT and invoice name), not to the quotation's customer. */
export function schoolReceiver(sale: any): BuildOptions['receiverOverride'] | undefined {
  const school = sale?.quotation?.portalOrder?.school
  if (!school?.nit) return undefined
  return { nit: school.nit, name: school.invoiceName || school.name, address: school.address ?? null }
}

const FOUR_DAYS = 4 * 24 * 3600 * 1000

export type CertifyOutcome = { status: 'CERTIFIED' | 'PENDING' | 'FAILED' | 'SKIPPED'; error?: string }

function felFields(res: CertifyResult, provider: FelProvider) {
  return {
    felStatus: 'CERTIFIED',
    felUuid: res.uuid ?? null,
    felAuthNumber: res.authorization ?? null,
    felSatSerie: res.serie ?? null,
    felSatNumber: res.number ?? null,
    felCertifiedAt: res.certifiedAt ?? new Date(),
    felPdfUrl: res.pdfUrl ?? null,
    felXmlUrl: res.xmlUrl ?? null,
    felEnvironment: provider.environment,
    felError: null,
  }
}

const errText = (errors: string[]) => errors.join(' · ').slice(0, 500)

/**
 * Sends the sale's factura to the certifier. Never throws: the sale already
 * happened, a FEL problem only changes felStatus/felError.
 */
export async function certifySale(saleId: string, opts: { manual?: boolean } = {}): Promise<CertifyOutcome> {
  const cfg = felConfig()
  const provider = getProvider(cfg)
  if (!provider) return { status: 'SKIPPED', error: 'FEL_PROVIDER no está configurado' }

  // Claim: only one sender at a time, never re-send a certified one.
  const staleBefore = new Date(Date.now() - 90_000)
  const claimed = await prisma.sale.updateMany({
    where: {
      id: saleId, requiresInvoice: true, isVoided: false,
      // FAILED is final (nothing in flight): a manual retry may go at once.
      // PENDING may have a send in progress: only claim it once it's stale.
      OR: [
        ...(opts.manual ? [{ felStatus: 'FAILED' }] : []),
        { felStatus: 'PENDING', OR: [{ felLastAttemptAt: null }, { felLastAttemptAt: { lt: staleBefore } }] },
      ],
    },
    data: { felLastAttemptAt: new Date(), felAttempts: { increment: 1 } },
  })
  if (claimed.count === 0) return { status: 'SKIPPED', error: 'La factura ya está certificada o en proceso' }

  const sale = await prisma.sale.findUnique({ where: { id: saleId }, include: saleForDte })
  if (!sale) return { status: 'SKIPPED' }
  const ctx = contextFor(sale.branch, cfg)
  if (!ctx) {
    const error = `La sucursal ${sale.branch.name} no tiene empresa de FELplex (Branch.felEntityId ni FELPLEX_ENTITY_ID)`
    await prisma.sale.update({ where: { id: saleId }, data: { felStatus: 'FAILED', felError: error } })
    return { status: 'FAILED', error }
  }

  let doc
  try {
    // An invoice generated days after the sale is issued today: SAT rejects
    // emission dates more than 5 days before certification.
    const issuedAt = Date.now() - sale.createdAt.getTime() > FOUR_DAYS ? new Date() : sale.createdAt
    const override = schoolReceiver(sale)
    doc = buildDteForSale(sale as unknown as BuildSaleInput, cfg, { issuedAt, ...(override ? { receiverOverride: override } : {}) })
  } catch (err: any) {
    const error = err instanceof DteBuildError ? err.message : `No se pudo armar la factura: ${err?.message ?? err}`
    await prisma.sale.update({ where: { id: saleId }, data: { felStatus: 'FAILED', felError: error.slice(0, 500) } })
    return { status: 'FAILED', error }
  }

  const res = await provider.certify(doc, ctx)
  if (res.ok) {
    await prisma.sale.update({ where: { id: saleId }, data: { ...felFields(res, provider), felDocType: doc.type } })
    return { status: 'CERTIFIED' }
  }
  const cfgMax = cfg.maxAttempts
  const status = res.retryable && sale.felAttempts < cfgMax ? 'PENDING' : 'FAILED'
  const note = !res.retryable && /no respondió/.test(res.errors.join(' '))
    ? ' — Revisa en FELplex si se certificó antes de reintentar (podría duplicarse).'
    : ''
  const error = errText(res.errors) + note
  await prisma.sale.update({ where: { id: saleId }, data: { felStatus: status, felError: error.slice(0, 500), felDocType: doc.type } })
  return { status, error }
}

/** Annul the DTE of a voided sale. The SAT allows it until the end of the month after issue. */
export async function voidSaleFel(saleId: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  const sale = await prisma.sale.findUnique({ where: { id: saleId }, select: { felStatus: true, felUuid: true, felVoidStatus: true, branch: { select: { felEntityId: true } } } })
  if (!sale || sale.felStatus !== 'CERTIFIED' || !sale.felUuid || sale.felVoidStatus === 'VOIDED') return { ok: true }
  const cfg = felConfig()
  const provider = getProvider(cfg)
  const ctx = contextFor(sale.branch, cfg)
  if (!provider || !ctx) {
    const error = 'FEL no está configurado: anula el documento directamente en FELplex'
    await prisma.sale.update({ where: { id: saleId }, data: { felVoidStatus: 'FAILED', felVoidError: error } })
    return { ok: false, error }
  }
  const res = await provider.void(sale.felUuid, reason || 'Anulación de venta', ctx)
  await prisma.sale.update({
    where: { id: saleId },
    data: res.ok
      ? { felVoidStatus: 'VOIDED', felVoidedAt: new Date(), felVoidError: null }
      : { felVoidStatus: 'FAILED', felVoidError: errText(res.errors) },
  })
  return res.ok ? { ok: true } : { ok: false, error: errText(res.errors) }
}

/** Re-read a certified document (e.g. to pick up the PDF link). */
export async function refreshSaleFel(saleId: string): Promise<{ ok: boolean; error?: string }> {
  const sale = await prisma.sale.findUnique({ where: { id: saleId }, select: { felUuid: true, branch: { select: { felEntityId: true } } } })
  const cfg = felConfig()
  const provider = getProvider(cfg)
  const ctx = sale ? contextFor(sale.branch, cfg) : null
  if (!sale?.felUuid || !provider || !ctx) return { ok: false, error: 'La venta no tiene documento certificado' }
  const res = await provider.get(sale.felUuid, ctx)
  if (!res.ok) return { ok: false, error: errText(res.errors) }
  await prisma.sale.update({ where: { id: saleId }, data: felFields(res, provider) })
  return { ok: true }
}

// ── Credit notes (NCRE) ─────────────────────────────────────────────────────

export async function certifyCreditNote(creditNoteId: string, opts: { manual?: boolean } = {}): Promise<CertifyOutcome> {
  const cfg = felConfig()
  const provider = getProvider(cfg)
  if (!provider) return { status: 'SKIPPED', error: 'FEL_PROVIDER no está configurado' }
  const staleBefore = new Date(Date.now() - 90_000)
  const claimed = await prisma.creditNote.updateMany({
    where: {
      id: creditNoteId, isCancelled: false,
      OR: [
        ...(opts.manual ? [{ felStatus: 'FAILED' }] : []),
        { felStatus: 'PENDING', OR: [{ felLastAttemptAt: null }, { felLastAttemptAt: { lt: staleBefore } }] },
      ],
    },
    data: { felLastAttemptAt: new Date(), felAttempts: { increment: 1 } },
  })
  if (claimed.count === 0) return { status: 'SKIPPED', error: 'La nota de crédito ya está certificada o en proceso' }

  const note = await prisma.creditNote.findUnique({
    where: { id: creditNoteId },
    include: { items: { include: { saleItem: { include: { product: { select: { name: true } }, variation: { select: { name: true, isDefault: true } } } } } }, sale: { include: saleForDte } },
  })
  if (!note) return { status: 'SKIPPED' }
  const sale = note.sale
  const ctx = contextFor(sale.branch, cfg)
  if (!sale.felUuid || !ctx) {
    const error = !sale.felUuid ? 'La factura original no tiene documento certificado' : 'La sucursal no tiene empresa de FELplex'
    await prisma.creditNote.update({ where: { id: creditNoteId }, data: { felStatus: 'FAILED', felError: error } })
    return { status: 'FAILED', error }
  }

  let doc
  try {
    // The note's lines are the credited amounts: same builder, with each
    // returned line priced at what was really charged for it.
    const asSale: BuildSaleInput = {
      ...(sale as any),
      createdAt: new Date(),
      total: note.total,
      discount: 0,
      items: note.items.map(ci => {
        const qty = Number(ci.quantity)
        const amount = Number(ci.amount)
        return {
          ...ci.saleItem,
          quantity: qty,
          unitPrice: Number.isInteger(qty) && qty > 0 ? Math.ceil((amount / qty) * 100) / 100 : amount,
          total: amount,
          promoDiscount: 0,
        }
      }),
    }
    const override = schoolReceiver(sale)
    doc = buildDteForSale(asSale, cfg, {
      type: 'NCRE', parentUuid: sale.felUuid, memo: note.reason.slice(0, 250),
      ...(override ? { receiverOverride: override } : {}),
    })
    doc.externalId = `NC-${note.number}`
  } catch (err: any) {
    const error = err instanceof DteBuildError ? err.message : `No se pudo armar la nota de crédito: ${err?.message ?? err}`
    await prisma.creditNote.update({ where: { id: creditNoteId }, data: { felStatus: 'FAILED', felError: error.slice(0, 500) } })
    return { status: 'FAILED', error }
  }

  const res = await provider.certify(doc, ctx)
  if (res.ok) {
    await prisma.creditNote.update({
      where: { id: creditNoteId },
      data: {
        felStatus: 'CERTIFIED', felUuid: res.uuid ?? null, felAuthNumber: res.authorization ?? null,
        felSatSerie: res.serie ?? null, felSatNumber: res.number ?? null, felCertifiedAt: res.certifiedAt ?? new Date(),
        felPdfUrl: res.pdfUrl ?? null, felXmlUrl: res.xmlUrl ?? null, felEnvironment: provider.environment, felError: null,
      },
    })
    return { status: 'CERTIFIED' }
  }
  const status = res.retryable && note.felAttempts < cfg.maxAttempts ? 'PENDING' : 'FAILED'
  const error = errText(res.errors)
  await prisma.creditNote.update({ where: { id: creditNoteId }, data: { felStatus: status, felError: error } })
  return { status, error }
}

// ── Background retry ────────────────────────────────────────────────────────

export async function retryPending(log?: (msg: string) => void): Promise<number> {
  const cfg = felConfig()
  if (!getProvider(cfg)) return 0
  const since = new Date(Date.now() - FOUR_DAYS)
  const backoff = new Date(Date.now() - cfg.retryMinutes * 60_000)
  const sales = await prisma.sale.findMany({
    where: { requiresInvoice: true, isVoided: false, felStatus: 'PENDING', createdAt: { gte: since }, felAttempts: { lt: cfg.maxAttempts }, OR: [{ felLastAttemptAt: null }, { felLastAttemptAt: { lt: backoff } }] },
    select: { id: true }, take: 25, orderBy: { createdAt: 'asc' },
  })
  const notes = await prisma.creditNote.findMany({
    where: { isCancelled: false, felStatus: 'PENDING', felAttempts: { lt: cfg.maxAttempts }, OR: [{ felLastAttemptAt: null }, { felLastAttemptAt: { lt: backoff } }] },
    select: { id: true }, take: 25,
  })
  let done = 0
  for (const s of sales) { const r = await certifySale(s.id); if (r.status === 'CERTIFIED') done++ }
  for (const n of notes) { const r = await certifyCreditNote(n.id); if (r.status === 'CERTIFIED') done++ }
  if ((sales.length || notes.length) && log) log(`FEL: reintento de ${sales.length} factura(s) y ${notes.length} nota(s), ${done} certificada(s)`)
  return done
}

let timer: NodeJS.Timeout | null = null
export function startFelWorker(log: (msg: string) => void) {
  const cfg = felConfig()
  if (timer || cfg.provider === 'none' || cfg.retryMinutes <= 0) return
  timer = setInterval(() => { retryPending(log).catch(err => log(`FEL: error en reintento: ${err?.message ?? err}`)) }, cfg.retryMinutes * 60_000)
  timer.unref?.()
  log(`FEL: proveedor ${cfg.provider} (${cfg.environment}), reintento cada ${cfg.retryMinutes} min`)
}
