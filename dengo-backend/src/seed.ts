/**
 * Base seed data for local development/testing — one branch, one user per
 * role, a small catalog, a customer and a supplier. Safe to re-run: skips
 * anything that already exists instead of erroring or duplicating.
 * Run from dengo-backend/: npm run prisma:seed
 */
import { PrismaClient } from '@prisma/client'
import { hashPassword } from './services/auth.service.js'

const prisma = new PrismaClient()

const DEMO_PASSWORD = 'Admin1234!'

async function main() {
  const branch = await prisma.branch.upsert({
    where: { code: 'CENTRAL' },
    create: { name: 'Tienda Central', code: 'CENTRAL', type: 'main', city: 'Ciudad de Guatemala', currency: 'GTQ' },
    update: {},
  })
  console.log(`✅ Sucursal: ${branch.name} (${branch.id})`)

  const passwordHash = await hashPassword(DEMO_PASSWORD)
  const users = [
    { email: 'admin@dengo.gt', name: 'Administrador Demo', role: 'ADMIN' },
    { email: 'auditor@dengo.gt', name: 'Auditor Demo', role: 'AUDITOR' },
    { email: 'inventario@dengo.gt', name: 'Control de Inventario Demo', role: 'INVENTORY_CONTROL' },
    { email: 'cajero@dengo.gt', name: 'Cajero Demo', role: 'OPERATOR' },
  ]
  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      create: { ...u, passwordHash, branchId: branch.id },
      update: {},
    })
  }
  console.log(`✅ ${users.length} usuarios (contraseña para todos: ${DEMO_PASSWORD})`)

  const unit = await prisma.productUnit.findFirst({ where: { name: 'Unidad' } })
    ?? await prisma.productUnit.create({ data: { name: 'Unidad', abbreviation: 'u', type: 'DISCRETE' } })

  const categories = await Promise.all(['Abarrotes', 'Bebidas', 'Limpieza'].map(name =>
    prisma.category.findFirst({ where: { name } }).then(existing => existing ?? prisma.category.create({ data: { name } }))
  ))

  const products = [
    { name: 'Arroz 1lb', barcode: '7501000000011', categoryId: categories[0]!.id, basePrice: 8.5, cost: 5.5, minStock: 20 },
    { name: 'Frijol 1lb', barcode: '7501000000028', categoryId: categories[0]!.id, basePrice: 9.0, cost: 6.0, minStock: 20 },
    { name: 'Gaseosa 600ml', barcode: '7501000000035', categoryId: categories[1]!.id, basePrice: 7.5, cost: 4.5, minStock: 30 },
    { name: 'Agua Pura 1L', barcode: '7501000000042', categoryId: categories[1]!.id, basePrice: 5.0, cost: 3.0, minStock: 30 },
    { name: 'Jabón de Lavar', barcode: '7501000000059', categoryId: categories[2]!.id, basePrice: 6.0, cost: 3.8, minStock: 15 },
  ]

  for (const p of products) {
    const product = await prisma.product.upsert({
      where: { barcode: p.barcode },
      create: { name: p.name, barcode: p.barcode, categoryId: p.categoryId, baseUnitId: unit.id, basePrice: p.basePrice, cost: p.cost, minStock: p.minStock },
      update: {},
    })
    await prisma.inventory.upsert({
      where: { productId_branchId: { productId: product.id, branchId: branch.id } },
      create: { productId: product.id, branchId: branch.id, quantity: 50 },
      update: {},
    })
  }
  console.log(`✅ ${products.length} productos con 50 unidades de stock inicial cada uno`)

  await prisma.customer.upsert({
    where: { nit: 'C/F' },
    create: { nit: 'C/F', name: 'Consumidor Final', creditLimit: 0 },
    update: {},
  })
  await prisma.customer.upsert({
    where: { nit: '1234567-8' },
    create: { nit: '1234567-8', name: 'Cliente Frecuente Demo', email: 'cliente@example.com', creditLimit: 500 },
    update: {},
  })
  console.log('✅ 2 clientes (Consumidor Final + uno con crédito)')

  await prisma.supplier.upsert({
    where: { code: 'PROV001' },
    create: { code: 'PROV001', name: 'Distribuidora Demo', contactName: 'Proveedor de Prueba' },
    update: {},
  })
  console.log('✅ 1 proveedor')

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
    console.log(`✅ ${adjustmentReasons.length} motivos de ajuste de inventario (editables luego en Configuración)`)
  }

  console.log('\n🌱 Listo. Inicia sesión con cualquiera de estos correos y la contraseña', DEMO_PASSWORD)
  users.forEach(u => console.log(`   - ${u.email} (${u.role})`))
}

main()
  .catch(e => { console.error('❌ Seed falló:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
