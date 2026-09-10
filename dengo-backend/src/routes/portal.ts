import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { validateUser, logLogin } from '../services/auth.service.js'
import { log } from '../services/audit.service.js'
import { getLicense } from './license.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const orderSchema = z.object({
  schoolId: z.string().min(1),
  educationalLevel: z.string().optional(),
  programType: z.string().min(1),
  notes: z.string().optional(),
  grades: z.array(z.object({
    gradeName: z.string().min(1),
    studentCount: z.number().int().positive(),
  })).min(1, 'Debe ingresar al menos un grado con número de alumnos'),
  items: z.array(z.object({
    productId: z.string().min(1),
    quantity: z.number().positive(),
    unitPrice: z.number().min(0),
    notes: z.string().optional(),
  })).min(1),
})

async function requireTeacher(request: FastifyRequest, reply: FastifyReply) {
  if ((request.user as any).role !== 'TEACHER') {
    return reply.status(403).send({ error: 'Solo para maestros' })
  }
}

function parseAllowedCategoryIds(raw: string | null): string[] | null {
  if (!raw) return null
  try {
    const arr = JSON.parse(raw)
    if (Array.isArray(arr) && arr.length > 0) return arr.map(String)
    return null
  } catch {
    return null
  }
}

async function getTeacherForUser(userId: string) {
  return prisma.teacher.findUnique({ where: { userId } })
}

export default async function portalRoutes(fastify: FastifyInstance) {
  const teacherGuard = { preHandler: [fastify.authenticate, requireTeacher] }

  // ── Public: portal config ──────────────────────────────────────────────────
  // 404 here (no config, or pageEnabled off) is what tells the portal frontend
  // to fall back to a bare, unbranded login form instead of the custom landing.
  fastify.get('/config', async (_request, reply) => {
    const license = await getLicense()
    if (!license.pageEnabled) return reply.status(404).send({ error: 'Configuración no encontrada' })
    const cfg = await prisma.portalConfig.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } })
    if (!cfg) return reply.status(404).send({ error: 'Configuración no encontrada' })
    return reply.send(cfg)
  })

  // ── Public: teacher login ───────────────────────────────────────────────────
  fastify.post('/auth/login', { config: { rateLimit: { max: 10, timeWindow: 60_000 } } }, async (request, reply) => {
    const body = loginSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'Email y contraseña requeridos' })

    const { email, password } = body.data
    const ip = request.ip
    const ua = request.headers['user-agent']

    const license = await getLicense()
    if (!license.maestrosEnabled) {
      return reply.status(403).send({ error: 'El portal de maestros no está activo. Contacta a tu proveedor.' })
    }

    let user
    try {
      user = await validateUser(email, password)
    } catch (err: any) {
      await logLogin({ email, success: false, ipAddress: ip, ...(ua && { userAgent: ua }), ...(err.message && { failReason: err.message }) })
      return reply.status(401).send({ error: 'Credenciales incorrectas' })
    }

    if (user.role !== 'TEACHER') {
      await logLogin({ email, userId: user.id, success: false, ipAddress: ip, ...(ua && { userAgent: ua }), failReason: 'No es maestro' })
      return reply.status(403).send({ error: 'Esta cuenta no tiene acceso al portal de maestros' })
    }

    await logLogin({ email, userId: user.id, success: true, ipAddress: ip, ...(ua && { userAgent: ua }) })
    await log({ userId: user.id, action: 'LOGIN', entity: 'User', entityId: user.id, ipAddress: ip })

    const token = fastify.jwt.sign(
      { id: user.id, role: user.role, branchId: user.branchId, branchIds: [user.branchId], email: user.email, permissions: [] },
      { expiresIn: '8h' }
    )

    return reply.send({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, branchId: user.branchId, isActive: user.isActive },
    })
  })

  // ── [TEACHER] profile ───────────────────────────────────────────────────────
  fastify.get('/me', teacherGuard, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: (request.user as any).id },
      include: {
        teacher: {
          include: {
            schools: {
              where: { isActive: true },
              include: { school: true },
            },
          },
        },
      },
    })
    if (!user || !user.teacher) return reply.status(404).send({ error: 'Maestro no encontrado' })

    const programs = await prisma.programConfig.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } })

    return reply.send({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      teacher: {
        id: user.teacher.id,
        phone: user.teacher.phone,
        schools: user.teacher.schools.map(s => ({
          id: s.id,
          grade: s.grade,
          section: s.section,
          educationalLevel: s.educationalLevel,
          school: { id: s.school.id, name: s.school.name, municipio: s.school.municipio },
        })),
      },
      programs: programs.map(p => ({
        id: p.id,
        type: p.type,
        name: p.name,
        description: p.description,
        maxAmountPerTeacher: p.maxAmountPerTeacher ? Number(p.maxAmountPerTeacher) : null,
        limitPerStudent: p.limitPerStudent ? Number(p.limitPerStudent) : null,
        isActive: p.isActive,
      })),
    })
  })

  // ── [TEACHER] active programs ───────────────────────────────────────────────
  fastify.get('/programs', teacherGuard, async (_request, reply) => {
    const programs = await prisma.programConfig.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } })
    return reply.send(programs.map(p => ({
      id: p.id,
      type: p.type,
      name: p.name,
      description: p.description,
      maxAmountPerTeacher: p.maxAmountPerTeacher ? Number(p.maxAmountPerTeacher) : null,
      limitPerStudent: p.limitPerStudent ? Number(p.limitPerStudent) : null,
      allowedCategoryIds: parseAllowedCategoryIds(p.allowedCategoryIds),
      isActive: p.isActive,
    })))
  })

  // ── [TEACHER] program options (predefined packages) ──────────────────────────
  fastify.get('/programs/options', teacherGuard, async (request, reply) => {
    const q = request.query as { programType?: string; level?: string }

    // Options with no level restrictions show for everyone; options with levels show only for matching level
    const levelFilter = q.level ? {
      OR: [
        { levels: { some: { level: q.level } } },
        { levels: { none: {} } },
      ],
    } : {}

    const options = await prisma.programOption.findMany({
      where: {
        isActive: true,
        ...(q.programType ? { programType: q.programType } : {}),
        ...levelFilter,
      },
      include: {
        items: {
          include: { product: { select: { id: true, name: true, basePrice: true, imageUrl: true, brand: true } } },
        },
        levels: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })
    return reply.send(options.map(o => ({
      id: o.id,
      programType: o.programType,
      name: o.name,
      description: o.description,
      sortOrder: o.sortOrder,
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

  // ── [TEACHER] products ──────────────────────────────────────────────────────
  fastify.get('/products', teacherGuard, async (request, reply) => {
    const q = request.query as { programType?: string; search?: string; categoryId?: string; page?: string; limit?: string }
    const page = Math.max(1, Number(q.page ?? 1))
    const limit = Math.min(100, Math.max(1, Number(q.limit ?? 20)))

    let allowedCategoryIds: string[] | null = null
    if (q.programType) {
      const program = await prisma.programConfig.findFirst({ where: { type: q.programType, isActive: true } })
      if (program) allowedCategoryIds = parseAllowedCategoryIds(program.allowedCategoryIds)
    }

    const where: any = {
      isActive: true,
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(allowedCategoryIds ? { categoryId: { in: allowedCategoryIds } } : {}),
      ...(q.search ? {
        OR: [
          { name: { contains: q.search, mode: 'insensitive' } },
          { brand: { contains: q.search, mode: 'insensitive' } },
          { sku: { contains: q.search, mode: 'insensitive' } },
          { barcode: { contains: q.search, mode: 'insensitive' } },
        ],
      } : {}),
    }

    const [total, products] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        include: { category: { select: { id: true, name: true } } },
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ])

    return reply.send({
      data: products.map(p => ({
        id: p.id,
        name: p.name,
        brand: p.brand,
        description: p.description,
        basePrice: Number(p.basePrice),
        imageUrl: p.imageUrl,
        category: p.category,
      })),
      total,
      page,
      limit,
    })
  })

  // ── [TEACHER] categories ────────────────────────────────────────────────────
  fastify.get('/categories', teacherGuard, async (request, reply) => {
    const q = request.query as { programType?: string }
    let allowedCategoryIds: string[] | null = null
    if (q.programType) {
      const program = await prisma.programConfig.findFirst({ where: { type: q.programType, isActive: true } })
      if (program) allowedCategoryIds = parseAllowedCategoryIds(program.allowedCategoryIds)
    }
    const categories = await prisma.category.findMany({
      where: {
        isActive: true,
        ...(allowedCategoryIds ? { id: { in: allowedCategoryIds } } : {}),
      },
      orderBy: { name: 'asc' },
    })
    return reply.send(categories.map(c => ({ id: c.id, name: c.name, color: c.color })))
  })

  // ── [TEACHER] create order ──────────────────────────────────────────────────
  fastify.post('/orders', teacherGuard, async (request, reply) => {
    const body = orderSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const teacher = await getTeacherForUser((request.user as any).id)
    if (!teacher) return reply.status(404).send({ error: 'Maestro no encontrado' })

    // Validate school assignment
    const assignment = await prisma.teacherSchool.findFirst({
      where: { teacherId: teacher.id, schoolId: body.data.schoolId, isActive: true },
    })
    if (!assignment) return reply.status(400).send({ error: 'No tiene asignada esta escuela' })

    // Validate program
    const program = await prisma.programConfig.findFirst({ where: { type: body.data.programType, isActive: true } })
    if (!program) return reply.status(400).send({ error: 'Programa no disponible' })

    // Multi-grade requires a comment
    if (body.data.grades.length > 1 && !body.data.notes?.trim()) {
      return reply.status(400).send({ error: 'El comentario es obligatorio cuando el pedido cubre más de un grado' })
    }

    // Gratuidad: only one active order per school per year
    if (body.data.programType === 'GRATUITY') {
      const year = new Date().getFullYear()
      const existing = await prisma.portalOrder.findFirst({
        where: {
          schoolId: body.data.schoolId,
          programType: 'GRATUITY',
          status: { in: ['PENDING', 'APPROVED', 'QUOTED'] },
          createdAt: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) },
        },
      })
      if (existing) {
        return reply.status(400).send({ error: 'Ya existe un pedido de gratuidad activo para esta escuela en el año actual' })
      }
    }

    // Resolve products and compute totals server-side
    const productIds = body.data.items.map(i => i.productId)
    const products = await prisma.product.findMany({ where: { id: { in: productIds }, isActive: true } })
    const productMap = new Map(products.map(p => [p.id, p]))

    const items = body.data.items.map(i => {
      const product = productMap.get(i.productId)
      if (!product) throw new Error(`Producto no encontrado: ${i.productId}`)
      const unitPrice = i.unitPrice > 0 ? i.unitPrice : Number(product.basePrice)
      const total = Number((unitPrice * i.quantity).toFixed(2))
      return {
        productId: product.id,
        productName: product.name,
        quantity: i.quantity,
        unitPrice,
        total,
        notes: i.notes ?? null,
      }
    })

    const totalAmount = Number(items.reduce((s, it) => s + it.total, 0).toFixed(2))
    const totalStudents = body.data.grades.reduce((s, g) => s + g.studentCount, 0)

    // maxAmountPerTeacher check
    if (program.maxAmountPerTeacher && totalAmount > Number(program.maxAmountPerTeacher)) {
      return reply.status(400).send({
        error: `El total (Q${totalAmount.toFixed(2)}) excede el límite del programa (Q${Number(program.maxAmountPerTeacher).toFixed(2)})`,
      })
    }

    // limitPerStudent check (SCHOOL_SUPPLIES, GRATUITY)
    if (program.limitPerStudent && totalStudents > 0) {
      const maxAllowed = Number((Number(program.limitPerStudent) * totalStudents).toFixed(2))
      if (totalAmount > maxAllowed) {
        return reply.status(400).send({
          error: `El total (Q${totalAmount.toFixed(2)}) excede el límite de Q${Number(program.limitPerStudent).toFixed(2)} por alumno × ${totalStudents} alumnos = Q${maxAllowed.toFixed(2)} máximo`,
        })
      }
    }

    const orderGradeSummary = body.data.grades.map(g => `${g.gradeName}: ${g.studentCount}`).join(', ')

    // Generate order number: PED-YYYY-NNN
    const year = new Date().getFullYear()
    const prefix = `PED-${year}`
    const count = await prisma.portalOrder.count({ where: { orderNumber: { startsWith: prefix } } })
    const orderNumber = `${prefix}-${String(count + 1).padStart(3, '0')}`

    const order = await prisma.portalOrder.create({
      data: {
        orderNumber,
        teacherId: teacher.id,
        schoolId: body.data.schoolId,
        educationalLevel: body.data.educationalLevel ?? null,
        studentCount: totalStudents,
        orderGradeSummary,
        programType: body.data.programType,
        status: 'PENDING',
        notes: body.data.notes ?? null,
        totalAmount,
        items: { create: items },
        grades: {
          create: body.data.grades.map(g => ({ gradeName: g.gradeName, studentCount: g.studentCount })),
        },
      },
      include: { items: true, school: true, grades: true },
    })

    return reply.status(201).send(order)
  })

  // ── [TEACHER] list own orders ───────────────────────────────────────────────
  fastify.get('/orders', teacherGuard, async (request, reply) => {
    const teacher = await getTeacherForUser((request.user as any).id)
    if (!teacher) return reply.status(404).send({ error: 'Maestro no encontrado' })

    const orders = await prisma.portalOrder.findMany({
      where: { teacherId: teacher.id },
      include: { school: { select: { name: true } }, items: true, grades: true },
      orderBy: { createdAt: 'desc' },
    })
    return reply.send(orders)
  })

  // ── [TEACHER] order detail ──────────────────────────────────────────────────
  fastify.get('/orders/:id', teacherGuard, async (request, reply) => {
    const { id } = request.params as { id: string }
    const teacher = await getTeacherForUser((request.user as any).id)
    if (!teacher) return reply.status(404).send({ error: 'Maestro no encontrado' })

    const order = await prisma.portalOrder.findFirst({
      where: { id, teacherId: teacher.id },
      include: { school: true, items: true, grades: true },
    })
    if (!order) return reply.status(404).send({ error: 'Pedido no encontrado' })
    return reply.send(order)
  })

  // ── [TEACHER] messages: single thread with admin ───────────────────────────
  // All messages to/from this teacher in one conversation.
  // Messages can reference an order (portalOrderId) as context.

  // Unread count (admin messages not yet read by teacher) — static path first
  fastify.get('/messages/unread', teacherGuard, async (request, reply) => {
    const teacher = await getTeacherForUser((request.user as any).id)
    if (!teacher) return reply.send({ count: 0 })
    const count = await prisma.portalMessage.count({
      where: { teacherId: teacher.id, senderRole: 'ADMIN', isRead: false },
    })
    return reply.send({ count })
  })

  // Full thread
  fastify.get('/messages', teacherGuard, async (request, reply) => {
    const teacher = await getTeacherForUser((request.user as any).id)
    if (!teacher) return reply.status(404).send({ error: 'Maestro no encontrado' })

    const messages = await prisma.portalMessage.findMany({
      where: { teacherId: teacher.id },
      orderBy: { createdAt: 'asc' },
      take: 300,
      include: { portalOrder: { select: { orderNumber: true } } },
    })
    // Mark admin messages as read now that teacher opened them
    await prisma.portalMessage.updateMany({
      where: { teacherId: teacher.id, senderRole: 'ADMIN', isRead: false },
      data: { isRead: true },
    })
    return reply.send({ data: messages })
  })

  // Send message (optional portalOrderId for order context)
  fastify.post('/messages', teacherGuard, async (request, reply) => {
    const teacher = await getTeacherForUser((request.user as any).id)
    if (!teacher) return reply.status(404).send({ error: 'Maestro no encontrado' })

    const body = (request.body as any)?.body?.trim()
    const portalOrderId = (request.body as any)?.portalOrderId ?? null
    if (!body) return reply.status(400).send({ error: 'El mensaje no puede estar vacío' })

    // Validate order belongs to teacher if provided
    if (portalOrderId) {
      const order = await prisma.portalOrder.findFirst({ where: { id: portalOrderId, teacherId: teacher.id } })
      if (!order) return reply.status(400).send({ error: 'Pedido no encontrado' })
    }

    const msg = await prisma.portalMessage.create({
      data: { teacherId: teacher.id, senderRole: 'TEACHER', body, portalOrderId, isRead: false },
      include: { portalOrder: { select: { orderNumber: true } } },
    })
    return reply.status(201).send(msg)
  })
}
