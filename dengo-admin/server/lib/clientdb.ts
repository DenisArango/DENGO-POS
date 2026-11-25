import pg from 'pg'
import { plainDbUrl } from './env-file.js'

// Prisma's DateTime columns are `timestamp` without zone holding UTC: read them as UTC.
pg.types.setTypeParser(1114, (s: string) => new Date(s.replace(' ', 'T') + 'Z'))

/** A short-lived connection to one client's database (works even with its backend down). */
export async function withClientDb<T>(databaseUrl: string, fn: (db: pg.Client) => Promise<T>): Promise<T> {
  const db = new pg.Client({ connectionString: plainDbUrl(databaseUrl), connectionTimeoutMillis: 5000, statement_timeout: 10000 })
  await db.connect()
  try { return await fn(db) } finally { await db.end().catch(() => {}) }
}

export interface License {
  posEnabled: boolean
  maestrosEnabled: boolean
  pageEnabled: boolean
  felEnabled: boolean
  aiEnabled: boolean
  aiMonthlyLimit: number | null
  suspended: boolean
  suspendedMessage: string | null
}

export interface ClientMetrics {
  license: License | null
  salesToday: number
  totalToday: number
  salesByDay: { day: string; total: number; count: number }[]
  lastSaleAt: string | null
  products: number
  users: number
  branches: { name: string; code: string }[]
  aiUsedThisMonth: number
  dbSizeBytes: number
}

// Guatemala is UTC-6 all year; Prisma stores UTC timestamps without zone.
const GT_TODAY = `(date_trunc('day', now() AT TIME ZONE 'America/Guatemala') + interval '6 hours')`
const GT_MONTH = `(date_trunc('month', now() AT TIME ZONE 'America/Guatemala') + interval '6 hours')`

export async function readLicense(db: pg.Client): Promise<License | null> {
  const r = await db.query(`SELECT "POS_ENABLED" pos, "MAESTROS_ENABLED" mae, "PAGE_ENABLED" page, "FEL_ENABLED" fel, "AI_ENABLED" ai,
    "AI_MONTHLY_LIMIT" lim, "SUSPENDED" sus, "SUSPENDED_MESSAGE" msg FROM "LICENSE_CONFIG" ORDER BY "UPDATED_AT" LIMIT 1`)
  const x = r.rows[0]
  if (!x) return null
  return { posEnabled: x.pos, maestrosEnabled: x.mae, pageEnabled: x.page, felEnabled: x.fel, aiEnabled: x.ai, aiMonthlyLimit: x.lim, suspended: !!x.sus, suspendedMessage: x.msg }
}

export async function clientMetrics(databaseUrl: string): Promise<ClientMetrics> {
  return withClientDb(databaseUrl, async (db) => {
    const one = async (sql: string) => (await db.query(sql)).rows[0] ?? {}
    const [license, today, days, last, prod, users, branches, ai, size] = await Promise.all([
      readLicense(db).catch(() => null),
      one(`SELECT count(*)::int n, coalesce(sum("TOTAL"),0)::float t FROM "SALES" WHERE "IS_VOIDED" = false AND "CREATED_AT" >= ${GT_TODAY}`),
      db.query(`SELECT to_char(("CREATED_AT" - interval '6 hours')::date, 'YYYY-MM-DD') d, count(*)::int n, coalesce(sum("TOTAL"),0)::float t
        FROM "SALES" WHERE "IS_VOIDED" = false AND "CREATED_AT" >= ${GT_TODAY} - interval '13 days' GROUP BY 1 ORDER BY 1`),
      one(`SELECT max("CREATED_AT") m FROM "SALES"`),
      one(`SELECT count(*)::int n FROM "PRODUCTS" WHERE "IS_ACTIVE" = true`),
      one(`SELECT count(*)::int n FROM "USERS" WHERE "IS_ACTIVE" = true`),
      db.query(`SELECT "NAME" name, "CODE" code FROM "BRANCHES" ORDER BY "NAME"`),
      one(`SELECT count(*)::int n FROM "AI_USAGE" WHERE "SUCCESS" = true AND "CREATED_AT" >= ${GT_MONTH}`).catch(() => ({ n: 0 })),
      one(`SELECT pg_database_size(current_database())::float s`),
    ])
    // 14 days with zeros filled in, oldest first
    const byDay = new Map(days.rows.map((r: any) => [r.d, r]))
    const salesByDay = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(Date.now() - 6 * 3600_000 - (13 - i) * 86400_000).toISOString().slice(0, 10)
      const r: any = byDay.get(d)
      return { day: d, total: r?.t ?? 0, count: r?.n ?? 0 }
    })
    return {
      license,
      salesToday: today.n ?? 0,
      totalToday: today.t ?? 0,
      salesByDay,
      lastSaleAt: last.m ? (last.m as Date).toISOString() : null,
      products: prod.n ?? 0,
      users: users.n ?? 0,
      branches: branches.rows,
      aiUsedThisMonth: ai.n ?? 0,
      dbSizeBytes: size.s ?? 0,
    }
  })
}
