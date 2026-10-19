import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { config } from './config.js'
import authPlugin from './plugins/auth.plugin.js'
import { prisma } from './lib/prisma.js'
import { ensureSystemRoles } from './lib/permissions.js'

// Routes
import authRoutes from './routes/auth.js'
import branchRoutes from './routes/branches.js'
import userRoutes from './routes/users.js'
import categoryRoutes from './routes/categories.js'
import productRoutes from './routes/products.js'
import inventoryRoutes from './routes/inventory.js'
import inventoryReasonsRoutes from './routes/inventory-reasons.js'
import inventoryCountRoutes from './routes/inventory-counts.js'
import customerRoutes from './routes/customers.js'
import supplierRoutes from './routes/suppliers.js'
import salesRoutes from './routes/sales.js'
import cashRegisterRoutes from './routes/cash-registers.js'
import transferRoutes from './routes/transfers.js'
import quotationRoutes from './routes/quotations.js'
import reportRoutes from './routes/reports.js'
import auditRoutes from './routes/audit.js'
import unitRoutes from './routes/units.js'
import roleRoutes from './routes/roles.js'
import settingsRoutes from './routes/settings.js'
import licenseRoutes from './routes/license.js'
import goalsRoutes from './routes/goals.js'
import aiRoutes from './routes/ai.js'
import portalRoutes from './routes/portal.js'
import portalAdminRoutes from './routes/portal-admin.js'
import messagesRoutes from './routes/messages.js'

const fastify = Fastify({
  logger: {
    level: config.isDev ? 'info' : 'warn',
    transport: config.isDev ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
  },
})

async function bootstrap() {
  // Security
  await fastify.register(helmet, { contentSecurityPolicy: false })

  // CORS
  await fastify.register(cors, {
    origin: config.cors.origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })

  // Rate limiting — keyed by the bearer token (one bucket per logged-in
  // session), not by IP. Several cashier devices in the same store normally
  // share one router/public IP (NAT), so the default IP-based key lumped
  // ALL of them into a single shared bucket: background polling alone
  // (unread messages, portal orders, notifications, offline-sync — each
  // every 30-60s) plus a few people navigating between pages around the
  // same time was enough to exhaust it, after which EVERY device at that
  // store got 429s simultaneously, for everything, until the window reset —
  // this is what the client saw as a sudden wave of unrelated endpoints all
  // failing at once. Falls back to IP only for unauthenticated requests
  // (login, the public /api/license check) where there's no token yet.
  await fastify.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.windowMs,
    keyGenerator: (request) => request.headers.authorization ?? request.ip,
    // Must return a real Error with .statusCode set (429, matching the
    // library's own default — see its defaultErrorResponse) — the previous
    // version returned a plain {error: string} object, which has no
    // .statusCode. The global error handler below then fell through to its
    // `?? 500` fallback for EVERY rate-limited request, so a client hitting
    // the limit got a genuine HTTP 500 (and this handler's 500 branch
    // discards the real message too) instead of 429 — indistinguishable
    // from an actual server crash, both to the browser console and to
    // anyone debugging from it.
    errorResponseBuilder: (_request, context) => {
      const err = new Error('Demasiadas solicitudes. Intenta más tarde.')
      ;(err as Error & { statusCode: number }).statusCode = context.statusCode
      return err
    },
  })

  // Auth (JWT + authenticate decorator)
  await fastify.register(authPlugin)

  // Health check
  fastify.get('/health', async () => ({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  }))

  // API routes
  await fastify.register(authRoutes,         { prefix: '/api/auth' })
  await fastify.register(branchRoutes,       { prefix: '/api/branches' })
  await fastify.register(userRoutes,         { prefix: '/api/users' })
  await fastify.register(categoryRoutes,     { prefix: '/api/categories' })
  await fastify.register(productRoutes,      { prefix: '/api/products' })
  await fastify.register(inventoryRoutes,    { prefix: '/api/inventory' })
  await fastify.register(inventoryReasonsRoutes, { prefix: '/api/inventory-reasons' })
  await fastify.register(inventoryCountRoutes,  { prefix: '/api/inventory-counts' })
  await fastify.register(customerRoutes,     { prefix: '/api/customers' })
  await fastify.register(supplierRoutes,     { prefix: '/api/suppliers' })
  await fastify.register(salesRoutes,        { prefix: '/api/sales' })
  await fastify.register(cashRegisterRoutes, { prefix: '/api/cash-registers' })
  await fastify.register(transferRoutes,     { prefix: '/api/transfers' })
  await fastify.register(quotationRoutes,    { prefix: '/api/quotations' })
  await fastify.register(reportRoutes,       { prefix: '/api/reports' })
  await fastify.register(auditRoutes,        { prefix: '/api/audit' })
  await fastify.register(unitRoutes,         { prefix: '/api/units' })
  await fastify.register(roleRoutes,         { prefix: '/api/roles' })
  await fastify.register(settingsRoutes,     { prefix: '/api/settings' })
  await fastify.register(licenseRoutes,      { prefix: '/api/license' })
  await fastify.register(goalsRoutes,        { prefix: '/api/goals' })
  await fastify.register(aiRoutes,           { prefix: '/api/ai' })
  // Teacher portal (Variedades Dayana). The portal frontend runs on port 5174.
  // Add http://localhost:5174 to CORS_ORIGIN in dengo-backend/.env (comma-separated)
  // so the portal can call these endpoints. No code change needed — config.ts
  // already splits CORS_ORIGIN on commas.
  await fastify.register(portalRoutes,       { prefix: '/api/portal' })
  await fastify.register(portalAdminRoutes,  { prefix: '/api/portal-admin' })
  await fastify.register(messagesRoutes,     { prefix: '/api/messages' })

  // Global error handler
  fastify.setErrorHandler((error, _request, reply) => {
    fastify.log.error(error)
    if (error.validation) {
      return reply.status(400).send({ error: 'Datos inválidos', details: error.validation })
    }
    const statusCode = error.statusCode ?? 500
    reply.status(statusCode).send({
      error: statusCode === 500 ? 'Error interno del servidor' : error.message,
    })
  })

  // 404 handler
  fastify.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({ error: 'Ruta no encontrada' })
  })

  // Warm up DB connection pool before accepting requests
  await prisma.$connect()
  fastify.log.info('✅ Database connected')

  // Idempotent — creates the 4 legacy roles as editable Role rows the first
  // time this runs; no-ops on every later boot.
  await ensureSystemRoles()

  // Start
  await fastify.listen({ port: config.port, host: config.host })
  fastify.log.info(`🚀 DENGO POS API running on http://${config.host}:${config.port}`)
}

// Graceful shutdown
const signals = ['SIGTERM', 'SIGINT'] as const
for (const signal of signals) {
  process.on(signal, async () => {
    fastify.log.info(`Received ${signal}, shutting down...`)
    await fastify.close()
    await prisma.$disconnect()
    process.exit(0)
  })
}

bootstrap().catch(err => {
  console.error('Fatal error during startup:', err)
  process.exit(1)
})
