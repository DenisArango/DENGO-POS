import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { hasPermission } from '../lib/permissions.js'
import { SALES_DIMENSIONS, SALES_METRICS, INVENTORY_DIMENSIONS, INVENTORY_METRICS, CASH_DIMENSIONS, CASH_METRICS, DIMENSION_LABELS } from '../lib/reportQuery.js'
import { toBusinessDateKey, toBusinessDateTimeLabel } from '../lib/timezone.js'
import { prisma } from '../lib/prisma.js'
import { allowedBranchIds } from '../lib/branch-scope.js'
import { runAnalyst, type AnalystUsage } from '../lib/aiAnalyst.js'
import { aiPeriod, getAiStatus, recordAiUsage, requireAiQuota } from '../lib/aiQuota.js'

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

// ---------------------------------------------------------------------------
// Tool surface exposed to the AI. `/reports/query` is the main workhorse — a
// flexible "group X by Y, show me Z" engine (see lib/reportQuery.ts) that
// covers the overwhelming majority of sales/inventory/cash-flow questions
// through composition (groupBy + metrics + filters) instead of one bespoke
// endpoint per question. The rest are genuinely different shapes that don't
// fit a fact-table aggregation: a raw transaction list, a customer directory,
// goals (target vs actual, not a summable fact), and transfers (a workflow
// list). Keeping this list short and composable is the whole point — a new
// phrasing of an already-supported combination (say, "ventas por cajero la
// semana pasada") needs ZERO new code because groupBy/metrics already compose.
// ---------------------------------------------------------------------------
const ALLOWED_ENDPOINTS: Record<string, readonly string[]> = {
  '/reports/query': ['entity', 'groupBy', 'metrics', 'branchId', 'from', 'to', 'categoryName', 'productName', 'customerName', 'paymentMethod', 'saleType', 'cashRegisterId', 'sortBy', 'sortDir', 'limit'],
  '/reports/sales-history': ['branchId', 'from', 'to', 'saleType', 'paymentMethod', 'search', 'cashRegisterId', 'includeVoided'],
  '/reports/product-rotation': ['branchId', 'cashRegisterId'],
  '/customers': ['search', 'sortBy'],
  '/transfers': ['fromBranchId', 'toBranchId', 'status'],
  '/goals': ['branchId', 'year', 'month'],
  '/goals/compliance-report': ['branchId', 'months'],
}

const AVAILABLE_ENDPOINTS = `
Herramientas disponibles (todas prefijadas con /api, SOLO puedes usar estas y SOLO con estos parámetros):

### /reports/query — tu herramienta PRINCIPAL para casi cualquier pregunta de ventas, inventario o caja
{ "endpoint": "/reports/query", "params": { "entity": "...", "groupBy": "...", "metrics": "m1,m2", "from": "ISO", "to": "ISO", "branchId": "", "categoryName": "", "productName": "", "customerName": "", "paymentMethod": "", "saleType": "", "cashRegisterId": "", "sortBy": "", "sortDir": "asc|desc", "limit": "N" } }

- entity="sales": groupBy uno de [${SALES_DIMENSIONS.join(', ')}] · metrics (separadas por coma) uno o más de [${SALES_METRICS.join(', ')}]
- entity="inventory": groupBy uno de [${INVENTORY_DIMENSIONS.join(', ')}] · metrics uno o más de [${INVENTORY_METRICS.join(', ')}]
- entity="cashRegisters": groupBy uno de [${CASH_DIMENSIONS.join(', ')}] · metrics uno o más de [${CASH_METRICS.join(', ')}]
- groupBy="none" (o ausente) = un solo total, sin desglose — para preguntas tipo "¿cuánto he vendido en total?"
- groupBy="recent" (solo entity="sales") = NO agrupa ni suma nada — devuelve los eventos de venta individuales más recientes primero (producto, cantidad, Q, fecha/hora, factura, cliente). Úsalo para CUALQUIER pregunta sobre "los últimos N productos/ventas", "qué se vendió hace un momento", "qué se acaba de vender" — nunca uses groupBy="product" para esto, eso suma todo el período en una sola fila por producto y pierde el orden cronológico que se está pidiendo. Combínalo con el parámetro limit (ej. limit:"5" para "los últimos 5").
- categoryName/productName/customerName: el NOMBRE tal como lo escribió el usuario (ej. "Coca Cola", "Cuadernos") — el servidor lo busca, TÚ nunca inventes un id
- branchId: NO lo pases casi nunca (el servidor ya limita a la sucursal del usuario automáticamente). La ÚNICA excepción es cuando groupBy="branch" — ahí SÍ puedes omitirlo para comparar TODAS las sucursales, es el único caso que compara sucursales.
- sortBy: el nombre de una métrica pedida, o "group" para ordenar por la dimensión (útil en series de tiempo). sortDir default: descendente por la primera métrica, excepto day/week/month que por defecto van ascendente (cronológico).
- limit: cuántas filas devolver (default 50, o 1 si groupBy="none")

Ejemplos (aprende el patrón, no los copies literalmente — combina libremente):
- "productos más vendidos este mes" → entity:sales, groupBy:product, metrics:"revenue,quantity", from:<inicio de mes>, to:<hoy>
- "mis categorías con más ganancia" → entity:sales, groupBy:category, metrics:"profit,marginPercent"
- "ventas por día de la última semana" → entity:sales, groupBy:day, metrics:"revenue,salesCount", from:<hace 7 días>
- "ventas por semana del último mes" → entity:sales, groupBy:week, metrics:"revenue"
- "compara mis sucursales este mes" → entity:sales, groupBy:branch, metrics:"revenue,salesCount" (sin branchId)
- "ventas por método de pago" → entity:sales, groupBy:paymentMethod, metrics:"revenue"
- "qué cajero ha vendido más" → entity:sales, groupBy:cashier, metrics:"revenue,salesCount"
- "ventas del producto X" → entity:sales, groupBy:day (o none), productName:"X"
- "cuáles fueron los últimos 5 productos vendidos ayer" → entity:sales, groupBy:recent, limit:"5", from:<ayer 00:00>, to:<ayer 23:59>
- "¿cuánto he vendido hoy en total?" → entity:sales, groupBy:none, metrics:"revenue,salesCount", from:<hoy 00:00>, to:<hoy 23:59>
- "estado de mi inventario por categoría" → entity:inventory, groupBy:category, metrics:"quantity,value"
- "qué sucursal tiene más stock" → entity:inventory, groupBy:branch, metrics:"quantity,value" (sin branchId)
- "flujo de caja de esta semana" → entity:cashRegisters, groupBy:day, metrics:"totalSales,cashSales,cardSales,transferSales"

### Otras herramientas (para lo que /reports/query no cubre):
- GET /reports/sales-history?from=&to=&branchId=&cashRegisterId=&paymentMethod=&saleType=&search=&includeVoided=  → LISTA de ventas individuales (no agregada) — usa esto para "muéstrame las ventas de hoy", "busca la venta con factura X", "ventas con descuento aplicado"
- GET /reports/product-rotation?branchId=&cashRegisterId=  → qué tan rápido rota cada producto en los últimos 30 días (fijo, no acepta rango de fechas) — usa para "productos sin movimiento", "productos muertos", "rotación de inventario"
- GET /customers?search=&sortBy=  → directorio de clientes con su perfil (NIT, crédito) y estadísticas de compra. sortBy acepta "purchasesCount" (más frecuentes), "totalPurchases" (que más han gastado), "lastPurchase" (compra más reciente) o "name"
- GET /transfers?fromBranchId=&toBranchId=&status=  → traslados de inventario entre sucursales
- GET /goals?branchId=&year=&month=  → meta de ventas de la sucursal propia del usuario en un mes (si no se pasa year/month, usa el mes actual). Ya incluye cuánto debe venderse POR DÍA en lo que resta del mes para alcanzar la meta — NUNCA intentes calcular tú ese número, ya viene en la respuesta (solo para el mes actual; en meses pasados no aplica).
- GET /goals/compliance-report?branchId=&months=N  → meta y cumplimiento de TODAS las sucursales accesibles, mes a mes de los últimos N meses. NO pases branchId si quieres todas las sucursales. También incluye, por cada sucursal/mes, cuánto falta vender por día para llegar a la meta (solo calculado para el mes actual).

Para CUALQUIER pregunta sobre "meta", "meta de ventas" u "objetivo de ventas": usa /goals si es solo sobre la sucursal propia; usa /goals/compliance-report (months=1 si no piden historial) si menciona otras sucursales, "todas las sucursales", o comparar sucursales. NUNCA uses /reports/query para esto — las metas no son una métrica de ventas, son un objetivo distinto que se compara contra las ventas.
`

const queryConfigSchema = z.object({
  intent: z.string().default(''),
  endpoint: z.string(),
  // The model naturally emits a numeric-feeling param (limit, months, year)
  // as a real JSON number, not a quoted string, however literally the prompt
  // example shows it — a strict z.record(z.string()) rejected the ENTIRE
  // response over this alone, silently losing an otherwise perfectly good
  // answer to the keyword fallback. Accept string/number/boolean and coerce.
  params: z.record(z.union([z.string(), z.number(), z.boolean()]))
    .transform(obj => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, String(v)])))
    .default({}),
  visualization: z.enum(['bar', 'line', 'pie', 'table']).default('table'),
  title: z.string().default('Reporte'),
  description: z.string().default(''),
})

type QueryConfig = z.infer<typeof queryConfigSchema>

const historyTurnSchema = z.object({
  question: z.string(),
  intent: z.string().optional(),
})

function buildAnalyzePrompt(reportType: string, data: unknown, context?: string): string {
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

function parseRecommendations(text: string): Record<string, unknown>[] {
  try {
    const match = text.match(/\[[\s\S]*\]/)
    if (match) {
      const parsed = JSON.parse(match[0])
      return Array.isArray(parsed)
        ? parsed.slice(0, 4).map((r: Record<string, unknown>) => ({ ...r, actionable: true }))
        : []
    }
    return []
  } catch { return [] }
}

function localRules(reportType: string, data: Record<string, unknown>): Record<string, unknown>[] {
  const recs: Record<string, unknown>[] = []

  if (['inventory', 'inventory_status'].includes(reportType)) {
    if (Number(data?.lowStock ?? 0) > 0) {
      recs.push({ title: 'Productos con Stock Crítico', description: `Hay ${data.lowStock} producto(s) con stock bajo. Realiza un pedido urgente para evitar perder ventas.`, priority: 'high', category: 'inventory', actionable: true })
    }
    if (Number(data?.overstock ?? 0) > 0) {
      recs.push({ title: 'Reducir Inventario Excesivo', description: `${data.overstock} producto(s) tienen sobrestock. Crea promociones para aumentar su rotación y liberar capital.`, priority: 'medium', category: 'pricing', actionable: true })
    }
  }

  if (['sales', 'daily_sales', 'sales_history'].includes(reportType)) {
    const avg = Number(data?.avgTicket ?? 0)
    if (avg > 0 && avg < 50) {
      recs.push({ title: 'Aumentar Ticket Promedio', description: `El ticket promedio es Q${avg.toFixed(2)}. Implementa combos y venta cruzada para incrementarlo.`, priority: 'medium', category: 'marketing', actionable: true })
    }
    if (Number(data?.transactions ?? 0) < 10) {
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

  return `Eres el motor de inteligencia de negocio de un POS en Guatemala — esta función es el diferenciador principal del producto, así que cada respuesta debe ser precisa y realmente útil, no una aproximación genérica. El usuario pregunta:

"${question}"

Contexto: branchId="${branchId}" (la sucursal propia del usuario — ver abajo cuándo usarla), fecha actual="${today}"
${historyBlock}
${AVAILABLE_ENDPOINTS}

Determina qué herramienta y parámetros responden mejor la pregunta y responde SOLO con JSON válido, sin texto adicional:
{
  "intent": "descripción corta de lo que el usuario quiere ver",
  "endpoint": "/reports/query",
  "params": { "entity": "sales", "groupBy": "product", "metrics": "revenue,quantity", "from": "2026-05-01T00:00:00", "to": "2026-05-29T23:59:59" },
  "visualization": "bar|line|pie|table",
  "title": "Título del reporte",
  "description": "Qué muestra este reporte en 1-2 oraciones"
}

Reglas:
- endpoint debe ser EXACTAMENTE uno de los listados arriba, nada más
- Si la pregunta es sobre un período, calcúlalo desde "${today}" (ej. "este mes" = desde el día 1 de este mes hasta hoy)
- Si la pregunta hace referencia a la conversación previa, resuélvela usando ese contexto
- Si no hay combinación exacta que responda la pregunta, elige la más cercana — nunca respondas con un endpoint que no está en la lista
- visualization: "bar" para comparaciones entre categorías/productos/sucursales, "line" para tendencias en el tiempo (day/week/month), "pie" para distribuciones de una parte del total, "table" para listas detalladas o cuando hay más de una métrica relevante a la vez`
}

// The second half of "actually analyze this, don't just show a table": the
// model gets handed back the real rows it just caused to be fetched and has
// to answer the user's actual question from them — including doing any
// arithmetic the question calls for (a difference, a per-day/per-unit split,
// an average, a projection, a comparison between rows). Capped to the first
// 40 rows so a big report still stays well within a cheap token budget.
function buildAnalysisFromDataPrompt(question: string, columns: { key: string; label: string; type: string }[], rows: Record<string, unknown>[], today: string): string {
  const colDesc = columns.map(c => `${c.key} = ${c.label} (${c.type})`).join(', ')
  // Reformat any 'date' column to a business-local "YYYY-MM-DD HH:mm" string
  // before the model ever sees it — a raw UTC ISO timestamp has caused the
  // model to misjudge which calendar day an event falls on near the day
  // boundary (18:00-00:00 Guatemala time is already "tomorrow" in UTC).
  const dateKeys = columns.filter(c => c.type === 'date').map(c => c.key)
  const localizedRows = dateKeys.length === 0 ? rows : rows.map(row => {
    const copy = { ...row }
    for (const key of dateKeys) {
      const v = copy[key]
      if (typeof v === 'string' || v instanceof Date) {
        const d = v instanceof Date ? v : new Date(v)
        if (!isNaN(d.getTime())) copy[key] = toBusinessDateTimeLabel(d)
      }
    }
    return copy
  })
  const sample = JSON.stringify(localizedRows.slice(0, 40))
  const truncated = rows.length > 40 ? `\n(mostrando 40 de ${rows.length} filas — para tu análisis asume que el resto sigue un patrón similar salvo que algo en la pregunta sugiera lo contrario)` : ''

  // Pre-summed totals for every numeric/currency column, computed exactly in
  // code rather than left for the model to re-add across many rows — adding
  // ~5-40 decimal numbers by eye is exactly where a model's arithmetic
  // quietly drifts by a little (seen in testing: summed 5 rows to Q43 when
  // the real total was Q44). Over this many rows it should cite these, not
  // re-derive them — still free to compute anything ELSE from the raw rows
  // (an average, a per-row comparison, a per-day split) that isn't already
  // summed here.
  const sumKeys = columns.filter(c => c.type === 'currency' || c.type === 'number').map(c => c.key)
  const totals = sumKeys.length > 0 && rows.length > 1
    ? sumKeys.map(key => {
        const sum = rows.reduce((s, r) => s + (Number(r[key]) || 0), 0)
        const col = columns.find(c => c.key === key)!
        return `${col.label} total = ${Math.round(sum * 100) / 100}`
      }).join(', ')
    : null

  return `Eres un analista de negocio de un POS en Guatemala respondiendo la pregunta de un usuario, usando SOLO los datos reales de abajo — ya se obtuvieron para esta pregunta.

Pregunta del usuario: "${question}"
Fecha de hoy: ${today} (hora de Guatemala — cualquier columna de fecha/hora en los datos de abajo YA está en esta misma zona horaria, no le apliques ningún ajuste adicional)

Columnas: ${colDesc}
Datos:
${sample}${truncated}
${totals ? `\nTotales YA sumados sobre las ${rows.length} fila(s) completas (cítalos tal cual para cualquier "total"/"suma" — no vuelvas a sumar columna por columna a mano, así es como se cuelan pequeños errores de redondeo): ${totals}` : ''}

Responde la pregunta directamente, en español, en 2-4 oraciones, como lo haría un analista con calculadora en mano:
- Si la pregunta pide un cálculo (cuánto falta, promedio, diferencia, por día, por hora, proyección, comparación entre filas, porcentaje, etc.), HAZLO tú mismo con los números reales de arriba. Nunca digas que no puedes calcularlo ni inventes una cifra — si un dato que necesitas no está en la tabla, dilo explícitamente en vez de adivinar.
- Menciona cifras concretas en Quetzales (Q) cuando aplique, redondeadas a 2 decimales.
- No repitas la tabla completa (ya se muestra aparte) — da la respuesta/análisis, no una transcripción de los datos.
- Si hay algo accionable u obvio en los datos (un valor atípico, una fila muy por debajo o encima del resto), puedes mencionarlo brevemente, pero prioriza responder exactamente lo que se preguntó.`
}

// A dimension-aware, metric-aware keyword fallback — used when there's no
// ANTHROPIC_API_KEY configured, or the live call fails/times out. Unlike a
// single hardcoded endpoint per keyword, this composes a /reports/query
// request from whatever dimension + metric words it recognizes, so it stays
// reasonably capable (not just "top products, always") even without the
// model in the loop.
const DIMENSION_KEYWORDS: [RegExp, string][] = [
  [/producto/i, 'product'],
  [/categor[ií]a/i, 'category'],
  [/client/i, 'customer'],
  [/sucursal|tienda/i, 'branch'],
  [/m[eé]todo de pago|efectivo|tarjeta|transferencia/i, 'paymentMethod'],
  [/cajer[oa]/i, 'cashier'],
  [/caja\b/i, 'cashRegister'],
  [/d[ií]a\b/i, 'day'],
  [/semana/i, 'week'],
  [/mes\b|mensual/i, 'month'],
]
const METRIC_KEYWORDS: [RegExp, string][] = [
  [/ganancia|utilidad|margen/i, 'profit'],
  [/cantidad|unidades/i, 'quantity'],
  [/ticket promedio/i, 'avgTicket'],
  [/costo/i, 'cost'],
]

function fallbackQueryConfig(question: string, branchId: string, today: string): QueryConfig {
  const q = question.toLowerCase()
  const from30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10) + 'T00:00:00'
  const to = today + 'T23:59:59'

  if (q.includes('meta') || q.includes('objetivo de venta')) {
    const mentionsOtherBranches = /sucursal|tienda|demas|demás/.test(q)
    if (mentionsOtherBranches) {
      return { intent: 'Cumplimiento de metas de todas las sucursales', endpoint: '/goals/compliance-report', params: { months: '1' }, visualization: 'table',
        title: 'Cumplimiento de Metas', description: 'Meta de ventas y cuánto se ha cumplido en cada sucursal este mes' }
    }
    return { intent: 'Meta de ventas', endpoint: '/goals', params: { branchId }, visualization: 'table',
      title: 'Meta de Ventas', description: 'Meta de ventas del mes actual y el total vendido hasta el momento' }
  }
  if (q.includes('cliente') || q.includes('comprador')) {
    const sortBy = /frecuen/.test(q) ? 'purchasesCount' : /gast|compr[oó]|total/.test(q) ? 'totalPurchases' : /reciente|última|ultima/.test(q) ? 'lastPurchase' : 'purchasesCount'
    return { intent: 'Análisis de clientes', endpoint: '/customers', params: { sortBy }, visualization: 'table',
      title: 'Reporte de Clientes', description: 'Clientes con su historial de compras' }
  }
  if (q.includes('rotaci') || q.includes('muerto') || q.includes('sin movimiento')) {
    return { intent: 'Rotación de productos', endpoint: '/reports/product-rotation', params: { branchId }, visualization: 'bar',
      title: 'Rotación de Productos (últimos 30 días)', description: 'Análisis de qué tan rápido se venden los productos' }
  }
  if (q.includes('traslado')) {
    return { intent: 'Traslados entre sucursales', endpoint: '/transfers', params: {}, visualization: 'table',
      title: 'Traslados', description: 'Traslados de stock entre sucursales' }
  }
  if (q.includes('historial de venta') || q.includes('busca la venta') || q.includes('factura')) {
    return { intent: 'Historial de ventas', endpoint: '/reports/sales-history', params: { branchId, from: from30, to }, visualization: 'table',
      title: 'Historial de Ventas', description: 'Ventas individuales del período' }
  }
  // "Últimos N productos/ventas" is a chronological list, not a sum — checked
  // before the generic dimension-keyword loop below, since a phrase like
  // "últimos 5 productos vendidos" would otherwise match 'product' first and
  // silently turn into a sum of the whole period instead of a recent list.
  if (/[uú]ltim|reci[eé]n|hace un momento|se acaba de vender/.test(q)) {
    const limitMatch = q.match(/\d+/)
    return { intent: 'Productos vendidos recientemente', endpoint: '/reports/query',
      params: { entity: 'sales', groupBy: 'recent', branchId, from: from30, to, limit: limitMatch ? limitMatch[0] : '10' },
      visualization: 'table', title: 'Ventas Recientes', description: 'Las ventas más recientes, de más nueva a más vieja' }
  }

  // Everything else funnels through the flexible query engine — pick the
  // entity from keywords, the dimension from DIMENSION_KEYWORDS, and sensible
  // metrics (revenue/salesCount by default, or whatever metric keywords matched).
  const entity = /inventario|stock/.test(q) ? 'inventory' : /caja\b|flujo de caja|efectivo en caja/.test(q) ? 'cashRegisters' : 'sales'
  const dimensionMatch = DIMENSION_KEYWORDS.find(([re]) => re.test(q))
  const groupBy = dimensionMatch?.[1] ?? (entity === 'sales' ? 'product' : 'category')
  const matchedMetrics = METRIC_KEYWORDS.filter(([re]) => re.test(q)).map(([, m]) => m)
  const metrics = entity === 'inventory'
    ? (matchedMetrics.length ? matchedMetrics.filter(m => (INVENTORY_METRICS as readonly string[]).includes(m)) : ['quantity', 'value'])
    : entity === 'cashRegisters'
      ? ['totalSales', 'sessionCount']
      : (matchedMetrics.length ? [...new Set(['revenue', ...matchedMetrics])] : ['revenue', 'quantity'])

  return {
    intent: 'Reporte de ventas', endpoint: '/reports/query',
    params: { entity, groupBy, metrics: metrics.join(','), from: from30, to, branchId },
    visualization: groupBy === 'day' || groupBy === 'week' || groupBy === 'month' ? 'line' : 'bar',
    title: 'Reporte', description: 'Reporte generado automáticamente a partir de tu pregunta',
  }
}

// /reports/query is the only endpoint that compares branches (groupBy:
// 'branch'); every other tool — and /reports/query itself for any other
// groupBy — is always pinned to the asking user's own branch server-side,
// never trusting the model's choice of branchId.
function isBranchOptional(endpoint: string, params: Record<string, string>): boolean {
  if (endpoint === '/goals/compliance-report') return true
  if (endpoint === '/reports/query' && params.groupBy === 'branch') return true
  return false
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
  if (allowedParams.includes('branchId') && !isBranchOptional(config.endpoint, params)) {
    params.branchId = branchId
  }

  return { ...config, params }
}

// ---------------------------------------------------------------------------
// Response normalization — turns whatever shape each endpoint actually
// returns into one uniform {columns, rows} contract, computed HERE from the
// real response (never guessed client-side from field names). /reports/query
// already returns this shape natively; everything else gets a small,
// hand-authored, correct column map (these are OUR endpoints' real fields,
// not the model's guess) so the frontend never has to infer what a column
// means from its key name.
// ---------------------------------------------------------------------------
interface NormalizedReport { columns: { key: string; label: string; type: string }[]; rows: Record<string, unknown>[] }

const ENTITY_LABELS: Record<string, string> = { sales: 'Ventas', inventory: 'Inventario', cashRegisters: 'Flujo de Caja' }

// A small, fast model (haiku) sometimes leaves an optional-feeling field like
// "title" out of its JSON entirely — zod's schema default then silently
// fills in the generic "Reporte", which looks unfinished in the chat. For
// /reports/query specifically we can always do better from the params
// themselves (we know exactly what was asked), so a generic/missing title
// never reaches the user even when the model was terse about it.
function autoQueryTitle(endpoint: string, params: Record<string, string>): string {
  if (endpoint !== '/reports/query') return 'Reporte'
  const entityLabel = ENTITY_LABELS[params.entity ?? 'sales'] ?? 'Reporte'
  const dim = params.groupBy && params.groupBy !== 'none' ? DIMENSION_LABELS[params.groupBy] : undefined
  return dim ? `${entityLabel} por ${dim}` : entityLabel
}

function normalizeForReport(endpoint: string, data: unknown): NormalizedReport {
  if (endpoint === '/reports/query') {
    const d = data as { columns?: NormalizedReport['columns']; rows?: Record<string, unknown>[] } | null
    return { columns: d?.columns ?? [], rows: d?.rows ?? [] }
  }

  if (endpoint === '/customers') {
    const rows = Array.isArray(data) ? data as Record<string, unknown>[] : []
    return {
      columns: [
        { key: 'name', label: 'Cliente', type: 'string' },
        { key: 'nit', label: 'NIT', type: 'string' },
        { key: 'purchasesCount', label: 'Compras', type: 'number' },
        { key: 'totalPurchases', label: 'Total Comprado (Q)', type: 'currency' },
        { key: 'lastPurchase', label: 'Última Compra', type: 'date' },
        { key: 'creditUsed', label: 'Crédito Usado (Q)', type: 'currency' },
      ],
      rows,
    }
  }

  if (endpoint === '/goals') {
    const d = data as Record<string, unknown> | null
    return {
      columns: [
        { key: 'targetAmount', label: 'Meta (Q)', type: 'currency' },
        { key: 'currentAmount', label: 'Vendido (Q)', type: 'currency' },
        { key: 'percent', label: 'Cumplimiento (%)', type: 'percent' },
        { key: 'dailyTargetToReachGoal', label: 'Venta Diaria Necesaria (Q)', type: 'currency' },
      ],
      rows: d ? [d] : [],
    }
  }

  if (endpoint === '/goals/compliance-report') {
    const rows = Array.isArray(data) ? data as Record<string, unknown>[] : []
    return {
      columns: [
        { key: 'branchName', label: 'Sucursal', type: 'string' },
        { key: 'targetAmount', label: 'Meta (Q)', type: 'currency' },
        { key: 'currentAmount', label: 'Vendido (Q)', type: 'currency' },
        { key: 'percent', label: 'Cumplimiento (%)', type: 'percent' },
        { key: 'dailyTargetToReachGoal', label: 'Venta Diaria Necesaria (Q)', type: 'currency' },
      ],
      rows,
    }
  }

  if (endpoint === '/transfers') {
    const rows = Array.isArray(data) ? data as Record<string, unknown>[] : []
    return {
      columns: [
        { key: 'id', label: 'ID', type: 'string' },
        { key: 'fromBranchId', label: 'Desde', type: 'string' },
        { key: 'toBranchId', label: 'Hacia', type: 'string' },
        { key: 'status', label: 'Estado', type: 'string' },
      ],
      rows,
    }
  }

  if (endpoint === '/reports/product-rotation') {
    const rows = Array.isArray(data) ? data as Record<string, unknown>[] : []
    return {
      columns: [
        { key: 'name', label: 'Producto', type: 'string' },
        { key: 'category', label: 'Categoría', type: 'string' },
        { key: 'currentStock', label: 'Stock Actual', type: 'number' },
        { key: 'salesLast30Days', label: 'Vendido (30 días)', type: 'number' },
        { key: 'rotationIndex', label: 'Índice de Rotación', type: 'number' },
        { key: 'daysOfInventory', label: 'Días de Inventario', type: 'number' },
        { key: 'status', label: 'Estado', type: 'string' },
      ],
      rows,
    }
  }

  if (endpoint === '/reports/sales-history') {
    const rows = (Array.isArray(data) ? data : []).map((s: Record<string, unknown>) => ({
      invoiceNumber: s.invoiceNumber,
      createdAt: s.createdAt,
      customer: (s.customer as { name?: string } | null)?.name ?? 'Consumidor Final',
      total: Number(s.total ?? 0),
      paymentMethod: s.paymentMethod,
      saleType: s.saleType,
    }))
    return {
      columns: [
        { key: 'invoiceNumber', label: 'Factura', type: 'string' },
        { key: 'createdAt', label: 'Fecha', type: 'date' },
        { key: 'customer', label: 'Cliente', type: 'string' },
        { key: 'total', label: 'Total (Q)', type: 'currency' },
        { key: 'paymentMethod', label: 'Método de Pago', type: 'string' },
        { key: 'saleType', label: 'Tipo', type: 'string' },
      ],
      rows,
    }
  }

  // Unknown shape (shouldn't happen given the allowlist) — show it as a
  // single row rather than silently nothing, so a gap here is visible.
  if (Array.isArray(data)) return { columns: [], rows: data as Record<string, unknown>[] }
  return { columns: [], rows: data && typeof data === 'object' ? [data as Record<string, unknown>] : [] }
}

export default async function aiRoutes(fastify: FastifyInstance) {
  // AI calls cost money per request and hit an external API — cap them tighter
  // than the general API rate limit.
  const aiRateLimit = { config: { rateLimit: { max: 20, timeWindow: 60_000 } } }

  // POST /api/ai/query-report — AI interprets question, fetches data, returns
  // { config, columns, rows } — a single uniform contract regardless of which
  // internal tool answered the question, so the frontend never has to guess
  // what a field means from its name.
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
    // Business-local date, not raw UTC — during the ~6h window where it's
    // already a new UTC day but still "yesterday" evening in Guatemala, a
    // plain UTC date made "ventas de hoy" silently look at the wrong day.
    const today = toBusinessDateKey(new Date())

    let config: QueryConfig | null = null
    const client = await getAnthropicClient()
    if (client && !(await requireAiQuota(reply))) return reply
    const startedAt = Date.now()
    const tokens = { inputTokens: 0, outputTokens: 0 }

    if (client) {
      try {
        const msg = await client.messages.create({
          model: AI_MODEL,
          max_tokens: 700,
          messages: [{ role: 'user', content: buildQueryPrompt(question, branchId, today, history) }],
        })
        tokens.inputTokens += msg.usage.input_tokens
        tokens.outputTokens += msg.usage.output_tokens
        const text = msg.content[0]?.type === 'text' ? msg.content[0].text : ''
        const match = text.match(/\{[\s\S]*\}/)
        if (!match) {
          fastify.log.warn({ question, text }, 'AI query-report: no JSON object in model response, using fallback')
        } else {
          const raw = queryConfigSchema.safeParse(JSON.parse(match[0]))
          if (!raw.success) {
            fastify.log.warn({ question, text, issues: raw.error.flatten() }, 'AI query-report: model JSON failed schema validation, using fallback')
          } else {
            config = sanitizeConfig(raw.data, branchId)
            if (!config) {
              fastify.log.warn({ question, endpoint: raw.data.endpoint }, 'AI query-report: model picked a non-allowlisted endpoint, using fallback')
            }
          }
        }
      } catch (err) {
        fastify.log.warn(err, 'AI query-report: live call threw, using fallback')
      }
    }

    // Fallback: keyword-driven /reports/query composition (also used when the
    // AI picks a non-allowlisted endpoint, so the request never silently fails).
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

      if (req.statusCode >= 400) {
        const body = JSON.parse(req.body || '{}')
        return reply.status(req.statusCode).send({ error: body.error ?? 'Error al obtener los datos del reporte' })
      }

      const data = JSON.parse(req.body)
      const { columns, rows } = normalizeForReport(config.endpoint, data)
      const title = (config.title && config.title !== 'Reporte') ? config.title : autoQueryTitle(config.endpoint, config.params)
      let description = config.description || `Aquí está tu reporte: ${title.toLowerCase()}.`

      // Reasoning pass: hands the model the REAL numbers it just fetched and
      // has it actually answer the question — including any arithmetic the
      // question asks for (a difference, a per-day split, an average, a
      // projection) — instead of just handing back a table. This is the
      // difference between "a chart appeared" and the AI genuinely analyzing
      // the data, and it's why a follow-up like "¿y cuánto debo vender por
      // día para llegar?" works without a bespoke backend field for every
      // possible derived question — the model computes it from the rows
      // itself, the same way a person would with a calculator in hand.
      if (client && rows.length > 0) {
        try {
          const analysisMsg = await client.messages.create({
            model: AI_MODEL,
            max_tokens: 350,
            messages: [{ role: 'user', content: buildAnalysisFromDataPrompt(question, columns, rows, today) }],
          })
          tokens.inputTokens += analysisMsg.usage.input_tokens
          tokens.outputTokens += analysisMsg.usage.output_tokens
          const analysisText = analysisMsg.content[0]?.type === 'text' ? analysisMsg.content[0].text.trim() : ''
          if (analysisText) description = analysisText
        } catch (err) {
          fastify.log.warn(err, 'AI query-report: analysis pass failed, using generic description')
        }
      }

      if (client) {
        await recordAiUsage(request, { kind: 'QUERY', question, success: true, model: AI_MODEL, branchId, ...tokens, durationMs: Date.now() - startedAt })
      }
      return reply.send({ config: { title, description, visualization: config.visualization, intent: config.intent }, columns, rows })
    } catch (err) {
      fastify.log.error(err, 'Failed to fetch report data')
      return reply.status(500).send({ error: 'Error al obtener los datos del reporte' })
    }
  })

  // POST /api/ai/analyst — open-ended analysis: the model writes and runs its
  // own read-only SQL over business views (see lib/aiAnalyst.ts), iterates
  // on the real results, and returns a structured report the frontend
  // renders as KPIs/charts/tables. Handles questions nobody anticipated.
  fastify.post('/analyst', { config: { rateLimit: { max: 10, timeWindow: 60_000 } }, preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!hasAnyReportsPermission(request)) return reply.status(403).send({ error: 'No tienes permiso para esta acción' })
    const parsed = z.object({
      question: z.string().trim().min(3).max(1000),
      branchId: z.string().optional(),
      // Trimmed rather than rejected — an over-long history should never
      // make a follow-up question fail.
      history: z.array(z.object({
        question: z.string().transform(s => s.slice(0, 1000)),
        summary: z.string().transform(s => s.slice(0, 6000)).optional(),
        queries: z.array(z.object({ purpose: z.string().optional(), sql: z.string().transform(s => s.slice(0, 8000)) }))
          .transform(qs => qs.slice(-8)).optional(),
      })).transform(h => h.slice(-4)).optional(),
    }).safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    if (!(await requireAiQuota(reply))) return reply
    const client = await getAnthropicClient()
    if (!client) {
      return reply.status(503).send({ error: 'La IA no está configurada en el servidor (falta ANTHROPIC_API_KEY).' })
    }

    const isAdmin = request.user.role === 'ADMIN'
    const branchIds = isAdmin ? null : allowedBranchIds(request)
    const canSeeCosts = hasPermission(request, 'reports.financial')
    const branches = await prisma.branch.findMany({
      where: branchIds ? { id: { in: branchIds } } : {},
      select: { id: true, name: true },
    })
    const selected = parsed.data.branchId ? branches.find(b => b.id === parsed.data.branchId) : undefined
    const user = await prisma.user.findUnique({ where: { id: request.user.id }, select: { name: true } })

    const model = process.env.ANTHROPIC_ANALYST_MODEL ?? 'claude-sonnet-5-5'
    const usage: AnalystUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
    const startedAt = Date.now()
    const logUsage = (success: boolean) => recordAiUsage(request, {
      kind: 'ANALYST', question: parsed.data.question, success, model,
      branchId: parsed.data.branchId ?? null, ...usage, durationMs: Date.now() - startedAt,
    })
    try {
      const report = await runAnalyst({
        client,
        model,
        question: parsed.data.question,
        history: parsed.data.history ?? [],
        ctx: {
          today: toBusinessDateKey(new Date()),
          now: toBusinessDateTimeLabel(new Date()),
          userName: user?.name ?? 'usuario',
          branchNames: branchIds ? branches.map(b => b.name) : null,
          ...(selected ? { selectedBranchName: selected.name } : {}),
          canSeeCosts,
        },
        scope: { branchIds, canSeeCosts },
        log: (obj, msg) => fastify.log.warn(obj, msg),
        usage,
      })
      await logUsage(true)
      return reply.send(report)
    } catch (err) {
      fastify.log.error(err, 'AI analyst failed')
      // Not charged to the client's allowance, but kept so the token cost is visible
      if (usage.inputTokens > 0) await logUsage(false)
      const status = (err as { status?: number }).status
      if (status === 401) return reply.status(503).send({ error: 'La clave de la IA no es válida — revisa ANTHROPIC_API_KEY en el servidor.' })
      if (status === 429 || status === 529) return reply.status(503).send({ error: 'La IA está saturada en este momento, intenta de nuevo en un minuto.' })
      return reply.status(502).send({ error: 'No se pudo completar el análisis. Intenta de nuevo o reformula la pregunta.' })
    }
  })

  fastify.post('/analyze', { ...aiRateLimit, preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!hasAnyReportsPermission(request)) return reply.status(403).send({ error: 'No tienes permiso para esta acción' })
    const parsed = z.object({
      reportType: z.string(),
      data: z.unknown(),
      context: z.string().optional(),
    }).safeParse(request.body)

    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const { reportType, data, context } = parsed.data
    const client = await getAnthropicClient()

    if (!client) {
      return reply.send({ recommendations: localRules(reportType, data as Record<string, unknown>) })
    }
    if (!(await requireAiQuota(reply))) return reply

    const startedAt = Date.now()
    try {
      const msg = await client.messages.create({
        model: AI_MODEL,
        max_tokens: 900,
        messages: [{ role: 'user', content: buildAnalyzePrompt(reportType, data, context) }],
      })

      const text = msg.content[0]?.type === 'text' ? msg.content[0].text : ''
      const recommendations = parseRecommendations(text)
      await recordAiUsage(request, {
        kind: 'RECOMMENDATION',
        question: `Recomendaciones: ${REPORT_TYPE_LABELS[reportType] ?? reportType}`,
        success: recommendations.length > 0,
        model: AI_MODEL,
        inputTokens: msg.usage.input_tokens,
        outputTokens: msg.usage.output_tokens,
        durationMs: Date.now() - startedAt,
      })

      return reply.send({ recommendations: recommendations.length > 0 ? recommendations : localRules(reportType, data as Record<string, unknown>) })
    } catch (err) {
      fastify.log.error(err, 'AI analyze error')
      return reply.send({ recommendations: localRules(reportType, data as Record<string, unknown>) })
    }
  })
  // GET /api/ai/usage — this month's allowance, for the counter shown next
  // to every AI feature. Any logged-in user.
  fastify.get('/usage', { preHandler: [fastify.authenticate] }, async (_request, reply) => {
    return reply.send(await getAiStatus())
  })

  // GET /api/ai/usage/details — who asked what this month (client ADMIN).
  // Counts only, no tokens/cost — that's the vendor's business (see /usage/vendor).
  fastify.get('/usage/details', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'ADMIN') return reply.status(403).send({ error: 'Acceso denegado' })
    const { start, end } = aiPeriod()
    const where = { success: true, createdAt: { gte: start, lt: end } }
    const [status, byUser, byKind, recent] = await Promise.all([
      getAiStatus(),
      prisma.aiUsage.groupBy({ by: ['userId', 'userName'], where, _count: { _all: true } }),
      prisma.aiUsage.groupBy({ by: ['kind'], where, _count: { _all: true } }),
      prisma.aiUsage.findMany({
        where, orderBy: { createdAt: 'desc' }, take: 100,
        select: { id: true, kind: true, userName: true, question: true, durationMs: true, createdAt: true },
      }),
    ])
    return reply.send({
      status,
      byUser: byUser.map(u => ({ userId: u.userId, userName: u.userName, count: u._count._all })).sort((a, b) => b.count - a.count),
      byKind: Object.fromEntries(byKind.map(k => [k.kind, k._count._all])),
      recent,
    })
  })

  // GET /api/ai/usage/vendor?months=6 — token totals per month and model, for
  // the vendor to see what each client really costs. Same shared secret as
  // PUT /api/license; 404 without it so the route doesn't advertise itself.
  fastify.get('/usage/vendor', async (request, reply) => {
    const secret = process.env.LICENSE_ADMIN_SECRET
    if (!secret || request.headers['x-license-secret'] !== secret) return reply.status(404).send({ error: 'Not found' })
    const months = Math.min(24, Math.max(1, Number((request.query as { months?: string }).months) || 6))
    const rows = await prisma.$queryRaw<{ month: string; model: string; kind: string; success: boolean; calls: bigint; input: bigint; output: bigint; cache_read: bigint; cache_write: bigint }[]>`
      SELECT to_char("CREATED_AT" - interval '6 hours', 'YYYY-MM') AS month, "MODEL" AS model, "KIND" AS kind, "SUCCESS" AS success,
             count(*) AS calls, sum("INPUT_TOKENS") AS input, sum("OUTPUT_TOKENS") AS output,
             sum("CACHE_READ_TOKENS") AS cache_read, sum("CACHE_WRITE_TOKENS") AS cache_write
      FROM "AI_USAGE"
      WHERE "CREATED_AT" >= now() - make_interval(months => ${months}::int)
      GROUP BY 1, 2, 3, 4
      ORDER BY 1 DESC, 2, 3, 4`
    return reply.send({
      status: await getAiStatus(),
      rows: rows.map(r => ({
        month: r.month, model: r.model, kind: r.kind, success: r.success, calls: Number(r.calls),
        inputTokens: Number(r.input), outputTokens: Number(r.output),
        cacheReadTokens: Number(r.cache_read), cacheWriteTokens: Number(r.cache_write),
      })),
    })
  })
}
