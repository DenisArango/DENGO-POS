/**
 * One-off catalog migration from a client's existing Loyverse POS export into
 * DENGO. Internal tool — never exposed via any HTTP route, run by hand during
 * client onboarding:
 *
 *   npx tsx scripts/import-loyverse.ts \
 *     --branch="Sucursal Zona 1" \
 *     --items=items_export.xlsx \
 *     --inventory=inventory_list.xlsx \
 *     --customers=customers_export.xlsx \
 *     --suppliers=suppliers_export.xlsx \
 *     --employees=employees_export.xlsx \
 *     [--branch-code=ZONA1] [--dry-run]
 *
 * All 5 file flags are optional and independent — pass only what you have.
 * Always run with --dry-run first: it prints the exact summary (created /
 * matched / skipped / warnings) without writing anything, so you can review
 * before committing to a real client's database.
 *
 * --employees creates one DENGO User per row (matched by email on re-runs,
 * same "already exists, skip" pattern as customers/suppliers), always as a
 * plain OPERATOR (sales + cash register, nothing administrative) regardless
 * of anything in the source file — Loyverse's employee export carries no
 * real role/permission data, so granting anything wider from it would be
 * guessing. A random temporary password is generated per employee and
 * printed once at the end (never written to disk) — share these out of
 * band; each employee should change their password on first login. Like
 * --items, this needs --branch (the employee's starting branch; the owner
 * can add others per-person afterward from Usuarios). The owner then
 * assigns real roles/fine permissions per person from Configuración → Roles.
 *
 * --branch is a NAME, not a database id. It's looked up case-insensitively
 * against existing branches; if none matches, one is created on the spot as
 * a **provisional placeholder** (just name/code/currency — no address, logo,
 * printer width, default customer, etc.) so this script never blocks on "the
 * branch doesn't exist yet in the app." The client fills in the rest later
 * from Configuración → Tiendas — same pattern as the admin seed script.
 * --branch-code optionally sets its code explicitly; otherwise one is
 * slugified from the name.
 *
 * The Loyverse export is one Excel file PER BRANCH (their inventory report
 * is branch-scoped), so onboarding a multi-branch client means running this
 * script once per branch with a different --branch and --inventory each
 * time. Products are a GLOBAL catalog in DENGO (only Inventory — the
 * quantity — is per-branch), and the same item routinely appears in more
 * than one branch's export — so every run after the first one MATCHES
 * existing products (by barcode, then SKU, then exact name) instead of
 * creating duplicates, and still links matched products into that branch's
 * inventory. A matched product's price/cost from an earlier run is never
 * overwritten by a later branch's file.
 */
import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import * as XLSX from 'xlsx'
import { prisma } from '../src/lib/prisma.js'
import { looksLikeRealNit } from '../src/lib/nit.js'
import { hashPassword } from '../src/services/auth.service.js'

// ── CLI args ─────────────────────────────────────────────────────────────
type Args = {
  branch?: string
  branchCode?: string
  items?: string
  inventory?: string
  customers?: string
  suppliers?: string
  employees?: string
  dryRun: boolean
}

function parseArgs(): Args {
  const args: Args = { dryRun: false }
  for (const raw of process.argv.slice(2)) {
    if (raw === '--dry-run') { args.dryRun = true; continue }
    const m = raw.match(/^--([a-z-]+)=(.*)$/)
    if (m) {
      const key = m[1] === 'branch-code' ? 'branchCode' : m[1]
      ;(args as any)[key!] = m[2]
    }
  }
  return args
}

// ── Sheet reading ────────────────────────────────────────────────────────
function readSheet(path: string): Record<string, string>[] {
  const wb = XLSX.read(readFileSync(path))
  const ws = wb.Sheets[wb.SheetNames[0]!]!
  return XLSX.utils.sheet_to_json(ws, { defval: '' })
}

// ── Helpers ──────────────────────────────────────────────────────────────
function slugify(name: string): string {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'X'
}

// Appends a numeric/id suffix on collision, always fitting within maxLen.
function uniqueCode(base: string, used: Set<string>, maxLen: number, fallbackSuffix: string): string {
  let candidate = base.slice(0, maxLen)
  if (!used.has(candidate)) { used.add(candidate); return candidate }
  candidate = `${base.slice(0, maxLen - fallbackSuffix.length - 1)}-${fallbackSuffix}`.slice(0, maxLen)
  let n = 2
  while (used.has(candidate)) {
    const suffix = `${fallbackSuffix}${n}`
    candidate = `${base.slice(0, maxLen - suffix.length - 1)}-${suffix}`.slice(0, maxLen)
    n++
  }
  used.add(candidate)
  return candidate
}

// Looks up a branch by name (case-insensitive) or by --branch-code if given;
// creates a provisional placeholder (name/code/type only — no address, logo,
// printer width, default customer) if nothing matches, so onboarding a
// multi-branch client never has to pre-create branches by hand in the app
// first. The client completes the rest later from Configuración → Tiendas.
async function resolveBranch(name: string, codeOverride: string | undefined, dryRun: boolean): Promise<{ id: string; created: boolean }> {
  const existing = await prisma.branch.findFirst({
    where: codeOverride
      ? { OR: [{ name: { equals: name, mode: 'insensitive' } }, { code: codeOverride }] }
      : { name: { equals: name, mode: 'insensitive' } },
  })
  if (existing) return { id: existing.id, created: false }

  const existingCodes = new Set((await prisma.branch.findMany({ select: { code: true } })).map(b => b.code))
  const code = codeOverride ?? uniqueCode(slugify(name), existingCodes, 20, 'B')
  const isFirstBranch = existingCodes.size === 0

  if (dryRun) return { id: 'DRY-RUN-BRANCH', created: true }
  const branch = await prisma.branch.create({ data: { name: name.slice(0, 150), code, type: isFirstBranch ? 'main' : 'branch' } })
  return { id: branch.id, created: true }
}

function joinAddress(parts: (string | undefined)[]): string | undefined {
  const clean = parts.map(p => (p ?? '').trim()).filter(Boolean)
  return clean.length ? clean.join(', ').slice(0, 300) : undefined
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// 6 random bytes, base64url-encoded — 8 readable characters, no quoting
// issues, ~48 bits of entropy. Plenty for a one-time temp password the
// employee is expected to change on first login.
function generateTempPassword(): string {
  return randomBytes(6).toString('base64url')
}
const str = (v: unknown): string => String(v ?? '').trim()
// looksLikeRealNit imported from src/lib/nit.js — shared with sales.ts so
// "what counts as a billable NIT" is defined in exactly one place.

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs()
  console.log(args.dryRun ? '🔍 DRY RUN — no se escribirá nada en la base de datos\n' : '⚠️  MODO REAL — se van a crear registros\n')

  const warnings: string[] = []
  const usedSupplierCodes = new Set<string>()
  const usedNits = new Set<string>()

  // ── Suppliers ──────────────────────────────────────────────────────────
  if (args.suppliers) {
    const rows = readSheet(args.suppliers)
    let created = 0, skipped = 0, matched = 0

    // Pre-load existing codes so re-runs don't collide with a prior partial import.
    const existing = await prisma.supplier.findMany({ select: { code: true, name: true } })
    for (const s of existing) usedSupplierCodes.add(s.code)
    const existingByName = new Map(existing.map(s => [s.name.toLowerCase(), s]))

    for (const row of rows) {
      const company = str(row['Compañía/Empresa'])
      const person = str(row['Nombre (s)'])
      const name = company || person
      if (!name) { skipped++; continue }

      if (existingByName.has(name.toLowerCase())) { matched++; continue }

      const loyverseId = str(row['Id. del proveedor'])
      const code = uniqueCode(slugify(name), usedSupplierCodes, 30, loyverseId || 'S')
      const address = joinAddress([row['Dirección 1'], row['Dirección 2'], row['Estado/Provincia'], row['C.P.'], row['País']] as string[])

      const rawNit = str(row['Nit'])
      const rawAltId = str(row['NIF/CIF/RFC'])
      const taxId = looksLikeRealNit(rawNit) ? rawNit : (looksLikeRealNit(rawAltId) ? rawAltId : undefined)
      const notesParts = [str(row['Comentarios'])]
      if (!taxId && (rawNit || rawAltId)) notesParts.push(`Código Loyverse: ${rawNit || rawAltId}`)

      const data = {
        code,
        name: name.slice(0, 150),
        contactName: (company && person ? person : '').slice(0, 150),
        taxId,
        email: str(row['Correo electrónico']) || undefined,
        phone: str(row['Teléfono']) || undefined,
        address,
        city: str(row['Ciudad']) || undefined,
        notes: notesParts.filter(Boolean).join(' | ') || undefined,
      }

      if (!args.dryRun) await prisma.supplier.create({ data })
      created++
    }
    console.log(`Proveedores: ${created} nuevos, ${matched} ya existían (mismo nombre), ${skipped} sin nombre (omitidos)`)
  }

  // ── Customers ──────────────────────────────────────────────────────────
  if (args.customers) {
    const rows = readSheet(args.customers)
    let created = 0, skipped = 0, matched = 0
    let withCredit = 0, unlimited = 0

    // Two separate sets on purpose: `existingNits` is what was already in the
    // DB *before* this run started (so re-running the same file — e.g.
    // retrying after an error partway through — recognizes every row as
    // already imported and skips it, instead of creating a full second copy
    // of all of them). `usedNits` only tracks collisions *within this run*,
    // where two different rows in the same file genuinely share a NIT.
    const existingNits = new Set((await prisma.customer.findMany({ select: { nit: true } })).map(c => c.nit))
    for (const n of existingNits) usedNits.add(n)

    for (const row of rows) {
      const name = str(row['Nombre (s)'])
      if (!name) { skipped++; continue }

      const loyverseId = str(row['ID del cliente'])
      const rawNit = str(row['Nit'])
      const validNit = looksLikeRealNit(rawNit)
      let nit = validNit ? rawNit : `SIN-NIT-${loyverseId || slugify(name)}`

      if (existingNits.has(nit)) {
        // Already in the database under this exact NIT/placeholder — almost
        // certainly the same source row from an earlier run of this script.
        // Match and skip, same as suppliers/products do.
        matched++
        continue
      }
      if (usedNits.has(nit)) {
        // Two DIFFERENT rows in this same file share a real NIT (or two
        // blank-NIT customers whose generated placeholder collided) — these
        // are genuinely two different customers, so suffix instead of skipping.
        let n = 2
        let candidate = `${nit}-${n}`
        while (usedNits.has(candidate)) { n++; candidate = `${nit}-${n}` }
        warnings.push(`Cliente "${name}" — NIT "${nit}" duplicado dentro del mismo archivo, usando "${candidate}"`)
        nit = candidate
      }
      usedNits.add(nit)

      const saldo = num(row['Saldo'])
      const limite = num(row['Límite de crédito'])
      // "Sin límite configurado pero con saldo" = ya usó crédito sin tope fijado → ilimitado.
      // Sin saldo y sin límite = nunca ha usado crédito → sin acceso a crédito por defecto.
      const creditEnabled = saldo !== 0 || limite > 0
      const creditLimitEnabled = limite > 0
      if (creditEnabled) { withCredit++; if (!creditLimitEnabled) unlimited++ }

      const address = joinAddress([row['Dirección 1'], row['Dirección 2'], row['Estado/Provincia'], row['C.P.'], row['País']] as string[])
      const commentParts = [str(row['Comentarios'])]
      if (!validNit && rawNit) commentParts.push(`Código Loyverse: ${rawNit}`)

      const data = {
        nit: nit.slice(0, 30),
        name: name.slice(0, 150),
        email: str(row['Correo electrónico']) || undefined,
        phone: str(row['Teléfono']) || undefined,
        address,
        comments: commentParts.filter(Boolean).join(' | ').slice(0, 2000) || undefined,
        creditEnabled,
        creditLimitEnabled,
        creditLimit: creditLimitEnabled ? limite : 0,
        creditUsed: creditEnabled ? Math.max(saldo, 0) : 0,
      }

      if (!args.dryRun) await prisma.customer.create({ data })
      created++
    }
    console.log(`Clientes: ${created} nuevos (${withCredit} con crédito habilitado, ${unlimited} de esos sin límite), ${matched} ya existían, ${skipped} sin nombre (omitidos)`)
  }

  // ── Employees (Users) ────────────────────────────────────────────────────
  // Everyone imports as OPERATOR (ventas + caja, sin nada administrativo) —
  // el Loyverse export no trae un rol real, y asignar algo más amplio desde
  // datos ambiguos sería un riesgo de seguridad. El dueño ajusta roles y
  // permisos finos por persona desde Configuración → Roles una vez que todos
  // puedan iniciar sesión.
  const employeeCredentials: { email: string; password: string }[] = []
  if (args.employees) {
    if (!args.branch) {
      console.error('❌ --employees requiere --branch="Nombre de la sucursal" para asignarles una sucursal de inicio')
      process.exit(1)
    }
    const { id: branchId } = await resolveBranch(args.branch, args.branchCode, args.dryRun)

    const rows = readSheet(args.employees)
    let created = 0, skipped = 0, matched = 0

    const existingEmails = new Set((await prisma.user.findMany({ select: { email: true } })).map(u => u.email.toLowerCase()))

    for (const row of rows) {
      const name = str(row['Nombre (s)']) || str(row['Usuario'])
      const email = str(row['Correo electrónico']).toLowerCase()
      if (!name || !email) { skipped++; continue }

      if (existingEmails.has(email)) { matched++; continue }
      existingEmails.add(email)

      // Seen in real client data: the Nit column (normally blank for
      // employees) repurposed to write the literal word "Admin" on exactly
      // one row. That's a signal worth surfacing, not a reason to
      // auto-elevate — flagged in the warnings instead.
      if (str(row['Nit']).toLowerCase() === 'admin') {
        warnings.push(`Empleado "${name}" (${email}) — tenía "Admin" en la columna Nit del export; se importó como OPERATOR igual que el resto, revisa si debe tener el rol ADMIN desde Configuración → Usuarios`)
      }

      const password = generateTempPassword()
      employeeCredentials.push({ email, password })

      if (!args.dryRun) {
        const passwordHash = await hashPassword(password)
        await prisma.user.create({
          data: { email, name: name.slice(0, 150), passwordHash, role: 'OPERATOR', branchId },
        })
      }
      created++
    }
    console.log(`Empleados: ${created} nuevos (rol OPERATOR), ${matched} ya existían (mismo correo), ${skipped} sin nombre o sin correo (omitidos)`)
  }

  // ── Products + inventory ─────────────────────────────────────────────────
  if (args.items) {
    if (!args.branch) {
      console.error('❌ --items requiere --branch="Nombre de la sucursal" para poder cargar el stock')
      process.exit(1)
    }
    const { id: branchId, created: branchCreated } = await resolveBranch(args.branch, args.branchCode, args.dryRun)
    if (branchCreated) {
      console.log(`📍 Sucursal "${args.branch}" no existía — creada como provisional (código: ${args.branchCode ?? '(generado automáticamente)'}). El cliente debe completar dirección, logo, ancho de impresora, etc. desde Configuración → Tiendas.`)
    } else {
      console.log(`📍 Sucursal "${args.branch}" ya existía — se usa la existente.`)
    }

    // One shared default unit for everything imported this way — Loyverse's
    // export doesn't carry a clean unit-of-measure column.
    let defaultUnit = await prisma.productUnit.findFirst({ where: { abbreviation: 'u' } })
    if (!defaultUnit) {
      defaultUnit = args.dryRun
        ? ({ id: 'DRY-RUN-UNIT' } as any)
        : await prisma.productUnit.create({ data: { name: 'Unidad', abbreviation: 'u', type: 'DISCRETE' } })
    }

    const categoryCache = new Map<string, string>() // name -> id
    for (const c of await prisma.category.findMany({ select: { id: true, name: true } })) {
      categoryCache.set(c.name.toLowerCase(), c.id)
    }
    async function resolveCategoryId(rawName: string): Promise<string> {
      const name = (rawName || 'Sin categoría').replace(/\|/g, ' › ').replace(/\s*>\s*/g, ' › ').trim().slice(0, 100)
      const key = name.toLowerCase()
      const cached = categoryCache.get(key)
      if (cached) return cached
      if (args.dryRun) { categoryCache.set(key, 'DRY-RUN-CAT'); return 'DRY-RUN-CAT' }
      const cat = await prisma.category.create({ data: { name } })
      categoryCache.set(key, cat.id)
      return cat.id
    }

    const rows = readSheet(args.items)

    // Products are a GLOBAL catalog (only Inventory is per-branch) — the same
    // item routinely appears in more than one branch's export, so a second
    // (or third...) branch's run must MATCH an already-imported product
    // instead of creating a duplicate. Matched in this order: barcode, then
    // SKU, then exact name. A matched product's price/cost is never touched
    // by a later run — only its linkage into this branch's inventory changes.
    const existingByBarcode = new Map<string, string>()
    const existingBySku = new Map<string, string>()
    const existingByName = new Map<string, string>()
    for (const p of await prisma.product.findMany({ select: { id: true, barcode: true, sku: true, name: true } })) {
      if (p.barcode) existingByBarcode.set(p.barcode, p.id)
      if (p.sku) existingBySku.set(p.sku, p.id)
      existingByName.set(p.name.toLowerCase(), p.id)
    }
    const usedBarcodes = new Set(existingByBarcode.keys())

    let created = 0, matched = 0, skipped = 0
    const skuToProductId = new Map<string, string>()

    for (const row of rows) {
      const name = str(row['Nombre']).replace(/^\t+/, '')
      if (!name) { skipped++; continue }
      if (str(row['Es un servicio']).toLowerCase() === 'y') { skipped++; continue }

      // Product.sku/barcode are VARCHAR(150) — Loyverse concatenates a
      // variant product's several barcodes into one pipe-separated value
      // here (seen up to 111 chars for real), so 150 gives real headroom;
      // this is still a defensive ceiling (with a warning) against a truly
      // pathological outlier, not something real data is expected to hit.
      // Truncating here, before anything else touches these values, keeps
      // the matching maps, skuToProductId, and what's actually written to
      // the DB all in agreement — truncating only at insert time would leave
      // a later run's full-length lookup key out of sync with what's stored.
      const rawSku = str(row['Número de artículo'])
      const sku = rawSku.slice(0, 150) || undefined
      if (rawSku.length > 150) warnings.push(`Producto "${name}" — SKU de ${rawSku.length} caracteres, recortado a 150: "${sku}"`)

      const rawBarcode = str(row['Nombre de visualización del código de barras']) || str(row['Identificador del producto'])
      let barcode = rawBarcode.slice(0, 150) || undefined
      if (rawBarcode.length > 150) warnings.push(`Producto "${name}" — código de barras de ${rawBarcode.length} caracteres, recortado a 150: "${barcode}"`)

      const matchedId = (barcode && existingByBarcode.get(barcode))
        || (sku && existingBySku.get(sku))
        || existingByName.get(name.slice(0, 200).toLowerCase())
      if (matchedId) {
        matched++
        if (sku) skuToProductId.set(sku, matchedId)
        continue
      }

      if (barcode) {
        if (usedBarcodes.has(barcode)) {
          warnings.push(`Producto "${name}" — código de barras "${barcode}" ya usado por otro producto, se deja sin código`)
          barcode = undefined
        } else {
          usedBarcodes.add(barcode)
        }
      }

      const categoryId = await resolveCategoryId(str(row['Categoría']))

      const data = {
        barcode,
        sku,
        name: name.slice(0, 200),
        basePrice: num(row['Precio de venta']),
        cost: num(row['Costo']),
        categoryId,
        baseUnitId: defaultUnit!.id,
        minStock: Math.round(num(row['Mínimo de productos'])),
        isActive: str(row['Inactivo']).toLowerCase() !== 'y',
      }

      if (args.dryRun) {
        created++
        if (sku) skuToProductId.set(sku, 'DRY-RUN-PRODUCT')
        continue
      }
      const product = await prisma.product.create({ data })
      if (sku) skuToProductId.set(sku, product.id)
      created++
    }
    console.log(`Productos: ${created} nuevos, ${matched} ya existían (mismo código de barras/SKU/nombre — vinculados a esta sucursal sin duplicar), ${skipped} omitidos (sin nombre o son servicio)`)
    console.log(`Categorías: ${categoryCache.size} en total (nuevas + existentes)`)

    // ── Inventory (stock quantities) ────────────────────────────────────
    if (args.inventory) {
      const invRows = readSheet(args.inventory)
      let matched = 0, notFound = 0
      for (const row of invRows) {
        const sku = str(row['Número de artículo']).slice(0, 150) // must match the truncation applied when products were created
        const productId = sku ? skuToProductId.get(sku) : undefined
        if (!productId) { notFound++; continue }
        const quantity = num(row['Cantidad'])
        if (!args.dryRun) {
          await prisma.inventory.upsert({
            where: { productId_branchId: { productId, branchId } },
            create: { productId, branchId, quantity },
            update: { quantity },
          })
        }
        matched++
      }
      console.log(`Inventario: ${matched} productos con stock cargado, ${notFound} filas sin producto correspondiente (revisa que --items se haya corrido en el mismo lote)`)
    }
  } else if (args.inventory) {
    console.error('❌ --inventory requiere --items en la misma corrida (necesita crear los productos primero)')
    process.exit(1)
  }

  if (employeeCredentials.length && !args.dryRun) {
    console.log(`\n🔑 Credenciales temporales — compártelas con cada empleado, deben cambiar su contraseña en su primer inicio de sesión:`)
    for (const c of employeeCredentials) console.log(`   ${c.email}  →  ${c.password}`)
  }

  if (warnings.length) {
    console.log(`\n⚠️  ${warnings.length} advertencias:`)
    for (const w of warnings.slice(0, 50)) console.log('  -', w)
    if (warnings.length > 50) console.log(`  ... y ${warnings.length - 50} más`)
  }

  console.log(args.dryRun ? '\n✅ Dry run completo — corre sin --dry-run para escribir de verdad.' : '\n✅ Importación completa.')
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
