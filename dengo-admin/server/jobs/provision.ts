import { mkdir, writeFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import type { Config } from '../config.js'
import type { Step, StepCtx } from './engine.js'
import { pascalName, dbName, normalizeDomain } from '../lib/names.js'
import { renderEnv } from '../lib/env-file.js'
import { nextFreePort, isListening } from '../lib/ports.js'
import { takenPorts, writeClientFile, type ClientFile } from '../lib/registry.js'
import { withClientDb } from '../lib/clientdb.js'
import { applyCaddy, renderClientCaddy } from '../lib/caddy.js'
import { checkDns } from '../lib/system.js'
import { createClientDb, dropClientDb, clientDbExists } from '../lib/pgadmin.js'
import { databaseUrl, felEnv, aiEnv, corsFor, hex, newId } from '../lib/client-env.js'
import { health } from '../lib/pm2.js'

const code = z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9_-]+$/, 'Solo letras, números, - y _')

export const provisionSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  domain: z.string().trim().min(4).max(190),
  contact: z.object({ name: z.string().max(120).optional(), phone: z.string().max(40).optional(), email: z.string().max(150).optional() }).default({}),
  notes: z.string().max(2000).optional(),
  admin: z.object({
    name: z.string().trim().min(2).max(150),
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(8).max(100).optional(),
  }),
  branches: z.array(z.object({ name: z.string().trim().min(2).max(150), code })).min(1).max(30),
  modules: z.object({ pos: z.boolean(), maestros: z.boolean(), page: z.boolean(), fel: z.boolean(), ai: z.boolean() }),
  aiMonthlyLimit: z.number().int().min(0).max(100_000).nullable(),
  fel: z.object({
    nit: z.string().trim().min(5).max(20),
    frases: z.string().trim().regex(/^\d+:\d+(,\s*\d+:\d+)*$/, 'Formato: 1:1 o 1:1,2:1'),
    docType: z.enum(['FACT', 'FPEQ']),
    establishment: z.string().trim().min(1).max(5),
    env: z.enum(['test', 'production']),
    sellerName: z.string().max(200).optional(),
    allowCf: z.boolean().optional(),
    sendEmail: z.boolean().optional(),
  }).nullable().optional(),
  web: z.boolean(),
  applyCaddy: z.boolean().default(true),
}).superRefine((v, ctx) => {
  if (!normalizeDomain(v.domain)) ctx.addIssue({ code: 'custom', path: ['domain'], message: 'Dominio inválido (ej. libreriael.com)' })
  if (v.modules.fel && !v.fel) ctx.addIssue({ code: 'custom', path: ['fel'], message: 'Faltan los datos de FEL' })
  const codes = v.branches.map(b => b.code.toUpperCase())
  if (new Set(codes).size !== codes.length) ctx.addIssue({ code: 'custom', path: ['branches'], message: 'Códigos de sucursal repetidos' })
})
export type ProvisionInput = z.infer<typeof provisionSchema>

const randomPassword = () => {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  return Array.from(hex(12).match(/../g)!, h => abc[parseInt(h, 16) % abc.length]).join('') + '!7'
}

/** Name, database and ports the new client would get, without changing anything. */
export async function planClient(c: Config, input: ProvisionInput) {
  const name = pascalName(input.displayName)
  const db = dbName(input.displayName)
  const domain = normalizeDomain(input.domain)!
  const taken = await takenPorts(c)
  const listening = c.mode === 'simulate' ? async () => false : isListening
  const apiPort = await nextFreePort(3001, taken, listening)
  const webPort = input.web ? await nextFreePort(4401, new Set([...taken, apiPort]), listening) : null
  return { name, db, domain, apiPort, webPort }
}

export function provisionSteps(c: Config, input: ProvisionInput): Step[] {
  const backend = join(c.appDir, 'dengo-backend')
  const d = (ctx: StepCtx) => ctx.data as {
    name: string; db: string; domain: string; apiPort: number; webPort: number | null; dir: string; url: string; password: string; caddyPending: boolean
  }

  return [
    {
      id: 'validate', title: 'Revisar nombre, base de datos y puertos',
      run: async (ctx) => {
        const p = await planClient(c, input)
        const dir = join(c.clientsDir, p.name)
        if (existsSync(dir)) throw new Error(`Ya existe la carpeta del cliente ${p.name}`)
        if (await clientDbExists(c, p.db)) throw new Error(`Ya existe una base de datos o un usuario de base llamado ${p.db}`)
        const dbPassword = hex(24)
        ctx.secret(dbPassword)
        Object.assign(ctx.data, p, { dir, dbPassword, url: databaseUrl(c, p.db, p.db, dbPassword), caddyPending: false })
        ctx.log(`  Cliente ${p.name} · base ${p.db} · API :${p.apiPort}${p.webPort ? ` · web :${p.webPort}` : ''} · ${p.domain}`)
      },
    },
    {
      id: 'createdb', title: 'Crear su usuario y su base de datos',
      run: async (ctx) => {
        await createClientDb(c, d(ctx).db, (ctx.data as { dbPassword: string }).dbPassword)
        ctx.log(`  CREATE ROLE ${d(ctx).db} · CREATE DATABASE ${d(ctx).db} OWNER ${d(ctx).db}`)
      },
      undo: async (ctx) => {
        await dropClientDb(c, d(ctx).db)
        ctx.log(`  DROP DATABASE ${d(ctx).db} · DROP ROLE ${d(ctx).db}`)
      },
    },
    {
      id: 'env', title: 'Escribir la carpeta y el .env del cliente',
      run: async (ctx) => {
        const x = d(ctx)
        await mkdir(join(x.dir, 'migracion'), { recursive: true })
        const jwt = hex(32)
        const lic = hex(24)
        ctx.secret(jwt); ctx.secret(lic)
        const text = renderEnv([
          [`# ${input.displayName} — creado por dengo-admin el ${new Date().toISOString().slice(0, 10)}`, {
            NODE_ENV: 'production', PORT: String(x.apiPort), HOST: '127.0.0.1', LOG_LEVEL: 'warn',
          }],
          ['# Base de datos', { DATABASE_URL: x.url }],
          ['# Secretos propios de este cliente', { JWT_SECRET: jwt, LICENSE_ADMIN_SECRET: lic }],
          ['# Dominios que pueden llamar a la API', { CORS_ORIGIN: corsFor(x.domain, input.web) }],
          ['# IA (clave global del panel; encendido y límite mensual van en la licencia)', aiEnv(c)],
          ['# Facturación electrónica — Digifact', felEnv(c, input.modules.fel, input.fel ?? null)],
        ])
        await writeFile(join(x.dir, '.env'), text, { mode: 0o600 })
        ctx.log(`  ${join(x.dir, '.env')}`)
      },
      undo: async (ctx) => { await rm(d(ctx).dir, { recursive: true, force: true }); ctx.log(`  borrada ${d(ctx).dir}`) },
    },
    {
      id: 'schema', title: 'Crear las tablas (prisma db push)',
      run: async (ctx) => {
        const r = await ctx.sh('npx', ['prisma', 'db', 'push', '--skip-generate'], { cwd: backend, env: { DATABASE_URL: d(ctx).url } })
        if (r.code !== 0) throw new Error('prisma db push falló')
      },
    },
    {
      id: 'seed', title: 'Administrador, sucursal principal y licencia',
      run: async (ctx) => {
        const first = input.branches[0]!
        const password = input.admin.password || randomPassword()
        ctx.secret(password)
        d(ctx).password = password
        const r = await ctx.sh('npx', ['tsx', 'src/seed.ts'], {
          cwd: backend,
          env: {
            DATABASE_URL: d(ctx).url,
            SEED_ADMIN_EMAIL: input.admin.email, SEED_ADMIN_NAME: input.admin.name, SEED_ADMIN_PASSWORD: password,
            SEED_BRANCH_NAME: first.name, SEED_BRANCH_CODE: first.code.toUpperCase(),
            SEED_LICENSE_POS: String(input.modules.pos), SEED_LICENSE_MAESTROS: String(input.modules.maestros),
            SEED_LICENSE_PAGINA: String(input.modules.page), SEED_LICENSE_IA: String(input.modules.ai),
            SEED_LICENSE_IA_LIMITE: input.aiMonthlyLimit === null ? 'ilimitado' : String(input.aiMonthlyLimit),
          },
        })
        if (r.code !== 0) throw new Error('El seed falló')
        ctx.result.adminEmail = input.admin.email
        ctx.result.adminPassword = password
      },
    },
    {
      id: 'data', title: 'Sucursales, datos del negocio y FEL',
      run: async (ctx) => {
        const x = d(ctx)
        await withClientDb(x.url, async (db) => {
          for (const b of input.branches.slice(1)) {
            await db.query(`INSERT INTO "BRANCHES" ("ID","NAME","CODE","TYPE","CURRENCY","CREATED_AT","UPDATED_AT")
              VALUES ($1,$2,$3,'branch','GTQ',now(),now()) ON CONFLICT ("CODE") DO NOTHING`, [newId(), b.name, b.code.toUpperCase()])
            ctx.log(`  Sucursal ${b.name} (${b.code.toUpperCase()})`)
          }
          await db.query(`INSERT INTO "COMPANY_PROFILE" ("ID","NAME","TAX_ID","PHONE","EMAIL","WEBSITE","COUNTRY","UPDATED_AT")
            VALUES ($1,$2,$3,$4,$5,$6,'Guatemala',now())`,
          [newId(), input.displayName, input.fel?.nit ?? null, input.contact.phone || null, input.contact.email || null, `https://${x.domain}`])
          await db.query(`UPDATE "LICENSE_CONFIG" SET "FEL_ENABLED" = $1, "UPDATED_AT" = now()`, [input.modules.fel])
        })
        ctx.log(`  Perfil «${input.displayName}» · FEL ${input.modules.fel ? 'activo' : 'apagado'}`)
      },
    },
    {
      id: 'pm2', title: 'Arrancar el proceso del cliente (pm2)',
      run: async (ctx) => {
        const x = d(ctx)
        const r = await ctx.sh('pm2', ['start', join(backend, 'dist', 'index.js'), '--name', x.name, '--cwd', x.dir])
        if (r.code !== 0) throw new Error('pm2 no pudo arrancar el proceso')
        await ctx.sh('pm2', ['save'])
      },
      undo: async (ctx) => { await ctx.sh('pm2', ['delete', d(ctx).name]); await ctx.sh('pm2', ['save']) },
    },
    {
      id: 'health', title: 'Esperar a que responda /api/health',
      run: async (ctx) => {
        for (let i = 0; i < 25; i++) {
          const h = await health(c, d(ctx).apiPort, true)
          if (h.ok) { ctx.log(`  En línea (${h.ms} ms)`); return }
          await new Promise(r => setTimeout(r, 1000))
        }
        throw new Error('El backend no respondió en 25 s (revisa los logs del cliente)')
      },
    },
    {
      id: 'web', title: 'Página web: contenido inicial y proceso',
      run: async (ctx) => {
        if (!input.web) return 'skipped'
        const x = d(ctx)
        await withClientDb(x.url, db => db.query(`INSERT INTO "SITE_CONFIG" ("ID","SITE","THEME","PUBLISHED","PUBLIC_URL","POS_URL","BUSINESS_NAME","PHONE","EMAIL","CREATED_AT","UPDATED_AT")
          VALUES ($1,'plantilla','clasico',false,$2,$3,$4,$5,$6,now(),now())`,
        [newId(), `https://${x.domain}`, `https://pos.${x.domain}`, input.displayName, input.contact.phone || null, input.contact.email || null]))
        const web = join(c.appDir, 'dengo-web')
        const r = await ctx.sh('pm2', ['start', join(web, 'dist', 'server', 'entry.mjs'), '--name', `${x.name}-web`, '--cwd', web], {
          env: { HOST: '127.0.0.1', PORT: String(x.webPort), DENGO_API: `http://127.0.0.1:${x.apiPort}` },
        })
        if (r.code !== 0) throw new Error('pm2 no pudo arrancar la página web')
        await ctx.sh('pm2', ['save'])
        if (c.mode !== 'simulate') {
          let up = false
          for (let i = 0; i < 20 && !up; i++) {
            try { up = (await fetch(`http://127.0.0.1:${x.webPort}/`, { signal: AbortSignal.timeout(3000) })).status < 500 } catch { /* not yet */ }
            if (!up) await new Promise(res => setTimeout(res, 1000))
          }
          if (!up) throw new Error(`La página web no respondió en el puerto ${x.webPort} (revisa pm2 logs ${x.name}-web)`)
          ctx.log(`  Página en línea en :${x.webPort}`)
        }
        ctx.log('  La página queda sin publicar: se publica desde el POS (Página web) cuando el cliente la revise.')
      },
      undo: async (ctx) => { if (input.web) { await ctx.sh('pm2', ['delete', `${d(ctx).name}-web`]); await ctx.sh('pm2', ['save']) } },
    },
    {
      id: 'caddy', title: 'Dominio en Caddy (HTTPS)',
      run: async (ctx) => {
        const x = d(ctx)
        if (!input.applyCaddy) { x.caddyPending = true; ctx.warn('Se dejó para después'); return }
        const hosts = [`pos.${x.domain}`, ...(input.web ? [x.domain, `www.${x.domain}`] : [])]
        const checks = await Promise.all(hosts.map(h => checkDns(h, c.serverIp)))
        for (const ch of checks) ctx.log(`  DNS ${ch.host} → ${ch.addresses.join(', ') || 'sin registro'} ${ch.ok ? '✓' : '✗'}`)
        if (c.mode !== 'simulate' && checks.some(ch => !ch.ok)) {
          x.caddyPending = true
          ctx.warn(`El DNS aún no apunta a ${c.serverIp || 'este servidor'}: aplica Caddy desde la ficha del cliente cuando apunte`)
          return
        }
        await applyCaddy(c, ctx.sh, x.name, renderClientCaddy(x.name, { domain: x.domain, apiPort: x.apiPort, web: input.web, webPort: x.webPort, frontendDist: c.frontendDist }))
        ctx.result.posUrl = `https://pos.${x.domain}`
        if (input.web) ctx.result.webUrl = `https://${x.domain}`
      },
      undo: async (ctx) => { if (!d(ctx).caddyPending) await applyCaddy(c, ctx.sh, d(ctx).name, null).catch(() => {}) },
    },
    {
      id: 'save', title: 'Guardar la ficha del cliente',
      run: async (ctx) => {
        const x = d(ctx)
        const file: ClientFile = {
          name: x.name, displayName: input.displayName, domain: x.domain, apiPort: x.apiPort, web: input.web, webPort: x.webPort,
          contact: input.contact, notes: input.notes ?? '', createdAt: new Date().toISOString(), archived: false,
          caddy: 'managed', caddyPending: x.caddyPending, dbName: x.db,
        }
        await writeClientFile(c, file)
        ctx.result.client = x.name
        ctx.result.posUrl ??= `https://pos.${x.domain}`
        ctx.log(`  ✓ ${input.displayName} quedó listo`)
      },
    },
  ]
}
