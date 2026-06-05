import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

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

function buildPrompt(reportType: string, data: any, context?: string): string {
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

const AVAILABLE_ENDPOINTS = `
Endpoints disponibles (todos prefijados con /api):
- GET /reports/sales-history?from=ISO&to=ISO&branchId=  → lista de ventas (id, total, paymentMethod, createdAt, customer{name}, items[{quantity,total,product{name,category{name}}}])
- GET /reports/sales-by-product?from=ISO&to=ISO&branchId=&limit=N  → productos más vendidos (productId, name, quantitySold, revenue, cost, profit, marginPercent)
- GET /reports/daily-sales?date=YYYY-MM-DD&branchId=  → resumen del día (hourly, paymentMethods, topProducts)
- GET /reports/inventory-status?branchId=  → estado del inventario (productId, name, quantity, minStock, cost, value, status)
- GET /reports/product-rotation?from=ISO&to=ISO&branchId=  → rotación de productos (name, sold, stock, rotationDays)
- GET /reports/stock-movements?productId=&branchId=&from=ISO&to=ISO  → movimientos de stock
- GET /reports/cash-registers-history?branchId=&from=ISO&to=ISO  → historial de cajas
- GET /customers  → clientes (id, name, nit, creditLimit, creditUsed, totalPurchases, purchasesCount, lastPurchase)
- GET /transfers?fromBranchId=&toBranchId=&status=  → traslados
`

function buildQueryPrompt(question: string, branchId: string, today: string): string {
  return `Eres un asistente de inteligencia de negocios para un POS en Guatemala. El usuario pregunta:

"${question}"

Contexto: branchId="${branchId}", fecha actual="${today}"

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
- params siempre debe incluir branchId si el endpoint lo acepta
- Si la pregunta es sobre un período, calcúlalo desde "${today}"
- Si no hay endpoint que responda exactamente, elige el más cercano
- visualization: "bar" para comparaciones, "line" para tendencias, "pie" para distribuciones, "table" para listas detalladas`
}

export default async function aiRoutes(fastify: FastifyInstance) {
  // POST /api/ai/query-report — AI interprets question, fetches data, returns visualization config + data
  fastify.post('/query-report', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const parsed = z.object({
      question: z.string().min(3),
      branchId: z.string().optional(),
    }).safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const { question, branchId: reqBranchId } = parsed.data
    const branchId = reqBranchId ?? request.user.branchId ?? ''
    const today = new Date().toISOString().slice(0, 10)
    const apiKey = process.env.ANTHROPIC_API_KEY

    let config: any = null

    if (apiKey) {
      try {
        const Anthropic = (await import('@anthropic-ai/sdk')).default
        const client = new Anthropic({ apiKey })
        const msg = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 600,
          messages: [{ role: 'user', content: buildQueryPrompt(question, branchId, today) }],
        })
        const text = msg.content[0]?.type === 'text' ? msg.content[0].text : ''
        const match = text.match(/\{[\s\S]*\}/)
        if (match) config = JSON.parse(match[0])
      } catch (err) {
        fastify.log.warn(err, 'AI query-report error, using fallback')
      }
    }

    // Fallback: simple keyword matching
    if (!config) {
      config = fallbackQueryConfig(question, branchId, today)
    }

    // Fetch the data from the resolved endpoint
    try {
      const url = new URL(`http://localhost${config.endpoint}`)
      Object.entries(config.params ?? {}).forEach(([k, v]) => url.searchParams.set(k, String(v)))

      const req = await (fastify as any).inject({
        method: 'GET',
        url: `/api${url.pathname}?${url.searchParams.toString()}`,
        headers: { authorization: request.headers.authorization ?? '' },
      })

      const data = JSON.parse(req.body)
      return reply.send({ config, data })
    } catch (err) {
      fastify.log.error(err, 'Failed to fetch report data')
      return reply.status(500).send({ error: 'Error al obtener los datos del reporte' })
    }
  })

  fastify.post('/analyze', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const parsed = z.object({
      reportType: z.string(),
      data: z.any(),
      context: z.string().optional(),
    }).safeParse(request.body)

    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const { reportType, data, context } = parsed.data
    const apiKey = process.env.ANTHROPIC_API_KEY

    if (!apiKey) {
      return reply.send({ recommendations: localRules(reportType, data) })
    }

    try {
      const Anthropic = (await import('@anthropic-ai/sdk')).default
      const client = new Anthropic({ apiKey })

      const msg = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 900,
        messages: [{ role: 'user', content: buildPrompt(reportType, data, context) }],
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

function fallbackQueryConfig(question: string, branchId: string, today: string) {
  const q = question.toLowerCase()
  const from30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10) + 'T00:00:00'
  const to = today + 'T23:59:59'

  if (q.includes('cliente') || q.includes('comprador')) {
    return { intent: 'Análisis de clientes', endpoint: '/customers', params: {}, visualization: 'table',
      title: 'Reporte de Clientes', description: 'Lista de clientes con historial de compras',
      xKey: 'name', yKey: 'totalPurchases', columns: ['name','nit','totalPurchases','purchasesCount','lastPurchase'] }
  }
  if (q.includes('rotaci') || q.includes('muerto') || q.includes('sin movimiento')) {
    return { intent: 'Rotación de productos', endpoint: '/reports/product-rotation',
      params: { from: from30, to, branchId }, visualization: 'bar',
      title: 'Rotación de Productos', description: 'Análisis de qué tan rápido se venden los productos',
      xKey: 'name', yKey: 'sold', columns: ['name','sold','stock','rotationDays'] }
  }
  if (q.includes('inventario') || q.includes('stock')) {
    return { intent: 'Estado del inventario', endpoint: '/reports/inventory-status',
      params: { branchId }, visualization: 'table',
      title: 'Estado del Inventario', description: 'Niveles actuales de stock por producto',
      xKey: 'name', yKey: 'quantity', columns: ['name','quantity','minStock','cost','value','status'] }
  }
  if (q.includes('ganancia') || q.includes('margen') || q.includes('utilidad')) {
    return { intent: 'Márgenes de ganancia', endpoint: '/reports/sales-by-product',
      params: { from: from30, to, branchId, limit: '20' }, visualization: 'bar',
      title: 'Márgenes por Producto', description: 'Rentabilidad de productos en los últimos 30 días',
      xKey: 'name', yKey: 'profit', columns: ['name','revenue','cost','profit','marginPercent'] }
  }
  // Default: top products
  return { intent: 'Productos más vendidos', endpoint: '/reports/sales-by-product',
    params: { from: from30, to, branchId, limit: '15' }, visualization: 'bar',
    title: 'Top Productos (últimos 30 días)', description: 'Los productos con mayor volumen de ventas',
    xKey: 'name', yKey: 'revenue', columns: ['name','quantitySold','revenue','marginPercent'] }
}
