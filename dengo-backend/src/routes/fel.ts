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
import { certifySale, certifyCreditNote, refreshSaleFel, voidSaleFel, getProvider, contextFor, schoolReceiver } from '../lib/fel/service.js'
import { isValidGtNit, normalizeNit } from '../lib/nit.js'

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

const dteSaleInclude = {
  customer: { select: { nit: true, name: true, email: true, address: true } },
  branch: { select: { name: true, city: true, felEntityId: true } },
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
      branches: branches.map(b => ({ ...b, entityId: b.felEntityId || cfg.defaultEntityId, ready: cfg.provider === 'mock' || !!(b.felEntityId || cfg.defaultEntityId) })),
    }
  })

  // POST /api/fel/test — talks to the certifier for each establishment (DTE credits left).
  fastify.post('/test', { preHandler: [fastify.authenticate, requirePermission('settings.system')] }, async (_request, reply) => {
    const cfg = felConfig()
    const provider = getProvider(cfg)
    if (!provider) return reply.status(400).send({ error: 'FEL no está activo en este servidor (FEL_PROVIDER=none)' })
    const branches = await prisma.branch.findMany({ where: { status: 'active' }, select: { id: true, name: true, felEntityId: true } })
    const results = []
    for (const b of branches) {
      const ctx = contextFor(b, cfg)
      if (!ctx) { results.push({ branch: b.name, ok: false, error: 'Sin empresa de FELplex configurada' }); continue }
      try {
        const credits = await provider.credits(ctx)
        results.push({ branch: b.name, entityId: ctx.entityId, ok: true, credits })
      } catch (err: any) {
        results.push({ branch: b.name, entityId: ctx.entityId, ok: false, error: err?.message ?? String(err) })
      }
    }
    return { provider: provider.name, environment: provider.environment, results }
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
    const branch = await prisma.branch.findUnique({ where: { id: request.user.branchId }, select: { felEntityId: true } })
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
