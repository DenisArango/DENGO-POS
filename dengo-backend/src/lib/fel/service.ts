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
import { digifactProvider } from './providers/digifact.js'
import { mockProvider } from './providers/mock.js'
import type { CertifyResult, FelContext, FelProvider } from './types.js'
import { felDocPdfPath } from './doc-link.js'
import { generateAccessNumber, gtCalendarDaysBetween, SAT_MAX_EMISSION_AGE_DAYS, contingencyDeadline } from './sat-rules.js'

export function getProvider(cfg: FelConfig = felConfig()): FelProvider | null {
  if (cfg.provider === 'felplex') return felplexProvider(cfg)
  if (cfg.provider === 'digifact') return digifactProvider(cfg)
  if (cfg.provider === 'mock') return mockProvider()
  return null
}

export interface FelBranch {
  felEntityId?: string | null
  felEstablishmentCode?: string | null
  name?: string | null
  address?: string | null
  city?: string | null
}

export function contextFor(branch: FelBranch, cfg: FelConfig = felConfig()): FelContext | null {
  if (cfg.provider === 'digifact') {
    // Digifact has one login per emisor; what changes per branch is the SAT establishment.
    const code = branch.felEstablishmentCode?.trim() || cfg.digifact.establishment
    return {
      entityId: code,
      establishment: { code, name: branch.name?.trim() || '', address: branch.address?.trim() || '', city: branch.city?.trim() || '' },
    }
  }
  const entityId = branch.felEntityId?.trim() || cfg.defaultEntityId
  if (cfg.provider === 'mock') return { entityId: entityId ?? 'mock' }
  return entityId ? { entityId } : null
}

export const felBranchSelect = { name: true, city: true, address: true, felEntityId: true, felEstablishmentCode: true } as const

const saleForDte = {
  customer: { select: { nit: true, name: true, email: true, address: true } },
  branch: { select: felBranchSelect },
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
    // Always our own printable invoice (lib/fel/invoice-pdf.ts), branded per client.
    felPdfUrl: res.uuid ? felDocPdfPath(res.uuid) : res.pdfUrl ?? null,
    felXmlUrl: res.xmlUrl ?? null,
    felEnvironment: provider.environment,
    felError: null,
  }
}

/** Archives the certified XML (FelDocumentXml) — kept apart from the sale row. */
export async function saveDteXml(uuid: string | undefined, xml: string | undefined | null) {
  if (!uuid || !xml) return
  const id = uuid.toUpperCase()
  await prisma.felDocumentXml.upsert({ where: { uuid: id }, create: { uuid: id, xml }, update: { xml } }).catch(() => {})
}

const gtDate = (d: Date) => d.toLocaleDateString('es-GT', { timeZone: 'America/Guatemala' })

/**
 * Gives a sale its contingency Numero de Acceso (random, unique among ours).
 * Returns the number the sale ends up with; an existing one is kept.
 */
export async function assignAccessNumber(saleId: string, issuedAt: Date, reason: string): Promise<string | null> {
  for (let i = 0; i < 6; i++) {
    const candidate = generateAccessNumber()
    try {
      const r = await prisma.sale.updateMany({
        where: { id: saleId, felAccessNumber: null },
        data: { felAccessNumber: candidate, felIssuedAt: issuedAt, felContingencyReason: reason.slice(0, 300) },
      })
      if (r.count === 1) return candidate
      const cur = await prisma.sale.findUnique({ where: { id: saleId }, select: { felAccessNumber: true } })
      return cur?.felAccessNumber ?? null
    } catch (err: any) {
      if (err?.code !== 'P2002') throw err // anything but a collision with another sale's number
    }
  }
  return null
}

let kickRunning = false
/** The SAT asks to send contingency documents right away once the certifier answers again. */
function kickRetry() {
  if (kickRunning) return
  kickRunning = true
  setTimeout(() => {
    retryPending().catch(() => {}).finally(() => { kickRunning = false })
  }, 2000).unref?.()
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

  // A contingency document keeps the emission date printed on it. Any other
  // invoice generated days after the sale is issued today: the SAT rejects
  // emission dates more than 5 days before certification.
  const contingency = !!sale.felAccessNumber
  const issuedAt = sale.felIssuedAt
    ?? (Date.now() - sale.createdAt.getTime() > FOUR_DAYS ? new Date() : sale.createdAt)
  if (contingency && gtCalendarDaysBetween(issuedAt, new Date()) > SAT_MAX_EMISSION_AGE_DAYS) {
    const error = `Venció el plazo de la SAT: un documento en contingencia se certifica a más tardar ${SAT_MAX_EMISSION_AGE_DAYS} días después de emitido (emitido el ${gtDate(issuedAt)}). Consulta con el contador: lo usual es anular la venta y emitir una factura nueva.`
    await prisma.sale.update({ where: { id: saleId }, data: { felStatus: 'FAILED', felError: error.slice(0, 500) } })
    return { status: 'FAILED', error }
  }

  let doc
  try {
    const override = schoolReceiver(sale)
    doc = buildDteForSale(sale as unknown as BuildSaleInput, cfg, { issuedAt, ...(override ? { receiverOverride: override } : {}) })
    if (sale.felAccessNumber && provider.supportsContingency) doc.accessNumber = sale.felAccessNumber
  } catch (err: any) {
    const error = err instanceof DteBuildError ? err.message : `No se pudo armar la factura: ${err?.message ?? err}`
    await prisma.sale.update({ where: { id: saleId }, data: { felStatus: 'FAILED', felError: error.slice(0, 500) } })
    return { status: 'FAILED', error }
  }

  const res = await provider.certify(doc, ctx)
  if (res.ok) {
    await prisma.sale.update({ where: { id: saleId }, data: { ...felFields(res, provider), felDocType: doc.type, felIssuedAt: issuedAt } })
    await saveDteXml(res.uuid, res.xml)
    kickRetry()
    return { status: 'CERTIFIED' }
  }
  const timedOut = !res.retryable && /no respondió/.test(res.errors.join(' '))
  // Couldn't reach the certifier: the customer leaves with a "Documento en
  // contingencia" (SAT procedure 4.1), certified later with its access number.
  let accessNumber = sale.felAccessNumber
  if ((res.retryable || timedOut) && !accessNumber && provider.supportsContingency && !opts.manual) {
    accessNumber = await assignAccessNumber(saleId, issuedAt, `Sin respuesta del certificador: ${errText(res.errors)}`)
  }
  // Contingency documents keep retrying until the SAT deadline, not just felAttempts times.
  const status = res.retryable && (accessNumber || sale.felAttempts < cfg.maxAttempts) ? 'PENDING' : 'FAILED'
  const note = timedOut
    ? ` — Revisa en ${provider.name === 'digifact' ? 'Digifact' : 'FELplex'} si se certificó antes de reintentar (podría duplicarse).`
    : accessNumber && status === 'PENDING'
      ? ` — En contingencia (No. de acceso ${accessNumber}); se reintenta sola hasta el ${gtDate(contingencyDeadline(issuedAt))}.`
      : ''
  const error = errText(res.errors) + note
  await prisma.sale.update({ where: { id: saleId }, data: { felStatus: status, felError: error.slice(0, 500), felDocType: doc.type } })
  return { status, error }
}

/** Annul the DTE of a voided sale. The SAT allows it until the end of the month after issue. */
export async function voidSaleFel(saleId: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  const sale = await prisma.sale.findUnique({ where: { id: saleId }, select: { felStatus: true, felUuid: true, felVoidStatus: true, branch: { select: felBranchSelect } } })
  if (!sale || sale.felStatus !== 'CERTIFIED' || !sale.felUuid || sale.felVoidStatus === 'VOIDED') return { ok: true }
  const cfg = felConfig()
  const provider = getProvider(cfg)
  const ctx = contextFor(sale.branch, cfg)
  if (!provider || !ctx) {
    const error = 'FEL no está configurado: anula el documento directamente en el portal del certificador'
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
  const sale = await prisma.sale.findUnique({ where: { id: saleId }, select: { felUuid: true, branch: { select: felBranchSelect } } })
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
        felPdfUrl: res.uuid ? felDocPdfPath(res.uuid) : res.pdfUrl ?? null, felXmlUrl: res.xmlUrl ?? null,
        felEnvironment: provider.environment, felError: null,
      },
    })
    await saveDteXml(res.uuid, res.xml)
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
    where: {
      requiresInvoice: true, isVoided: false, felStatus: 'PENDING',
      AND: [
        // Contingency documents: until the SAT deadline (checked in certifySale).
        { OR: [{ createdAt: { gte: since }, felAttempts: { lt: cfg.maxAttempts } }, { felAccessNumber: { not: null } }] },
        { OR: [{ felLastAttemptAt: null }, { felLastAttemptAt: { lt: backoff } }] },
      ],
    },
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
