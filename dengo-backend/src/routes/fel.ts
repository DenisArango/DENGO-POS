// Facturación electrónica (FEL) — status, connection test, NIT lookup, manual
// certification retries, DTE preview, and notas de crédito.
// The certifier itself is configured per deployment in .env (lib/fel/config.ts).

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requirePermission } from '../lib/permissions.js'
import { canAccessBranch } from '../lib/branch-scope.js'
import { log } from '../services/audit.service.js'
import { updateStock } from '../services/inventory.service.js'
import { felConfig, felConfigSummary } from '../lib/fel/config.js'
import { buildDteForSale, DteBuildError, saleLineNets, type BuildSaleInput } from '../lib/fel/build.js'
import { certifySale, certifyCreditNote, refreshSaleFel, voidSaleFel, getProvider, contextFor, schoolReceiver, felBranchSelect } from '../lib/fel/service.js'
import { verifyFelDocKey } from '../lib/fel/doc-link.js'
import { renderDocumentPdf } from '../lib/fel/invoice-doc.js'
import { phraseText, contingencyDeadline, CONTINGENCY_TITLE, CONTINGENCY_FOOTER } from '../lib/fel/sat-rules.js'
import { isValidGtNit, normalizeNit } from '../lib/nit.js'

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

const dteSaleInclude = {
  customer: { select: { nit: true, name: true, email: true, address: true } },
  branch: { select: felBranchSelect },
  items: { include: { product: { select: { name: true } }, variation: { select: { name: true, isDefault: true, conversionFactor: true } } } },
  quotation: { select: { portalOrder: { select: { school: { select: { name: true, nit: true, invoiceName: true, address: true } } } } } },
} as const

export default async function felRoutes(fastify: FastifyInstance) {
  // GET /api/fel/status — configuration (no secrets), pending/failed counts.
  fastify.get('/status', { preHandler: [fastify.authenticate, requirePermission('sales.view')] }, async () => {
    const cfg = felConfig()
    const [pending, failed, voidFailed, notesPending] = await Promise.all([
      prisma.sale.count({ where: { requiresInvoice: true, isVoided: false, felStatus: 'PENDING' } }),
      prisma.sale.count({ where: { requiresInvoice: true, isVoided: false, felStatus: 'FAILED' } }),
      prisma.sale.count({ where: { felVoidStatus: 'FAILED' } }),
      prisma.creditNote.count({ where: { isCancelled: false, felStatus: { in: ['PENDING', 'FAILED'] } } }),
    ])
    const branches = await prisma.branch.findMany({ where: { status: 'active' }, select: { id: true, name: true, felEntityId: true, felEstablishmentCode: true }, orderBy: { name: 'asc' } })
    return {
      config: felConfigSummary(cfg),
      counts: { pending, failed, voidFailed, creditNotesPending: notesPending },
      branches: branches.map(b => (cfg.provider === 'digifact'
        ? { ...b, entityId: b.felEstablishmentCode || cfg.digifact.establishment, felEstablishmentCode: b.felEstablishmentCode || cfg.digifact.establishment, ready: true }
        : { ...b, entityId: b.felEntityId || cfg.defaultEntityId, ready: cfg.provider === 'mock' || !!(b.felEntityId || cfg.defaultEntityId) })),
    }
  })

  // POST /api/fel/test — talks to the certifier for each establishment (DTE credits left).
  fastify.post('/test', { preHandler: [fastify.authenticate, requirePermission('settings.system')] }, async (_request, reply) => {
    const cfg = felConfig()
    const provider = getProvider(cfg)
    if (!provider) return reply.status(400).send({ error: 'FEL no está activo en este servidor (FEL_PROVIDER=none)' })
    const branches = await prisma.branch.findMany({ where: { status: 'active' }, select: { id: true, ...felBranchSelect } })
    const results = []
    for (const b of branches) {
      const ctx = contextFor(b, cfg)
      if (!ctx) { results.push({ branch: b.name, ok: false, error: 'Sin empresa de FELplex configurada' }); continue }
      // Digifact has one login for every establishment: test it once.
      if (provider.name === 'digifact' && results.some(r => r.ok)) { results.push({ branch: b.name, entityId: ctx.entityId, ok: true, credits: null }); continue }
      try {
        const credits = await provider.credits(ctx)
        results.push({ branch: b.name, entityId: ctx.entityId, ok: true, credits })
      } catch (err: any) {
        results.push({ branch: b.name, entityId: ctx.entityId, ok: false, error: err?.message ?? String(err) })
      }
    }
    return { provider: provider.name, environment: provider.environment, results }
  })

  // GET /api/fel/doc/:uuid.pdf?k=… — our branded invoice drawn from the
  // certified XML (lib/fel/invoice-pdf.ts); &original=1 gives the certifier's
  // own PDF instead. No login: the signed key in the link is the access.
  fastify.get('/doc/:file', async (request, reply) => {
    const { file } = request.params as { file: string }
    const { k, original } = request.query as { k?: string; original?: string }
    const uuid = file.replace(/\.pdf$/i, '').toUpperCase()
    if (!/^[0-9A-F-]{36}$/.test(uuid) || !verifyFelDocKey(uuid, k)) return reply.status(404).send({ error: 'Documento no encontrado' })
    try {
      let pdf: Buffer | null = null
      if (original !== '1') pdf = await renderDocumentPdf(uuid)
      if (!pdf) {
        const cfg = felConfig()
        const provider = getProvider(cfg)
        const ctx = contextFor({}, cfg)
        if (provider?.pdf && ctx) pdf = await provider.pdf(uuid, ctx)
      }
      if (!pdf) return reply.status(404).send({ error: 'Documento no encontrado' })
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `inline; filename="DTE-${uuid}.pdf"`)
        // Short: the copy shows ANULADO once the sale is voided.
        .header('Cache-Control', 'private, max-age=300')
        .send(pdf)
    } catch (err: any) {
      request.log.error({ err }, 'FEL PDF')
      return reply.status(502).send({ error: `No se pudo generar el PDF: ${err?.message ?? err}` })
    }
  })

  // GET /api/fel/receipt-info — what the POS prints on a factura it builds
  // itself (contingency tickets, also offline): emisor, phrases, SAT legends.
  // Cached by the POS for offline use.
  let emisorNameCache: { nit: string; name: string | null } | null = null
  fastify.get('/receipt-info', { preHandler: [fastify.authenticate] }, async () => {
    const cfg = felConfig()
    const provider = getProvider(cfg)
    let emisorName = cfg.provider === 'digifact' ? cfg.digifact.sellerName : null
    if (cfg.provider === 'digifact' && !emisorName && cfg.digifact.nit) {
      if (emisorNameCache?.nit !== cfg.digifact.nit) {
        const ctx = contextFor({}, cfg)
        const found = provider && ctx ? await provider.lookupTaxId('NIT', cfg.digifact.nit, ctx).catch(() => null) : null
        if (found?.name) emisorNameCache = { nit: cfg.digifact.nit, name: found.name }
      }
      emisorName = emisorNameCache?.name ?? null
    }
    return {
      enabled: !!provider,
      contingency: !!provider?.supportsContingency,
      emisorNit: cfg.provider === 'digifact' ? cfg.digifact.nit : null,
      emisorName,
      phrases: (cfg.provider === 'digifact' ? cfg.digifact.frases : []).map(([t, e]) => phraseText(t, e)),
      contingencyTitle: CONTINGENCY_TITLE,
      contingencyFooter: CONTINGENCY_FOOTER,
    }
  })

  // GET /api/fel/contingencies?from&to — documents issued in contingency,
  // grouped into the periods the "Aviso de contingencia" asks for (SAT 4.1:
  // start, end, establishment, reason, number of documents).
  fastify.get('/contingencies', { preHandler: [fastify.authenticate, requirePermission('sales.view')] }, async (request) => {
    const q = request.query as { from?: string; to?: string }
    const to = q.to ? new Date(`${q.to}T23:59:59-06:00`) : new Date()
    const from = q.from ? new Date(`${q.from}T00:00:00-06:00`) : new Date(to.getTime() - 60 * 86_400_000)
    const docs = await prisma.sale.findMany({
      where: { felAccessNumber: { not: null }, felIssuedAt: { gte: from, lte: to } },
      select: {
        id: true, invoiceNumber: true, felAccessNumber: true, felIssuedAt: true, felStatus: true, felCertifiedAt: true,
        felSatSerie: true, felSatNumber: true, felContingencyReason: true, felContingencyNotifiedAt: true, isVoided: true, total: true,
        branch: { select: { id: true, name: true, felEstablishmentCode: true } },
      },
      orderBy: { felIssuedAt: 'asc' },
    })
    const cfg = felConfig()
    const GAP = 3 * 3600_000 // a new period once nothing went into contingency for 3 h
    const periods: any[] = []
    const lastByBranch = new Map<string, any>()
    for (const d of docs) {
      const at = d.felIssuedAt!.getTime()
      let p = lastByBranch.get(d.branch.id)
      if (!p || at - p.lastIssued > GAP) {
        p = {
          branchId: d.branch.id, branch: d.branch.name,
          establishment: d.branch.felEstablishmentCode || (cfg.provider === 'digifact' ? cfg.digifact.establishment : null),
          start: d.felIssuedAt, lastIssued: at, end: null as Date | null, reason: d.felContingencyReason, docs: [] as any[],
        }
        periods.push(p)
        lastByBranch.set(d.branch.id, p)
      }
      p.lastIssued = at
      p.docs.push({
        id: d.id, invoiceNumber: d.invoiceNumber, accessNumber: d.felAccessNumber, issuedAt: d.felIssuedAt, status: d.felStatus,
        certifiedAt: d.felCertifiedAt, serie: d.felSatSerie, number: d.felSatNumber, voided: d.isVoided, total: Number(d.total),
        notifiedAt: d.felContingencyNotifiedAt, deadline: contingencyDeadline(d.felIssuedAt!),
      })
    }
    return periods.map(p => {
      const certified = p.docs.filter((d: any) => d.certifiedAt)
      // The contingency ends when the certifier answered again: the first certification after the last document.
      const firstCert = certified.map((d: any) => new Date(d.certifiedAt).getTime()).filter((t: number) => t >= p.lastIssued).sort()[0]
      return {
        branchId: p.branchId, branch: p.branch, establishment: p.establishment,
        start: p.start, end: firstCert ? new Date(firstCert) : null, lastIssued: new Date(p.lastIssued),
        reason: p.reason, count: p.docs.length,
        certified: certified.length, pending: p.docs.filter((d: any) => d.status === 'PENDING').length,
        failed: p.docs.filter((d: any) => d.status === 'FAILED').length,
        notifiedAt: p.docs.every((d: any) => d.notifiedAt) ? p.docs[0].notifiedAt : null,
        docs: p.docs,
      }
    }).reverse()
  })

  // POST /api/fel/contingencies/notified { saleIds } — the Aviso de contingencia was filed.
  fastify.post('/contingencies/notified', { preHandler: [fastify.authenticate, requirePermission('settings.system')] }, async (request, reply) => {
    const body = z.object({ saleIds: z.array(z.string()).min(1), undo: z.boolean().optional() }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'Datos inválidos' })
    const r = await prisma.sale.updateMany({
      where: { id: { in: body.data.saleIds }, felAccessNumber: { not: null } },
      data: { felContingencyNotifiedAt: body.data.undo ? null : new Date() },
    })
    await log({ userId: request.user.id, action: body.data.undo ? 'FEL_CONTINGENCY_NOTICE_UNDO' : 'FEL_CONTINGENCY_NOTICE', entity: 'Sale', entityId: body.data.saleIds[0]!, newValues: { count: r.count } })
    return { updated: r.count }
  })

  // GET /api/fel/tax-id/:kind/:id — NIT / CUI → name, from the SAT through the certifier.
  fastify.get('/tax-id/:kind/:id', { preHandler: [fastify.authenticate, requirePermission('sales.create')] }, async (request, reply) => {
    const { kind, id } = request.params as { kind: string; id: string }
    const k = kind.toUpperCase() === 'CUI' ? 'CUI' : 'NIT'
    const clean = normalizeNit(id)
    if (k === 'NIT' && !isValidGtNit(clean)) return reply.status(400).send({ error: 'El NIT no es válido (dígito verificador incorrecto)', valid: false })
    if (k === 'CUI' && !/^\d{13}$/.test(clean)) return reply.status(400).send({ error: 'El CUI debe tener 13 dígitos', valid: false })
    const cfg = felConfig()
    const provider = getProvider(cfg)
    const branch = await prisma.branch.findUnique({ where: { id: request.user.branchId }, select: felBranchSelect })
    const ctx = branch ? contextFor(branch, cfg) : contextFor({}, cfg)
    if (!provider || !ctx) return { valid: true, found: false, taxId: clean, note: 'Consulta a la SAT no disponible (FEL no configurado)' }
    try {
      return { valid: true, ...(await provider.lookupTaxId(k, clean, ctx)) }
    } catch (err: any) {
      return reply.status(502).send({ error: `No se pudo consultar: ${err?.message ?? err}` })
    }
  })

  // GET /api/fel/sales/:id/preview — the DTE that would be sent, without sending it.
  fastify.get('/sales/:id/preview', { preHandler: [fastify.authenticate, requirePermission('sales.edit')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const sale = await prisma.sale.findUnique({ where: { id }, include: dteSaleInclude })
    if (!sale) return reply.status(404).send({ error: 'Venta no encontrada' })
    if (!canAccessBranch(request, sale.branchId)) return reply.status(403).send({ error: 'Acceso denegado' })
    try {
      const override = schoolReceiver(sale)
      const doc = buildDteForSale(sale as unknown as BuildSaleInput, felConfig(), override ? { receiverOverride: override } : {})
      return { doc }
    } catch (err: any) {
      return reply.status(400).send({ error: err instanceof DteBuildError ? err.message : String(err?.message ?? err) })
    }
  })

  // POST /api/fel/sales/:id/certify — manual (re)try of a PENDING/FAILED factura.
  fastify.post('/sales/:id/certify', { preHandler: [fastify.authenticate, requirePermission('sales.edit')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const sale = await prisma.sale.findUnique({ where: { id }, select: { branchId: true, requiresInvoice: true } })
    if (!sale) return reply.status(404).send({ error: 'Venta no encontrada' })
    if (!canAccessBranch(request, sale.branchId)) return reply.status(403).send({ error: 'Acceso denegado' })
    if (!sale.requiresInvoice) return reply.status(400).send({ error: 'Esta venta no tiene factura' })
    const out = await certifySale(id, { manual: true })
    await log({ userId: request.user.id, action: 'FEL_CERTIFY', entity: 'Sale', entityId: id, newValues: out })
    return out
  })

  // POST /api/fel/sales/:id/refresh — re-read the certified DTE (PDF link, SAT data).
  fastify.post('/sales/:id/refresh', { preHandler: [fastify.authenticate, requirePermission('sales.view')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const res = await refreshSaleFel(id)
    return res.ok ? res : reply.status(400).send({ error: res.error })
  })

  // POST /api/fel/sales/:id/void-retry — annul again a DTE whose annulment failed.
  fastify.post('/sales/:id/void-retry', { preHandler: [fastify.authenticate, requirePermission('sales.cancel')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const sale = await prisma.sale.findUnique({ where: { id }, select: { isVoided: true, voidReason: true, branchId: true } })
    if (!sale) return reply.status(404).send({ error: 'Venta no encontrada' })
    if (!canAccessBranch(request, sale.branchId)) return reply.status(403).send({ error: 'Acceso denegado' })
    if (!sale.isVoided) return reply.status(400).send({ error: 'La venta no está anulada' })
    const res = await voidSaleFel(id, sale.voidReason ?? 'Anulación de venta')
    return res.ok ? res : reply.status(400).send({ error: res.error })
  })

  // ── Notas de crédito ──────────────────────────────────────────────────────

  // GET /api/fel/sales/:id/credit-notes — notes of a sale + what each line can still be credited.
  fastify.get('/sales/:id/credit-notes', { preHandler: [fastify.authenticate, requirePermission('sales.view')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const sale = await prisma.sale.findUnique({ where: { id }, include: dteSaleInclude })
    if (!sale) return reply.status(404).send({ error: 'Venta no encontrada' })
    if (!canAccessBranch(request, sale.branchId)) return reply.status(403).send({ error: 'Acceso denegado' })
    const notes = await prisma.creditNote.findMany({
      where: { saleId: id },
      include: { items: true, createdBy: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    })
    return { notes, lines: creditableLines(sale, notes) }
  })

  // POST /api/fel/sales/:id/credit-notes — partial return / correction of a certified factura.
  fastify.post('/sales/:id/credit-notes', { preHandler: [fastify.authenticate, requirePermission('sales.cancel')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      reason: z.string().trim().min(3, 'Escribe el motivo').max(500),
      returnStock: z.boolean().default(true),
      items: z.array(z.object({ saleItemId: z.string(), quantity: z.number().positive() })).min(1, 'Elige al menos un producto'),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message ?? 'Datos inválidos' })

    const sale = await prisma.sale.findUnique({ where: { id }, include: dteSaleInclude })
    if (!sale) return reply.status(404).send({ error: 'Venta no encontrada' })
    if (!canAccessBranch(request, sale.branchId)) return reply.status(403).send({ error: 'Acceso denegado' })
    if (sale.isVoided) return reply.status(400).send({ error: 'La venta está anulada' })
    if (!sale.requiresInvoice || sale.felStatus !== 'CERTIFIED' || !sale.felUuid) {
      return reply.status(400).send({ error: 'Solo se emite nota de crédito sobre una factura certificada. Si la venta no tiene factura, anúlala o corrígela directamente.' })
    }

    const existing = await prisma.creditNote.findMany({ where: { saleId: id }, include: { items: true } })
    const lines = creditableLines(sale, existing)
    const chosen: { saleItemId: string; quantity: number; amount: number }[] = []
    for (const req of body.data.items) {
      const line = lines.find(l => l.saleItemId === req.saleItemId)
      if (!line) return reply.status(400).send({ error: 'Ese producto no es de esta venta' })
      if (req.quantity > line.remainingQty + 1e-9) return reply.status(400).send({ error: `${line.description}: solo quedan ${line.remainingQty} por acreditar` })
      // The last units take whatever is left so cents never drift.
      const amount = Math.abs(req.quantity - line.remainingQty) < 1e-9 ? line.remainingAmount : r2(line.unitNet * req.quantity)
      chosen.push({ saleItemId: req.saleItemId, quantity: req.quantity, amount })
    }
    const total = r2(chosen.reduce((s, c) => s + c.amount, 0))
    if (total <= 0) return reply.status(400).send({ error: 'El monto a acreditar es cero' })

    const note = await prisma.$transaction(async (tx) => {
      const last = await tx.creditNote.findFirst({ where: { branchId: sale.branchId }, orderBy: { number: 'desc' }, select: { number: true } })
      return tx.creditNote.create({
        data: {
          saleId: id, branchId: sale.branchId, number: (last?.number ?? 0) + 1,
          reason: body.data.reason, total, returnStock: body.data.returnStock, createdById: request.user.id,
          items: { create: chosen.map(c => ({ saleItemId: c.saleItemId, quantity: c.quantity, amount: c.amount })) },
        },
      })
    })

    if (body.data.returnStock) {
      for (const c of chosen) {
        const item = sale.items.find(i => i.id === c.saleItemId)
        if (!item?.productId) continue // out-of-catalog lines carry no stock
        const conv = Number(item.variation?.conversionFactor ?? 1)
        await updateStock(item.productId, sale.branchId, c.quantity * conv, {
          type: 'RETURN', performedById: request.user.id, referenceId: note.id, reason: `Nota de crédito NC-${note.number}: ${body.data.reason}`.slice(0, 250),
        })
      }
    }

    const out = await certifyCreditNote(note.id)
    await log({ userId: request.user.id, action: 'CREDIT_NOTE', entity: 'Sale', entityId: id, newValues: { creditNote: note.number, total, fel: out } })
    const fresh = await prisma.creditNote.findUnique({ where: { id: note.id }, include: { items: true } })
    return reply.status(201).send({ note: fresh, fel: out })
  })

  // POST /api/fel/credit-notes/:id/certify — manual retry.
  fastify.post('/credit-notes/:id/certify', { preHandler: [fastify.authenticate, requirePermission('sales.cancel')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const note = await prisma.creditNote.findUnique({ where: { id }, select: { branchId: true } })
    if (!note) return reply.status(404).send({ error: 'Nota de crédito no encontrada' })
    if (!canAccessBranch(request, note.branchId)) return reply.status(403).send({ error: 'Acceso denegado' })
    return certifyCreditNote(id, { manual: true })
  })

  // POST /api/fel/credit-notes/:id/cancel — drop a note that was never certified (undoes its stock return).
  fastify.post('/credit-notes/:id/cancel', { preHandler: [fastify.authenticate, requirePermission('sales.cancel')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const note = await prisma.creditNote.findUnique({ where: { id }, include: { items: { include: { saleItem: { include: { variation: { select: { conversionFactor: true } } } } } } } })
    if (!note) return reply.status(404).send({ error: 'Nota de crédito no encontrada' })
    if (!canAccessBranch(request, note.branchId)) return reply.status(403).send({ error: 'Acceso denegado' })
    if (note.isCancelled) return reply.status(400).send({ error: 'Ya está cancelada' })
    if (note.felStatus === 'CERTIFIED') return reply.status(400).send({ error: 'Ya está certificada en la SAT: no se puede cancelar' })
    const claimed = await prisma.creditNote.updateMany({ where: { id, isCancelled: false, felStatus: { not: 'CERTIFIED' } }, data: { isCancelled: true } })
    if (claimed.count === 0) return reply.status(409).send({ error: 'La nota cambió mientras tanto; recarga' })
    if (note.returnStock) {
      for (const ci of note.items) {
        if (!ci.saleItem.productId) continue
        const conv = Number(ci.saleItem.variation?.conversionFactor ?? 1)
        await updateStock(ci.saleItem.productId, note.branchId, -Number(ci.quantity) * conv, {
          type: 'OUT', performedById: request.user.id, referenceId: note.id, reason: `Nota de crédito NC-${note.number} cancelada`,
        })
      }
    }
    await log({ userId: request.user.id, action: 'CREDIT_NOTE_CANCEL', entity: 'CreditNote', entityId: id })
    return { ok: true }
  })
}

interface CreditableLine {
  saleItemId: string; description: string; quantity: number; paid: number; unitNet: number
  creditedQty: number; remainingQty: number; remainingAmount: number
}

/** Per sale line: what was paid, what was already credited, and what is left. */
function creditableLines(sale: any, notes: { isCancelled: boolean; items: { saleItemId: string; quantity: unknown; amount: unknown }[] }[]): CreditableLine[] {
  const nets = saleLineNets(sale)
  return sale.items.map((item: any, k: number) => {
    const qty = Number(item.quantity)
    const credited = notes.filter(n => !n.isCancelled).flatMap(n => n.items).filter(ci => ci.saleItemId === item.id)
    const creditedQty = credited.reduce((s, ci) => s + Number(ci.quantity), 0)
    const creditedAmount = r2(credited.reduce((s, ci) => s + Number(ci.amount), 0))
    const net = nets[k] ?? 0
    return {
      saleItemId: item.id,
      description: item.product?.name ?? item.customName ?? 'Producto',
      quantity: qty,
      paid: net,
      unitNet: qty > 0 ? net / qty : 0,
      creditedQty,
      remainingQty: Math.max(0, r2(qty - creditedQty)),
      remainingAmount: Math.max(0, r2(net - creditedAmount)),
    }
  })
}
