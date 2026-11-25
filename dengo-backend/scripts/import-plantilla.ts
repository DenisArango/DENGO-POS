/**
 * Importa la plantilla DENGO (ver plantilla-spec.ts) a la base de UN cliente. Lo corre
 * dengo-admin con el .env del cliente; también se puede a mano:
 *
 *   DATABASE_URL=… npx tsx scripts/import-plantilla.ts --file=plantilla.xlsx [--images=carpeta] [--dry-run]
 *
 * Reglas (las mismas del importador de Loyverse):
 * - Nunca duplica: productos se empatan por código de barras → SKU → nombre; clientes por
 *   NIT → nombre; proveedores por código; empleados por correo; sucursales por código.
 *   Lo que ya existe no se sobreescribe (precio/costo de un producto existente se respetan),
 *   salvo la cantidad de Inventario, que es lo que la hoja dice que hay hoy.
 * - Saldo pendiente de un cliente → un cargo «Saldo migrado» (CreditCharge) y crédito activo.
 * - Empleados nuevos: contraseña temporal impresa una sola vez al final.
 * - Fotos: archivos de --images nombrados por SKU o código de barras; se comprimen como en
 *   el POS (JPEG 1280 px, calidad 82) y solo se ponen a productos sin foto.
 * - --dry-run valida y cuenta sin escribir nada.
 * Al final imprime una línea «@@RESUMEN {json}» que dengo-admin lee.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, extname, basename } from 'node:path'
import { randomBytes } from 'node:crypto'
import sharp from 'sharp'
import { prisma } from '../src/lib/prisma.js'
import { hashPassword } from '../src/services/auth.service.js'
import { validateTemplate, parseNumber, parseBool, ROLES } from './plantilla-spec.js'

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a)
  return m ? [m[1], m[2] ?? 'true'] : [a, 'true']
})) as { file?: string; images?: string; 'dry-run'?: string }
const dry = args['dry-run'] === 'true'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
const tempPassword = () => {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  return Array.from(randomBytes(10), b => abc[b % abc.length]).join('') + '!4'
}

async function main() {
  if (!args.file || !existsSync(args.file)) { console.error('❌ Falta --file=<plantilla.xlsx>'); process.exit(1) }
  const branchesNow = await prisma.branch.findMany({ select: { id: true, code: true, name: true } })
  const v = validateTemplate(readFileSync(args.file), { branchCodes: branchesNow.map(b => b.code), branchNames: branchesNow.map(b => b.name) })
  for (const w of v.warnings) console.log(`⚠️  ${w.sheet}${w.row ? ` fila ${w.row}` : ''}: ${w.message}`)
  if (v.errors.length) {
    for (const e of v.errors.slice(0, 200)) console.log(`❌ ${e.sheet}${e.row ? ` fila ${e.row}` : ''}${e.column ? ` [${e.column}]` : ''}: ${e.message}`)
    console.log(`@@RESUMEN ${JSON.stringify({ ok: false, errors: v.errors.length })}`)
    process.exit(2)
  }
  const d = v.data
  const summary: Record<string, { nuevos: number; existentes: number; extra?: number }> = {}
  const tally = (k: string) => (summary[k] ??= { nuevos: 0, existentes: 0 })
  const DRY = 'DRY'

  // ── Sucursales ──
  const branchByCode = new Map(branchesNow.map(b => [b.code.toUpperCase(), b.id]))
  const branchByName = new Map(branchesNow.map(b => [norm(b.name), b.id]))
  for (const r of d.sucursales) {
    const code = r.code.toUpperCase()
    if (branchByCode.has(code)) { tally('sucursales').existentes++; continue }
    const id = dry ? `${DRY}-${code}` : (await prisma.branch.create({ data: {
      code, name: r.name.slice(0, 150), type: branchByCode.size ? 'branch' : 'main', address: r.address ?? '', city: r.city ?? '', phone: r.phone ?? '',
    } })).id
    branchByCode.set(code, id); branchByName.set(norm(r.name), id)
    tally('sucursales').nuevos++
  }
  const branchId = (ref: string) => branchByCode.get(ref.toUpperCase()) ?? branchByName.get(norm(ref))

  // ── Categorías ──
  const catByName = new Map((await prisma.category.findMany({ select: { id: true, name: true } })).map(c => [norm(c.name), c.id]))
  const colorOf = new Map(d.categorias.map(r => [norm(r.name), r.color || null]))
  const categoryId = async (raw: string) => {
    const name = (raw || 'Sin categoría').trim().slice(0, 100)
    const hit = catByName.get(norm(name))
    if (hit) { return hit }
    const id = dry ? `${DRY}-cat` : (await prisma.category.create({ data: { name, color: colorOf.get(norm(name)) ?? null } })).id
    catByName.set(norm(name), id)
    tally('categorias').nuevos++
    return id
  }
  for (const r of d.categorias) { if (catByName.has(norm(r.name))) tally('categorias').existentes++; else await categoryId(r.name) }

  // ── Unidades ──
  const units = await prisma.productUnit.findMany()
  const unitId = async (raw: string) => {
    const name = raw.trim() || 'Unidad'
    const hit = units.find(u => norm(u.name) === norm(name) || norm(u.abbreviation) === norm(name))
    if (hit) return hit.id
    if (dry) return `${DRY}-unit`
    const abbr = norm(name) === 'unidad' ? 'u' : name.slice(0, 10).toLowerCase()
    const u = await prisma.productUnit.create({ data: { name: name.slice(0, 60), abbreviation: abbr, type: 'DISCRETE' } })
    units.push(u)
    return u.id
  }

  // ── Productos ──
  const existing = await prisma.product.findMany({ select: { id: true, barcode: true, sku: true, name: true, imageUrl: false } })
  const byBarcode = new Map(existing.filter(p => p.barcode).map(p => [p.barcode!, p.id]))
  const bySku = new Map(existing.filter(p => p.sku).map(p => [p.sku!.toUpperCase(), p.id]))
  const byName = new Map(existing.map(p => [norm(p.name), p.id]))
  for (const r of d.productos) {
    const sku = r.sku.slice(0, 150)
    const barcode = r.barcode ? r.barcode.slice(0, 150) : null
    const hit = (barcode && byBarcode.get(barcode)) || bySku.get(sku.toUpperCase()) || byName.get(norm(r.name))
    if (hit) { bySku.set(sku.toUpperCase(), hit); tally('productos').existentes++; continue }
    const data = {
      sku, barcode, name: r.name.slice(0, 200), brand: r.brand || null,
      basePrice: parseNumber(r.price) ?? 0, cost: parseNumber(r.cost ?? '') ?? 0,
      minStock: Math.round(parseNumber(r.minStock ?? '') ?? 0), maxStock: r.maxStock ? Math.round(parseNumber(r.maxStock) ?? 0) : null,
      isActive: parseBool(r.active ?? '', true), categoryId: await categoryId(r.category), baseUnitId: await unitId(r.unit ?? ''),
    }
    const id = dry ? `${DRY}-${sku}` : (await prisma.product.create({ data })).id
    bySku.set(sku.toUpperCase(), id)
    if (barcode) byBarcode.set(barcode, id)
    tally('productos').nuevos++
  }

  // ── Inventario ──
  let invRows = 0, invMissing = 0
  for (const r of d.inventario) {
    const productId = bySku.get(r.sku.toUpperCase())
    if (!productId) { invMissing++; continue }
    for (const code of d.inventoryBranches) {
      const raw = r[`qty:${code}`] ?? ''
      if (raw === '') continue
      const bId = branchId(code)!
      const quantity = parseNumber(raw) ?? 0
      if (!dry) await prisma.inventory.upsert({
        where: { productId_branchId: { productId, branchId: bId } },
        create: { productId, branchId: bId, quantity, lastRestockAt: new Date() },
        update: { quantity },
      })
      invRows++
    }
  }
  summary.inventario = { nuevos: invRows, existentes: 0, extra: invMissing }

  // ── Clientes ──
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' }, select: { id: true } })
  const custs = await prisma.customer.findMany({ select: { id: true, nit: true, name: true } })
  const custByNit = new Map(custs.filter(c => c.nit).map(c => [c.nit!.replace(/\W/g, '').toUpperCase(), c.id]))
  const custByName = new Map(custs.map(c => [norm(c.name), c.id]))
  let debt = 0
  for (const r of d.clientes) {
    const nitKey = (r.nit ?? '').replace(/\W/g, '').toUpperCase()
    if ((nitKey && custByNit.has(nitKey)) || custByName.has(norm(r.name))) { tally('clientes').existentes++; continue }
    const balance = parseNumber(r.balance ?? '') ?? 0
    const limit = parseNumber(r.creditLimit ?? '')
    const credit = parseBool(r.credit ?? '', false) || balance > 0
    tally('clientes').nuevos++
    if (dry) { if (balance > 0) debt += balance; continue }
    if (balance > 0 && !admin) throw new Error('No hay un usuario ADMIN para registrar los saldos migrados')
    const c = await prisma.customer.create({ data: {
      name: r.name.slice(0, 150), nit: r.nit ? r.nit.slice(0, 30) : null, phone: r.phone || null, email: r.email || null,
      address: r.address || null, comments: r.comments || null,
      creditEnabled: credit, creditLimitEnabled: limit !== null, creditLimit: limit ?? 0,
    } })
    if (nitKey) custByNit.set(nitKey, c.id)
    custByName.set(norm(r.name), c.id)
    if (balance > 0) {
      const amount = Math.round(balance * 100) / 100
      await prisma.$transaction([
        prisma.creditCharge.create({ data: { customerId: c.id, amount, concept: 'Saldo migrado', reference: 'Migración', chargeDate: new Date(), createdById: admin!.id } }),
        prisma.customer.update({ where: { id: c.id }, data: { creditUsed: { increment: amount } } }),
      ])
      debt += amount
    }
  }
  if (summary.clientes) summary.clientes.extra = Math.round(debt * 100) / 100

  // ── Proveedores ──
  const supCodes = new Set((await prisma.supplier.findMany({ select: { code: true } })).map(s => s.code.toUpperCase()))
  for (const r of d.proveedores) {
    if (supCodes.has(r.code.toUpperCase())) { tally('proveedores').existentes++; continue }
    supCodes.add(r.code.toUpperCase())
    tally('proveedores').nuevos++
    if (!dry) await prisma.supplier.create({ data: {
      code: r.code.slice(0, 30), name: r.name.slice(0, 150), contactName: r.contact ?? '', phone: r.phone || null, email: r.email || null,
      taxId: r.nit || null, address: r.address || null, city: r.city || null, paymentTerms: r.terms || 'Contado',
    } })
  }

  // ── Empleados ──
  const emails = new Set((await prisma.user.findMany({ select: { email: true } })).map(u => u.email.toLowerCase()))
  const creds: { email: string; password: string }[] = []
  for (const r of d.empleados) {
    const email = r.email.toLowerCase()
    if (emails.has(email)) { tally('empleados').existentes++; continue }
    emails.add(email)
    tally('empleados').nuevos++
    const role = ROLES[norm(r.role ?? '')] ?? 'OPERATOR'
    const password = tempPassword()
    if (!dry) {
      await prisma.user.create({ data: { email, name: r.name.slice(0, 150), role, branchId: branchId(r.branch)!, passwordHash: await hashPassword(password) } })
      creds.push({ email, password })
    }
  }

  // Printed right away: if anything later fails, these users exist and nobody would see their passwords again.
  if (creds.length) {
    console.log('\n🔑 Contraseñas temporales (se muestran una sola vez):')
    for (const c of creds) console.log(`   ${c.email}  →  ${c.password}`)
    console.log('')
  }

  // ── Fotos ──
  if (args.images && existsSync(args.images)) {
    let put = 0, skip = 0, unknown = 0
    const bad: string[] = []
    const files = readdirSync(args.images, { recursive: true }).map(String).filter(f => /\.(jpe?g|png|webp)$/i.test(f))
    for (const f of files) {
      const key = basename(f, extname(f)).trim()
      const pid = byBarcode.get(key) ?? bySku.get(key.toUpperCase())
      if (!pid || pid.startsWith(DRY)) { if (!pid) unknown++; else put++; continue }
      const p = await prisma.product.findUnique({ where: { id: pid }, select: { imageUrl: true } })
      if (p?.imageUrl) { skip++; continue }
      try { // one unreadable photo never stops the rest
        const jpg = await sharp(readFileSync(join(args.images, f))).rotate().resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
          .flatten({ background: '#ffffff' }).jpeg({ quality: 82 }).toBuffer()
        if (!dry) await prisma.product.update({ where: { id: pid }, data: { imageUrl: `data:image/jpeg;base64,${jpg.toString('base64')}` } })
        put++
      } catch {
        bad.push(f)
      }
    }
    summary.fotos = { nuevos: put, existentes: skip, extra: unknown }
    if (bad.length) console.log(`⚠️  ${bad.length} fotos no se pudieron leer y se omitieron: ${bad.slice(0, 10).join(', ')}`)
  }

  for (const [k, s] of Object.entries(summary)) console.log(k === 'inventario' ? `✅ inventario: ${s.nuevos} cantidades cargadas${s.extra ? `, ${s.extra} SKU sin producto` : ''}` : `✅ ${k}: ${s.nuevos} nuevos, ${s.existentes} ya existían${s.extra ? ` (${k === 'clientes' ? `Q${s.extra} de saldo migrado` : `${s.extra} sin producto`})` : ''}`)
  console.log(dry ? '\n✅ Revisión completa: no se escribió nada.' : '\n✅ Importación completa.')
  console.log(`@@RESUMEN ${JSON.stringify({ ok: true, dry, summary, credentials: creds })}`)
}

main().catch((e) => { console.error('❌', e.message ?? e); process.exit(1) }).finally(() => prisma.$disconnect())
