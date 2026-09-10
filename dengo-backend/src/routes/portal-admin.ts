import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { log } from '../services/audit.service.js'
import { hashPassword } from '../services/auth.service.js'

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
  items: true,
  grades: true,
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
    return reply.send({ data: orders, total, page, limit })
  })

  // ── Order detail ─────────────────────────────────────────────────────────────
  fastify.get('/orders/:id', requireAdmin, async (request, reply) => {
    const { id } = request.params as { id: string }
    const order = await prisma.portalOrder.findUnique({ where: { id }, include: orderInclude })
    if (!order) return reply.status(404).send({ error: 'Pedido no encontrado' })
    return reply.send(order)
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
            productId: it.productId,
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
    isActive: z.boolean().optional(),
  })

  fastify.post('/schools', requireAdmin, async (request, reply) => {
    const body = schoolSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const school = await prisma.school.create({
      data: {
        name: body.data.name,
        code: body.data.code ?? null,
        address: body.data.address ?? null,
        municipio: body.data.municipio ?? null,
        departamento: body.data.departamento ?? null,
        opfContact: body.data.opfContact ?? null,
        opfPhone: body.data.opfPhone ?? null,
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
          include: { product: { select: { id: true, name: true, basePrice: true, imageUrl: true } } },
        },
        levels: true,
      },
      orderBy: [{ programType: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    })
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
        imageUrl: i.product.imageUrl,
      })),
    })))
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
      productId: string
      productName: string
      productBrand: string | null
      programType: string
      totalNeeded: number
    }>()
    for (const item of orderItems) {
      const key = `${item.productId}:${item.portalOrder.programType}`
      const g = groups.get(key)
      if (g) {
        g.totalNeeded = Number((g.totalNeeded + Number(item.quantity)).toFixed(4))
      } else {
        groups.set(key, {
          productId: item.productId,
          productName: item.productName,
          productBrand: item.product.brand ?? null,
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

    const threads = await Promise.all(teachers.map(async t => {
      const last = await prisma.portalMessage.findFirst({
        where: { teacherId: t.id },
        orderBy: { createdAt: 'desc' },
        include: { portalOrder: { select: { orderNumber: true } } },
      })
      const unread = await prisma.portalMessage.count({
        where: { teacherId: t.id, senderRole: 'TEACHER', isRead: false },
      })
      return { teacher: t, lastMessage: last, unread, hasHistory: !!last }
    }))

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
