/**
 * Provisioning seed — creates exactly what a fresh instance structurally
 * needs to have a first login and be usable, nothing demo: one branch (a
 * placeholder to attach the admin user to — User.branchId is required — meant
 * to be completed from Configuración → Tiendas right after logging in), one
 * real ADMIN user, the default inventory-adjustment-reason catalog (without
 * at least one per direction, manual stock adjustments are blocked
 * entirely — this is operational, not demo data), and an optional initial
 * LicenseConfig row so a client's modules can be set in the same step as
 * everything else instead of a separate PUT /api/license call right after.
 *
 * Every value is overridable via env vars so the same script covers local
 * dev (defaults below) and real client onboarding (override every SEED_*
 * var). The 4 system roles (ADMIN/AUDITOR/INVENTORY_CONTROL/OPERATOR) are
 * NOT created here — ensureSystemRoles() already creates them on every
 * backend boot, before this ever needs to run.
 *
 * Run from dengo-backend/: npm run prisma:seed
 */
import { PrismaClient } from '@prisma/client'
import { hashPassword } from './services/auth.service.js'

const prisma = new PrismaClient()

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@dengo.gt'
const ADMIN_NAME = process.env.SEED_ADMIN_NAME ?? 'Administrador'
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin1234!'

const BRANCH_NAME = process.env.SEED_BRANCH_NAME ?? 'Sucursal Principal'
const BRANCH_CODE = process.env.SEED_BRANCH_CODE ?? 'PRINCIPAL'

// Same three flags PUT /api/license controls later — set here once at
// provisioning time so onboarding a client doesn't need a separate curl call
// right after seeding. An unset env keeps the module ON (matches the
// backend's own DEFAULT_LICENSE fallback when no row exists yet at all).
const LICENSE = {
  posEnabled: process.env.SEED_LICENSE_POS !== 'false',
  maestrosEnabled: process.env.SEED_LICENSE_MAESTROS !== 'false',
  pageEnabled: process.env.SEED_LICENSE_PAGINA !== 'false',
}

async function main() {
  const branch = await prisma.branch.upsert({
    where: { code: BRANCH_CODE },
    create: { name: BRANCH_NAME, code: BRANCH_CODE, type: 'main', currency: 'GTQ' },
    update: {},
  })
  console.log(`✅ Sucursal: ${branch.name} (${branch.id}) — completa dirección, ciudad, logo e impresora desde Configuración → Tiendas`)

  const passwordHash = await hashPassword(ADMIN_PASSWORD)
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    create: { email: ADMIN_EMAIL, name: ADMIN_NAME, role: 'ADMIN', passwordHash, branchId: branch.id },
    update: {},
  })
  console.log(`✅ Usuario administrador: ${admin.email}`)

  const adjustmentReasons: { label: string; direction: 'UP' | 'DOWN'; sortOrder: number }[] = [
    { label: 'Ajuste inicial / conteo físico', direction: 'UP', sortOrder: 0 },
    { label: 'Devolución de cliente', direction: 'UP', sortOrder: 1 },
    { label: 'Transferencia recibida de otra sucursal', direction: 'UP', sortOrder: 2 },
    { label: 'Corrección de conteo (a favor)', direction: 'UP', sortOrder: 3 },
    { label: 'Otro (aumento)', direction: 'UP', sortOrder: 4 },
    { label: 'Rotura/Daño', direction: 'DOWN', sortOrder: 0 },
    { label: 'Vencimiento', direction: 'DOWN', sortOrder: 1 },
    { label: 'Pérdida/Robo', direction: 'DOWN', sortOrder: 2 },
    { label: 'Transferencia enviada a otra sucursal', direction: 'DOWN', sortOrder: 3 },
    { label: 'Corrección de conteo (en contra)', direction: 'DOWN', sortOrder: 4 },
    { label: 'Otro (disminución)', direction: 'DOWN', sortOrder: 5 },
  ]
  if (await prisma.inventoryAdjustmentReason.count() === 0) {
    for (const r of adjustmentReasons) await prisma.inventoryAdjustmentReason.create({ data: r })
    console.log(`✅ ${adjustmentReasons.length} motivos de ajuste de inventario (editables luego en Configuración → Motivos de Ajuste)`)
  }

  const existingLicense = await prisma.licenseConfig.findFirst()
  if (!existingLicense) {
    await prisma.licenseConfig.create({ data: LICENSE })
    console.log(`✅ Licencia inicial — POS: ${LICENSE.posEnabled}, Portal de maestros: ${LICENSE.maestrosEnabled}, Landing con marca: ${LICENSE.pageEnabled}`)
  }

  console.log(`\n🌱 Listo. Inicia sesión con ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`)
  if (ADMIN_PASSWORD === 'Admin1234!') {
    console.log('⚠️  Esa es la contraseña por defecto — cámbiala desde Usuarios apenas entres, sobre todo si esto es para un cliente real y no solo desarrollo local.')
  }
}

main()
  .catch(e => { console.error('❌ Seed falló:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
