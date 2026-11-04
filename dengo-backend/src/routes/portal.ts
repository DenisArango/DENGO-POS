import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { validateUser, logLogin } from '../services/auth.service.js'
import { log } from '../services/audit.service.js'
import { getLicense } from './license.js'
import sharp from 'sharp'
import { isPerStudent, buildOrderItems } from '../lib/portalOrders.js'
import { getVapidKeys, notifyTeacher } from '../lib/webPush.js'

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
    // Per-student programs: units in ONE student's kit. Otherwise the total.
    quantity: z.number().positive(),
    unitPrice: z.number().min(0).optional(), // display hint only — ignored
    notes: z.string().optional(),
  })).min(1),
})

async function requireTeacher(request: FastifyRequest, reply: FastifyReply) {
  if ((request.user as any).role !== 'TEACHER') {
    return reply.status(403).send({ error: 'Solo para maestros' })
  }
}

const ACTIVE_GRATUITY_STATUSES = ['PENDING', 'APPROVED', 'QUOTED', 'INVOICED']

// Cost is the provider's own number: strip it from everything the teacher gets.
function forTeacher<T extends { items?: { unitCost?: unknown }[] }>(order: T): T {
  if (!order.items) return order
  return { ...order, items: order.items.map(({ unitCost: _cost, ...rest }) => rest) } as T
}

// ── App icon (home screen / notifications) from the provider's logo ─────────
const iconCache = new Map<string, Buffer>()
async function portalIcon(size: number): Promise<Buffer> {
  const cfg = await prisma.portalConfig.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } })
  const cacheKey = `${size}:${cfg?.updatedAt?.getTime() ?? 0}`
  const hit = iconCache.get(cacheKey)
  if (hit) return hit
  const color = /^#[0-9a-f]{6}$/i.test(cfg?.primaryColor ?? '') ? cfg!.primaryColor : '#F97316'
  let png: Buffer | null = null
  const logo = cfg?.logoUrl ?? ''
  const match = logo.match(/^data:image\/[a-z+]+;base64,(.+)$/i)
  if (match) {
    try {
      // Logo centred on white with a safe margin, so Android's round/squircle
      // masks never cut it.
      const inner = Math.round(size * 0.72)
      const art = await sharp(Buffer.from(match[1]!, 'base64')).resize(inner, inner, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer()
      png = await sharp({ create: { width: size, height: size, channels: 4, background: '#ffffff' } })
        .composite([{ input: art, gravity: 'center' }]).png().toBuffer()
    } catch { png = null }
  }
  if (!png) {
    const letter = (cfg?.businessName?.trim()[0] ?? 'P').toUpperCase().replace(/[<>&"]/g, '')
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="100%" height="100%" fill="${color}"/><text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${Math.round(size * 0.5)}" fill="#ffffff">${letter}</text></svg>`
    png = await sharp(Buffer.from(svg)).png().toBuffer()
  }
  iconCache.set(cacheKey, png)
  return png
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

  // ── Public: installable app (needed for notifications on iPhone) ──────────
  fastify.get('/manifest.webmanifest', async (_request, reply) => {
    const cfg = await prisma.portalConfig.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } })
    const name = cfg?.businessName ? `${cfg.businessName} · Pedidos` : 'Portal de Maestros'
    const color = /^#[0-9a-f]{6}$/i.test(cfg?.primaryColor ?? '') ? cfg!.primaryColor : '#F97316'
    return reply.type('application/manifest+json').send({
      name,
      short_name: 'Pedidos',
      description: 'Pedidos escolares para maestros',
      lang: 'es',
      start_url: '/dashboard',
      scope: '/',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: color,
      icons: [
        { src: '/api/portal/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/api/portal/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/api/portal/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    })
  })

  fastify.get('/icon-:size.png', async (request, reply) => {
    const size = Number((request.params as { size: string }).size)
    if (![72, 96, 180, 192, 512].includes(size)) return reply.status(404).send({ error: 'Tamaño no disponible' })
    return reply.type('image/png').header('Cache-Control', 'public, max-age=86400').send(await portalIcon(size))
  })

  fastify.get('/push/public-key', async (_request, reply) => {
    const { publicKey } = await getVapidKeys()
    return reply.send({ publicKey })
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

    // Schools that already used this year's gratuity — shown in step 1 so the
    // teacher doesn't build a whole order only to have it refused at the end.
    const year = new Date().getFullYear()
    const gratuityTaken = await prisma.portalOrder.findMany({
      where: {
        schoolId: { in: user.teacher.schools.map(s => s.schoolId) },
        programType: 'GRATUITY',
        status: { in: ACTIVE_GRATUITY_STATUSES },
        createdAt: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) },
      },
      select: { schoolId: true, orderNumber: true },
    })

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
        perStudent: isPerStudent(p),
        isActive: p.isActive,
      })),
      blockedPrograms: gratuityTaken.map(o => ({ schoolId: o.schoolId, programType: 'GRATUITY', orderNumber: o.orderNumber })),
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
      perStudent: isPerStudent(p),
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

    // A chosen category narrows within the program's allowed ones — spreading
    // both under the same `categoryId` key used to silently drop the choice.
    const categoryFilter = q.categoryId
      ? (allowedCategoryIds && !allowedCategoryIds.includes(q.categoryId) ? { in: [] as string[] } : q.categoryId)
      : (allowedCategoryIds ? { in: allowedCategoryIds } : undefined)
    const where: any = {
      isActive: true,
      ...(categoryFilter ? { categoryId: categoryFilter } : {}),
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
          status: { in: ACTIVE_GRATUITY_STATUSES },
          createdAt: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) },
        },
      })
      if (existing) {
        return reply.status(400).send({ error: 'Ya existe un pedido de gratuidad activo para esta escuela en el año actual' })
      }
    }

    // Prices always come from the catalog: the client-sent unitPrice is only
    // a display hint — trusting it let a crafted request slip under the limits.
    const totalStudents = body.data.grades.reduce((s, g) => s + g.studentCount, 0)
    const perStudent = isPerStudent(program)
    const built = await buildOrderItems(body.data.items, perStudent, totalStudents)
    if ('error' in built) return reply.status(400).send({ error: built.error })
    const { items, totalAmount, kitAmount } = built

    // limitPerStudent: the kit of one student can't cost more than the amount
    // per student (same as total ≤ amount × students).
    if (program.limitPerStudent && totalStudents > 0) {
      const perStudentLimit = Number(program.limitPerStudent)
      const maxAllowed = Number((perStudentLimit * totalStudents).toFixed(2))
      if (kitAmount != null ? kitAmount > perStudentLimit + 0.001 : totalAmount > maxAllowed) {
        return reply.status(400).send({
          error: kitAmount != null
            ? `El kit de cada alumno (Q${kitAmount.toFixed(2)}) pasa del monto por alumno (Q${perStudentLimit.toFixed(2)})`
            : `El total (Q${totalAmount.toFixed(2)}) excede el límite de Q${perStudentLimit.toFixed(2)} por alumno × ${totalStudents} alumnos = Q${maxAllowed.toFixed(2)} máximo`,
        })
      }
    }

    if (program.maxAmountPerTeacher && totalAmount > Number(program.maxAmountPerTeacher)) {
      return reply.status(400).send({
        error: `El total (Q${totalAmount.toFixed(2)}) excede el límite del programa (Q${Number(program.maxAmountPerTeacher).toFixed(2)})`,
      })
    }

    const orderGradeSummary = body.data.grades.map(g => `${g.gradeName}: ${g.studentCount}`).join(', ')

    // Order number PED-YYYY-NNN. Two teachers submitting at the same moment
    // can compute the same next number — retry on the unique-key clash.
    const year = new Date().getFullYear()
    const prefix = `PED-${year}`
    const createOrder = async (attempt: number): Promise<any> => {
      const count = await prisma.portalOrder.count({ where: { orderNumber: { startsWith: prefix } } })
      const orderNumber = `${prefix}-${String(count + 1 + attempt).padStart(3, '0')}`
      try {
        return await prisma.portalOrder.create({ data: orderData(orderNumber), include: { items: true, school: true, grades: true } })
      } catch (err: any) {
        if (err?.code === 'P2002' && attempt < 5) return createOrder(attempt + 1)
        throw err
      }
    }
    const orderData = (orderNumber: string) => ({
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
    })
    const order = await createOrder(0)

    return reply.status(201).send(forTeacher(order))
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
    return reply.send(orders.map(forTeacher))
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
    return reply.send(forTeacher(order))
  })

  // ── [TEACHER] notifications on this device ─────────────────────────────────
  const subscriptionSchema = z.object({
    endpoint: z.string().url().max(1000),
    keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
  })

  fastify.post('/push/subscribe', teacherGuard, async (request, reply) => {
    const body = subscriptionSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'Suscripción inválida' })
    const teacher = await getTeacherForUser((request.user as any).id)
    if (!teacher) return reply.status(404).send({ error: 'Maestro no encontrado' })
    const ua = String(request.headers['user-agent'] ?? '').slice(0, 300) || null
    // The same browser re-subscribing (or a shared tablet switching teacher)
    // just moves the endpoint to this teacher.
    await prisma.pushSubscription.upsert({
      where: { endpoint: body.data.endpoint },
      create: { teacherId: teacher.id, endpoint: body.data.endpoint, p256dh: body.data.keys.p256dh, auth: body.data.keys.auth, userAgent: ua },
      update: { teacherId: teacher.id, p256dh: body.data.keys.p256dh, auth: body.data.keys.auth, userAgent: ua },
    })
    return reply.send({ ok: true })
  })

  fastify.post('/push/unsubscribe', teacherGuard, async (request, reply) => {
    const endpoint = (request.body as any)?.endpoint
    if (typeof endpoint === 'string') {
      const teacher = await getTeacherForUser((request.user as any).id)
      if (teacher) await prisma.pushSubscription.deleteMany({ where: { endpoint, teacherId: teacher.id } })
    }
    return reply.send({ ok: true })
  })

  fastify.post('/push/test', teacherGuard, async (request, reply) => {
    const teacher = await getTeacherForUser((request.user as any).id)
    if (!teacher) return reply.status(404).send({ error: 'Maestro no encontrado' })
    const sent = await notifyTeacher(teacher.id, {
      title: '¡Listo! Las notificaciones funcionan',
      body: 'Aquí te avisaremos de tus pedidos, cotizaciones, facturas y mensajes.',
      url: '/dashboard',
      tag: 'test',
    })
    return reply.send({ sent })
  })

  // ── [TEACHER] documents sent through the inbox ─────────────────────────────
  // Only what the provider sent to THIS teacher can be opened.
  fastify.get('/documents/:kind/:id', teacherGuard, async (request, reply) => {
    const { kind, id } = request.params as { kind: string; id: string }
    const teacher = await getTeacherForUser((request.user as any).id)
    if (!teacher) return reply.status(404).send({ error: 'Maestro no encontrado' })
    const sentToMe = await prisma.portalMessage.findFirst({
      where: { teacherId: teacher.id, ...(kind === 'invoice' ? { kind: 'INVOICE', saleId: id } : { kind: 'QUOTATION', quotationId: id }) },
      include: { portalOrder: { include: { school: { select: { name: true } } } } },
    })
    if (!sentToMe) return reply.status(404).send({ error: 'Documento no encontrado' })

    const [company, portalCfg] = await Promise.all([
      prisma.companyProfile.findFirst(),
      prisma.portalConfig.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } }),
    ])
    const issuer = {
      name: company?.legalName || company?.name || portalCfg?.businessName || '',
      tradeName: portalCfg?.businessName || company?.name || '',
      taxId: company?.taxId ?? null,
      address: company?.address || portalCfg?.address || null,
      city: company?.city || portalCfg?.city || null,
      phone: company?.phone || portalCfg?.phone || null,
      email: company?.email || portalCfg?.email || null,
      logo: portalCfg?.logoUrl || company?.logo || null,
    }
    const order = sentToMe.portalOrder
    const orderInfo = order ? { orderNumber: order.orderNumber, school: order.school.name, grades: order.orderGradeSummary } : null

    if (kind === 'invoice') {
      const sale = await prisma.sale.findUnique({
        where: { id },
        include: { customer: { select: { name: true, nit: true } }, items: { include: { product: { select: { name: true } }, variation: { select: { name: true } } } } },
      })
      if (!sale) return reply.status(404).send({ error: 'Documento no encontrado' })
      return reply.send({
        kind: 'INVOICE',
        number: `${sale.invoiceSeries ?? ''}${sale.invoiceSeries ? '-' : ''}${sale.invoiceSeqNumber ?? sale.invoiceNumber}`,
        date: sale.createdAt,
        issuer,
        order: orderInfo,
        customer: { name: sale.buyerName || sale.customer?.name || 'Consumidor final', nit: sale.buyerNit || sale.customer?.nit || 'CF' },
        items: sale.items.map(i => ({
          description: [i.product?.name, i.variation?.name].filter(Boolean).join(' · '),
          quantity: Number(i.quantity), unitPrice: Number(i.unitPrice), total: Number(i.total),
        })),
        subtotal: Number(sale.subtotal), discount: Number(sale.discount), tax: Number(sale.tax), total: Number(sale.total),
        fel: { status: sale.felStatus, uuid: sale.felUuid, authNumber: sale.felAuthNumber, certifiedAt: sale.felCertifiedAt },
      })
    }

    const quotation = await prisma.quotation.findUnique({
      where: { id },
      include: { customer: { select: { name: true, nit: true } }, items: { include: { product: { select: { name: true } }, variation: { select: { name: true } } } } },
    })
    if (!quotation) return reply.status(404).send({ error: 'Documento no encontrado' })
    return reply.send({
      kind: 'QUOTATION',
      number: quotation.quotationNumber,
      date: quotation.createdAt,
      validUntil: quotation.validUntil,
      issuer,
      order: orderInfo,
      customer: { name: quotation.customer.name, nit: quotation.customer.nit || 'CF' },
      items: quotation.items.map(i => ({
        description: i.customName || [i.product?.name, i.variation?.name].filter(Boolean).join(' · '),
        quantity: Number(i.quantity), unitPrice: Number(i.unitPrice), total: Number(i.total),
      })),
      subtotal: Number(quotation.subtotal), discount: Number(quotation.discount), tax: Number(quotation.tax), total: Number(quotation.total),
      notes: quotation.notes,
    })
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
