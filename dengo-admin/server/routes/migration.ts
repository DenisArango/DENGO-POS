import type { FastifyInstance } from 'fastify'
import { mkdir, writeFile, readdir, readFile, stat } from 'node:fs/promises'
import { existsSync, writeFileSync } from 'node:fs'
import { join, basename, extname } from 'node:path'
import AdmZip from 'adm-zip'
import type { Config } from '../config.js'
import { services } from '../lib/services.js'
import { readClient } from '../lib/registry.js'
import { withClientDb } from '../lib/clientdb.js'
import { buildTemplate, validateTemplate } from '../../../dengo-backend/scripts/plantilla-spec.js'
import { backupClient } from '../jobs/ops.js'
import type { Step } from '../jobs/engine.js'

const LOYVERSE_FIELDS = ['items', 'inventory', 'customers', 'suppliers', 'employees'] as const
const BATCH_RE = /^\d{8}-\d{6}$/
const batchStamp = () => new Date(Date.now() - 6 * 3600_000).toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')

interface BatchMeta {
  batch: string
  format: 'dengo' | 'loyverse'
  files: Record<string, string>
  images: number
  branch?: string
  createdAt: string
  lastRun?: { dry: boolean; ok: boolean; at: string; summary?: unknown }
}

/** Only image files, flattened to their base name (no paths from the zip ever reach the disk). */
function extractImages(zipBuf: Buffer, dir: string): number {
  const zip = new AdmZip(zipBuf)
  let n = 0
  for (const e of zip.getEntries()) {
    if (e.isDirectory) continue
    const name = basename(e.entryName.replace(/\\/g, '/'))
    if (!/^[\w .-]{1,120}\.(jpe?g|png|webp)$/i.test(name) || name.startsWith('.') || name.includes('..')) continue
    writeFileSync(join(dir, name), e.getData())
    n++
  }
  return n
}

export async function migrationRoutes(app: FastifyInstance, { config }: { config: Config }) {
  const { jobs } = services(config)

  app.get('/api/template.xlsx', async (_req, reply) => {
    reply.header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('content-disposition', 'attachment; filename="Plantilla-DENGO.xlsx"')
    return reply.send(buildTemplate())
  })

  const branchesOf = async (url: string) => withClientDb(url, async db => (await db.query('SELECT "CODE" code, "NAME" name FROM "BRANCHES"')).rows as { code: string; name: string }[])

  // Upload: plantilla DENGO (file + optional images zip) or the Loyverse exports.
  app.post<{ Params: { name: string } }>('/api/clients/:name/migrations', async (req, reply) => {
    const r = await readClient(config, req.params.name)
    if (!r) return reply.status(404).send({ error: 'No existe ese cliente' })
    const batch = batchStamp()
    const dir = join(r.dir, 'migracion', batch)
    await mkdir(join(dir, 'fotos'), { recursive: true })
    const meta: BatchMeta = { batch, format: 'dengo', files: {}, images: 0, createdAt: new Date().toISOString() }
    for await (const part of req.parts()) {
      if (part.type === 'field') {
        if (part.fieldname === 'format' && (part.value === 'loyverse' || part.value === 'dengo')) meta.format = part.value
        if (part.fieldname === 'branch') meta.branch = String(part.value).trim().slice(0, 150)
        continue
      }
      const buf = await part.toBuffer()
      const ext = extname(part.filename).toLowerCase()
      if (part.fieldname === 'images') {
        if (ext !== '.zip') return reply.status(400).send({ error: 'Las fotos van en un archivo .zip' })
        meta.images = extractImages(buf, join(dir, 'fotos'))
        continue
      }
      if (!['.xlsx', '.xls', '.csv'].includes(ext)) return reply.status(400).send({ error: `«${part.filename}» no es Excel` })
      const key = part.fieldname === 'file' ? 'plantilla' : part.fieldname
      if (key !== 'plantilla' && !LOYVERSE_FIELDS.includes(key as any)) continue
      const fname = `${key}${ext}`
      await writeFile(join(dir, fname), buf)
      meta.files[key] = fname
    }
    if (meta.format === 'dengo' && !meta.files.plantilla) return reply.status(400).send({ error: 'Falta el archivo de la plantilla' })
    if (meta.format === 'loyverse') {
      if (!Object.keys(meta.files).length) return reply.status(400).send({ error: 'Sube al menos un archivo de Loyverse' })
      if ((meta.files.items || meta.files.employees) && !meta.branch) return reply.status(400).send({ error: 'Loyverse necesita el nombre de la sucursal de estos archivos' })
      if (meta.files.inventory && !meta.files.items) return reply.status(400).send({ error: 'El inventario de Loyverse necesita también el archivo de artículos' })
    }
    await writeFile(join(dir, 'lote.json'), JSON.stringify(meta, null, 2))
    let validation = null
    if (meta.format === 'dengo') {
      const branches = await branchesOf(r.env.DATABASE_URL!).catch(() => [])
      const { data: _d, ...v } = validateTemplate(await readFile(join(dir, meta.files.plantilla!)), { branchCodes: branches.map(b => b.code), branchNames: branches.map(b => b.name) })
      validation = v
    }
    return { batch, meta, validation }
  })

  app.get<{ Params: { name: string } }>('/api/clients/:name/migrations', async (req, reply) => {
    const r = await readClient(config, req.params.name)
    if (!r) return reply.status(404).send({ error: 'No existe ese cliente' })
    const base = join(r.dir, 'migracion')
    if (!existsSync(base)) return { batches: [] }
    const out: BatchMeta[] = []
    for (const b of (await readdir(base)).filter(b => BATCH_RE.test(b)).sort().reverse()) {
      try { out.push(JSON.parse(await readFile(join(base, b, 'lote.json'), 'utf8'))) } catch { /* incomplete upload */ }
    }
    return { batches: out }
  })

  // Run a batch: dry (review, writes nothing) or real (back up first).
  app.post<{ Params: { name: string; batch: string } }>('/api/clients/:name/migrations/:batch/run', async (req, reply) => {
    const r = await readClient(config, req.params.name)
    if (!r) return reply.status(404).send({ error: 'No existe ese cliente' })
    if (!BATCH_RE.test(req.params.batch)) return reply.status(400).send({ error: 'Lote inválido' })
    const dir = join(r.dir, 'migracion', req.params.batch)
    const metaPath = join(dir, 'lote.json')
    if (!existsSync(metaPath)) return reply.status(404).send({ error: 'No existe ese lote' })
    const meta = JSON.parse(await readFile(metaPath, 'utf8')) as BatchMeta
    const dry = (req.body as { dry?: unknown } | null)?.dry !== false
    const backend = join(config.appDir, 'dengo-backend')
    const hasImages = meta.images > 0 && existsSync(join(dir, 'fotos'))

    const args = meta.format === 'dengo'
      ? ['tsx', 'scripts/import-plantilla.ts', `--file=${join(dir, meta.files.plantilla!)}`, ...(hasImages ? [`--images=${join(dir, 'fotos')}`] : [])]
      : ['tsx', 'scripts/import-loyverse.ts', ...(meta.branch ? [`--branch=${meta.branch}`] : []),
        ...LOYVERSE_FIELDS.filter(f => meta.files[f]).map(f => `--${f}=${join(dir, meta.files[f]!)}`)]
    if (dry) args.push('--dry-run')

    const steps: Step[] = [
      ...(dry ? [] : [{ id: 'backup', title: 'Respaldo antes de importar', run: async (ctx: any) => { await backupClient(config, ctx, r, 'migracion') } } as Step]),
      {
        id: 'import', title: dry ? 'Revisar sin escribir (dry-run)' : 'Importar al sistema',
        run: async (ctx) => {
          const creds: string[] = []
          let resumen: any = null
          let inCreds = false
          const res = await ctx.sh('npx', args, {
            cwd: backend, env: { DATABASE_URL: r.env.DATABASE_URL!, NODE_ENV: 'production' },
            // temporary passwords and the machine summary never reach the saved log
            filter: (l) => {
              if (l.startsWith('@@RESUMEN ')) { try { resumen = JSON.parse(l.slice(10)) } catch { /* ignore */ } return null }
              if (/Contraseñas temporales|Credenciales temporales/.test(l)) { inCreds = true; return '🔑 Contraseñas temporales: se muestran al terminar (no se guardan)' }
              if (inCreds && /→/.test(l)) { creds.push(l.trim()); return null }
              inCreds = false
              return l
            },
          })
          if (creds.length) ctx.result.credentials = creds
          if (resumen) ctx.result.summary = resumen.summary ?? resumen
          meta.lastRun = { dry, ok: res.code === 0, at: new Date().toISOString(), summary: resumen?.summary }
          await writeFile(metaPath, JSON.stringify(meta, null, 2))
          if (res.code === 2) throw new Error('La plantilla tiene errores: corrígelos y vuelve a subirla')
          if (res.code !== 0) throw new Error('La importación falló (revisa el log)')
        },
      },
    ]
    try {
      const j = jobs.start({ kind: dry ? 'migration-dry' : 'migration', title: `${dry ? 'Revisar' : 'Importar'} datos de ${r.file.displayName}`, client: r.file.name, steps })
      return reply.status(202).send({ jobId: j.id })
    } catch (e: any) {
      return reply.status(e.statusCode ?? 500).send({ error: e.message })
    }
  })

  app.get<{ Params: { name: string; batch: string } }>('/api/clients/:name/migrations/:batch', async (req, reply) => {
    const r = await readClient(config, req.params.name)
    if (!r || !BATCH_RE.test(req.params.batch)) return reply.status(404).send({ error: 'No existe' })
    const p = join(r.dir, 'migracion', req.params.batch, 'lote.json')
    if (!existsSync(p)) return reply.status(404).send({ error: 'No existe ese lote' })
    const meta = JSON.parse(await readFile(p, 'utf8')) as BatchMeta
    const size = meta.files.plantilla ? (await stat(join(r.dir, 'migracion', req.params.batch, meta.files.plantilla))).size : 0
    return { meta, size }
  })
}
