import Fastify, { type FastifyError } from 'fastify'
import { randomBytes } from 'node:crypto'
import { monitorEventLoopDelay } from 'node:perf_hooks'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import compress from '@fastify/compress'
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
import pushRoutes from './routes/push.js'
import appRoutes from './routes/app.js'
import websiteRoutes from './routes/website.js'
import felRoutes from './routes/fel.js'
import { startFelWorker } from './lib/fel.js'
import siteRoutes from './routes/site.js'
import diagRoutes from './routes/diag.js'

const fastify = Fastify({
  // Behind Caddy on the same machine: trust X-Forwarded-For only from the
  // loopback proxy, so request.ip is the real client (login rate limit and
  // login history) instead of 127.0.0.1 for everyone.
  trustProxy: '127.0.0.1,::1',
  // The POS sends its own X-Request-Id (see dengo-frontend/src/lib/api.ts) and
  // shows it in the «Detalle técnico» panel: using it as the log reqId lets a
  // failure on a cashier's screenshot be found here with a plain grep.
  requestIdHeader: false,
  genReqId: (req) => {
    const h = req.headers['x-request-id']
    return typeof h === 'string' && /^[A-Za-z0-9-]{4,40}$/.test(h) ? h : randomBytes(5).toString('hex')
  },
  logger: {
    // LOG_LEVEL=info in the client's .env (then pm2 restart) logs EVERY request
    // with its reqId — handy while chasing disconnections, noisy otherwise.
    level: process.env['LOG_LEVEL'] ?? (config.isDev ? 'info' : 'warn'),
    transport: config.isDev ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
  },
})

// Spanish names for the unique columns a person can collide with.
const UNIQUE_FIELDS: Record<string, string> = {
  barcode: 'código de barras', sku: 'SKU', code: 'código', nit: 'NIT', email: 'correo', name: 'nombre',
  slug: 'dirección', invoicenumber: 'número de factura', quotationnumber: 'número de cotización', ordernumber: 'número de pedido',
}

/** A Prisma known-request error as an HTTP status and a message a person can act on; null for anything else. */
function prismaKnownError(error: unknown): { status: number; message: string } | null {
  const e = error as { name?: string; code?: string; meta?: { target?: unknown; field_name?: unknown } }
  if (e?.name !== 'PrismaClientKnownRequestError' || typeof e.code !== 'string') return null
  switch (e.code) {
    case 'P2002': {
      const target = Array.isArray(e.meta?.target) ? e.meta!.target.map(String) : String(e.meta?.target ?? '').split(/[_,]/)
      const field = target.map(t => UNIQUE_FIELDS[t.toLowerCase().replace(/[^a-z]/g, '')]).find(Boolean)
      return { status: 409, message: field ? `Ya existe un registro con ese ${field}.` : 'Ya existe un registro con esos datos.' }
    }
    case 'P2000': return { status: 400, message: 'Uno de los textos es demasiado largo para guardarse. Acórtalo e intenta de nuevo.' }
    case 'P2003': return { status: 409, message: 'No se puede: está ligado a otros registros.' }
    case 'P2025': return { status: 404, message: 'No se encontró el registro (puede que alguien más lo haya cambiado o borrado).' }
    case 'P2024': return { status: 503, message: 'El servidor está muy ocupado en este momento. Intenta de nuevo en unos segundos.' }
    default: return null
  }
}

async function bootstrap() {
  // Security
  await fastify.register(helmet, { contentSecurityPolicy: false })

  // Compress JSON responses (brotli/gzip, whichever the browser accepts).
  // Product/customer/report lists are tens to hundreds of KB of repetitive
  // JSON — this cuts them to roughly a tenth over the wire, which matters on
  // a store's shared connection or a teacher's phone. Small bodies skipped.
  await fastify.register(compress, { global: true, threshold: 1024, encodings: ['br', 'gzip'] })

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
    // Requests from this machine itself skip the limit: that's the website
    // (dengo-web renders on the server and calls the API over loopback), so
    // every visitor would otherwise share ONE bucket. Real clients never look
    // local: trustProxy turns Caddy's X-Forwarded-For into their own IP.
    allowList: (request) => request.ip === '127.0.0.1' || request.ip === '::1',
    keyGenerator: (request) => {
      const auth = request.headers.authorization
      if (auth?.startsWith('Bearer ')) {
        try {
          const u = fastify.jwt.verify<{ id?: string }>(auth.slice(7))
          if (u?.id) return `u:${u.id}`
        } catch { /* invalid/expired token: falls back to the IP */ }
      }
      return `ip:${request.ip}`
    },
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

  // Global error handler — set BEFORE the routes: in Fastify a route plugin
  // registered earlier keeps the default handler, which echoes internal
  // error text (e.g. Prisma's) to the client on a 500.
  fastify.setErrorHandler((error: FastifyError, request, reply) => {
    // Prisma's known errors are mostly the DATA's fault, not the server's: a
    // duplicate barcode, a text too long for its column, a missing row. Left
    // as 500s they reached the till as «Sin conexión con el servidor» (the POS
    // shows that for every 5xx and re-checks the connection), so a cashier who
    // typed a repeated barcode thought the system had gone down.
    const known = prismaKnownError(error)
    if (known) {
      if (known.status >= 500) request.log.error(error)
      else request.log.warn({ code: (error as { code?: string }).code, url: request.url }, known.message)
      return reply.status(known.status).send({ error: known.message })
    }
    if ((error.statusCode ?? 500) >= 500) request.log.error({ err: error, url: request.url, method: request.method }, error.message)
    if (error.validation) {
      return reply.status(400).send({ error: 'Datos inválidos', details: error.validation })
    }
    const statusCode = error.statusCode ?? 500
    reply.status(statusCode).send({
      error: statusCode === 500 ? 'Error interno del servidor' : error.message,
    })
  })

  // ── Connection diagnostics ───────────────────────────────────────────
  // Production logs only WARN and up, so normally a request leaves no trace.
  // These three cover what a «Sin conexión» on a till usually comes down to:
  // a request that took too long, a request the client gave up on, and the
  // whole process being blocked (then EVERY request, the health ping too,
  // stalls at once — exactly what makes all tills flip to offline together).
  const SLOW_MS = Number(process.env['SLOW_REQUEST_MS'] ?? 3000)
  fastify.addHook('onSend', async (request, reply, payload) => {
    reply.header('x-request-id', request.id)
    return payload
  })
  fastify.addHook('onResponse', async (request, reply) => {
    const ms = Math.round(reply.elapsedTime)
    if (ms >= SLOW_MS) request.log.warn({ tag: 'lenta', method: request.method, url: request.url.split('?')[0], status: reply.statusCode, ms, ip: request.ip }, `solicitud lenta: ${request.method} ${request.url.split('?')[0]} ${ms} ms`)
  })
  fastify.addHook('onRequestAbort', async (request) => {
    request.log.warn({ tag: 'abortada', method: request.method, url: request.url.split('?')[0], ip: request.ip }, `el cliente cerró la conexión antes de recibir respuesta: ${request.method} ${request.url.split('?')[0]}`)
  })

  // Auth (JWT + authenticate decorator)
  await fastify.register(authPlugin)

  // Health check
  // Exempt from the rate limit: every cashier device pings this to know it's
  // online, and devices in one store share an IP (an unauthenticated request
  // is keyed by IP), so a busy store could get its own pings refused and every
  // till would flip to "Sin conexión" at once.
  // uptime lets the POS notice (and log) that the process restarted — a pm2
  // crash-restart looks to a cashier exactly like a dropped connection.
  const health = async () => ({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString(), uptime: Math.round(process.uptime()) })
  fastify.get('/health', { config: { rateLimit: false } }, health)
  // Same, under /api: Caddy only forwards /api/* to the backend, so this is the
  // one the POS can reach on its own domain to tell "online" (no database touched,
  // so a slow report can't make it time out).
  fastify.get('/api/health', { config: { rateLimit: false } }, health)

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
  await fastify.register(pushRoutes,         { prefix: '/api/push' })
  await fastify.register(appRoutes,          { prefix: '/api/app' })
  await fastify.register(websiteRoutes,      { prefix: '/api/website' })
  await fastify.register(felRoutes,          { prefix: '/api/fel' })
  await fastify.register(siteRoutes,         { prefix: '/api/site' })
  await fastify.register(diagRoutes,         { prefix: '/api/diag' })

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
  // Facturas that never reached the certifier (no connection) are retried in the background.
  startFelWorker(msg => fastify.log.info(msg))
  startEventLoopWatch()
}

// Node runs every request on one thread: a heavy synchronous job (a huge
// report, a big JSON, an import) freezes ALL of them, the health ping
// included, for as long as it runs. Logged once a minute when it happened,
// with memory, so it can be lined up with the tills' «Sin conexión».
function startEventLoopWatch() {
  const h = monitorEventLoopDelay({ resolution: 20 })
  h.enable()
  setInterval(() => {
    const maxMs = Math.round(h.max / 1e6)
    const p99 = Math.round(h.percentile(99) / 1e6)
    if (maxMs >= 1000) {
      const mem = process.memoryUsage()
      fastify.log.warn({ tag: 'bloqueo', maxMs, p99, rssMB: Math.round(mem.rss / 1048576), heapMB: Math.round(mem.heapUsed / 1048576) },
        `servidor bloqueado hasta ${maxMs} ms en el último minuto (p99 ${p99} ms) — todas las solicitudes esperaron`)
    }
    h.reset()
  }, 60_000).unref()
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
