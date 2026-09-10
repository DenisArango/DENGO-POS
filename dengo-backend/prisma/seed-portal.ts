/**
 * Portal seed script — clears existing portal orders and creates 5 test scenarios.
 * Run (from dengo-backend/):
 *   npx tsx prisma/seed-portal.ts
 *
 * Scenarios:
 *   1. Normal single-grade PENDING        — happy path
 *   2. Multi-grade APPROVED               — requires notes, 3 grades
 *   3. At limitPerStudent (SCHOOL_SUPPLIES) — exactly at Q50/alumno × 20 = Q1000
 *   4. GRATUITY APPROVED                  — blocks any second gratuidad this year for that school
 *   5. QUOTED with delivery info          — status after cotización
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🗑️  Clearing existing portal orders…')
  await prisma.portalMessage.deleteMany()
  await prisma.portalOrderGrade.deleteMany()
  await prisma.portalOrderItem.deleteMany()
  await prisma.portalOrder.deleteMany()
  console.log('   ✅ Done\n')

  // ── Fetch required context ────────────────────────────────────────────────────
  const teachers = await prisma.teacher.findMany({
    where: { isActive: true },
    include: {
      user: true,
      schools: { where: { isActive: true }, include: { school: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  if (teachers.length === 0) {
    throw new Error('❌ No hay maestros. Crea al menos uno en el portal primero.')
  }

  const valid = teachers.filter(t => t.schools.length > 0)
  if (valid.length === 0) {
    throw new Error('❌ Ningún maestro tiene escuela asignada. Asígnales escuela primero.')
  }

  const products = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
    take: 6,
  })
  if (products.length < 2) {
    throw new Error('❌ Se necesitan al menos 2 productos activos en la BD.')
  }

  // Ensure SCHOOL_SUPPLIES program exists with limitPerStudent = 50
  let supplies = await prisma.programConfig.findFirst({ where: { type: 'SCHOOL_SUPPLIES', isActive: true } })
  if (!supplies) {
    supplies = await prisma.programConfig.create({
      data: { type: 'SCHOOL_SUPPLIES', name: 'Útiles Escolares', limitPerStudent: 50, isActive: true },
    })
    console.log('   ✅ Programa SCHOOL_SUPPLIES creado con limitPerStudent=Q50\n')
  } else if (!supplies.limitPerStudent) {
    supplies = await prisma.programConfig.update({
      where: { id: supplies.id },
      data: { limitPerStudent: 50 },
    })
    console.log('   ✅ Programa SCHOOL_SUPPLIES actualizado: limitPerStudent=Q50\n')
  }

  const t1 = valid[0]
  const t2 = valid.length > 1 ? valid[1] : valid[0]
  const school1 = t1.schools[0].school
  // For school2, try a different school; fall back to school1
  const school2 = t2.schools.find(s => s.school.id !== school1.id)?.school ?? school1

  const [p1, p2, p3] = products
  const lps = Number(supplies.limitPerStudent) // 50

  let seq = 5001
  const nextNum = () => `PED-SEED-${String(seq++).padStart(3, '0')}`

  // ── Scenario 1: Normal PENDING ────────────────────────────────────────────────
  const total1 = Number(p1.basePrice) * 2 + Number(p2.basePrice) * 1
  const o1 = await prisma.portalOrder.create({
    data: {
      orderNumber: nextNum(),
      teacherId: t1.id,
      schoolId: school1.id,
      educationalLevel: 'PRIMARIA',
      programType: 'SCHOOL_SUPPLIES',
      status: 'PENDING',
      studentCount: 25,
      orderGradeSummary: '3ro Primaria: 25',
      totalAmount: total1,
      grades:  { create: [{ gradeName: '3ro Primaria', studentCount: 25 }] },
      items:   {
        create: [
          { productId: p1.id, productName: p1.name, quantity: 2, unitPrice: Number(p1.basePrice), total: Number(p1.basePrice) * 2 },
          { productId: p2.id, productName: p2.name, quantity: 1, unitPrice: Number(p2.basePrice), total: Number(p2.basePrice) },
        ],
      },
    },
  })
  console.log(`✅ Scenario 1 — Normal PENDING:        ${o1.orderNumber}`)
  console.log(`   Maestro: ${t1.user.name}  |  Escuela: ${school1.name}`)
  console.log(`   Grado: 3ro Primaria (25 alumnos)  |  Total: Q${total1.toFixed(2)}`)

  // ── Scenario 2: Multi-grade APPROVED ─────────────────────────────────────────
  const totalStudents2 = 22 + 25 + 25
  const total2 = Number(p1.basePrice) * totalStudents2
  const deliveryDate2 = new Date(Date.now() + 7 * 86_400_000)
  const o2 = await prisma.portalOrder.create({
    data: {
      orderNumber: nextNum(),
      teacherId: t1.id,
      schoolId: school1.id,
      educationalLevel: 'PRIMARIA',
      programType: 'TEACHING_KIT',
      status: 'APPROVED',
      notes: 'Orden cubre tres grados de primaria. El material de 1ro Primaria es distinto al de 2do y 3ro; favor respetar la distribución.',
      studentCount: totalStudents2,
      orderGradeSummary: '1ro Primaria: 22, 2do Primaria: 25, 3ro Primaria: 25',
      totalAmount: total2,
      approvedAt: new Date(),
      deliveryDate: deliveryDate2,
      deliveryTime: '08:00',
      deliveryNotes: 'Entregar en dirección de la escuela, preguntar por directora.',
      grades:  {
        create: [
          { gradeName: '1ro Primaria', studentCount: 22 },
          { gradeName: '2do Primaria', studentCount: 25 },
          { gradeName: '3ro Primaria', studentCount: 25 },
        ],
      },
      items:   {
        create: [
          { productId: p1.id, productName: p1.name, quantity: totalStudents2, unitPrice: Number(p1.basePrice), total: total2 },
        ],
      },
    },
  })
  console.log(`\n✅ Scenario 2 — Multi-grado APPROVED:  ${o2.orderNumber}`)
  console.log(`   3 grados, 72 alumnos  |  notas obligatorias ✓  |  entrega: ${deliveryDate2.toLocaleDateString('es-GT')}`)

  // ── Scenario 3: At limitPerStudent boundary ───────────────────────────────────
  const students3 = 20
  const max3 = lps * students3          // 1000
  // Pick quantity so total = exactly max3
  const unitP = Number(p1.basePrice) || 10
  const qty3 = Math.floor(max3 / unitP)
  const total3 = qty3 * unitP
  const o3 = await prisma.portalOrder.create({
    data: {
      orderNumber: nextNum(),
      teacherId: t2.id,
      schoolId: school2.id,
      educationalLevel: 'BASICO',
      programType: 'SCHOOL_SUPPLIES',
      status: 'PENDING',
      studentCount: students3,
      orderGradeSummary: '1ro Básico: 20',
      totalAmount: total3,
      grades:  { create: [{ gradeName: '1ro Básico', studentCount: students3 }] },
      items:   {
        create: [
          { productId: p1.id, productName: p1.name, quantity: qty3, unitPrice: unitP, total: total3 },
        ],
      },
    },
  })
  console.log(`\n✅ Scenario 3 — En límite de Q${lps}/alumno: ${o3.orderNumber}`)
  console.log(`   ${students3} alumnos × Q${lps} = Q${max3}  |  Total orden: Q${total3.toFixed(2)}`)

  // ── Scenario 4: GRATUITY APPROVED (blocks second gratuidad for same school/year) ──
  const pGrat = products.length > 2 ? p3 : p2
  const total4 = Number(pGrat.basePrice) * 18
  const o4 = await prisma.portalOrder.create({
    data: {
      orderNumber: nextNum(),
      teacherId: t1.id,
      schoolId: school1.id,
      educationalLevel: 'PREPRIMARIA',
      programType: 'GRATUITY',
      status: 'APPROVED',
      studentCount: 18,
      orderGradeSummary: 'Preparatoria: 18',
      totalAmount: total4,
      approvedAt: new Date(),
      grades:  { create: [{ gradeName: 'Preparatoria', studentCount: 18 }] },
      items:   {
        create: [
          { productId: pGrat.id, productName: pGrat.name, quantity: 18, unitPrice: Number(pGrat.basePrice), total: total4 },
        ],
      },
    },
  })
  console.log(`\n✅ Scenario 4 — Gratuidad APPROVED:    ${o4.orderNumber}`)
  console.log(`   Escuela: ${school1.name}  |  Un segundo pedido GRATUITY para esta escuela este año será RECHAZADO.`)

  // ── Scenario 5: QUOTED with delivery ─────────────────────────────────────────
  const total5 = Number(p2.basePrice) * 35
  const delivery5 = new Date(Date.now() + 14 * 86_400_000)
  const o5 = await prisma.portalOrder.create({
    data: {
      orderNumber: nextNum(),
      teacherId: t2.id,
      schoolId: school2.id,
      educationalLevel: 'PRIMARIA',
      programType: 'FOOD_PACKAGE',
      status: 'QUOTED',
      adminNotes: 'Se envía cotización COT-SEED-001 para su aprobación. Confirmar para proceder a facturación.',
      studentCount: 35,
      orderGradeSummary: '4to Primaria: 35',
      totalAmount: total5,
      approvedAt: new Date(Date.now() - 2 * 86_400_000),
      deliveryDate: delivery5,
      deliveryTime: '09:00',
      deliveryNotes: 'Coordinar con la directora del establecimiento.',
      grades:  { create: [{ gradeName: '4to Primaria', studentCount: 35 }] },
      items:   {
        create: [
          { productId: p2.id, productName: p2.name, quantity: 35, unitPrice: Number(p2.basePrice), total: total5 },
        ],
      },
    },
  })
  console.log(`\n✅ Scenario 5 — QUOTED con entrega:    ${o5.orderNumber}`)
  console.log(`   Nota admin visible al maestro  |  Entrega: ${delivery5.toLocaleDateString('es-GT')}`)

  console.log('\n─────────────────────────────────────────────────')
  console.log('🌱 Seed completado. 5 pedidos creados.')
  console.log('─────────────────────────────────────────────────')
  console.log('\n📋 Para probar cada escenario:')
  console.log('  1. PENDING normal: entra al portal como maestro → "Mis pedidos" → verás el estado "En revisión"')
  console.log('  2. Multi-grado: en el admin aparecen 3 filas de grados; si intentas crear uno sin notas → error 400')
  console.log('  3. Límite: intenta crear un pedido de SCHOOL_SUPPLIES que supere Q' + lps + '/alumno × alumnos')
  console.log('  4. Gratuidad: intenta crear otro pedido GRATUITY para "' + school1.name + '" → error 400')
  console.log('  5. QUOTED: visible en el portal como maestro con nota del admin y fecha de entrega')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
