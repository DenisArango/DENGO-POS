// AI data analyst — answers any business question by writing its own
// read-only SQL over a curated set of business views, looking at the real
// results, iterating, and finally returning a structured report (KPIs,
// charts, tables, narrative) that the React frontend renders.
//
// This replaced a fixed "pick one of N canned queries" design that could
// only answer questions someone had anticipated in advance.
//
// Safety model (defense in depth — any ONE of these alone blocks writes):
//   1. The model never sees or names real tables: it queries CTE "views"
//      (ventas, inventario, …) that this module prepends to its SQL, and
//      search_path is pointed away from the schema holding the real tables.
//   2. The statement runs inside a READ ONLY transaction with a hard
//      statement_timeout.
//   3. The SQL text is validated: one SELECT/WITH statement, no comments,
//      no DDL/DML/session keywords, no system catalogs or admin functions.
//   4. Branch scoping and cost visibility are enforced inside the views
//      (bound parameters), so a non-admin can only ever see their branches
//      and a user without reports.financial never sees costs/profit.

import type Anthropic from '@anthropic-ai/sdk'
import { prisma } from './prisma.js'

// ── Semantic layer ──────────────────────────────────────────────────────────

// Same fixed offset as lib/timezone.ts (Guatemala, UTC-6, no DST). Every
// timestamp is converted once here so the model only ever sees local time.
const LOCAL = (col: string) => `(${col} - interval '6 hours')`
// $1 = allowed branch ids (NULL = all), $2 = may see costs.
const BRANCH = (col: string) => `($1::text[] IS NULL OR ${col} = ANY($1::text[]))`
const COST = (expr: string) => `(CASE WHEN $2::boolean THEN (${expr})::float8 END)`

interface ViewDef { name: string; doc: string; sql: string }

const VIEWS: ViewDef[] = [
  {
    name: 'sucursales',
    doc: 'id, nombre, codigo, estado',
    sql: `SELECT b."ID" AS id, b."NAME" AS nombre, b."CODE" AS codigo, b."STATUS" AS estado
          FROM public."BRANCHES" b WHERE ${BRANCH('b."ID"')}`,
  },
  {
    name: 'productos',
    doc: 'id, nombre, codigo_barras, sku, marca, categoria, unidad_base, precio_venta (por unidad base), costo_unitario (por unidad base), stock_minimo, stock_maximo (NULL = sin máximo), activo, creado',
    sql: `SELECT p."ID" AS id, p."NAME" AS nombre, p."BARCODE" AS codigo_barras, p."SKU" AS sku, p."BRAND" AS marca,
                 c."NAME" AS categoria, u."NAME" AS unidad_base, p."BASE_PRICE"::float8 AS precio_venta,
                 ${COST('p."COST"')} AS costo_unitario, p."MIN_STOCK" AS stock_minimo, p."MAX_STOCK" AS stock_maximo,
                 p."IS_ACTIVE" AS activo, ${LOCAL('p."CREATED_AT"')} AS creado
          FROM public."PRODUCTS" p
          JOIN public."CATEGORIES" c ON c."ID" = p."CATEGORY_ID"
          JOIN public."PRODUCT_UNITS" u ON u."ID" = p."BASE_UNIT_ID"`,
  },
  {
    name: 'presentaciones',
    doc: 'id, producto_id, producto, nombre (ej. "Caja de 12", "Resma"), factor_conversion (unidades base que contiene), precio (precio de venta de la presentación), codigo_barras',
    sql: `SELECT v."ID" AS id, v."PRODUCT_ID" AS producto_id, p."NAME" AS producto, v."NAME" AS nombre,
                 v."CONVERSION_FACTOR"::float8 AS factor_conversion, v."PRICE"::float8 AS precio, v."BARCODE" AS codigo_barras
          FROM public."PRODUCT_VARIATIONS" v JOIN public."PRODUCTS" p ON p."ID" = v."PRODUCT_ID"`,
  },
  {
    name: 'inventario',
    doc: 'producto_id, producto, categoria, sucursal_id, sucursal, cantidad (en unidades base), costo_unitario, precio_venta, valor_costo (cantidad*costo), valor_venta (cantidad*precio), stock_minimo, stock_maximo, ultima_venta, ultimo_ingreso, producto_activo',
    sql: `SELECT i."PRODUCT_ID" AS producto_id, p."NAME" AS producto, c."NAME" AS categoria, i."BRANCH_ID" AS sucursal_id,
                 b."NAME" AS sucursal, i."QUANTITY"::float8 AS cantidad, ${COST('p."COST"')} AS costo_unitario,
                 p."BASE_PRICE"::float8 AS precio_venta, ${COST('i."QUANTITY" * p."COST"')} AS valor_costo,
                 (i."QUANTITY" * p."BASE_PRICE")::float8 AS valor_venta, p."MIN_STOCK" AS stock_minimo,
                 p."MAX_STOCK" AS stock_maximo, ${LOCAL('i."LAST_SALE_AT"')} AS ultima_venta,
                 ${LOCAL('i."LAST_RESTOCK_AT"')} AS ultimo_ingreso, p."IS_ACTIVE" AS producto_activo
          FROM public."INVENTORY" i
          JOIN public."PRODUCTS" p ON p."ID" = i."PRODUCT_ID"
          JOIN public."CATEGORIES" c ON c."ID" = p."CATEGORY_ID"
          JOIN public."BRANCHES" b ON b."ID" = i."BRANCH_ID"
          WHERE ${BRANCH('i."BRANCH_ID"')}`,
  },
  {
    name: 'ventas',
    doc: 'id, numero, fecha (timestamp local), dia (date), hora (0-23), dia_semana (1=lunes … 7=domingo), sucursal_id, sucursal, cajero, cliente_id, cliente, nit_cliente, metodo_pago (CASH|CARD|TRANSFER|MIXED|CREDIT), tipo_venta (CASH|CREDIT), subtotal, descuento, total, efectivo, tarjeta, transferencia, pagada, monto_pagado, vence, anulada, con_factura, caja, numero_caja',
    sql: `SELECT s."ID" AS id, s."INVOICE_NUMBER" AS numero, ${LOCAL('s."CREATED_AT"')} AS fecha,
                 ${LOCAL('s."CREATED_AT"')}::date AS dia, EXTRACT(HOUR FROM ${LOCAL('s."CREATED_AT"')})::int AS hora,
                 EXTRACT(ISODOW FROM ${LOCAL('s."CREATED_AT"')})::int AS dia_semana,
                 s."BRANCH_ID" AS sucursal_id, b."NAME" AS sucursal, us."NAME" AS cajero, s."CUSTOMER_ID" AS cliente_id,
                 cu."NAME" AS cliente, cu."NIT" AS nit_cliente, s."PAYMENT_METHOD" AS metodo_pago, s."SALE_TYPE" AS tipo_venta,
                 s."SUBTOTAL"::float8 AS subtotal, s."DISCOUNT"::float8 AS descuento, s."TOTAL"::float8 AS total,
                 s."CASH_AMOUNT"::float8 AS efectivo, s."CARD_AMOUNT"::float8 AS tarjeta, s."TRANSFER_AMOUNT"::float8 AS transferencia,
                 s."IS_PAID" AS pagada, s."PAID_AMOUNT"::float8 AS monto_pagado, ${LOCAL('s."DUE_DATE"')}::date AS vence,
                 s."IS_VOIDED" AS anulada, s."REQUIRES_INVOICE" AS con_factura, cr."NAME" AS caja, cr."REGISTER_NUMBER" AS numero_caja
          FROM public."SALES" s
          JOIN public."BRANCHES" b ON b."ID" = s."BRANCH_ID"
          JOIN public."USERS" us ON us."ID" = s."CASHIER_ID"
          LEFT JOIN public."CUSTOMERS" cu ON cu."ID" = s."CUSTOMER_ID"
          LEFT JOIN public."CASH_REGISTERS" cr ON cr."ID" = s."CASH_REGISTER_ID"
          WHERE ${BRANCH('s."BRANCH_ID"')}`,
  },
  {
    name: 'ventas_detalle',
    doc: 'una fila por producto vendido: id, venta_id, numero, fecha, dia, hora, dia_semana, sucursal_id, sucursal, cajero, cliente_id, cliente, metodo_pago, producto_id, producto, categoria, presentacion ("Unidad" si se vendió la unidad base), factor_conversion, cantidad (en la presentación vendida), unidades_base (cantidad*factor — úsala para comparar con inventario), precio_unitario, descuento_pct, total_linea, costo_linea, ganancia_linea, anulada',
    sql: `SELECT si."ID" AS id, s."ID" AS venta_id, s."INVOICE_NUMBER" AS numero, ${LOCAL('s."CREATED_AT"')} AS fecha,
                 ${LOCAL('s."CREATED_AT"')}::date AS dia, EXTRACT(HOUR FROM ${LOCAL('s."CREATED_AT"')})::int AS hora,
                 EXTRACT(ISODOW FROM ${LOCAL('s."CREATED_AT"')})::int AS dia_semana,
                 s."BRANCH_ID" AS sucursal_id, b."NAME" AS sucursal, us."NAME" AS cajero, s."CUSTOMER_ID" AS cliente_id,
                 cu."NAME" AS cliente, s."PAYMENT_METHOD" AS metodo_pago, si."PRODUCT_ID" AS producto_id, p."NAME" AS producto,
                 c."NAME" AS categoria, COALESCE(v."NAME", 'Unidad') AS presentacion,
                 COALESCE(v."CONVERSION_FACTOR", 1)::float8 AS factor_conversion, si."QUANTITY"::float8 AS cantidad,
                 (si."QUANTITY" * COALESCE(v."CONVERSION_FACTOR", 1))::float8 AS unidades_base,
                 si."UNIT_PRICE"::float8 AS precio_unitario, (si."DISCOUNT" * 100)::float8 AS descuento_pct,
                 si."TOTAL"::float8 AS total_linea,
                 ${COST('p."COST" * COALESCE(v."CONVERSION_FACTOR", 1) * si."QUANTITY"')} AS costo_linea,
                 ${COST('si."TOTAL" - p."COST" * COALESCE(v."CONVERSION_FACTOR", 1) * si."QUANTITY"')} AS ganancia_linea,
                 s."IS_VOIDED" AS anulada
          FROM public."SALE_ITEMS" si
          JOIN public."SALES" s ON s."ID" = si."SALE_ID"
          JOIN public."PRODUCTS" p ON p."ID" = si."PRODUCT_ID"
          JOIN public."CATEGORIES" c ON c."ID" = p."CATEGORY_ID"
          JOIN public."BRANCHES" b ON b."ID" = s."BRANCH_ID"
          JOIN public."USERS" us ON us."ID" = s."CASHIER_ID"
          LEFT JOIN public."CUSTOMERS" cu ON cu."ID" = s."CUSTOMER_ID"
          LEFT JOIN public."PRODUCT_VARIATIONS" v ON v."ID" = si."VARIATION_ID"
          WHERE ${BRANCH('s."BRANCH_ID"')}`,
  },
  {
    name: 'clientes',
    doc: 'id, nombre, nit, telefono, email, credito_habilitado, limite_credito (NULL = sin límite), credito_usado (saldo pendiente actual), activo, creado',
    sql: `SELECT cu."ID" AS id, cu."NAME" AS nombre, cu."NIT" AS nit, cu."PHONE" AS telefono, cu."EMAIL" AS email,
                 cu."CREDIT_ENABLED" AS credito_habilitado,
                 CASE WHEN cu."CREDIT_LIMIT_ENABLED" THEN cu."CREDIT_LIMIT"::float8 END AS limite_credito,
                 cu."CREDIT_USED"::float8 AS credito_usado, cu."IS_ACTIVE" AS activo, ${LOCAL('cu."CREATED_AT"')} AS creado
          FROM public."CUSTOMERS" cu`,
  },
  {
    name: 'abonos_credito',
    doc: 'pagos de clientes a ventas al crédito: id, fecha, dia, cliente_id, cliente, venta_numero, sucursal, monto, metodo_pago, cobrado_por',
    sql: `SELECT cp."ID" AS id, ${LOCAL('cp."CREATED_AT"')} AS fecha, ${LOCAL('cp."CREATED_AT"')}::date AS dia,
                 cp."CUSTOMER_ID" AS cliente_id, cu."NAME" AS cliente, s."INVOICE_NUMBER" AS venta_numero, b."NAME" AS sucursal,
                 cp."AMOUNT"::float8 AS monto, cp."PAYMENT_METHOD" AS metodo_pago, us."NAME" AS cobrado_por
          FROM public."CREDIT_PAYMENTS" cp
          LEFT JOIN public."SALES" s ON s."ID" = cp."SALE_ID"
          LEFT JOIN public."CASH_REGISTERS" cr ON cr."ID" = cp."CASH_REGISTER_ID"
          LEFT JOIN public."BRANCHES" b ON b."ID" = COALESCE(s."BRANCH_ID", cr."BRANCH_ID")
          LEFT JOIN public."CUSTOMERS" cu ON cu."ID" = COALESCE(cp."CUSTOMER_ID", s."CUSTOMER_ID")
          JOIN public."USERS" us ON us."ID" = cp."PAID_BY_ID"
          WHERE ${BRANCH('COALESCE(s."BRANCH_ID", cr."BRANCH_ID")')}`,
  },
  {
    name: 'cajas',
    doc: 'sesiones de caja (apertura → cierre): id, sucursal, nombre, numero, abierta_por, cerrada_por, apertura, cierre, dia, estado (OPEN|CLOSED), monto_inicial, monto_contado_cierre, monto_esperado, diferencia (contado - esperado), total_ventas, cantidad_ventas, ventas_efectivo, ventas_tarjeta, ventas_transferencia',
    sql: `SELECT cr."ID" AS id, b."NAME" AS sucursal, cr."NAME" AS nombre, cr."REGISTER_NUMBER" AS numero,
                 uo."NAME" AS abierta_por, uc."NAME" AS cerrada_por, ${LOCAL('cr."OPENED_AT"')} AS apertura,
                 ${LOCAL('cr."CLOSED_AT"')} AS cierre, ${LOCAL('cr."OPENED_AT"')}::date AS dia, cr."STATUS" AS estado,
                 cr."INITIAL_AMOUNT"::float8 AS monto_inicial, cr."FINAL_AMOUNT"::float8 AS monto_contado_cierre,
                 cr."EXPECTED_AMOUNT"::float8 AS monto_esperado, cr."DIFFERENCE"::float8 AS diferencia,
                 cr."TOTAL_SALES"::float8 AS total_ventas, cr."SALES_COUNT" AS cantidad_ventas,
                 cr."CASH_SALES"::float8 AS ventas_efectivo, cr."CARD_SALES"::float8 AS ventas_tarjeta,
                 cr."TRANSFER_SALES"::float8 AS ventas_transferencia
          FROM public."CASH_REGISTERS" cr
          JOIN public."BRANCHES" b ON b."ID" = cr."BRANCH_ID"
          JOIN public."USERS" uo ON uo."ID" = cr."OPENED_BY_ID"
          LEFT JOIN public."USERS" uc ON uc."ID" = cr."CLOSED_BY_ID"
          WHERE ${BRANCH('cr."BRANCH_ID"')}`,
  },
  {
    name: 'movimientos_caja',
    doc: 'ingresos/egresos manuales de efectivo en caja (gastos, retiros, etc.): id, fecha, dia, sucursal, caja, tipo (INCOME=ingreso | EXPENSE=egreso), monto, descripcion, usuario',
    sql: `SELECT cm."ID" AS id, ${LOCAL('cm."CREATED_AT"')} AS fecha, ${LOCAL('cm."CREATED_AT"')}::date AS dia,
                 b."NAME" AS sucursal, cr."NAME" AS caja, cm."TYPE" AS tipo, cm."AMOUNT"::float8 AS monto,
                 cm."DESCRIPTION" AS descripcion, us."NAME" AS usuario
          FROM public."CASH_MOVEMENTS" cm
          JOIN public."CASH_REGISTERS" cr ON cr."ID" = cm."CASH_REGISTER_ID"
          JOIN public."BRANCHES" b ON b."ID" = cr."BRANCH_ID"
          JOIN public."USERS" us ON us."ID" = cm."PERFORMED_BY_ID"
          WHERE ${BRANCH('cr."BRANCH_ID"')}`,
  },
  {
    name: 'movimientos_inventario',
    doc: 'todo cambio de stock: id, fecha, dia, sucursal_id, sucursal, producto_id, producto, tipo (IN=entrada/compra/recepción de traslado, SALE=venta, TRANSFER=traslado, ADJUSTMENT=ajuste/conteo, RETURN=devolución, OUT=salida), cambio (con signo, unidades base), cantidad_antes, cantidad_despues, motivo, referencia (ej. COMPRA-15, id de venta o traslado), usuario',
    sql: `SELECT m."ID" AS id, ${LOCAL('m."CREATED_AT"')} AS fecha, ${LOCAL('m."CREATED_AT"')}::date AS dia,
                 m."BRANCH_ID" AS sucursal_id, b."NAME" AS sucursal, m."PRODUCT_ID" AS producto_id, p."NAME" AS producto,
                 m."TYPE" AS tipo, (COALESCE(m."QUANTITY_AFTER", 0) - COALESCE(m."QUANTITY_BEFORE", 0))::float8 AS cambio,
                 m."QUANTITY_BEFORE"::float8 AS cantidad_antes, m."QUANTITY_AFTER"::float8 AS cantidad_despues,
                 m."REASON" AS motivo, m."REFERENCE_ID" AS referencia, us."NAME" AS usuario
          FROM public."STOCK_MOVEMENTS" m
          JOIN public."PRODUCTS" p ON p."ID" = m."PRODUCT_ID"
          JOIN public."BRANCHES" b ON b."ID" = m."BRANCH_ID"
          JOIN public."USERS" us ON us."ID" = m."PERFORMED_BY_ID"
          WHERE ${BRANCH('m."BRANCH_ID"')}`,
  },
  {
    name: 'compras',
    doc: 'líneas de compras a proveedores: numero_compra (ej. COMPRA-15), fecha, dia, sucursal, proveedor, producto_id, producto, unidades (unidades base, con signo: una edición de compra agrega filas negativas — SUMA siempre), costo_unitario (por unidad base), costo_total',
    sql: `SELECT m."REFERENCE_ID" AS numero_compra, ${LOCAL('m."CREATED_AT"')} AS fecha, ${LOCAL('m."CREATED_AT"')}::date AS dia,
                 b."NAME" AS sucursal, sp."NAME" AS proveedor, m."PRODUCT_ID" AS producto_id, p."NAME" AS producto,
                 (COALESCE(m."QUANTITY_AFTER", 0) - COALESCE(m."QUANTITY_BEFORE", 0))::float8 AS unidades,
                 ${COST('m."UNIT_COST"')} AS costo_unitario,
                 ${COST('(COALESCE(m."QUANTITY_AFTER", 0) - COALESCE(m."QUANTITY_BEFORE", 0)) * COALESCE(m."UNIT_COST", p."COST")')} AS costo_total
          FROM public."STOCK_MOVEMENTS" m
          JOIN public."PRODUCTS" p ON p."ID" = m."PRODUCT_ID"
          JOIN public."BRANCHES" b ON b."ID" = m."BRANCH_ID"
          LEFT JOIN public."SUPPLIERS" sp ON sp."ID" = m."SUPPLIER_ID"
          WHERE (m."REFERENCE_ID" LIKE 'COMPRA-%' OR m."REFERENCE_ID" LIKE 'INTAKE-%') AND ${BRANCH('m."BRANCH_ID"')}`,
  },
  {
    name: 'traslados',
    doc: 'una fila por producto trasladado: traslado_id, creado, dia, estado (PENDING|IN_TRANSIT|RECEIVED|REJECTED|CANCELLED), origen, destino, producto_id, producto, presentacion, cantidad, unidades_base, precio_unitario, total_precio, costo_total, recibido',
    sql: `SELECT t."ID" AS traslado_id, ${LOCAL('t."CREATED_AT"')} AS creado, ${LOCAL('t."CREATED_AT"')}::date AS dia, t."STATUS" AS estado,
                 bf."NAME" AS origen, bt."NAME" AS destino, ti."PRODUCT_ID" AS producto_id, p."NAME" AS producto,
                 COALESCE(v."NAME", 'Unidad') AS presentacion, ti."QUANTITY"::float8 AS cantidad,
                 (ti."QUANTITY" * ti."CONVERSION_FACTOR")::float8 AS unidades_base,
                 COALESCE(ti."UNIT_PRICE", v."PRICE", p."BASE_PRICE")::float8 AS precio_unitario,
                 (ti."QUANTITY" * COALESCE(ti."UNIT_PRICE", v."PRICE", p."BASE_PRICE"))::float8 AS total_precio,
                 ${COST('ti."QUANTITY" * COALESCE(ti."UNIT_COST", p."COST" * ti."CONVERSION_FACTOR")')} AS costo_total,
                 ${LOCAL('t."RECEIVED_AT"')} AS recibido
          FROM public."TRANSFER_ITEMS" ti
          JOIN public."TRANSFERS" t ON t."ID" = ti."TRANSFER_ID"
          JOIN public."PRODUCTS" p ON p."ID" = ti."PRODUCT_ID"
          JOIN public."BRANCHES" bf ON bf."ID" = t."FROM_BRANCH_ID"
          JOIN public."BRANCHES" bt ON bt."ID" = t."TO_BRANCH_ID"
          LEFT JOIN public."PRODUCT_VARIATIONS" v ON v."ID" = ti."VARIATION_ID"
          WHERE (${BRANCH('t."FROM_BRANCH_ID"')} OR ${BRANCH('t."TO_BRANCH_ID"')})`,
  },
  {
    name: 'cotizaciones',
    doc: 'id, numero, fecha, dia, sucursal, cliente, estado (DRAFT|SENT|ACCEPTED|REJECTED|EXPIRED|CONVERTED|CANCELLED), total, valida_hasta, convertida_en_venta (bool)',
    sql: `SELECT q."ID" AS id, q."QUOTATION_NUMBER" AS numero, ${LOCAL('q."CREATED_AT"')} AS fecha, ${LOCAL('q."CREATED_AT"')}::date AS dia,
                 b."NAME" AS sucursal, cu."NAME" AS cliente, q."STATUS" AS estado, q."TOTAL"::float8 AS total,
                 ${LOCAL('q."VALID_UNTIL"')}::date AS valida_hasta, (q."CONVERTED_TO_SALE_ID" IS NOT NULL) AS convertida_en_venta
          FROM public."QUOTATIONS" q
          JOIN public."BRANCHES" b ON b."ID" = q."BRANCH_ID"
          JOIN public."CUSTOMERS" cu ON cu."ID" = q."CUSTOMER_ID"
          WHERE ${BRANCH('q."BRANCH_ID"')}`,
  },
  {
    name: 'metas_ventas',
    doc: 'metas mensuales de venta: sucursal_id, sucursal, anio, mes (1-12), meta (Q), etiqueta, cajas (números de caja que cuentan para la meta; vacío = toda la sucursal)',
    sql: `SELECT g."BRANCH_ID" AS sucursal_id, b."NAME" AS sucursal, g."YEAR" AS anio, g."MONTH" AS mes,
                 g."TARGET_AMOUNT"::float8 AS meta, g."LABEL" AS etiqueta, array_to_string(g."REGISTER_NUMBERS", ',') AS cajas
          FROM public."SALES_GOALS" g JOIN public."BRANCHES" b ON b."ID" = g."BRANCH_ID"
          WHERE ${BRANCH('g."BRANCH_ID"')}`,
  },
  {
    name: 'proveedores',
    doc: 'id, codigo, nombre, contacto, telefono, condiciones_pago, activo',
    sql: `SELECT sp."ID" AS id, sp."CODE" AS codigo, sp."NAME" AS nombre, sp."CONTACT_NAME" AS contacto,
                 sp."PHONE" AS telefono, sp."PAYMENT_TERMS" AS condiciones_pago, sp."IS_ACTIVE" AS activo
          FROM public."SUPPLIERS" sp`,
  },
  {
    name: 'usuarios',
    doc: 'id, nombre, rol, sucursal, activo',
    sql: `SELECT us."ID" AS id, us."NAME" AS nombre, us."ROLE" AS rol, b."NAME" AS sucursal, us."IS_ACTIVE" AS activo
          FROM public."USERS" us JOIN public."BRANCHES" b ON b."ID" = us."BRANCH_ID"`,
  },
]

const CTE_PREFIX = VIEWS.map(v => `${v.name} AS NOT MATERIALIZED (${v.sql})`).join(',\n')

export const SCHEMA_DOC = VIEWS.map(v => `- ${v.name}(${v.doc})`).join('\n')

// ── SQL validation + execution ──────────────────────────────────────────────

const FORBIDDEN_WORDS = /\b(insert|update|delete|merge|upsert|drop|alter|create|truncate|grant|revoke|copy|call|do|execute|prepare|deallocate|listen|notify|unlisten|vacuum|reindex|cluster|lock|set|reset|refresh|discard|checkpoint|load|security|owner|into)\b/i
const FORBIDDEN_FRAGMENTS = /(pg_|information_schema|\bpublic\s*\.|current_setting|set_config|dblink|lo_import|lo_export|\bcurrent_user\b|\bsession_user\b|version\s*\(|txid_|\$)/i

export class AnalystSqlError extends Error {}

function validateSql(raw: string): string {
  const sql = raw.trim().replace(/;+\s*$/, '')
  if (!sql) throw new AnalystSqlError('La consulta está vacía.')
  if (sql.length > 8000) throw new AnalystSqlError('La consulta es demasiado larga.')
  if (sql.includes(';')) throw new AnalystSqlError('Solo se permite una sentencia (sin ";").')
  if (/--|\/\*/.test(sql)) throw new AnalystSqlError('No se permiten comentarios en la consulta.')
  if (!/^(select|with)\b/i.test(sql)) throw new AnalystSqlError('La consulta debe empezar con SELECT o WITH.')
  // Words inside string literals are harmless — strip literals before
  // scanning so a filter like motivo ILIKE '%actualizar%' isn't rejected.
  const withoutLiterals = sql.replace(/'(?:[^']|'')*'/g, "''")
  const word = withoutLiterals.match(FORBIDDEN_WORDS)
  if (word) throw new AnalystSqlError(`Palabra no permitida en la consulta: "${word[0]}". Solo se permiten consultas de lectura.`)
  const frag = withoutLiterals.match(FORBIDDEN_FRAGMENTS)
  if (frag) throw new AnalystSqlError(`Elemento no permitido en la consulta: "${frag[0]}". Usa solo las vistas documentadas.`)
  return sql
}

// The model's statement (which may have its own WITH) runs as a subquery
// under our view CTEs — CTE names are visible inside nested subqueries, so
// no merging of WITH clauses is needed.
function buildFullSql(sql: string, rowLimit: number): string {
  return `WITH ${CTE_PREFIX}\nSELECT * FROM (\n${sql}\n) AS __q LIMIT ${rowLimit}`
}

export interface QueryResult {
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
  truncated: boolean
}

function normalizeValue(v: unknown): unknown {
  if (v === null || v === undefined) return null
  if (typeof v === 'bigint') return Number(v)
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null
    const iso = v.toISOString()
    // Already business-local wall time (converted in the views), so the UTC
    // fields ARE the local reading.
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso.slice(0, 16).replace('T', ' ')
  }
  if (typeof v === 'object' && v !== null && 'toNumber' in v && typeof (v as { toNumber: unknown }).toNumber === 'function') {
    return (v as { toNumber: () => number }).toNumber()
  }
  if (typeof v === 'number' && !Number.isFinite(v)) return null
  return v
}

const MAX_ROWS = 2000

export async function runAnalystQuery(rawSql: string, scope: { branchIds: string[] | null; canSeeCosts: boolean }): Promise<QueryResult> {
  const sql = validateSql(rawSql)
  const full = buildFullSql(sql, MAX_ROWS + 1)
  let raw: Record<string, unknown>[]
  try {
    raw = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
      await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '10s'`)
      // The real tables live in "public"; with it off the path only the
      // views (CTEs) and built-in functions are reachable by plain name.
      await tx.$executeRawUnsafe('SET LOCAL search_path TO pg_temp')
      return tx.$queryRawUnsafe<Record<string, unknown>[]>(full, scope.branchIds, scope.canSeeCosts)
    }, { timeout: 20_000, maxWait: 5_000 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Surface the Postgres message to the model so it can fix its SQL.
    const pg = msg.match(/(?:ERROR|Message):\s*`?([^`\n]+)/)?.[1] ?? msg.split('\n').filter(Boolean).slice(-1)[0] ?? msg
    if (/statement timeout|canceling statement/i.test(msg)) throw new AnalystSqlError('La consulta tardó demasiado (más de 10 s). Agrega filtros de fecha o agrega más.')
    throw new AnalystSqlError(`Error de SQL: ${pg.slice(0, 400)}`)
  }
  const truncated = raw.length > MAX_ROWS
  const rows = (truncated ? raw.slice(0, MAX_ROWS) : raw).map(r => {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(r)) out[k] = normalizeValue(v)
    return out
  })
  const columns = rows.length ? Object.keys(rows[0]!) : []
  return { columns, rows, rowCount: rows.length, truncated }
}

// ── Report spec ─────────────────────────────────────────────────────────────

export type ValueFormat = 'moneda' | 'numero' | 'porcentaje' | 'texto' | 'fecha'

export interface ReportColumn { key: string; label: string; format: ValueFormat }

export type ReportBlock =
  | { type: 'kpis'; items: { label: string; value: number | string; format: ValueFormat; note?: string }[] }
  | { type: 'chart'; title?: string; chart: 'barras' | 'barras_horizontales' | 'lineas' | 'area' | 'pastel' | 'barras_apiladas'; x: string; series: { key: string; label: string }[]; format: ValueFormat; rows: Record<string, unknown>[] }
  | { type: 'table'; title?: string; columns: ReportColumn[]; rows: Record<string, unknown>[]; totalRows: number }
  | { type: 'note'; text: string; tone: 'info' | 'alerta' | 'exito' }

export interface AnalystReport {
  title: string
  summary: string
  blocks: ReportBlock[]
  suggestions: string[]
  queries: { id: string; purpose: string; sql: string; rowCount: number; error?: string }[]
}

const MONEY_KEY = /(total|monto|precio|costo|valor|venta|ganancia|ingreso|egreso|saldo|meta|subtotal|descuento|efectivo|tarjeta|transferencia|credito|abono|diferencia|promedio_ticket|ticket)/i
const PCT_KEY = /(pct|porcentaje|margen|participacion|variacion|crecimiento|cumplimiento|tasa)/i

function inferFormat(key: string, sample: unknown): ValueFormat {
  if (typeof sample === 'number') {
    if (PCT_KEY.test(key)) return 'porcentaje'
    if (MONEY_KEY.test(key)) return 'moneda'
    return 'numero'
  }
  if (typeof sample === 'string' && /^\d{4}-\d{2}-\d{2}/.test(sample)) return 'fecha'
  return 'texto'
}

function humanize(key: string): string {
  const s = key.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const FORMATS = new Set(['moneda', 'numero', 'porcentaje', 'texto', 'fecha'])
const asFormat = (f: unknown, fallback: ValueFormat): ValueFormat => (typeof f === 'string' && FORMATS.has(f) ? f as ValueFormat : fallback)
const CHARTS = new Set(['barras', 'barras_horizontales', 'lineas', 'area', 'pastel', 'barras_apiladas'])

// Turns the model's report spec into renderable blocks. Charts/tables only
// ever carry data that came from a query actually run in this request
// (looked up by id) — the model never types numbers into a chart itself.
function resolveReport(input: Record<string, unknown>, results: Map<string, QueryResult>, queries: AnalystReport['queries']): AnalystReport {
  const blocks: ReportBlock[] = []
  const rawBlocks = Array.isArray(input.bloques) ? input.bloques as Record<string, unknown>[] : []
  for (const b of rawBlocks) {
    if (!b || typeof b !== 'object') continue
    if (b.tipo === 'kpis' && Array.isArray(b.items)) {
      const items = (b.items as Record<string, unknown>[])
        .filter(it => it && typeof it.etiqueta === 'string' && (typeof it.valor === 'number' || typeof it.valor === 'string'))
        .map(it => ({
          label: String(it.etiqueta),
          value: it.valor as number | string,
          format: asFormat(it.formato, typeof it.valor === 'number' ? 'numero' : 'texto'),
          ...(typeof it.nota === 'string' ? { note: it.nota } : {}),
        }))
      if (items.length) blocks.push({ type: 'kpis', items })
    } else if (b.tipo === 'grafica' && typeof b.consulta === 'string') {
      const res = results.get(b.consulta)
      if (!res || res.rows.length === 0) continue
      const x = typeof b.eje_x === 'string' && res.columns.includes(b.eje_x) ? b.eje_x : res.columns[0]!
      const seriesKeys = (Array.isArray(b.series) ? b.series as unknown[] : [])
        .filter((k): k is string => typeof k === 'string' && res.columns.includes(k) && k !== x)
      const keys = seriesKeys.length ? seriesKeys : res.columns.filter(c => c !== x && typeof res.rows[0]![c] === 'number').slice(0, 1)
      if (!keys.length) continue
      const labels = (b.etiquetas_series && typeof b.etiquetas_series === 'object') ? b.etiquetas_series as Record<string, unknown> : {}
      blocks.push({
        type: 'chart',
        ...(typeof b.titulo === 'string' ? { title: b.titulo } : {}),
        chart: (typeof b.grafica === 'string' && CHARTS.has(b.grafica) ? b.grafica : 'barras') as Extract<ReportBlock, { type: 'chart' }>['chart'],
        x,
        series: keys.map(k => ({ key: k, label: typeof labels[k] === 'string' ? labels[k] as string : humanize(k) })),
        format: asFormat(b.formato, inferFormat(keys[0]!, res.rows[0]![keys[0]!])),
        rows: res.rows.slice(0, 60),
      })
    } else if (b.tipo === 'tabla' && typeof b.consulta === 'string') {
      const res = results.get(b.consulta)
      if (!res) continue
      const requested = Array.isArray(b.columnas) ? b.columnas as Record<string, unknown>[] : []
      let columns: ReportColumn[] = requested
        .filter(c => c && typeof c.campo === 'string' && res.columns.includes(c.campo as string))
        .map(c => ({
          key: c.campo as string,
          label: typeof c.etiqueta === 'string' ? c.etiqueta : humanize(c.campo as string),
          format: asFormat(c.formato, inferFormat(c.campo as string, res.rows[0]?.[c.campo as string])),
        }))
      if (!columns.length) {
        columns = res.columns.map(k => ({ key: k, label: humanize(k), format: inferFormat(k, res.rows.find(r => r[k] != null)?.[k]) }))
      }
      const max = typeof b.max_filas === 'number' ? Math.min(500, Math.max(1, Math.floor(b.max_filas))) : 200
      blocks.push({
        type: 'table',
        ...(typeof b.titulo === 'string' ? { title: b.titulo } : {}),
        columns,
        rows: res.rows.slice(0, max),
        totalRows: res.rowCount,
      })
    } else if (b.tipo === 'nota' && typeof b.texto === 'string') {
      const tone = b.estilo === 'alerta' || b.estilo === 'exito' ? b.estilo : 'info'
      blocks.push({ type: 'note', text: b.texto, tone })
    }
  }
  return {
    title: typeof input.titulo === 'string' && input.titulo.trim() ? input.titulo.trim() : 'Análisis',
    summary: typeof input.resumen === 'string' ? input.resumen : '',
    blocks,
    suggestions: Array.isArray(input.sugerencias) ? (input.sugerencias as unknown[]).filter((s): s is string => typeof s === 'string').slice(0, 4) : [],
    queries,
  }
}

// ── Agent loop ──────────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'consultar_datos',
    description: 'Ejecuta UNA consulta SQL de solo lectura (PostgreSQL) sobre las vistas del negocio y devuelve las filas. Úsala tantas veces como necesites para explorar, verificar y calcular. Si da error, lee el mensaje y corrige la consulta.',
    input_schema: {
      type: 'object',
      properties: {
        proposito: { type: 'string', description: 'Qué quieres averiguar con esta consulta (una frase).' },
        sql: { type: 'string', description: 'Una sola sentencia SELECT (o WITH … SELECT) sobre las vistas documentadas. Sin punto y coma ni comentarios.' },
      },
      required: ['proposito', 'sql'],
    },
  },
  {
    name: 'presentar_reporte',
    description: 'Entrega la respuesta final al usuario como un reporte. Llámala UNA vez, al final, cuando ya tengas los datos. Las gráficas y tablas usan los resultados de consultas ya ejecutadas, referenciadas por su id (q1, q2, …).',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        resumen: { type: 'string', description: 'La respuesta y el análisis en markdown: responde directo a la pregunta, con las cifras clave, los cálculos que hiciste (brevemente) y conclusiones/recomendaciones accionables.' },
        bloques: {
          type: 'array',
          description: 'Bloques visuales en el orden en que se muestran.',
          items: {
            type: 'object',
            properties: {
              tipo: { type: 'string', enum: ['kpis', 'grafica', 'tabla', 'nota'] },
              titulo: { type: 'string' },
              items: {
                type: 'array',
                description: 'Solo para tipo=kpis: tarjetas con cifras clave.',
                items: {
                  type: 'object',
                  properties: {
                    etiqueta: { type: 'string' },
                    valor: { type: ['number', 'string'] },
                    formato: { type: 'string', enum: ['moneda', 'numero', 'porcentaje', 'texto', 'fecha'] },
                    nota: { type: 'string', description: 'Texto pequeño de contexto, ej. "+12% vs mes pasado".' },
                  },
                  required: ['etiqueta', 'valor'],
                },
              },
              consulta: { type: 'string', description: 'Para grafica/tabla: id de la consulta (q1, q2, …) cuyos resultados se muestran.' },
              grafica: { type: 'string', enum: ['barras', 'barras_horizontales', 'lineas', 'area', 'pastel', 'barras_apiladas'] },
              eje_x: { type: 'string', description: 'Columna para el eje X / categorías.' },
              series: { type: 'array', items: { type: 'string' }, description: 'Columnas numéricas a graficar.' },
              etiquetas_series: { type: 'object', description: 'Nombre legible por columna, ej. {"total":"Ventas"}.' },
              formato: { type: 'string', enum: ['moneda', 'numero', 'porcentaje'] },
              columnas: {
                type: 'array',
                description: 'Para tabla: columnas a mostrar, en orden. Omite para mostrar todas.',
                items: {
                  type: 'object',
                  properties: {
                    campo: { type: 'string' },
                    etiqueta: { type: 'string' },
                    formato: { type: 'string', enum: ['moneda', 'numero', 'porcentaje', 'texto', 'fecha'] },
                  },
                  required: ['campo'],
                },
              },
              max_filas: { type: 'number' },
              texto: { type: 'string', description: 'Para tipo=nota (markdown).' },
              estilo: { type: 'string', enum: ['info', 'alerta', 'exito'] },
            },
            required: ['tipo'],
          },
        },
        sugerencias: { type: 'array', items: { type: 'string' }, description: '2-3 preguntas de seguimiento útiles.' },
      },
      required: ['titulo', 'resumen', 'bloques'],
    },
  },
]

export interface AnalystContext {
  today: string            // YYYY-MM-DD business-local
  now: string              // YYYY-MM-DD HH:mm business-local
  userName: string
  branchNames: string[] | null  // null = all branches (admin)
  selectedBranchName?: string
  canSeeCosts: boolean
}

function buildSystemPrompt(ctx: AnalystContext): string {
  return `Eres el analista de datos de un negocio minorista en Guatemala que usa el sistema de punto de venta DENGO POS. Respondes preguntas del dueño o encargados sobre su negocio con datos reales, razonando como un analista humano: consultas, verificas, calculas y explicas.

## Datos disponibles
Consultas con la herramienta consultar_datos (PostgreSQL, solo lectura). Solo existen estas vistas (no hay otras tablas):
${SCHEMA_DOC}

Notas del modelo de datos:
- Moneda: quetzales (Q). Todas las fechas/horas YA están en hora local de Guatemala.
- "dia" es tipo date. Para "hoy" usa dia = DATE '${ctx.today}'; "ayer" = DATE '${ctx.today}' - 1; "este mes" = dia >= date_trunc('month', DATE '${ctx.today}').
- Excluye ventas anuladas (anulada = false) salvo que pregunten por ellas.
- El inventario se lleva en unidades base. Un producto puede venderse en presentaciones (ej. "Caja de 12", "Resma de 500"): en ventas_detalle, cantidad está en la presentación vendida y unidades_base = cantidad × factor_conversion. Para comparar con inventario o hablar de unidades físicas usa unidades_base.
- total de ventas incluye el descuento ya aplicado. La suma de total_linea de una venta puede diferir del total por el descuento global.
- El costo de ventas usa el costo actual del producto (no histórico).
- Una venta al crédito tiene tipo_venta = 'CREDIT'; su saldo se paga con abonos_credito. clientes.credito_usado es el saldo pendiente actual.${ctx.canSeeCosts ? '' : '\n- Este usuario NO tiene permiso para ver costos ni ganancias: esas columnas vienen vacías (NULL). No intentes calcularlos; dilo si te los piden.'}
- Para texto usa ILIKE con %…% (los nombres pueden variar en mayúsculas/acentos; prueba variantes si no hay resultados).
- Las columnas numéricas son double precision: para redondear usa round(x::numeric, 2). Divide con NULLIF(divisor, 0) para evitar división entre cero.

## Contexto
- Fecha y hora actual: ${ctx.now} (hoy es ${ctx.today}).
- Usuario: ${ctx.userName}.
- Sucursales visibles: ${ctx.branchNames ? ctx.branchNames.join(', ') : 'todas'}.${ctx.selectedBranchName ? `\n- El usuario está trabajando en la sucursal "${ctx.selectedBranchName}". Si la pregunta no menciona sucursal, analiza todas las visibles pero desglosa por sucursal cuando aporte.` : ''}

## Cómo trabajar
1. Piensa qué necesitas saber y consulta los datos. Puedes hacer varias consultas (explorar valores reales primero, ej. nombres de productos o categorías, si la pregunta los menciona).
2. Agrega en SQL (GROUP BY, SUM, COUNT, AVG, ventanas, date_trunc, generate_series para rellenar días sin ventas) en vez de traer miles de filas. Máximo 2000 filas por consulta.
3. Razona como analista: compara contra periodos anteriores cuando tenga sentido, calcula promedios, participación %, crecimiento, proyecciones (ej. al ritmo actual cuánto se venderá en el mes, cuánto falta para la meta y cuánto hay que vender por día en los días restantes), detecta anomalías. Haz los cálculos con SQL cuando puedas para que sean exactos.
4. Nunca inventes cifras: todo número que digas debe salir de una consulta.
5. Si la pregunta es ambigua, elige la interpretación más útil, dila en el resumen y responde.
6. Termina SIEMPRE llamando presentar_reporte con:
   - resumen: respuesta directa primero, luego el análisis (breve, en español, con cifras y en formato markdown). Incluye recomendaciones accionables cuando tenga sentido.
   - bloques: KPIs para las cifras principales, una gráfica cuando haya tendencia/comparación/ranking (lineas para tiempo, barras/barras_horizontales para rankings, pastel solo para participación con pocas categorías), y una tabla con el detalle. No repitas lo mismo en varios bloques.
   - sugerencias: 2-3 preguntas de seguimiento.
Si los datos no permiten responder, dilo claramente en el reporte y sugiere qué sí se puede analizar.`
}

export interface HistoryTurn { question: string; summary?: string | undefined; queries?: { purpose?: string | undefined; sql: string }[] | undefined }

/** Tokens spent by one analyst run, summed over every model call. */
export interface AnalystUsage { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }

export async function runAnalyst(opts: {
  client: Anthropic
  model: string
  question: string
  history: HistoryTurn[]
  ctx: AnalystContext
  scope: { branchIds: string[] | null; canSeeCosts: boolean }
  log: (obj: unknown, msg: string) => void
  /** Mutated in place, so the caller still has the totals if this throws midway. */
  usage?: AnalystUsage
}): Promise<AnalystReport> {
  const { client, model, question, history, ctx, scope } = opts
  const results = new Map<string, QueryResult>()
  const queries: AnalystReport['queries'] = []

  const messages: Anthropic.MessageParam[] = []
  for (const turn of history) {
    messages.push({ role: 'user', content: turn.question })
    const sqlNote = turn.queries?.length
      ? `\n\n(Consultas que usé:\n${turn.queries.map(q => `- ${q.purpose ?? ''}: ${q.sql}`).join('\n')})`
      : ''
    messages.push({ role: 'assistant', content: `${turn.summary || '(reporte entregado)'}${sqlNote}` })
  }
  messages.push({ role: 'user', content: question })

  const system: Anthropic.TextBlockParam[] = [{ type: 'text', text: buildSystemPrompt(ctx), cache_control: { type: 'ephemeral' } }]
  const MAX_STEPS = 10
  const startedAt = Date.now()

  for (let step = 0; step < MAX_STEPS; step++) {
    const outOfBudget = step === MAX_STEPS - 1 || Date.now() - startedAt > 150_000
    if (outOfBudget) {
      // Forced tool choice can't be combined with thinking — on the last
      // step thinking is turned off (and its earlier blocks dropped) and the
      // model is made to present whatever it has.
      for (const m of messages) {
        if (m.role === 'assistant' && Array.isArray(m.content)) {
          m.content = m.content.filter(c => c.type !== 'thinking' && c.type !== 'redacted_thinking')
        }
      }
    }
    const response = await client.messages.create({
      model,
      max_tokens: 16000,
      system,
      tools: TOOLS,
      messages,
      ...(outOfBudget
        ? { tool_choice: { type: 'tool' as const, name: 'presentar_reporte' } }
        : { thinking: { type: 'adaptive' as const } }),
    }, { timeout: 120_000 })
    if (opts.usage) {
      opts.usage.inputTokens += response.usage.input_tokens
      opts.usage.outputTokens += response.usage.output_tokens
      opts.usage.cacheReadTokens += response.usage.cache_read_input_tokens ?? 0
      opts.usage.cacheWriteTokens += response.usage.cache_creation_input_tokens ?? 0
    }
    messages.push({ role: 'assistant', content: response.content })

    const toolUses = response.content.filter((c): c is Anthropic.ToolUseBlock => c.type === 'tool_use')
    const present = toolUses.find(t => t.name === 'presentar_reporte')
    if (present) {
      return resolveReport(present.input as Record<string, unknown>, results, queries)
    }
    if (toolUses.length === 0) {
      // Plain-text answer (e.g. a clarification) — show it as the summary.
      const text = response.content.filter((c): c is Anthropic.TextBlock => c.type === 'text').map(c => c.text).join('\n').trim()
      return { title: 'Respuesta', summary: text || 'No pude generar un análisis para esta pregunta.', blocks: [], suggestions: [], queries }
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const tu of toolUses) {
      if (tu.name !== 'consultar_datos') {
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: 'Herramienta desconocida.', is_error: true })
        continue
      }
      const input = tu.input as { sql?: string; proposito?: string }
      const id = `q${queries.length + 1}`
      try {
        const res = await runAnalystQuery(String(input.sql ?? ''), scope)
        results.set(id, res)
        queries.push({ id, purpose: String(input.proposito ?? ''), sql: String(input.sql ?? ''), rowCount: res.rowCount })
        const preview = res.rows.slice(0, 80)
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: JSON.stringify({
            id_consulta: id,
            columnas: res.columns,
            total_filas: res.rowCount,
            ...(res.truncated ? { aviso: 'Resultado recortado a 2000 filas: agrega más.' } : {}),
            ...(res.rowCount > preview.length ? { nota: `Se muestran ${preview.length} de ${res.rowCount} filas; la tabla del reporte puede mostrar todas.` } : {}),
            filas: preview,
          }),
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        queries.push({ id, purpose: String(input.proposito ?? ''), sql: String(input.sql ?? ''), rowCount: 0, error: message })
        opts.log({ sql: input.sql, error: message }, 'AI analyst: query failed')
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: message, is_error: true })
      }
    }
    messages.push({ role: 'user', content: toolResults })
  }

  return { title: 'Análisis incompleto', summary: 'No logré terminar el análisis a tiempo. Intenta una pregunta más específica.', blocks: [], suggestions: [], queries }
}
