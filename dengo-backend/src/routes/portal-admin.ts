import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { isValidGtNit, normalizeNit } from '../lib/nit.js'
import { prisma } from '../lib/prisma.js'
import { imageUrlsFor } from '../lib/productImages.js'
import { Prisma } from '@prisma/client'
import { log } from '../services/audit.service.js'
import { hashPassword } from '../services/auth.service.js'
import { isPerStudent, orderBalance, buildAdminOrderItems, lineCost, round2 } from '../lib/portalOrders.js'
import { notifyTeacherLater } from '../lib/webPush.js'

// ── Admin guard ──────────────────────────────────────────────────────────────
async function requireAdminGuard(request: FastifyRequest, reply: FastifyReply) {
  if ((request.user as any).role !== 'ADMIN') {
    return reply.status(403).send({ error: 'Acceso denegado' })
  }
}

const orderInclude = {
  teacher: { include: { user: { select: { id: true, name: true, email: true } } } },
  school: true,
  approvedBy: { select: { id: true, name: true } },
  items: { include: { product: { select: { cost: true } } } },
  grades: true,
}

// Adds what the provider needs to see at a glance: whether the order is a
// per-student kit and whether it adds up to what the program allows.
async function withBalance<T extends { programType: string; totalAmount: unknown; studentCount: number | null; items?: { qtyPerStudent: unknown; unitCost?: unknown; quantity: unknown; product?: { cost?: unknown } | null }[] }>(orders: T[]) {
  const programs = await prisma.programConfig.findMany({ where: { type: { in: [...new Set(orders.map(o => o.programType))] } } })
  const byType = new Map(programs.map(p => [p.type, p]))
  return orders.map(o => {
    const program = byType.get(o.programType)
    const perStudent = o.items?.some(i => i.qtyPerStudent != null) ?? false
    const totalCost = round2((o.items ?? []).reduce((s, i) => s + lineCost(i), 0))
    return {
      ...o,
      perStudent,
      balance: orderBalance(program, o.totalAmount, o.studentCount ?? 0),
      totalCost,
      profit: round2(Number(o.totalAmount) - totalCost),
    }
  })
}

export default async function portalAdminRoutes(fastify: FastifyInstance) {
  const requireAdmin = { preHandler: [fastify.authenticate, requireAdminGuard] }

  // ── Stats ───────────────────────────────────────────────────────────────────
  fastify.get('/stats', requireAdmin, async (_request, reply) => {
    const pendingOrders = await prisma.portalOrder.count({ where: { status: 'PENDING' } })
    return reply.send({ pendingOrders })
  })

  // ── Orders list ───────────────────────────────────────────────────────────────
  fastify.get('/orders', requireAdmin, async (request, reply) => {
    const q = request.query as { status?: string; page?: string; limit?: string }
    const page = Math.max(1, Number(q.page ?? 1))
    const limit = Math.min(200, Math.max(1, Number(q.limit ?? 20)))

    const where: any = { ...(q.status ? { status: q.status } : {}) }
    const [total, orders] = await Promise.all([
      prisma.portalOrder.count({ where }),
      prisma.portalOrder.findMany({
        where,
        include: orderInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ])
    return reply.send({ data: await withBalance(orders), total, page, limit })
  })

  // ── Order detail ─────────────────────────────────────────────────────────────
  fastify.get('/orders/:id', requireAdmin, async (request, reply) => {
    const { id } = request.params as { id: string }
    const order = await prisma.portalOrder.findUnique({ where: { id }, include: orderInclude })
    if (!order) return reply.status(404).send({ error: 'Pedido no encontrado' })
    return reply.send((await withBalance([order]))[0])
  })

  // ── Correct an order (provider side) ─────────────────────────────────────────
  // The teacher never edits a sent order: they leave notes/messages and the
  // provider fixes products or student counts here, before quoting. For a
  // per-student kit order, item quantities are per student.
  fastify.put('/orders/:id', requireAdmin, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      grades: z.array(z.object({ gradeName: z.string().trim().min(1), studentCount: z.number().int().positive() })).min(1),
      items: z.array(z.object({
        productId: z.string().min(1).optional(),
        customName: z.string().trim().max(200).optional(), // product not in the catalog
        quantity: z.number().positive(),
        unitPrice: z.number().min(0).optional(),
        unitCost: z.number().min(0).optional(),
      })).min(1, 'El pedido debe tener al menos un producto'),
      perStudent: z.boolean().optional(),
      message: z.string().trim().optional(), // optional note sent to the teacher's inbox
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message ?? 'Datos inválidos' })

    const order = await prisma.portalOrder.findUnique({ where: { id }, include: { items: true, grades: true } })
    if (!order) return reply.status(404).send({ error: 'Pedido no encontrado' })
    if (!['PENDING', 'APPROVED'].includes(order.status)) {
      return reply.status(400).send({ error: 'Solo se pueden corregir pedidos en revisión o aprobados (antes de cotizar)' })
    }

    const program = await prisma.programConfig.findFirst({ where: { type: order.programType } })
    const wasPerStudent = order.items.some(i => i.qtyPerStudent != null)
    const perStudent = body.data.perStudent ?? (order.items.length ? wasPerStudent : (program ? isPerStudent(program) : false))
    const totalStudents = body.data.grades.reduce((s, g) => s + g.studentCount, 0)
    const built = await buildAdminOrderItems(body.data.items, perStudent, totalStudents)
    if ('error' in built) return reply.status(400).send({ error: built.error })

    const oldValues = {
      totalAmount: Number(order.totalAmount),
      studentCount: order.studentCount,
      grades: order.grades.map(g => `${g.gradeName}: ${g.studentCount}`),
      items: order.items.map(i => `${i.productName} x ${Number(i.qtyPerStudent ?? i.quantity)}`),
    }
    const updated = await prisma.$transaction(async tx => {
      await tx.portalOrderItem.deleteMany({ where: { portalOrderId: id } })
      await tx.portalOrderGrade.deleteMany({ where: { portalOrderId: id } })
      const o = await tx.portalOrder.update({
        where: { id },
        data: {
          studentCount: totalStudents,
          orderGradeSummary: body.data.grades.map(g => `${g.gradeName}: ${g.studentCount}`).join(', '),
          totalAmount: built.totalAmount,
          adjustedAt: new Date(),
          items: { create: built.items },
          grades: { create: body.data.grades },
        },
        include: orderInclude,
      })
      if (body.data.message) {
        await tx.portalMessage.create({
          data: { teacherId: order.teacherId, senderRole: 'ADMIN', body: body.data.message, portalOrderId: id, isRead: false },
        })
      }
      return o
    })
    notifyTeacherLater(order.teacherId, {
      title: `Ajustamos tu pedido ${order.orderNumber}`,
      body: body.data.message || 'El proveedor corrigió productos o alumnos. Toca para ver el pedido.',
      url: `/orders/${id}`,
      tag: `order-${id}`,
    })
    await log({
      userId: (request.user as any).id, action: 'UPDATE', entity: 'PortalOrder', entityId: id,
      oldValues, newValues: { totalAmount: built.totalAmount, studentCount: totalStudents },
    })
    return reply.send((await withBalance([updated]))[0])
  })

  // ── Approve ──────────────────────────────────────────────────────────────────
  fastify.put('/orders/:id/approve', requireAdmin, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      adminNotes: z.string().optional(),
      deliveryDate: z.string().min(1, 'La fecha de entrega es requerida'),
      deliveryTime: z.string().min(1, 'La hora de entrega es requerida'),
      deliveryNotes: z.string().optional(),
    }).safeParse(request.body ?? {})
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const order = await prisma.portalOrder.findUnique({ where: { id } })
    if (!order) return reply.status(404).send({ error: 'Pedido no encontrado' })
    if (order.status !== 'PENDING') return reply.status(400).send({ error: 'Solo se pueden aprobar pedidos pendientes' })

    const updated = await prisma.portalOrder.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedById: (request.user as any).id,
        approvedAt: new Date(),
        deliveryDate: new Date(body.data.deliveryDate),
        deliveryTime: body.data.deliveryTime,
        deliveryNotes: body.data.deliveryNotes ?? null,
        ...(body.data.adminNotes !== undefined ? { adminNotes: body.data.adminNotes } : {}),
      },
      include: orderInclude,
    })
    await log({ userId: (request.user as any).id, action: 'APPROVE', entity: 'PortalOrder', entityId: id })
    notifyTeacherLater(order.teacherId, {
      title: `Tu pedido ${order.orderNumber} fue aprobado`,
      body: `Entrega: ${new Date(body.data.deliveryDate).toLocaleDateString('es-GT', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })} a las ${body.data.deliveryTime}.`,
      url: `/orders/${id}`,
      tag: `order-${id}`,
    })
    return reply.send(updated)
  })

  // ── Reject ───────────────────────────────────────────────────────────────────
  fastify.put('/orders/:id/reject', requireAdmin, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({ adminNotes: z.string().min(1) }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'Debe indicar el motivo del rechazo' })

    const order = await prisma.portalOrder.findUnique({ where: { id } })
    if (!order) return reply.status(404).send({ error: 'Pedido no encontrado' })
    if (order.status !== 'PENDING') return reply.status(400).send({ error: 'Solo se pueden rechazar pedidos pendientes' })

    const updated = await prisma.portalOrder.update({
      where: { id },
      data: { status: 'REJECTED', adminNotes: body.data.adminNotes },
      include: orderInclude,
    })
    await log({ userId: (request.user as any).id, action: 'REJECT', entity: 'PortalOrder', entityId: id })
    notifyTeacherLater(order.teacherId, {
      title: `Tu pedido ${order.orderNumber} no fue aprobado`,
      body: body.data.adminNotes,
      url: `/orders/${id}`,
      tag: `order-${id}`,
    })
    return reply.send(updated)
  })

  // ── Create quotation from order ────────────────────────────────────────────────
  fastify.post('/orders/:id/quote', requireAdmin, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      branchId: z.string().min(1),
      customerId: z.string().min(1),
      validUntil: z.string().min(1),
      discount: z.number().min(0).optional(),
      notes: z.string().optional(),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const order = await prisma.portalOrder.findUnique({ where: { id }, include: { items: true } })
    if (!order) return reply.status(404).send({ error: 'Pedido no encontrado' })
    if (order.items.length === 0) return reply.status(400).send({ error: 'El pedido no tiene productos' })

    const subtotal = order.items.reduce((s, it) => s + Number(it.total), 0)
    const discount = body.data.discount ?? 0
    const total = Number((subtotal - discount).toFixed(2))

    // Generate quotation number: COT-YYYY-NNN
    const year = new Date().getFullYear()
    const prefix = `COT-${year}`
    const count = await prisma.quotation.count({ where: { quotationNumber: { startsWith: prefix } } })
    const quotationNumber = `${prefix}-${String(count + 1).padStart(3, '0')}`

    const quotation = await prisma.quotation.create({
      data: {
        quotationNumber,
        branchId: body.data.branchId,
        customerId: body.data.customerId,
        subtotal: Number(subtotal.toFixed(2)),
        tax: 0,
        discount,
        total,
        status: 'DRAFT',
        validUntil: new Date(body.data.validUntil),
        notes: body.data.notes ?? `Generada desde pedido del portal ${order.orderNumber}`,
        createdById: (request.user as any).id,
        items: {
          create: order.items.map(it => ({
            // A product typed in by the provider becomes a custom quotation line.
            ...(it.productId ? { productId: it.productId } : { customName: it.productName }),
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            discount: 0,
            total: it.total,
          })),
        },
      },
      include: {
        branch: true,
        customer: true,
        items: { include: { product: { select: { id: true, name: true } } } },
      },
    })

    await prisma.portalOrder.update({ where: { id }, data: { status: 'QUOTED', quotationId: quotation.id } })
    await log({ userId: (request.user as any).id, action: 'QUOTE', entity: 'PortalOrder', entityId: id, newValues: { quotationId: quotation.id } })
    return reply.status(201).send(quotation)
  })

  // ── Send the quotation / invoice to the teacher through the inbox ────────────
  // The teacher opens it from Mensajes (a printable page in the portal) and
  // gets a phone notification if they turned them on.
  fastify.post('/orders/:id/send-document', requireAdmin, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({ kind: z.enum(['QUOTATION', 'INVOICE']), message: z.string().trim().max(2000).optional() }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'Datos inválidos' })

    const order = await prisma.portalOrder.findUnique({
      where: { id },
      include: { quotation: { include: { convertedToSale: true } } },
    })
    if (!order) return reply.status(404).send({ error: 'Pedido no encontrado' })
    if (!order.quotation) return reply.status(400).send({ error: 'Este pedido todavía no tiene cotización' })

    const quotation = order.quotation
    const sale = quotation.convertedToSale
    if (body.data.kind === 'INVOICE' && (!sale || !sale.requiresInvoice)) {
      return reply.status(400).send({ error: 'La venta de este pedido todavía no tiene factura' })
    }
    const label = body.data.kind === 'QUOTATION'
      ? `Cotización ${quotation.quotationNumber}`
      : `Factura ${sale!.invoiceSeries ?? ''}-${sale!.invoiceSeqNumber ?? sale!.invoiceNumber}`
    const msg = await prisma.portalMessage.create({
      data: {
        teacherId: order.teacherId,
        senderRole: 'ADMIN',
        kind: body.data.kind,
        quotationId: body.data.kind === 'QUOTATION' ? quotation.id : null,
        saleId: body.data.kind === 'INVOICE' ? sale!.id : null,
        body: body.data.message || `Te enviamos la ${label.toLowerCase().startsWith('cot') ? 'cotización' : 'factura'} de tu pedido ${order.orderNumber}.`,
        portalOrderId: id,
        isRead: false,
      },
      include: { portalOrder: { select: { orderNumber: true } } },
    })
    if (body.data.kind === 'QUOTATION' && quotation.status === 'DRAFT') {
      await prisma.quotation.update({ where: { id: quotation.id }, data: { status: 'SENT' } })
    }
    await log({ userId: (request.user as any).id, action: 'SEND_DOCUMENT', entity: 'PortalOrder', entityId: id, newValues: { kind: body.data.kind } })
    notifyTeacherLater(order.teacherId, { title: `${label} · ${order.orderNumber}`, body: msg.body, url: '/messages', tag: `doc-${msg.id}` })
    return reply.status(201).send(msg)
  })

  // ── Profit metrics by school / program / teacher ────────────────────────────
  // Cost is the provider's own number (frozen per line, or the catalog cost),
  // never shown to teachers. Rejected orders don't count; pending ones are
  // reported apart since they can still change.
  fastify.get('/metrics', requireAdmin, async (request, reply) => {
    const q = request.query as { year?: string; programType?: string }
    const year = Number(q.year ?? new Date().getFullYear())
    const orders = await prisma.portalOrder.findMany({
      where: {
        status: { not: 'REJECTED' },
        createdAt: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) },
        ...(q.programType ? { programType: q.programType } : {}),
      },
      include: {
        school: { select: { id: true, name: true, municipio: true } },
        teacher: { include: { user: { select: { name: true } } } },
        items: { include: { product: { select: { cost: true } } } },
      },
    })

    type Row = { key: string; label: string; sub?: string | null; orders: number; students: number; revenue: number; cost: number; pendingRevenue: number }
    const empty = (key: string, label: string, sub?: string | null): Row => ({ key, label, sub: sub ?? null, orders: 0, students: 0, revenue: 0, cost: 0, pendingRevenue: 0 })
    const bySchool = new Map<string, Row>(), byProgram = new Map<string, Row>(), byTeacher = new Map<string, Row>(), byMonth = new Map<string, Row>()
    const byProduct = new Map<string, { name: string; quantity: number; revenue: number; cost: number; custom: boolean }>()
    const totals = empty('total', 'Total')

    for (const o of orders) {
      const revenue = Number(o.totalAmount)
      const cost = o.items.reduce((s, i) => s + lineCost(i), 0)
      const pending = o.status === 'PENDING'
      const month = `${o.createdAt.getFullYear()}-${String(o.createdAt.getMonth() + 1).padStart(2, '0')}`
      const targets: [Map<string, Row>, string, string, string | null][] = [
        [bySchool, o.schoolId, o.school.name, o.school.municipio],
        [byProgram, o.programType, o.programType, null],
        [byTeacher, o.teacherId, o.teacher.user?.name ?? '—', null],
        [byMonth, month, month, null],
      ]
      for (const [map, key, label, sub] of [...targets, [new Map([['total', totals]]), 'total', 'Total', null] as [Map<string, Row>, string, string, string | null]]) {
        const row = map.get(key) ?? empty(key, label, sub)
        row.orders++
        row.students += o.studentCount ?? 0
        if (pending) row.pendingRevenue += revenue
        else { row.revenue += revenue; row.cost += cost }
        map.set(key, row)
      }
      if (!pending) {
        for (const i of o.items) {
          const key = i.productId ?? `custom:${i.productName.toLowerCase()}`
          const p = byProduct.get(key) ?? { name: i.productName, quantity: 0, revenue: 0, cost: 0, custom: !i.productId }
          p.quantity += Number(i.quantity)
          p.revenue += Number(i.total)
          p.cost += lineCost(i)
          byProduct.set(key, p)
        }
      }
    }
    const finish = (r: Row) => ({
      ...r,
      revenue: round2(r.revenue), cost: round2(r.cost), pendingRevenue: round2(r.pendingRevenue),
      profit: round2(r.revenue - r.cost),
      marginPct: r.revenue > 0 ? round2(((r.revenue - r.cost) / r.revenue) * 100) : null,
    })
    const sortByRevenue = (rows: Row[]) => rows.map(finish).sort((a, b) => b.revenue - a.revenue || b.pendingRevenue - a.pendingRevenue)
    return reply.send({
      year,
      totals: finish(totals),
      bySchool: sortByRevenue([...bySchool.values()]),
      byProgram: sortByRevenue([...byProgram.values()]),
      byTeacher: sortByRevenue([...byTeacher.values()]),
      byMonth: [...byMonth.values()].map(finish).sort((a, b) => a.key.localeCompare(b.key)),
      byProduct: [...byProduct.values()]
        .map(p => ({ ...p, quantity: round2(p.quantity), revenue: round2(p.revenue), cost: round2(p.cost), profit: round2(p.revenue - p.cost) }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 50),
    })
  })

  // ── Teachers ──────────────────────────────────────────────────────────────────
  fastify.get('/teachers', requireAdmin, async (request, reply) => {
    const q = request.query as { isActive?: string }
    const where: any = {}
    if (q.isActive === 'true') where.isActive = true
    if (q.isActive === 'false') where.isActive = false

    const teachers = await prisma.teacher.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, isActive: true, branchId: true } },
        schools: { where: { isActive: true }, include: { school: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return reply.send(teachers)
  })

  fastify.post('/teachers', requireAdmin, async (request, reply) => {
    const body = z.object({
      name: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(6),
      phone: z.string().optional(),
      branchId: z.string().min(1),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const existing = await prisma.user.findUnique({ where: { email: body.data.email } })
    if (existing) return reply.status(409).send({ error: 'El email ya está registrado' })

    const passwordHash = await hashPassword(body.data.password)

    const result = await prisma.$transaction(async tx => {
      const user = await tx.user.create({
        data: {
          name: body.data.name,
          email: body.data.email,
          passwordHash,
          role: 'TEACHER',
          branchId: body.data.branchId,
          isActive: true,
        },
      })
      const teacher = await tx.teacher.create({
        data: { userId: user.id, phone: body.data.phone ?? null, isActive: true },
      })
      return { user, teacher }
    })

    await log({ userId: (request.user as any).id, action: 'CREATE', entity: 'Teacher', entityId: result.teacher.id })
    return reply.status(201).send({
      id: result.teacher.id,
      phone: result.teacher.phone,
      isActive: result.teacher.isActive,
      user: { id: result.user.id, name: result.user.name, email: result.user.email, branchId: result.user.branchId },
    })
  })

  fastify.put('/teachers/:id', requireAdmin, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      name: z.string().min(1).optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      isActive: z.boolean().optional(),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const teacher = await prisma.teacher.findUnique({ where: { id } })
    if (!teacher) return reply.status(404).send({ error: 'Maestro no encontrado' })

    const updated = await prisma.$transaction(async tx => {
      const t = await tx.teacher.update({
        where: { id },
        data: {
          ...(body.data.phone !== undefined ? { phone: body.data.phone } : {}),
          ...(body.data.isActive !== undefined ? { isActive: body.data.isActive } : {}),
        },
      })
      if (body.data.name !== undefined || body.data.email !== undefined || body.data.isActive !== undefined) {
        await tx.user.update({
          where: { id: teacher.userId },
          data: {
            ...(body.data.name !== undefined ? { name: body.data.name } : {}),
            ...(body.data.email !== undefined ? { email: body.data.email } : {}),
            ...(body.data.isActive !== undefined ? { isActive: body.data.isActive } : {}),
          },
        })
      }
      return t
    })

    await log({ userId: (request.user as any).id, action: 'UPDATE', entity: 'Teacher', entityId: id })
    return reply.send(updated)
  })

  // ── Teacher school assignments ─────────────────────────────────────────────────
  fastify.post('/teachers/:id/schools', requireAdmin, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      schoolId: z.string().min(1),
      grade: z.string().optional(),
      section: z.string().optional(),
      educationalLevel: z.string().optional(),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const teacher = await prisma.teacher.findUnique({ where: { id } })
    if (!teacher) return reply.status(404).send({ error: 'Maestro no encontrado' })

    const existing = await prisma.teacherSchool.findFirst({
      where: { teacherId: id, schoolId: body.data.schoolId, grade: body.data.grade ?? null },
    })

    let assignment
    if (existing) {
      assignment = await prisma.teacherSchool.update({
        where: { id: existing.id },
        data: {
          isActive: true,
          section: body.data.section ?? null,
          ...(body.data.educationalLevel !== undefined ? { educationalLevel: body.data.educationalLevel } : {}),
        },
        include: { school: { select: { id: true, name: true } } },
      })
    } else {
      assignment = await prisma.teacherSchool.create({
        data: {
          teacherId: id,
          schoolId: body.data.schoolId,
          grade: body.data.grade ?? null,
          section: body.data.section ?? null,
          educationalLevel: body.data.educationalLevel ?? null,
          isActive: true,
        },
        include: { school: { select: { id: true, name: true } } },
      })
    }
    return reply.status(201).send(assignment)
  })

  fastify.delete('/teachers/:id/schools/:schoolId', requireAdmin, async (request, reply) => {
    const { id, schoolId } = request.params as { id: string; schoolId: string }
    const q = request.query as { grade?: string }
    const assignments = await prisma.teacherSchool.updateMany({
      where: {
        teacherId: id,
        schoolId,
        ...(q.grade !== undefined ? { grade: q.grade } : {}),
      },
      data: { isActive: false },
    })
    if (assignments.count === 0) return reply.status(404).send({ error: 'Asignación no encontrada' })
    return reply.send({ message: 'Asignación eliminada' })
  })

  // ── Schools ────────────────────────────────────────────────────────────────────
  fastify.get('/schools', requireAdmin, async (_request, reply) => {
    return reply.send(await prisma.school.findMany({ orderBy: { name: 'asc' } }))
  })

  const schoolSchema = z.object({
    name: z.string().min(1),
    code: z.string().optional(),
    address: z.string().optional(),
    municipio: z.string().optional(),
    departamento: z.string().optional(),
    opfContact: z.string().optional(),
    opfPhone: z.string().optional(),
    // Who its facturas go to (FEL): the school's NIT and the name registered with it.
    nit: z.string().trim().max(30).optional(),
    invoiceName: z.string().trim().max(200).optional(),
    isActive: z.boolean().optional(),
  })

  fastify.post('/schools', requireAdmin, async (request, reply) => {
    const body = schoolSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    if (body.data.nit && !isValidGtNit(body.data.nit)) return reply.status(400).send({ error: 'El NIT de la escuela no es válido (dígito verificador)' })
    const school = await prisma.school.create({
      data: {
        name: body.data.name,
        code: body.data.code ?? null,
        address: body.data.address ?? null,
        municipio: body.data.municipio ?? null,
        departamento: body.data.departamento ?? null,
        opfContact: body.data.opfContact ?? null,
        opfPhone: body.data.opfPhone ?? null,
        nit: body.data.nit ? normalizeNit(body.data.nit) : null,
        invoiceName: body.data.invoiceName || null,
        ...(body.data.isActive !== undefined ? { isActive: body.data.isActive } : {}),
      },
    })
    await log({ userId: (request.user as any).id, action: 'CREATE', entity: 'School', entityId: school.id })
    return reply.status(201).send(school)
  })

  fastify.put('/schools/:id', requireAdmin, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = schoolSchema.partial().safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    if (body.data.nit && !isValidGtNit(body.data.nit)) return reply.status(400).send({ error: 'El NIT de la escuela no es válido (dígito verificador)' })
    try {
      const school = await prisma.school.update({
        where: { id },
        data: {
          ...(body.data.name !== undefined ? { name: body.data.name } : {}),
          ...(body.data.code !== undefined ? { code: body.data.code } : {}),
          ...(body.data.address !== undefined ? { address: body.data.address } : {}),
          ...(body.data.municipio !== undefined ? { municipio: body.data.municipio } : {}),
          ...(body.data.departamento !== undefined ? { departamento: body.data.departamento } : {}),
          ...(body.data.opfContact !== undefined ? { opfContact: body.data.opfContact } : {}),
          ...(body.data.opfPhone !== undefined ? { opfPhone: body.data.opfPhone } : {}),
          ...(body.data.nit !== undefined ? { nit: body.data.nit ? normalizeNit(body.data.nit) : null } : {}),
          ...(body.data.invoiceName !== undefined ? { invoiceName: body.data.invoiceName || null } : {}),
          ...(body.data.isActive !== undefined ? { isActive: body.data.isActive } : {}),
        },
      })
      await log({ userId: (request.user as any).id, action: 'UPDATE', entity: 'School', entityId: id })
      return reply.send(school)
    } catch {
      return reply.status(404).send({ error: 'Escuela no encontrada' })
    }
  })

  // ── Programs ─────────────────────────────────────────────────────────────────────
  fastify.get('/programs', requireAdmin, async (_request, reply) => {
    const programs = await prisma.programConfig.findMany({ orderBy: { name: 'asc' } })
    return reply.send(programs.map(p => ({
      ...p,
      maxAmountPerTeacher: p.maxAmountPerTeacher ? Number(p.maxAmountPerTeacher) : null,
      limitPerStudent: p.limitPerStudent ? Number(p.limitPerStudent) : null,
      perStudent: isPerStudent(p),
      allowedCategoryIds: p.allowedCategoryIds ? safeParseArray(p.allowedCategoryIds) : [],
    })))
  })

  const programBodySchema = z.object({
    type: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    maxAmountPerTeacher: z.number().min(0).nullable().optional(),
    limitPerStudent: z.number().min(0).nullable().optional(),
    allowedCategoryIds: z.array(z.string()).optional(),
    perStudent: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })

  fastify.post('/programs', requireAdmin, async (request, reply) => {
    const body = programBodySchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const program = await prisma.programConfig.create({
      data: {
        type: body.data.type,
        name: body.data.name,
        description: body.data.description ?? null,
        maxAmountPerTeacher: body.data.maxAmountPerTeacher ?? null,
        limitPerStudent: body.data.limitPerStudent ?? null,
        allowedCategoryIds: body.data.allowedCategoryIds && body.data.allowedCategoryIds.length > 0
          ? JSON.stringify(body.data.allowedCategoryIds)
          : null,
        ...(body.data.perStudent !== undefined ? { perStudent: body.data.perStudent } : {}),
        isActive: body.data.isActive ?? true,
      },
    })
    await log({ userId: (request.user as any).id, action: 'CREATE', entity: 'ProgramConfig', entityId: program.id })
    return reply.status(201).send(program)
  })

  fastify.put('/programs/:id', requireAdmin, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = programBodySchema.partial().safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    try {
      const program = await prisma.programConfig.update({
        where: { id },
        data: {
          ...(body.data.type !== undefined ? { type: body.data.type } : {}),
          ...(body.data.name !== undefined ? { name: body.data.name } : {}),
          ...(body.data.description !== undefined ? { description: body.data.description } : {}),
          ...(body.data.maxAmountPerTeacher !== undefined ? { maxAmountPerTeacher: body.data.maxAmountPerTeacher } : {}),
          ...(body.data.limitPerStudent !== undefined ? { limitPerStudent: body.data.limitPerStudent } : {}),
          ...(body.data.allowedCategoryIds !== undefined ? {
            allowedCategoryIds: body.data.allowedCategoryIds.length > 0 ? JSON.stringify(body.data.allowedCategoryIds) : null,
          } : {}),
          ...(body.data.perStudent !== undefined ? { perStudent: body.data.perStudent } : {}),
          ...(body.data.isActive !== undefined ? { isActive: body.data.isActive } : {}),
        },
      })
      await log({ userId: (request.user as any).id, action: 'UPDATE', entity: 'ProgramConfig', entityId: id })
      return reply.send(program)
    } catch {
      return reply.status(404).send({ error: 'Programa no encontrado' })
    }
  })

  // ── Program Options ─────────────────────────────────────────────────────────────
  fastify.get('/program-options', requireAdmin, async (request, reply) => {
    const q = request.query as { programType?: string }
    const options = await prisma.programOption.findMany({
      where: q.programType ? { programType: q.programType } : {},
      include: {
        items: {
          include: { product: { select: { id: true, name: true, basePrice: true } } },
        },
        levels: true,
      },
      orderBy: [{ programType: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    })
    const images = await imageUrlsFor(options.flatMap(o => o.items.map(i => i.product.id)), request)
    return reply.send(options.map(o => ({
      id: o.id,
      programType: o.programType,
      name: o.name,
      description: o.description,
      isActive: o.isActive,
      sortOrder: o.sortOrder,
      createdAt: o.createdAt,
      levels: o.levels.map(l => l.level),
      items: o.items.map(i => ({
        id: i.id,
        productId: i.productId,
        productName: i.productName,
        quantity: Number(i.quantity),
        basePrice: Number(i.product.basePrice),
        imageUrl: images.get(i.product.id) ?? null,
      })),
    })))
  })

  // Kits teachers actually ordered before, most common first: offered (never
  // pushed) on the packages screen so the provider can turn one into a
  // package with a click. Kits identical to an existing package are skipped.
  fastify.get('/program-options/suggestions', requireAdmin, async (request, reply) => {
    const q = request.query as { programType?: string }
    if (!q.programType) return reply.send([])
    const [orders, options] = await Promise.all([
      prisma.portalOrder.findMany({
        where: { programType: q.programType, status: { not: 'REJECTED' } },
        select: { createdAt: true, items: { select: { productId: true, productName: true, quantity: true, qtyPerStudent: true } } },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      prisma.programOption.findMany({ where: { programType: q.programType }, include: { items: true } }),
    ])
    const signature = (items: { productId: string; quantity: number }[]) =>
      items.map(i => `${i.productId}:${i.quantity}`).sort().join('|')
    const existing = new Set(options.map(o => signature(o.items.map(i => ({ productId: i.productId, quantity: Number(i.quantity) })))))

    const groups = new Map<string, { items: { productId: string; productName: string; quantity: number }[]; count: number; years: Set<number> }>()
    for (const o of orders) {
      if (o.items.length === 0) continue
      // A kit order's composition is its per-student kit; older orders only
      // have the quantity the teacher picked.
      const items = o.items
        .filter((i): i is typeof i & { productId: string } => !!i.productId) // typed-in products can't go in a package
        .map(i => ({ productId: i.productId, productName: i.productName, quantity: Number(i.qtyPerStudent ?? i.quantity) }))
      if (items.length === 0) continue
      const key = signature(items)
      if (existing.has(key)) continue
      const g = groups.get(key) ?? { items, count: 0, years: new Set<number>() }
      g.count++
      g.years.add(o.createdAt.getFullYear())
      groups.set(key, g)
    }
    const top = [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 5)
    const prices = await prisma.product.findMany({
      where: { id: { in: [...new Set(top.flatMap(g => g.items.map(i => i.productId)))] }, isActive: true },
      select: { id: true, basePrice: true },
    })
    const priceById = new Map(prices.map(p => [p.id, Number(p.basePrice)]))
    return reply.send(top
      .map(g => ({
        orderCount: g.count,
        years: [...g.years].sort(),
        // Products deleted since then can't go in a new package.
        items: g.items.filter(i => priceById.has(i.productId)).map(i => ({ ...i, basePrice: priceById.get(i.productId)! })),
      }))
      .filter(g => g.items.length > 0))
  })

  const programOptionBody = z.object({
    programType: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional().nullable(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).optional(),
    levels: z.array(z.string()).optional(),
  })

  fastify.post('/program-options', requireAdmin, async (request, reply) => {
    const body = programOptionBody.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const option = await prisma.programOption.create({
      data: {
        programType: body.data.programType,
        name: body.data.name,
        description: body.data.description ?? null,
        isActive: body.data.isActive ?? true,
        sortOrder: body.data.sortOrder ?? 0,
      },
    })
    if (body.data.levels && body.data.levels.length > 0) {
      await prisma.programOptionLevel.createMany({
        data: body.data.levels.map(level => ({ programOptionId: option.id, level })),
        skipDuplicates: true,
      })
    }
    await log({ userId: (request.user as any).id, action: 'CREATE', entity: 'ProgramOption', entityId: option.id })
    return reply.status(201).send(option)
  })

  fastify.put('/program-options/:id', requireAdmin, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = programOptionBody.partial().safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    try {
      const option = await prisma.programOption.update({
        where: { id },
        data: {
          ...(body.data.programType !== undefined ? { programType: body.data.programType } : {}),
          ...(body.data.name !== undefined ? { name: body.data.name } : {}),
          ...(body.data.description !== undefined ? { description: body.data.description } : {}),
          ...(body.data.isActive !== undefined ? { isActive: body.data.isActive } : {}),
          ...(body.data.sortOrder !== undefined ? { sortOrder: body.data.sortOrder } : {}),
        },
      })
      if (body.data.levels !== undefined) {
        await prisma.programOptionLevel.deleteMany({ where: { programOptionId: id } })
        if (body.data.levels.length > 0) {
          await prisma.programOptionLevel.createMany({
            data: body.data.levels.map(level => ({ programOptionId: id, level })),
            skipDuplicates: true,
          })
        }
      }
      await log({ userId: (request.user as any).id, action: 'UPDATE', entity: 'ProgramOption', entityId: id })
      return reply.send(option)
    } catch {
      return reply.status(404).send({ error: 'Opción no encontrada' })
    }
  })

  fastify.delete('/program-options/:id', requireAdmin, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      await prisma.programOptionLevel.deleteMany({ where: { programOptionId: id } })
      await prisma.programOptionItem.deleteMany({ where: { programOptionId: id } })
      await prisma.programOption.delete({ where: { id } })
      await log({ userId: (request.user as any).id, action: 'DELETE', entity: 'ProgramOption', entityId: id })
      return reply.send({ message: 'Opción eliminada' })
    } catch {
      return reply.status(404).send({ error: 'Opción no encontrada' })
    }
  })

  // Items within an option
  fastify.post('/program-options/:id/items', requireAdmin, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      productId: z.string().min(1),
      quantity: z.number().positive(),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const option = await prisma.programOption.findUnique({ where: { id } })
    if (!option) return reply.status(404).send({ error: 'Opción no encontrada' })

    const product = await prisma.product.findUnique({ where: { id: body.data.productId, isActive: true } })
    if (!product) return reply.status(404).send({ error: 'Producto no encontrado' })

    const existing = await prisma.programOptionItem.findFirst({ where: { programOptionId: id, productId: body.data.productId } })
    const item = existing
      ? await prisma.programOptionItem.update({ where: { id: existing.id }, data: { quantity: body.data.quantity } })
      : await prisma.programOptionItem.create({
          data: { programOptionId: id, productId: product.id, productName: product.name, quantity: body.data.quantity },
        })
    return reply.status(201).send(item)
  })

  fastify.delete('/program-options/:id/items/:itemId', requireAdmin, async (request, reply) => {
    const { id, itemId } = request.params as { id: string; itemId: string }
    try {
      await prisma.programOptionItem.delete({ where: { id: itemId, programOptionId: id } })
      return reply.send({ message: 'Producto eliminado de la opción' })
    } catch {
      return reply.status(404).send({ error: 'Producto no encontrado en la opción' })
    }
  })

  // ── Consolidated purchase view ───────────────────────────────────────────────
  fastify.get('/consolidated', requireAdmin, async (request, reply) => {
    const q = request.query as { programType?: string; year?: string }
    const year = Number(q.year ?? new Date().getFullYear())
    const startOfYear = new Date(year, 0, 1)
    const endOfYear = new Date(year + 1, 0, 1)

    const orderItems = await prisma.portalOrderItem.findMany({
      where: {
        portalOrder: {
          status: { in: ['PENDING', 'APPROVED', 'QUOTED'] },
          createdAt: { gte: startOfYear, lt: endOfYear },
          ...(q.programType ? { programType: q.programType } : {}),
        },
      },
      include: {
        product: { select: { id: true, name: true, brand: true } },
        portalOrder: { select: { programType: true } },
      },
    })

    // Group by productId + programType
    const groups = new Map<string, {
      productId: string | null
      productName: string
      productBrand: string | null
      programType: string
      totalNeeded: number
    }>()
    for (const item of orderItems) {
      // Typed-in products (no catalog id) are grouped by name.
      const key = `${item.productId ?? 'custom:' + item.productName.toLowerCase()}:${item.portalOrder.programType}`
      const g = groups.get(key)
      if (g) {
        g.totalNeeded = Number((g.totalNeeded + Number(item.quantity)).toFixed(4))
      } else {
        groups.set(key, {
          productId: item.productId,
          productName: item.productName,
          productBrand: item.product?.brand ?? null,
          programType: item.portalOrder.programType,
          totalNeeded: Number(item.quantity),
        })
      }
    }

    // Get existing purchase tracking
    const tracking = await prisma.portalPurchaseTracking.findMany({
      where: {
        fiscalYear: year,
        ...(q.programType ? { programType: q.programType } : {}),
      },
    })
    const trackingMap = new Map(tracking.map(t => [`${t.productId}:${t.programType}`, t]))

    const data = Array.from(groups.values()).map(g => {
      const t = trackingMap.get(`${g.productId}:${g.programType}`)
      const purchasedQty = t ? Number(t.purchasedQty) : 0
      return {
        productId: g.productId,
        productName: g.productName,
        productBrand: g.productBrand,
        programType: g.programType,
        totalNeeded: g.totalNeeded,
        purchasedQty,
        remaining: Math.max(0, g.totalNeeded - purchasedQty),
        trackingId: t?.id ?? null,
        notes: t?.notes ?? null,
      }
    })

    return reply.send({ data, year })
  })

  fastify.put('/consolidated/tracking', requireAdmin, async (request, reply) => {
    const body = z.object({
      productId: z.string().min(1),
      programType: z.string().min(1),
      fiscalYear: z.number().int().min(2020).max(2100),
      purchasedQty: z.number().min(0),
      notes: z.string().optional().nullable(),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const { productId, programType, fiscalYear, purchasedQty, notes } = body.data
    const existing = await prisma.portalPurchaseTracking.findFirst({
      where: { productId, programType, fiscalYear },
    })

    const tracking = existing
      ? await prisma.portalPurchaseTracking.update({
          where: { id: existing.id },
          data: { purchasedQty, notes: notes ?? null, updatedById: (request.user as any).id },
        })
      : await prisma.portalPurchaseTracking.create({
          data: { productId, programType, fiscalYear, purchasedQty, notes: notes ?? null, updatedById: (request.user as any).id },
        })

    return reply.send(tracking)
  })

  // ── Portal messages: teacher ↔ admin thread ──────────────────────────────────
  // Each teacher has ONE ongoing conversation with the admin.
  // Messages can optionally reference an order (portalOrderId + orderNum shown as tag).

  // Unread count badge (must be before /:teacherId to avoid route conflict)
  fastify.get('/teacher-messages/unread', requireAdmin, async (_request, reply) => {
    const count = await prisma.portalMessage.count({ where: { senderRole: 'TEACHER', isRead: false } })
    return reply.send({ count })
  })

  // List all teacher threads (sorted: unread first, then by last message date)
  fastify.get('/teacher-messages', requireAdmin, async (_request, reply) => {
    const teachers = await prisma.teacher.findMany({
      where: { isActive: true },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    })

    // 3 queries in total instead of 2 per teacher (this list was N+1).
    const ids = teachers.map(t => t.id)
    const [lastIds, unreadRows] = await Promise.all([
      ids.length === 0 ? [] : prisma.$queryRaw<{ id: string }[]>`
        SELECT DISTINCT ON ("TEACHER_ID") "ID" AS id FROM "PORTAL_MESSAGES"
        WHERE "TEACHER_ID" IN (${Prisma.join(ids)})
        ORDER BY "TEACHER_ID", "CREATED_AT" DESC`,
      prisma.portalMessage.groupBy({ by: ['teacherId'], where: { senderRole: 'TEACHER', isRead: false }, _count: { _all: true } }),
    ])
    const lastMessages = await prisma.portalMessage.findMany({
      where: { id: { in: lastIds.map(r => r.id) } },
      include: { portalOrder: { select: { orderNumber: true } } },
    })
    const lastByTeacher = new Map(lastMessages.map(m => [m.teacherId, m]))
    const unreadByTeacher = new Map(unreadRows.map(r => [r.teacherId, r._count._all]))
    const threads = teachers.map(t => {
      const last = lastByTeacher.get(t.id) ?? null
      return { teacher: t, lastMessage: last, unread: unreadByTeacher.get(t.id) ?? 0, hasHistory: !!last }
    })

    threads.sort((a, b) => {
      if (b.unread !== a.unread) return b.unread - a.unread
      if (!a.lastMessage && !b.lastMessage) return 0
      if (!a.lastMessage) return 1
      if (!b.lastMessage) return -1
      return new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime()
    })

    return reply.send({ data: threads })
  })

  // Thread with a specific teacher
  fastify.get('/teacher-messages/:teacherId', requireAdmin, async (request, reply) => {
    const { teacherId } = request.params as { teacherId: string }
    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
      include: { user: { select: { id: true, name: true, email: true } } },
    })
    if (!teacher) return reply.status(404).send({ error: 'Maestro no encontrado' })

    const messages = await prisma.portalMessage.findMany({
      where: { teacherId },
      orderBy: { createdAt: 'asc' },
      take: 300,
      include: { portalOrder: { select: { orderNumber: true } } },
    })
    // Mark teacher messages as read
    await prisma.portalMessage.updateMany({
      where: { teacherId, senderRole: 'TEACHER', isRead: false },
      data: { isRead: true },
    })
    return reply.send({ data: messages, teacher })
  })

  // Admin sends a message to a teacher (optional order context)
  fastify.post('/teacher-messages/:teacherId', requireAdmin, async (request, reply) => {
    const { teacherId } = request.params as { teacherId: string }
    const teacher = await prisma.teacher.findUnique({ where: { id: teacherId } })
    if (!teacher) return reply.status(404).send({ error: 'Maestro no encontrado' })

    const body = (request.body as any)?.body?.trim()
    const portalOrderId = (request.body as any)?.portalOrderId ?? null
    if (!body) return reply.status(400).send({ error: 'El mensaje no puede estar vacío' })

    const msg = await prisma.portalMessage.create({
      data: { teacherId, senderRole: 'ADMIN', body, portalOrderId: portalOrderId ?? null, isRead: false },
      include: { portalOrder: { select: { orderNumber: true } } },
    })
    notifyTeacherLater(teacherId, {
      title: msg.portalOrder ? `Mensaje sobre tu pedido ${msg.portalOrder.orderNumber}` : 'Nuevo mensaje del proveedor',
      body: body.length > 140 ? body.slice(0, 137) + '…' : body,
      url: '/messages',
      tag: 'messages',
    })
    return reply.status(201).send(msg)
  })

  // ── Portal config ────────────────────────────────────────────────────────────────
  fastify.get('/config', requireAdmin, async (_request, reply) => {
    const cfg = await prisma.portalConfig.findFirst({ orderBy: { createdAt: 'asc' } })
    if (cfg) return reply.send(cfg)
    return reply.send({
      businessName: 'Variedades Dayana',
      tagline: 'Tu proveedor educativo de confianza',
      aboutText: '',
      primaryColor: '#F97316',
      address: '',
      city: 'Rabinal, Baja Verapaz',
      phone: '',
      whatsapp: '',
      email: '',
      facebook: '',
      instagram: '',
    })
  })

  fastify.put('/config', requireAdmin, async (request, reply) => {
    const body = z.object({
      businessName: z.string().min(1),
      tagline: z.string().optional().nullable(),
      aboutText: z.string().optional().nullable(),
      logoUrl: z.string().max(3_000_000).optional().nullable(),
      heroImageUrl: z.string().max(8_000_000).optional().nullable(), // banner image, allowed larger than a logo
      primaryColor: z.string().optional(),
      address: z.string().optional().nullable(),
      city: z.string().optional().nullable(),
      phone: z.string().optional().nullable(),
      whatsapp: z.string().optional().nullable(),
      email: z.string().optional().nullable(),
      facebook: z.string().optional().nullable(),
      instagram: z.string().optional().nullable(),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const data = {
      businessName: body.data.businessName,
      tagline: body.data.tagline ?? null,
      aboutText: body.data.aboutText ?? null,
      logoUrl: body.data.logoUrl ?? null,
      heroImageUrl: body.data.heroImageUrl ?? null,
      primaryColor: body.data.primaryColor ?? '#F97316',
      address: body.data.address ?? null,
      city: body.data.city ?? null,
      phone: body.data.phone ?? null,
      whatsapp: body.data.whatsapp ?? null,
      email: body.data.email ?? null,
      facebook: body.data.facebook ?? null,
      instagram: body.data.instagram ?? null,
    }

    const existing = await prisma.portalConfig.findFirst({ orderBy: { createdAt: 'asc' } })
    const cfg = existing
      ? await prisma.portalConfig.update({ where: { id: existing.id }, data })
      : await prisma.portalConfig.create({ data: { ...data, isActive: true } })

    await log({ userId: (request.user as any).id, action: 'UPDATE', entity: 'PortalConfig', entityId: cfg.id })
    return reply.send(cfg)
  })
}

function safeParseArray(raw: string): string[] {
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.map(String) : []
  } catch {
    return []
  }
}
