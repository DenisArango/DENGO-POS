/**
 * One-off setup for Variedades Dayana, run AFTER `import-loyverse.ts
 * --employees=employees_export.xlsx` has already created the 15 employees
 * (matched below by the personal email Loyverse exported) and all 5 branches
 * already exist in the DB. This script:
 *
 *   1. Replaces each employee's login email with the real one the business
 *      wants (firstname.lastname@variedadesdayana.com), not the personal
 *      email from the export.
 *   2. Sets a shared temporary password for everyone (owner's choice — share
 *      it out of band, employees should change it after first login).
 *   3. Sets Diego Arango, Luis Arango and Pamela Sierra as ADMIN; everyone
 *      else stays OPERATOR.
 *   4. Assigns each employee to every branch they actually work at (home
 *      branch = first one listed, the rest via UserBranch) instead of just
 *      their original import branch.
 *   5. Replaces each branch's cash register definitions with the real list
 *      the owner gave (deletes whatever's there first — safe: CashRegister
 *      sessions match register definitions by name/number only, there's no
 *      foreign key tying historical sessions to a definition row).
 *
 * Usage:
 *   npx tsx scripts/setup-variedadesdayana-employees.ts --dry-run
 *   npx tsx scripts/setup-variedadesdayana-employees.ts [--password=1234]
 */
import { prisma } from '../src/lib/prisma.js'
import { hashPassword } from '../src/services/auth.service.js'

const EMAIL_DOMAIN = 'variedadesdayana.com'

const BRANCH_NAMES = {
  central: 'VARIEDADES DAYANA CENTRAL',
  jassmin: 'LIBRERIA JASSMIN ZONA 2',
  dayana2: 'LIBRERIA VARIEDADES DAYANA 2',
  cubulco: 'VARIEDADES DAYANA CUBULCO',
  bodega: 'BODEGA CENTRAL',
} as const
type BranchKey = keyof typeof BRANCH_NAMES

// `personalEmail` is how the user is currently matched in the DB (whatever
// import-loyverse.ts --employees= created it under). `branches[0]` becomes
// the home branch; the rest become additional-branch access.
const EMPLOYEES: { personalEmail: string; name: string; isAdmin: boolean; branches: BranchKey[] }[] = [
  { personalEmail: 'variedadesdayana@hotmail.es', name: 'Pamela Sierra', isAdmin: true, branches: ['central', 'jassmin', 'dayana2', 'cubulco', 'bodega'] },
  { personalEmail: 'anahi@variedadesdayana.com', name: 'Anahi Sesam', isAdmin: false, branches: ['central', 'jassmin', 'dayana2', 'cubulco', 'bodega'] },
  { personalEmail: 'diegoarango22016@gmail.com', name: 'Diego Arango', isAdmin: true, branches: ['central', 'jassmin', 'dayana2', 'cubulco', 'bodega'] },
  { personalEmail: 'dayanaarango@variedadesdayana.com', name: 'Dayana Arango', isAdmin: false, branches: ['central', 'jassmin', 'dayana2', 'cubulco'] },
  { personalEmail: 'sarahi@variedadesdayana.com', name: 'Sarahi Juarez', isAdmin: false, branches: ['central', 'jassmin', 'dayana2', 'cubulco', 'bodega'] },
  { personalEmail: 'sergioreyes@variedadesdayana.com', name: 'Sergio Reyes', isAdmin: false, branches: ['central', 'jassmin', 'dayana2', 'cubulco', 'bodega'] },
  { personalEmail: 'wilmervaley@variedadesdayana.com', name: 'Wilmer Valey', isAdmin: false, branches: ['central', 'jassmin', 'dayana2'] },
  { personalEmail: 'sabina@variedadesdayana.com', name: 'Sabina Ruiz', isAdmin: false, branches: ['cubulco'] },
  { personalEmail: 'anahisic@variedadesdayana.com', name: 'Anahi Sic', isAdmin: false, branches: ['central', 'jassmin', 'dayana2', 'cubulco'] },
  { personalEmail: 'amparoquintana@variedadesdayama.com', name: 'Amparo Quintana', isAdmin: false, branches: ['cubulco'] },
  { personalEmail: 'celesteramos@variedadesdayana.com', name: 'Celeste Ramos', isAdmin: false, branches: ['central', 'jassmin', 'dayana2', 'cubulco'] },
  { personalEmail: 'davidhernandez@variedadesdayana.com', name: 'David Hernandes', isAdmin: false, branches: ['central', 'jassmin', 'dayana2', 'cubulco'] },
  { personalEmail: 'lauracojom@variedadesdayana.com', name: 'Laura Cojom', isAdmin: false, branches: ['central', 'jassmin', 'dayana2', 'cubulco'] },
  { personalEmail: 'angelinaxitumul@gmail.com', name: 'Angelina Xitumul', isAdmin: false, branches: ['central', 'jassmin', 'dayana2', 'cubulco', 'bodega'] },
  { personalEmail: 'admin@general.com', name: 'Luis Arango', isAdmin: true, branches: ['central', 'jassmin', 'dayana2', 'cubulco', 'bodega'] },
]

const REGISTERS: Record<BranchKey, string[]> = {
  central: [
    'Tienda Caja 1 VD', 'Libreria Caja 1 VD', 'Gerencia VD', 'Libreria Caja 2 VD',
    'Libreria Caja 3 VD', 'Libreria Caja 4 VD', 'Libreria Caja 5 VD',
    'LIBRERIA COBROS TEMPORADA CAJA 1', 'LIBRERIA COBROS TEMPORADA CAJA 2',
  ],
  jassmin: ['Libreria Jassmìn Caja 1', 'Libreria Jassmìn Caja 2', 'Libreria Jassmìn Caja 3', 'Libreria Jassmìn Caja 4'],
  dayana2: ['SUCURSAL LIBRERIA DAYANA CAJA 2', 'SUCURSAL LIBRERIA DAYANA CAJA 1', 'SUCURSAL LIBRERIA DAYANA CAJA 3'],
  cubulco: ['VARIEDADES DAYANA CUBULCO', 'Libreria Cubulco Caja 1', 'Libreria Cubulco Caja 2', 'Libreria Cubulco Caja 3', 'Gerencia Cubulco'],
  bodega: ['BODEGA CENTRAL CAJA 1', 'BODEGA CENTRAL CAJA 2', 'BODEGA CENTRAL CAJA 3'],
}

// First + last token only (lowercase, no accents) — drops stray tokens like
// the disambiguating "1" in the source "Diego Arango 1".
function slugifyEmail(name: string): string {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(t => /^[a-z]+$/.test(t))
    .slice(0, 2)
    .join('.')
}

const dryRun = process.argv.includes('--dry-run')
const passwordArg = process.argv.find(a => a.startsWith('--password='))
const password = passwordArg ? passwordArg.slice('--password='.length) : '1234'

async function main() {
  console.log(dryRun ? '🔍 DRY RUN — no se escribirá nada\n' : '⚠️  MODO REAL — se van a modificar usuarios y cajas\n')

  const branches = new Map<BranchKey, string>()
  for (const [key, name] of Object.entries(BRANCH_NAMES) as [BranchKey, string][]) {
    const b = await prisma.branch.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } })
    if (!b) {
      console.error(`❌ No existe la sucursal "${name}" — corre primero los imports de esa sucursal (--items/--inventory con --branch="${name}").`)
      process.exit(1)
    }
    branches.set(key, b.id)
  }

  // ── Employees: real login email, password, role, branch access ─────────
  const passwordHash = dryRun ? '' : await hashPassword(password)
  let updated = 0, notFound = 0
  for (const emp of EMPLOYEES) {
    const user = await prisma.user.findUnique({ where: { email: emp.personalEmail.toLowerCase() } })
    if (!user) {
      console.log(`⚠️  No se encontró ningún usuario con el correo "${emp.personalEmail}" (${emp.name}) — ¿ya corriste import-loyverse.ts --employees=...? Saltando.`)
      notFound++
      continue
    }

    const realEmail = `${slugifyEmail(emp.name)}@${EMAIL_DOMAIN}`
    const homeBranchId = branches.get(emp.branches[0]!)!
    const extraBranchIds = emp.branches.slice(1).map(k => branches.get(k)!)

    console.log(`${emp.name}: ${emp.personalEmail} → ${realEmail} | rol ${emp.isAdmin ? 'ADMIN' : 'OPERATOR'} | sucursales: ${emp.branches.map(k => BRANCH_NAMES[k]).join(', ')}`)

    if (!dryRun) {
      await prisma.user.update({
        where: { id: user.id },
        data: { email: realEmail, passwordHash, role: emp.isAdmin ? 'ADMIN' : 'OPERATOR', branchId: homeBranchId },
      })
      for (const branchId of extraBranchIds) {
        await prisma.userBranch.upsert({
          where: { userId_branchId: { userId: user.id, branchId } },
          create: { userId: user.id, branchId },
          update: {},
        })
      }
      // Drop any stale extra-branch row not in this list (safe on a re-run after edits).
      await prisma.userBranch.deleteMany({ where: { userId: user.id, branchId: { notIn: extraBranchIds } } })
    }
    updated++
  }
  console.log(`\nEmpleados: ${updated} actualizados, ${notFound} no encontrados (revisa si ya corriste el import)`)

  // ── Cash registers: wipe and recreate per branch from the real list ────
  for (const [key, names] of Object.entries(REGISTERS) as [BranchKey, string[]][]) {
    const branchId = branches.get(key)!
    if (!dryRun) {
      await prisma.cashRegisterDefinition.deleteMany({ where: { branchId } })
      for (let i = 0; i < names.length; i++) {
        await prisma.cashRegisterDefinition.create({
          data: { branchId, name: names[i]!.replace(/\s+/g, ' ').trim().slice(0, 60), registerNumber: String(i + 1) },
        })
      }
    }
    console.log(`Cajas de "${BRANCH_NAMES[key]}": ${names.length} registradas`)
  }

  console.log(dryRun ? '\n✅ Dry run completo — corre sin --dry-run para escribir de verdad.' : '\n✅ Listo.')
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
