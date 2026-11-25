// Migración por la API (panel corriendo en simulate + Postgres local):
//   npx tsx server/scripts/e2e-migration.ts <plantilla.xlsx> <carpeta-fotos> [Cliente]
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import AdmZip from 'adm-zip'

const [file, photos, name = 'LibreriaElBuho'] = process.argv.slice(2)
const BASE = 'http://127.0.0.1:4900'
const login = await fetch(`${BASE}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'dengo-admin-dev' }) })
const cookie = login.headers.get('set-cookie')!.split(';')[0]!
const zip = new AdmZip()
for (const f of readdirSync(photos!)) zip.addFile(`carpeta/${f}`, readFileSync(join(photos!, f)))
zip.addFile('../../escape.png', Buffer.from('x'))

const fd = new FormData()
fd.append('format', 'dengo')
fd.append('file', new Blob([readFileSync(file!)]), 'plantilla.xlsx')
fd.append('images', new Blob([zip.toBuffer()]), 'fotos.zip')
const up = await (await fetch(`${BASE}/api/clients/${name}/migrations`, { method: 'POST', headers: { cookie }, body: fd })).json() as any
console.log('subida', up.batch, 'fotos', up.meta?.images, 'errores', up.validation?.errors.length, 'avisos', up.validation?.warnings.length, up.validation?.counts)

const run = async (dry: boolean) => {
  const s = await (await fetch(`${BASE}/api/clients/${name}/migrations/${up.batch}/run`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ dry }) })).json() as any
  let j: any
  for (let i = 0; i < 120; i++) { j = await (await fetch(`${BASE}/api/jobs/${s.jobId}`, { headers: { cookie } })).json(); if (j.status !== 'running') break; await new Promise(r => setTimeout(r, 1000)) }
  console.log(dry ? 'revisión' : 'importación', j.status, j.error ?? '', j.steps.map((x: any) => `${x.id}:${x.status}`).join(' '))
  console.log('  resumen', JSON.stringify(j.result?.summary), 'credenciales', j.result?.credentials?.length ?? 0)
  console.log('  log con contraseña?', j.lines.some((l: any) => /→/.test(l.text)))
}
await run(true)
await run(false)
console.log('lotes', ((await (await fetch(`${BASE}/api/clients/${name}/migrations`, { headers: { cookie } })).json()) as any).batches.length)
const t = await fetch(`${BASE}/api/template.xlsx`, { headers: { cookie } })
console.log('plantilla', t.status, t.headers.get('content-type'), (await t.arrayBuffer()).byteLength, 'bytes')
