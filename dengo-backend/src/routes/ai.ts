import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { hasPermission } from '../lib/permissions.js'

// AI calls cost real money per request — require at least one reports.*
// permission so a role deliberately created without any reporting access
// (all 4 seeded roles have one by default, but a custom role might not)
// can't still burn API credits by hitting these endpoints directly.
const REPORT_PERMISSIONS = ['reports.sales', 'reports.inventory', 'reports.financial', 'reports.audit'] as const
function hasAnyReportsPermission(request: FastifyRequest): boolean {
  return REPORT_PERMISSIONS.some(key => hasPermission(request, key))
}

const AI_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001'
const AI_TIMEOUT_MS = 15_000

const REPORT_TYPE_LABELS: Record<string, string> = {
  daily_sales: 'Ventas del Día',
  hourly_sales: 'Ventas por Hora',
  sales_by_period: 'Ventas por Período',
  sales_history: 'Historial de Ventas',
  top_products: 'Productos Más Vendidos',
  product_rotation: 'Rotación de Productos',
  profit_margins: 'Márgenes de Ganancia',
  credit_sales: 'Ventas al Crédito',
  inventory_status: 'Estado de Inventario',
  inventory_movements: 'Movimientos de Inventario',
  inventory_adjustments: 'Ajustes de Inventario',
  cash_flow: 'Flujo de Caja',
  user_activity: 'Actividad de Usuarios',
  sales: 'Ventas',
  inventory: 'Inventario',
  cash: 'Flujo de Caja',
  products: 'Productos',
}

// Single Anthropic client shared across requests — avoids re-importing the
// SDK and opening a new client on every call.
let anthropicClient: import('@anthropic-ai/sdk').default | null | undefined

async function getAnthropicClient() {
  if (anthropicClient !== undefined) return anthropicClient
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    anthropicClient = null
    return null
  }
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  anthropicClient = new Anthropic({ apiKey, timeout: AI_TIMEOUT_MS })
  return anthropicClient
}

// Endpoints the AI-driven report chat is allowed to fetch, and which query
// params it may forward for each one. This is the security boundary: the
// model's output (or the keyword fallback) can never reach an endpoint or
// param outside this list, even if the user's question tries to steer it
// there (prompt injection) or the model hallucinates a path.
const ALLOWED_ENDPOINTS: Record<string, readonly string[]> = {
  '/reports/dashboard': ['branchId'],
  '/reports/sales-history': ['branchId', 'from', 'to', 'saleType', 'paymentMethod', 'search', 'cashRegisterId', 'includeVoided'],
  '/reports/inventory-status': ['branchId'],
  '/reports/top-products': ['branchId', 'cashRegisterId', 'from', 'to'],
  '/reports/daily-sales': ['branchId', 'cashRegisterId', 'from', 'to'],
  '/reports/stock-movements': ['branchId', 'from', 'to', 'type'],
  '/reports/sales-by-product': ['branchId', 'cashRegisterId', 'from', 'to', 'limit'],
  '/reports/cash-registers-history': ['branchId', 'from', 'to'],
  '/reports/product-rotation': ['branchId', 'cashRegisterId'],
  '/customers': ['search'],
  '/transfers': ['fromBranchId', 'toBranchId', 'status'],
}

const AVAILABLE_ENDPOINTS = `
Endpoints disponibles (todos prefijados con /api, SOLO puedes usar estos y SOLO con estos parámetros):
- GET /reports/sales-history?from=ISO&to=ISO&branchId=&cashRegisterId=&paymentMethod=&saleType=&search=&includeVoided=  → lista de ventas (id, total, paymentMethod, saleType, createdAt, customer{name}, items[{quantity,total,product{name,category{name}}}])
- GET /reports/sales-by-product?from=ISO&to=ISO&branchId=&cashRegisterId=&limit=N  → productos más vendidos (productId, name, quantitySold, revenue, cost, profit, marginPercent)
- GET /reports/top-products?from=ISO&to=ISO&branchId=&cashRegisterId=  → top 50 productos por ingresos (rank, productId, name, category, quantity, revenue)
- GET /reports/daily-sales?from=ISO&to=ISO&branchId=&cashRegisterId=  → ventas agrupadas por día (date, count, total, cash, card, transfer, credit)
- GET /reports/inventory-status?branchId=  → estado del inventario (productId, name, quantity, minStock, cost, value, status)
- GET /reports/product-rotation?branchId=&cashRegisterId=  → rotación de productos en los últimos 30 días (fijo, no acepta rango de fechas)
- GET /reports/stock-movements?branchId=&from=ISO&to=ISO&type=IN|OUT|ADJUSTMENT|TRANSFER|SALE|RETURN  → movimientos de stock
- GET /reports/cash-registers-history?branchId=&from=ISO&to=ISO  → historial de cajas (usa openedAt para el rango, no acepta cashRegisterId)
- GET /customers?search=  → clientes (id, name, nit, creditLimit, creditUsed, totalPurchases, purchasesCount, lastPurchase)
- GET /transfers?fromBranchId=&toBranchId=&status=  → traslados
`

const queryConfigSchema = z.object({
  intent: z.string().default(''),
  endpoint: z.string(),
  params: z.record(z.string()).default({}),
  visualization: z.enum(['bar', 'line', 'pie', 'table']).default('table'),
  title: z.string().default('Reporte'),
  description: z.string().default(''),
  xKey: z.string().optional(),
  yKey: z.string().optional(),
  columns: z.array(z.string()).optional(),
})

type QueryConfig = z.infer<typeof queryConfigSchema>

const historyTurnSchema = z.object({
  question: z.string(),
  intent: z.string().optional(),
})

function buildAnalyzePrompt(reportType: string, data: any, context?: string): string {
  const label = REPORT_TYPE_LABELS[reportType] ?? reportType
  return `Eres un experto consultor de retail y punto de venta (POS) en Guatemala. Analiza los datos del reporte "${label}" y entrega 3 recomendaciones ESPECÍFICAS y ACCIONABLES para el personal de la tienda.

Contexto: negocio guatemalteco que usa Quetzales (Q).${context ? `\nInfo adicional: ${context}` : ''}

Datos:
${JSON.stringify(data, null, 2)}

Responde SOLO con JSON válido, sin texto antes ni después:
[
  {
    "title": "Título corto (máx 8 palabras)",
    "description": "Consejo práctico basado en los datos reales. Menciona cifras concretas. (2-3 oraciones)",
    "priority": "high|medium|low",
    "category": "inventory|pricing|marketing|operations"
  }
]

Reglas: español · basado en datos reales · sin inventar cifras · accionable hoy`
}

function parseRecommendations(text: string): any[] {
  try {
    const match = text.match(/\[[\s\S]*\]/)
    if (match) {
      const parsed = JSON.parse(match[0])
      return Array.isArray(parsed)
        ? parsed.slice(0, 4).map((r: any) => ({ ...r, actionable: true }))
        : []
    }
    return []
  } catch { return [] }
}

function localRules(reportType: string, data: any): any[] {
  const recs: any[] = []

  if (['inventory', 'inventory_status'].includes(reportType)) {
    if ((data?.lowStock ?? 0) > 0) {
      recs.push({ title: 'Productos con Stock Crítico', description: `Hay ${data.lowStock} producto(s) con stock bajo. Realiza un pedido urgente para evitar perder ventas.`, priority: 'high', category: 'inventory', actionable: true })
    }
    if ((data?.overstock ?? 0) > 0) {
      recs.push({ title: 'Reducir Inventario Excesivo', description: `${data.overstock} producto(s) tienen sobrestock. Crea promociones para aumentar su rotación y liberar capital.`, priority: 'medium', category: 'pricing', actionable: true })
    }
  }

  if (['sales', 'daily_sales', 'sales_history'].includes(reportType)) {
    const avg = Number(data?.avgTicket ?? 0)
    if (avg > 0 && avg < 50) {
      recs.push({ title: 'Aumentar Ticket Promedio', description: `El ticket promedio es Q${avg.toFixed(2)}. Implementa combos y venta cruzada para incrementarlo.`, priority: 'medium', category: 'marketing', actionable: true })
    }
    if ((data?.transactions ?? 0) < 10) {
      recs.push({ title: 'Incrementar Tráfico de Clientes', description: 'Las transacciones del período son bajas. Considera promociones de hora feliz o descuentos por cantidad para atraer más clientes.', priority: 'high', category: 'marketing', actionable: true })
    }
  }

  if (['profit_margins'].includes(reportType)) {
    recs.push({ title: 'Revisar Precios de Venta', description: 'Compara los márgenes actuales con el estándar del mercado. Productos con margen menor al 20% deben renegociarse con el proveedor o ajustarse en precio.', priority: 'medium', category: 'pricing', actionable: true })
  }

  if (recs.length === 0) {
    recs.push({ title: 'Activar Análisis Inteligente', description: 'Para obtener recomendaciones personalizadas con IA, configura la variable ANTHROPIC_API_KEY en el servidor. Visita console.anthropic.com para obtener tu API key.', priority: 'low', category: 'operations', actionable: true })
  }

  return recs
}

function buildQueryPrompt(question: string, branchId: string, today: string, history: { question: string; intent?: string | undefined }[]): string {
  const historyBlock = history.length
    ? `\nConversación previa (para entender preguntas de seguimiento como "y por categoría?" o "compáralo con el mes pasado"):\n${history
        .map((h, i) => `${i + 1}. Usuario preguntó: "${h.question}"${h.intent ? ` → se interpretó como: ${h.intent}` : ''}`)
        .join('\n')}\n`
    : ''

  return `Eres un asistente de inteligencia de negocios para un POS en Guatemala. El usuario pregunta:

"${question}"

Contexto: branchId="${branchId}", fecha actual="${today}"
${historyBlock}
${AVAILABLE_ENDPOINTS}

Determina qué datos necesita el usuario y responde SOLO con JSON válido, sin texto adicional:
{
  "intent": "descripción corta de lo que el usuario quiere ver",
  "endpoint": "/reports/sales-by-product",
  "params": { "from": "2026-05-01T00:00:00", "to": "2026-05-29T23:59:59", "branchId": "${branchId}", "limit": "20" },
  "visualization": "bar|line|pie|table",
  "title": "Título del reporte",
  "description": "Qué muestra este reporte en 1-2 oraciones",
  "xKey": "campo del eje X o columna principal",
  "yKey": "campo numérico principal para graficar",
  "columns": ["campo1","campo2","campo3"]
}

Reglas:
- endpoint debe ser EXACTAMENTE uno de los listados arriba, nada más
- params siempre debe incluir branchId si el endpoint lo acepta
- Si la pregunta es sobre un período, calcúlalo desde "${today}"
- Si la pregunta hace referencia a la conversación previa, resuélvela usando ese contexto
- Si no hay endpoint que responda exactamente, elige el más cercano de la lista
- visualization: "bar" para comparaciones, "line" para tendencias, "pie" para distribuciones, "table" para listas detalladas`
}

function fallbackQueryConfig(question: string, branchId: string, today: string): QueryConfig {
  const q = question.toLowerCase()
  const from30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10) + 'T00:00:00'
  const to = today + 'T23:59:59'

  if (q.includes('cliente') || q.includes('comprador')) {
    return { intent: 'Análisis de clientes', endpoint: '/customers', params: {}, visualization: 'table',
      title: 'Reporte de Clientes', description: 'Lista de clientes con historial de compras',
      xKey: 'name', yKey: 'totalPurchases', columns: ['name', 'nit', 'totalPurchases', 'purchasesCount', 'lastPurchase'] }
  }
  if (q.includes('rotaci') || q.includes('muerto') || q.includes('sin movimiento')) {
    return { intent: 'Rotación de productos', endpoint: '/reports/product-rotation',
      params: { branchId }, visualization: 'bar',
      title: 'Rotación de Productos (últimos 30 días)', description: 'Análisis de qué tan rápido se venden los productos',
      xKey: 'name', yKey: 'sold', columns: ['name', 'sold', 'stock', 'rotationDays'] }
  }
  if (q.includes('inventario') || q.includes('stock')) {
    return { intent: 'Estado del inventario', endpoint: '/reports/inventory-status',
      params: { branchId }, visualization: 'table',
      title: 'Estado del Inventario', description: 'Niveles actuales de stock por producto',
      xKey: 'name', yKey: 'quantity', columns: ['name', 'quantity', 'minStock', 'cost', 'value', 'status'] }
  }
  if (q.includes('ganancia') || q.includes('margen') || q.includes('utilidad')) {
    return { intent: 'Márgenes de ganancia', endpoint: '/reports/sales-by-product',
      params: { from: from30, to, branchId, limit: '20' }, visualization: 'bar',
      title: 'Márgenes por Producto', description: 'Rentabilidad de productos en los últimos 30 días',
      xKey: 'name', yKey: 'profit', columns: ['name', 'revenue', 'cost', 'profit', 'marginPercent'] }
  }
  if (q.includes('traslado')) {
    return { intent: 'Traslados entre sucursales', endpoint: '/transfers', params: {}, visualization: 'table',
      title: 'Traslados', description: 'Traslados de stock entre sucursales',
      xKey: 'id', yKey: undefined, columns: ['id', 'fromBranchId', 'toBranchId', 'status'] }
  }
  if (q.includes('caja') || q.includes('efectivo') || q.includes('flujo')) {
    return { intent: 'Historial de caja', endpoint: '/reports/cash-registers-history',
      params: { branchId, from: from30, to }, visualization: 'table',
      title: 'Historial de Caja', description: 'Aperturas y cierres de caja en los últimos 30 días',
      xKey: 'openedAt', yKey: undefined, columns: ['name', 'registerNumber', 'openedAt', 'closedAt', 'status'] }
  }
  // Default: top products
  return { intent: 'Productos más vendidos', endpoint: '/reports/sales-by-product',
    params: { from: from30, to, branchId, limit: '15' }, visualization: 'bar',
    title: 'Top Productos (últimos 30 días)', description: 'Los productos con mayor volumen de ventas',
    xKey: 'name', yKey: 'revenue', columns: ['name', 'quantitySold', 'revenue', 'marginPercent'] }
}

/** Clamps an AI- or fallback-produced config to the allowlist before it is ever used to build a request. */
function sanitizeConfig(config: QueryConfig, branchId: string): QueryConfig | null {
  const allowedParams = ALLOWED_ENDPOINTS[config.endpoint]
  if (!allowedParams) return null

  const params: Record<string, string> = {}
  for (const key of allowedParams) {
    const value = config.params[key]
    if (value !== undefined && value !== null && String(value).length > 0) {
      params[key] = String(value)
    }
  }
  // branchId is always server-enforced, never trusted from the model output.
  if (allowedParams.includes('branchId')) params.branchId = branchId

  return { ...config, params }
}

export default async function aiRoutes(fastify: FastifyInstance) {
  // AI calls cost money per request and hit an external API — cap them tighter
  // than the general API rate limit.
  const aiRateLimit = { config: { rateLimit: { max: 20, timeWindow: 60_000 } } }

  // POST /api/ai/query-report — AI interprets question, fetches data, returns visualization config + data
  fastify.post('/query-report', { ...aiRateLimit, preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!hasAnyReportsPermission(request)) return reply.status(403).send({ error: 'No tienes permiso para esta acción' })
    const parsed = z.object({
      question: z.string().min(3).max(500),
      branchId: z.string().optional(),
      history: z.array(historyTurnSchema).max(6).optional(),
    }).safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const { question, branchId: reqBranchId, history = [] } = parsed.data
    // Non-admins can only ever query their own branch, regardless of what the client sends.
    const branchId = request.user.role === 'ADMIN' ? (reqBranchId ?? request.user.branchId ?? '') : request.user.branchId
    const today = new Date().toISOString().slice(0, 10)

    let config: QueryConfig | null = null
    const client = await getAnthropicClient()

    if (client) {
      try {
        const msg = await client.messages.create({
          model: AI_MODEL,
          max_tokens: 600,
          messages: [{ role: 'user', content: buildQueryPrompt(question, branchId, today, history) }],
        })
        const text = msg.content[0]?.type === 'text' ? msg.content[0].text : ''
        const match = text.match(/\{[\s\S]*\}/)
        if (match) {
          const raw = queryConfigSchema.safeParse(JSON.parse(match[0]))
          if (raw.success) config = sanitizeConfig(raw.data, branchId)
        }
      } catch (err) {
        fastify.log.warn(err, 'AI query-report error, using fallback')
      }
    }

    // Fallback: simple keyword matching (also used when the AI picks a
    // non-allowlisted endpoint, so the request never silently fails).
    if (!config) {
      config = sanitizeConfig(fallbackQueryConfig(question, branchId, today), branchId)
    }
    if (!config) {
      return reply.status(500).send({ error: 'No se pudo interpretar la consulta' })
    }

    // Fetch the data from the resolved endpoint via an internal request so
    // the same auth/authorization checks as a direct API call still apply.
    try {
      const searchParams = new URLSearchParams(config.params).toString()
      const req = await fastify.inject({
        method: 'GET',
        url: `/api${config.endpoint}${searchParams ? `?${searchParams}` : ''}`,
        headers: { authorization: request.headers.authorization ?? '' },
      })

      const data = JSON.parse(req.body)
      return reply.send({ config, data })
    } catch (err) {
      fastify.log.error(err, 'Failed to fetch report data')
      return reply.status(500).send({ error: 'Error al obtener los datos del reporte' })
    }
  })

  fastify.post('/analyze', { ...aiRateLimit, preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!hasAnyReportsPermission(request)) return reply.status(403).send({ error: 'No tienes permiso para esta acción' })
    const parsed = z.object({
      reportType: z.string(),
      data: z.any(),
      context: z.string().optional(),
    }).safeParse(request.body)

    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const { reportType, data, context } = parsed.data
    const client = await getAnthropicClient()

    if (!client) {
      return reply.send({ recommendations: localRules(reportType, data) })
    }

    try {
      const msg = await client.messages.create({
        model: AI_MODEL,
        max_tokens: 900,
        messages: [{ role: 'user', content: buildAnalyzePrompt(reportType, data, context) }],
      })

      const text = msg.content[0]?.type === 'text' ? msg.content[0].text : ''
      const recommendations = parseRecommendations(text)

      return reply.send({ recommendations: recommendations.length > 0 ? recommendations : localRules(reportType, data) })
    } catch (err) {
      fastify.log.error(err, 'AI analyze error')
      return reply.send({ recommendations: localRules(reportType, data) })
    }
  })
}
