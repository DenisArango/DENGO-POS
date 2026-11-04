/**
 * Demo data for sales presentations — a fictional bookstore/office-supply
 * chain ("Librería Aurora", 3 branches) with ~10 months of history: purchases,
 * sales, cash registers, credit to schools, transfers, quotations and goals.
 *
 * NEVER run against a client database. Meant for an empty DB that already
 * had `npx prisma db push` + `npm run prisma:seed`:
 *   DATABASE_URL=postgresql://.../dengo_demo npx tsx scripts/seed-demo-libreria.ts
 */
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/services/auth.service.js'

const prisma = new PrismaClient()

if (!/dengo_demo/.test(process.env.DATABASE_URL ?? '')) {
  console.error('❌ Solo corre contra una base cuyo nombre contenga "dengo_demo".')
  process.exit(1)
}

// ── Deterministic randomness ───────────────────────────────────────────────
let seed = 20260105
const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const int = (a: number, b: number) => Math.floor(rnd() * (b - a + 1)) + a
const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)]!
const chance = (p: number) => rnd() < p
const r2 = (n: number) => Math.round(n * 100) / 100
function weighted<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((s, w) => s + w, 0)
  let x = rnd() * total
  for (let i = 0; i < items.length; i++) { x -= weights[i]!; if (x <= 0) return items[i]! }
  return items[items.length - 1]!
}

// Guatemala local time (UTC-6) -> Date
const gt = (y: number, m: number, d: number, h = 0, min = 0) => new Date(Date.UTC(y, m - 1, d, h + 6, min))

// ── Catalog ────────────────────────────────────────────────────────────────
type V = { name: string; factor: number; price: number }
type P = { name: string; brand?: string; price: number; cost: number; cat: string; pop: number; min: number; vars?: V[] }

const C = {
  cuad: 'Cuadernos', escr: 'Escritura', arte: 'Arte y Manualidades', papel: 'Papelería', ofi: 'Oficina',
  esc: 'Útiles Escolares', mochi: 'Mochilas y Loncheras', tec: 'Tecnología y Tintas', lib: 'Libros y Diccionarios', serv: 'Servicios',
}
const CAT_COLORS: Record<string, string> = {
  [C.cuad]: '#2563EB', [C.escr]: '#0EA5E9', [C.arte]: '#EC4899', [C.papel]: '#F59E0B', [C.ofi]: '#64748B',
  [C.esc]: '#10B981', [C.mochi]: '#8B5CF6', [C.tec]: '#EF4444', [C.lib]: '#A16207', [C.serv]: '#14B8A6',
}

const catalog: P[] = []
const add = (p: P) => catalog.push(p)

// Cuadernos
for (const [brand, mult] of [['Scribe', 1], ['Norma', 1.25], ['Arimany', 0.9]] as const) {
  for (const [tipo, base] of [['Cuaderno espiral 100 hojas cuadriculado', 14], ['Cuaderno espiral 100 hojas rayado', 14], ['Cuaderno espiral 200 hojas 3 materias', 28], ['Cuaderno cosido 80 hojas rayado', 9], ['Cuaderno cosido 80 hojas cuadrícula', 9], ['Cuaderno de dibujo 40 hojas', 12], ['Cuaderno de caligrafía', 8]] as const) {
    const price = r2(base * mult)
    add({ name: `${tipo}`, brand, price, cost: r2(price * 0.62), cat: C.cuad, pop: tipo.includes('100') ? 9 : 5, min: 24,
      vars: [{ name: 'Unidad', factor: 1, price }, { name: 'Paquete x5', factor: 5, price: r2(price * 5 * 0.92) }] })
  }
}
add({ name: 'Cuaderno profesional pasta dura 200 hojas', brand: 'Norma', price: 45, cost: 28, cat: C.cuad, pop: 3, min: 10 })
add({ name: 'Libreta de taquigrafía', brand: 'Scribe', price: 7, cost: 4, cat: C.cuad, pop: 3, min: 20 })
add({ name: 'Block de notas tamaño carta 50 hojas', brand: 'Arimany', price: 12, cost: 7, cat: C.cuad, pop: 3, min: 15 })

// Escritura
const writing: [string, string, number, number, number][] = [
  ['Lápiz grafito No. 2', 'Mongol', 2.5, 9, 144], ['Lápiz grafito HB', 'Faber-Castell', 2.5, 8, 144], ['Lápiz bicolor rojo/azul', 'Faber-Castell', 3.5, 5, 72],
  ['Lapicero azul punto mediano', 'BIC', 2.5, 10, 144], ['Lapicero negro punto mediano', 'BIC', 2.5, 8, 144], ['Lapicero rojo punto mediano', 'BIC', 2.5, 6, 144],
  ['Lapicero gel negro G2', 'Pilot', 12, 4, 48], ['Lapicero gel azul G2', 'Pilot', 12, 4, 48], ['Lapicero borrable FriXion', 'Pilot', 22, 2, 24],
  ['Portaminas 0.5 mm', 'Pentel', 18, 2, 24], ['Minas 0.5 mm HB tubo', 'Pentel', 9, 2, 36], ['Marcador permanente negro', 'Sharpie', 10, 4, 48],
  ['Marcador para pizarra azul', 'Expo', 12, 3, 36], ['Marcador para pizarra negro', 'Expo', 12, 3, 36], ['Resaltador amarillo', 'Stabilo', 9, 5, 60],
  ['Resaltador set 4 colores', 'Stabilo', 32, 2, 18], ['Corrector líquido tipo lapicero', 'Paper Mate', 14, 3, 36], ['Corrector de cinta', 'Maped', 16, 3, 30],
]
for (const [name, brand, price, pop, min] of writing) {
  const isCheap = price < 5
  add({ name, brand, price, cost: r2(price * 0.55), cat: C.escr, pop, min,
    vars: isCheap ? [{ name: 'Unidad', factor: 1, price }, { name: 'Caja x12', factor: 12, price: r2(price * 12 * 0.85) }] : undefined })
}

// Arte y manualidades
const art: [string, string, number, number, number][] = [
  ['Crayones 12 colores', 'Crayola', 18, 6, 30], ['Crayones 24 colores', 'Crayola', 32, 4, 20], ['Lápices de color 12 largos', 'Faber-Castell', 25, 7, 30],
  ['Lápices de color 24 largos', 'Faber-Castell', 48, 4, 15], ['Marcadores lavables 10 colores', 'Crayola', 38, 3, 15], ['Témperas 6 colores', 'Pelikan', 22, 4, 20],
  ['Acuarelas 12 colores con pincel', 'Pelikan', 28, 3, 15], ['Pincel plano No. 8', 'Pelikan', 6, 3, 30], ['Plastilina 10 barras', 'Play-Doh', 15, 5, 25],
  ['Foamy tamaño carta surtido x10', 'Arimany', 18, 4, 20], ['Foamy escarchado carta', 'Arimany', 4, 3, 50], ['Silicón líquido 100 ml', 'Pritt', 14, 4, 24],
  ['Barras de silicón delgadas x10', 'Truper', 8, 4, 30], ['Pistola de silicón pequeña', 'Truper', 35, 2, 8], ['Brillantina tubo surtido', 'Arimany', 3, 3, 40],
  ['Tijera escolar punta roma', 'Maped', 12, 5, 30], ['Tijera de oficina 8"', 'Maped', 28, 2, 10], ['Lana para manualidades', 'Arimany', 7, 2, 20],
]
for (const [name, brand, price, pop, min] of art) add({ name, brand, price, cost: r2(price * 0.58), cat: C.arte, pop, min })

// Papelería
add({ name: 'Papel bond carta 75 g', brand: 'Chamex', price: 52, cost: 38, cat: C.papel, pop: 8, min: 20,
  vars: [{ name: 'Resma 500 hojas', factor: 1, price: 52 }, { name: 'Caja 10 resmas', factor: 10, price: 490 }] })
add({ name: 'Papel bond oficio 75 g', brand: 'Chamex', price: 60, cost: 44, cat: C.papel, pop: 4, min: 10,
  vars: [{ name: 'Resma 500 hojas', factor: 1, price: 60 }, { name: 'Caja 10 resmas', factor: 10, price: 570 }] })
add({ name: 'Paquete hojas bond carta x100', brand: 'Xerox', price: 12, cost: 8, cat: C.papel, pop: 6, min: 30 })
const papeleria: [string, number, number, number][] = [
  ['Cartulina blanca pliego', 3, 6, 100], ['Cartulina de color pliego', 3.5, 5, 100], ['Papel construcción carta x50', 18, 4, 20],
  ['Papel china surtido', 1, 4, 100], ['Papel lustre surtido', 1.5, 3, 100], ['Papel manila pliego', 2, 3, 80],
  ['Papel bond pliego', 2.5, 3, 80], ['Cartoncillo pliego', 6, 3, 40], ['Papel periódico pliego', 1, 2, 100],
  ['Hojas de colores carta x100', 30, 2, 12], ['Papel fotográfico carta x20', 45, 1, 8], ['Sobre manila carta', 1.5, 3, 100],
  ['Folder manila carta', 1.5, 6, 200], ['Folder plástico con fastener', 5, 4, 60], ['Fastener metálico caja x50', 22, 2, 15],
]
for (const [name, price, pop, min] of papeleria) add({ name, brand: 'Arimany', price, cost: r2(price * 0.5), cat: C.papel, pop, min })

// Oficina
const office: [string, string, number, number, number][] = [
  ['Engrapadora estándar', 'Pilot', 45, 2, 8], ['Grapas estándar caja x5000', 'Pilot', 12, 3, 20], ['Clips No. 1 caja x100', 'Arimany', 6, 3, 25],
  ['Sujetadores 32 mm caja x12', 'Arimany', 14, 2, 15], ['Cinta adhesiva transparente 18 mm', '3M', 6, 5, 50], ['Cinta de empaque transparente', '3M', 16, 3, 24],
  ['Cinta masking tape 1"', '3M', 10, 3, 24], ['Notas adhesivas 3x3 amarillo', 'Post-it', 15, 4, 30], ['Archivador ampo tamaño carta', 'Oxford', 32, 3, 15],
  ['Archivador ampo tamaño oficio', 'Oxford', 35, 2, 10], ['Separadores carta x5', 'Oxford', 8, 2, 20], ['Perforadora de 2 agujeros', 'Maped', 42, 1, 6],
  ['Sello de goma personalizado', 'Arimany', 85, 1, 0], ['Almohadilla para sello', 'Pelikan', 22, 1, 6], ['Calculadora de escritorio 12 dígitos', 'Casio', 95, 2, 6],
  ['Calculadora científica fx-82', 'Casio', 165, 3, 8], ['Calculadora científica fx-570', 'Casio', 245, 2, 5],
]
for (const [name, brand, price, pop, min] of office) add({ name, brand, price, cost: r2(price * 0.6), cat: C.ofi, pop, min })

// Útiles escolares
const school: [string, string, number, number, number][] = [
  ['Borrador blanco pequeño', 'Pelikan', 2, 7, 100], ['Borrador de miga', 'Faber-Castell', 3.5, 4, 60], ['Sacapuntas metálico', 'Maped', 3, 6, 80],
  ['Sacapuntas con depósito', 'Maped', 8, 4, 40], ['Regla plástica 30 cm', 'Maped', 5, 5, 50], ['Juego de geometría 4 piezas', 'Maped', 18, 4, 25],
  ['Compás escolar', 'Maped', 22, 2, 15], ['Transportador 180°', 'Maped', 4, 2, 30], ['Pegamento en barra 21 g', 'Pritt', 12, 6, 50],
  ['Pegamento blanco 120 ml', 'Resistol', 10, 4, 40], ['Estuche escolar de tela', 'Totto', 35, 3, 15], ['Forro plástico para cuaderno', 'Arimany', 2.5, 4, 100],
  ['Etiquetas escolares x30', 'Arimany', 6, 3, 40], ['Pizarra blanca 40x60 cm', 'Arimany', 75, 1, 4],
]
for (const [name, brand, price, pop, min] of school) add({ name, brand, price, cost: r2(price * 0.55), cat: C.esc, pop, min })

// Mochilas
const bags: [string, string, number, number][] = [
  ['Mochila escolar básica', 'Totto', 185, 2], ['Mochila con ruedas', 'Totto', 325, 1], ['Mochila juvenil 2 compartimientos', 'Jansport', 395, 1],
  ['Lonchera térmica', 'Totto', 95, 2], ['Pachón 500 ml', 'Totto', 55, 2],
]
for (const [name, brand, price, pop] of bags) add({ name, brand, price, cost: r2(price * 0.62), cat: C.mochi, pop, min: 4 })

// Tecnología y tintas
const tech: [string, string, number, number, number][] = [
  ['Memoria USB 32 GB', 'Kingston', 65, 2, 8], ['Memoria USB 64 GB', 'Kingston', 95, 1, 5], ['Cartucho de tinta 664 negro', 'HP', 115, 2, 6],
  ['Cartucho de tinta 664 color', 'HP', 125, 1, 5], ['Botella de tinta 544 negra', 'Epson', 85, 2, 6], ['Botella de tinta GI-190 negra', 'Canon', 80, 1, 5],
  ['Audífonos con cable', 'Xtech', 45, 2, 8], ['Mouse óptico USB', 'Xtech', 55, 1, 6], ['Pilas AA x4', 'Duracell', 38, 2, 12],
]
for (const [name, brand, price, pop, min] of tech) add({ name, brand, price, cost: r2(price * 0.7), cat: C.tec, pop, min })

// Libros
const books: [string, string, number, number][] = [
  ['Diccionario escolar español', 'Larousse', 65, 2], ['Diccionario inglés-español', 'Larousse', 85, 1], ['Libro de caligrafía Palmer 1', 'Santillana', 35, 2],
  ['Libro de caligrafía Palmer 2', 'Santillana', 35, 2], ['Libro para colorear', 'Arimany', 15, 2], ['Atlas escolar de Guatemala', 'Piedra Santa', 75, 1],
  ['Agenda 2026', 'Norma', 55, 1],
]
for (const [name, brand, price, pop] of books) add({ name, brand, price, cost: r2(price * 0.65), cat: C.lib, pop, min: 4 })

// Servicios (no inventory pressure: kept stocked high)
const services: [string, number, number][] = [
  ['Fotocopia carta blanco y negro', 0.5, 10], ['Fotocopia carta a color', 2, 4], ['Impresión carta blanco y negro', 1, 6],
  ['Impresión carta a color', 3, 4], ['Engargolado / anillado', 15, 2], ['Plastificado carta', 10, 2],
]
for (const [name, price, pop] of services) add({ name, price, cost: r2(price * 0.3), cat: C.serv, pop, min: 0 })

// ── Main ───────────────────────────────────────────────────────────────────
const START = { y: 2026, m: 1, d: 5 }
const NOW = new Date()

async function main() {
  const admin = await prisma.user.findFirstOrThrow({ where: { role: 'ADMIN' } })
  const central = await prisma.branch.findFirstOrThrow({ where: { code: 'CENTRAL' } })

  // Company + branches
  await prisma.companyProfile.create({ data: { name: 'Librería Aurora', legalName: 'Librería Aurora, S.A.', taxId: '8456123-7', industry: 'Librería y papelería', address: '6a. Avenida 10-25, Zona 1', city: 'Guatemala', country: 'Guatemala', phone: '2232-4455', email: 'info@libreriaaurora.gt' } })
  await prisma.branch.update({ where: { id: central.id }, data: { type: 'main', address: '6a. Avenida 10-25, Zona 1', city: 'Guatemala', phone: '2232-4455', manager: 'María José Pérez', receiptSeries: 'CEN', companyName: 'Librería Aurora', companyTaxId: '8456123-7', companyTagline: 'Todo para tu escuela y oficina' } })
  const mixco = await prisma.branch.create({ data: { name: 'Mixco', code: 'MIXCO', address: 'Calzada San Juan 15-40, Zona 3 de Mixco', city: 'Mixco', phone: '2431-8890', manager: 'Carlos Méndez', receiptSeries: 'MIX', companyName: 'Librería Aurora', companyTaxId: '8456123-7' } })
  const villa = await prisma.branch.create({ data: { name: 'Villa Nueva', code: 'VNUEVA', address: '4a. Calle 3-12, Zona 1 de Villa Nueva', city: 'Villa Nueva', phone: '6631-2045', manager: 'Lucía Hernández', receiptSeries: 'VNU', companyName: 'Librería Aurora', companyTaxId: '8456123-7' } })
  const branches = [
    { b: central, weight: 1.0, base: 42 },
    { b: mixco, weight: 0.75, base: 32 },
    { b: villa, weight: 0.6, base: 26 },
  ]
  console.log('✅ Empresa y 3 sucursales')

  // Users
  const pass = await hashPassword('Demo1234!')
  const mkUser = (name: string, email: string, role: string, branchId: string) =>
    prisma.user.create({ data: { name, email, role, branchId, passwordHash: pass } })
  await prisma.user.update({ where: { id: admin.id }, data: { name: 'María José Pérez' } })
  const cashiers: Record<string, { id: string }[]> = {
    [central.id]: [await mkUser('Ana Sofía López', 'ana@libreriaaurora.gt', 'OPERATOR', central.id), await mkUser('Diego Ramírez', 'diego@libreriaaurora.gt', 'OPERATOR', central.id)],
    [mixco.id]: [await mkUser('Carlos Méndez', 'carlos@libreriaaurora.gt', 'OPERATOR', mixco.id), await mkUser('Gabriela Castillo', 'gcastillo@libreriaaurora.gt', 'OPERATOR', mixco.id)],
    [villa.id]: [await mkUser('Lucía Hernández', 'lucia@libreriaaurora.gt', 'OPERATOR', villa.id), await mkUser('Kevin Morales', 'kevin@libreriaaurora.gt', 'OPERATOR', villa.id)],
  }
  const bodega = await mkUser('Roberto Juárez', 'bodega@libreriaaurora.gt', 'INVENTORY_CONTROL', central.id)
  await mkUser('Patricia Aldana', 'contabilidad@libreriaaurora.gt', 'AUDITOR', central.id)
  for (const { b } of branches) await prisma.cashRegisterDefinition.create({ data: { branchId: b.id, name: 'Caja principal', registerNumber: '1' } })
  console.log('✅ 9 usuarios (contraseña Demo1234!)')

  // Categories, unit, suppliers
  const unit = await prisma.productUnit.create({ data: { name: 'Unidad', abbreviation: 'u', type: 'DISCRETE' } })
  const catIds: Record<string, string> = {}
  for (const name of Object.values(C)) catIds[name] = (await prisma.category.create({ data: { name, color: CAT_COLORS[name] } })).id

  const supplierDefs: [string, string, string][] = [
    ['Distribuidora Escolar Centroamericana', 'Héctor Gómez', 'Crédito 30 días'], ['Papelera Internacional', 'Silvia Rodas', 'Crédito 30 días'],
    ['Comercial Faber de Guatemala', 'Julio Paz', 'Crédito 15 días'], ['Importadora La Económica', 'Marta Cifuentes', 'Contado'],
    ['Tecnología y Suministros GT', 'Óscar Lemus', 'Contado'], ['Editorial Distribuciones del Sur', 'Rosa Batres', 'Crédito 30 días'],
  ]
  const suppliers: { id: string; name: string }[] = []
  for (const [i, [name, contactName, paymentTerms]] of supplierDefs.entries()) {
    suppliers.push(await prisma.supplier.create({ data: { code: `PROV-${String(i + 1).padStart(3, '0')}`, name, contactName, paymentTerms, phone: `2${int(200, 499)}-${int(1000, 9999)}`, taxId: `${int(1000000, 9999999)}-${int(0, 9)}`, rating: int(3, 5) } }))
  }
  const supplierFor = (cat: string) => ({
    [C.cuad]: suppliers[0], [C.escr]: suppliers[2], [C.arte]: suppliers[2], [C.papel]: suppliers[1], [C.ofi]: suppliers[3],
    [C.esc]: suppliers[0], [C.mochi]: suppliers[3], [C.tec]: suppliers[4], [C.lib]: suppliers[5], [C.serv]: suppliers[1],
  }[cat]!)

  // Products
  type Prod = P & { id: string; varRows: { id: string; factor: number; price: number; name: string }[]; weight: number }
  const products: Prod[] = []
  let bc = 7401000100001
  for (const p of catalog) {
    const id = randomUUID()
    const varRows = (p.vars ?? []).map((v, i) => ({ id: randomUUID(), ...v, isDefault: i === 0 }))
    await prisma.product.create({
      data: {
        id, name: p.name, brand: p.brand, basePrice: p.price, cost: p.cost, categoryId: catIds[p.cat]!, baseUnitId: unit.id,
        minStock: p.min, maxStock: p.min ? p.min * 4 : null, barcode: String(bc++), sku: `LA-${String(products.length + 1).padStart(4, '0')}`,
        variations: varRows.length ? { create: varRows.map(v => ({ id: v.id, name: v.name, conversionFactor: v.factor, price: v.price, isDefault: v.isDefault, barcode: v.factor > 1 ? String(bc++) : null })) } : undefined,
      },
    })
    // Long-tail popularity so reports show clear best-sellers
    products.push({ ...p, id, varRows, weight: p.pop * (0.4 + rnd() * 1.2) })
  }
  console.log(`✅ ${products.length} productos en ${Object.keys(C).length} categorías`)

  // Customers
  const cf = await prisma.customer.create({ data: { nit: 'CF', name: 'Consumidor Final' } })
  for (const { b } of branches) await prisma.branch.update({ where: { id: b.id }, data: { defaultCustomerId: cf.id } })
  const firstNames = ['José', 'María', 'Luis', 'Ana', 'Carlos', 'Andrea', 'Juan', 'Sofía', 'Miguel', 'Daniela', 'Jorge', 'Fernanda', 'Pedro', 'Valeria', 'Mario', 'Alejandra', 'Ricardo', 'Paola', 'Héctor', 'Claudia']
  const lastNames = ['García', 'López', 'Pérez', 'González', 'Hernández', 'Rodríguez', 'Martínez', 'Morales', 'Castillo', 'Ramírez', 'Méndez', 'Cruz', 'Juárez', 'Estrada', 'Orellana', 'Barrios', 'Ruiz', 'Monterroso']
  const people: { id: string }[] = []
  for (let i = 0; i < 55; i++) {
    const name = `${pick(firstNames)} ${pick(lastNames)} ${pick(lastNames)}`
    people.push(await prisma.customer.create({ data: { nit: `${int(1000000, 99999999)}${int(0, 9)}`, name, phone: `${pick(['5', '4', '3'])}${int(100, 999)}-${int(1000, 9999)}` } }))
  }
  const institutions = [
    'Colegio San Francisco de Asís', 'Colegio Mixto El Roble', 'Escuela Oficial Rural Mixta No. 12', 'Liceo Cristiano Belén', 'Instituto Nacional de Educación Básica Mixco',
    'Colegio Bilingüe Nuevo Amanecer', 'Academia de Computación Futuro', 'Despacho Contable Orellana & Asociados', 'Clínica Médica Santa Lucía', 'Ferretería La Cumbre',
  ]
  const credit: { id: string; limit: number }[] = []
  for (const name of institutions) {
    const limit = pick([3000, 5000, 8000, 10000, 15000])
    credit.push({ ...(await prisma.customer.create({ data: { nit: `${int(1000000, 9999999)}-${int(0, 9)}`, name, phone: `2${int(200, 499)}-${int(1000, 9999)}`, email: `compras@${name.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '').slice(0, 14)}.edu.gt`, creditEnabled: true, creditLimit: limit } })), limit })
  }
  console.log(`✅ ${people.length + credit.length + 1} clientes (${credit.length} con crédito)`)

  // ── Simulation state ─────────────────────────────────────────────────────
  const stock = new Map<string, number>() // `${branchId}:${productId}`
  const key = (b: string, p: string) => `${b}:${p}`
  const lastSale = new Map<string, Date>(), lastRestock = new Map<string, Date>()
  const salesCount = new Map<string, number>()
  const creditUsed = new Map<string, number>()
  const openCredit: { saleId: string; customerId: string; remaining: number; branchId: string; date: Date }[] = []
  const receiptNo = new Map<string, number>(branches.map(({ b }) => [b.id, 1]))
  let purchaseNo = 1
  const salePaid = new Map<string, number>()

  const movements: any[] = [], sales: any[] = [], items: any[] = [], registers: any[] = [], cashMoves: any[] = [], payments: any[] = []
  const move = (branchId: string, productId: string, delta: number, type: string, at: Date, extra: Record<string, unknown> = {}) => {
    const k = key(branchId, productId)
    const before = stock.get(k) ?? 0
    const after = before + delta
    stock.set(k, after)
    movements.push({ id: randomUUID(), productId, branchId, type, quantity: Math.abs(delta), quantityBefore: before, quantityAfter: after, createdAt: at, performedById: admin.id, ...extra })
  }

  // Products deliberately left to run out near the end (for "stock crítico" and "otras sucursales")
  const starved = new Set(products.filter(p => p.cat !== C.serv && p.pop >= 4).slice(0, 999).filter(() => chance(0.08)).map(p => p.id))
  const starvedOnlyVilla = products.find(p => p.name.startsWith('Calculadora científica fx-82'))!.id

  const purchase = (branchId: string, at: Date, list: { p: Prod; qty: number }[], performedById: string) => {
    if (!list.length) return
    const bySupplier = new Map<string, { p: Prod; qty: number }[]>()
    for (const it of list) { const s = supplierFor(it.p.cat); bySupplier.set(s.id, [...(bySupplier.get(s.id) ?? []), it]) }
    for (const [supplierId, its] of bySupplier) {
      const sup = suppliers.find(s => s.id === supplierId)!
      const ref = `COMPRA-${purchaseNo++}`
      for (const { p, qty } of its) {
        move(branchId, p.id, qty, 'IN', at, { referenceId: ref, supplierId, unitCost: p.cost, performedById, reason: `Proveedor: ${sup.name} | Ingreso — ${p.name}` })
        lastRestock.set(key(branchId, p.id), at)
      }
    }
  }

  // Opening stock (3 days before start)
  for (const { b, weight } of branches) {
    purchase(b.id, gt(2026, 1, 2, 9), products.map(p => ({ p, qty: p.cat === C.serv ? 20000 : Math.max(6, Math.round((p.min || 10) * 7 * weight)) })), bodega.id)
  }

  // Seasonality: back-to-school peak in January, then steady with paydays
  const seasonal = (m: number, d: number) => (m === 1 ? (d < 20 ? 2.6 : 2.0) : m === 2 ? 1.5 : m === 3 ? 1.05 : m === 10 ? 1.15 : 1.0)
  const hourWeights = [0, 0, 0, 0, 0, 0, 0, 0, 0.6, 1, 1.3, 1.4, 1.2, 0.9, 1, 1.2, 1.3, 1.1, 0.8, 0.5]
  const hours = hourWeights.map((_, h) => h)

  const end = gt(NOW.getUTCFullYear(), NOW.getUTCMonth() + 1, NOW.getUTCDate())
  const lastDay = new Date(NOW.getTime() - 6 * 3600_000)
  const days: { y: number; m: number; d: number; dow: number }[] = []
  for (let t = Date.UTC(START.y, START.m - 1, START.d); t <= Date.UTC(lastDay.getUTCFullYear(), lastDay.getUTCMonth(), lastDay.getUTCDate()); t += 86400_000) {
    const dt = new Date(t)
    days.push({ y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), dow: dt.getUTCDay() })
  }
  void end
  const totalDays = days.length

  let transferCount = 0
  const transfers: any[] = [], transferItems: any[] = []

  for (const [di, day] of days.entries()) {
    const isToday = di === totalDays - 1
    const nearEnd = di > totalDays - 20
    const growth = 0.9 + 0.25 * (di / totalDays)
    const dowF = [0.45, 1, 1, 1, 1.05, 1.15, 1.3][day.dow]!
    const payday = day.d === 15 || day.d >= 28 || day.d <= 2 ? 1.2 : 1

    for (const { b, base } of branches) {
      // Weekly restock (Mondays), unless the product is being starved at the end
      // Back-to-school season restocks twice a week with deeper orders
      const restockDay = day.dow === 1 || (day.m <= 2 && day.dow === 4)
      const depth = day.m === 1 ? 7 : day.m === 2 ? 5 : 4
      if (restockDay && !isToday) {
        const list: { p: Prod; qty: number }[] = []
        for (const p of products) {
          if (p.cat === C.serv) continue
          if (nearEnd && (starved.has(p.id) || (p.id === starvedOnlyVilla && b.id !== central.id))) continue
          const cur = stock.get(key(b.id, p.id)) ?? 0
          if (cur <= p.min * (depth - 2.5)) list.push({ p, qty: Math.max(6, Math.round(p.min * depth - cur)) })
        }
        purchase(b.id, gt(day.y, day.m, day.d, 7, 30), list, bodega.id)
      }

      // Cash register for the day
      const openedAt = gt(day.y, day.m, day.d, 8, int(0, 10))
      const closedAt = gt(day.y, day.m, day.d, 19, int(5, 40))
      if (!isToday && closedAt > NOW) continue
      const regId = randomUUID()
      const cashier = pick(cashiers[b.id]!)
      let cash = 0, card = 0, transfer = 0, total = 0, count = 0

      const n = Math.round(base * seasonal(day.m, day.d) * dowF * payday * growth * (0.8 + rnd() * 0.4))
      const times: Date[] = []
      for (let i = 0; i < n; i++) {
        const h = weighted(hours, hourWeights)
        const at = gt(day.y, day.m, day.d, h, int(0, 59))
        if (at > openedAt && at < closedAt && at < NOW) times.push(at)
      }
      times.sort((a, z) => a.getTime() - z.getTime())

      for (const at of times) {
        const isInstitution = chance(0.015)
        const nItems = isInstitution ? int(4, 10) : weighted([1, 2, 3, 4, 5, 6], [34, 27, 17, 11, 7, 4])
        const chosen = new Set<Prod>()
        while (chosen.size < nItems) chosen.add(weighted(products, products.map(p => p.weight)))
        const saleId = randomUUID()
        let saleTotal = 0
        const lines: any[] = []
        for (const p of chosen) {
          const v = p.varRows.length ? weighted(p.varRows, p.varRows.map(x => (x.factor === 1 ? 14 : isInstitution ? 6 : 1))) : null
          const factor = v?.factor ?? 1
          const unitPrice = v?.price ?? p.price
          let qty = p.cat === C.serv ? weighted([1, 2, 5, 10, 20, 50], [20, 15, 20, 20, 15, 10]) : weighted([1, 2, 3, 4, 6, 12], [62, 22, 8, 4, 3, 1])
          if (isInstitution) qty *= int(2, 4)
          if (factor > 1) qty = Math.max(1, Math.round(qty / 4))
          const have = stock.get(key(b.id, p.id)) ?? 0
          if (have < qty * factor) { if (have >= factor) qty = Math.floor(have / factor); else continue }
          const lineTotal = r2(qty * unitPrice)
          saleTotal += lineTotal
          lines.push({ id: randomUUID(), saleId, productId: p.id, variationId: v?.id ?? null, quantity: qty, unitPrice, discount: 0, total: lineTotal, _factor: factor })
        }
        if (!lines.length) continue
        saleTotal = r2(saleTotal)
        const discount = saleTotal > 300 && chance(0.25) ? r2(saleTotal * 0.05) : 0
        const finalTotal = r2(saleTotal - discount)

        const custInst = isInstitution ? pick(credit) : null
        const isCredit = !!custInst && chance(0.6) && (creditUsed.get(custInst.id) ?? 0) + finalTotal <= custInst.limit
        const method = isCredit ? 'CREDIT' : weighted(['CASH', 'CARD', 'TRANSFER', 'MIXED'], [62, 24, 10, 4])
        const customerId = custInst?.id ?? (chance(0.18) ? pick(people).id : cf.id)
        const no = receiptNo.get(b.id)!; receiptNo.set(b.id, no + 1)
        const voided = !isToday && chance(0.006)
        let cashAmount: number | null = null, cardAmount: number | null = null, transferAmount: number | null = null
        if (method === 'MIXED') { cashAmount = r2(finalTotal * 0.5); cardAmount = r2(finalTotal - cashAmount) }
        sales.push({
          id: saleId, invoiceNumber: `${b.receiptSeries || ({ [mixco.id]: 'MIX', [villa.id]: 'VNU' } as Record<string, string>)[b.id] || 'CEN'}-${no}`,
          branchId: b.id, cashierId: cashier.id, customerId, cashRegisterId: regId, subtotal: saleTotal, tax: 0, discount, total: finalTotal,
          paymentMethod: method, saleType: isCredit ? 'CREDIT' : 'CASH', isPaid: !isCredit, dueDate: isCredit ? new Date(at.getTime() + 30 * 86400_000) : null,
          cashAmount, cardAmount, transferAmount, cardReference: method === 'CARD' ? String(int(100000, 999999)) : null,
          transferDocumentNumber: method === 'TRANSFER' ? String(int(10000000, 99999999)) : null,
          isVoided: voided, voidedById: voided ? admin.id : null, voidedAt: voided ? new Date(at.getTime() + 20 * 60_000) : null, voidReason: voided ? pick(['Cliente cambió de opinión', 'Error en cobro', 'Producto equivocado']) : null,
          createdAt: at,
        })
        for (const l of lines) {
          const { _factor, ...row } = l
          items.push(row)
          move(b.id, l.productId, -(l.quantity * _factor), 'SALE', at, { referenceId: saleId, performedById: cashier.id })
          if (voided) move(b.id, l.productId, l.quantity * _factor, 'RETURN', new Date(at.getTime() + 20 * 60_000), { referenceId: saleId, reason: 'Anulación de venta', performedById: admin.id })
          salesCount.set(l.productId, (salesCount.get(l.productId) ?? 0) + 1)
          lastSale.set(key(b.id, l.productId), at)
        }
        if (voided) continue
        total += finalTotal; count++
        if (method === 'CASH') cash += finalTotal
        else if (method === 'CARD') card += finalTotal
        else if (method === 'TRANSFER') transfer += finalTotal
        else if (method === 'MIXED') { cash += cashAmount!; card += cardAmount! }
        if (isCredit) {
          creditUsed.set(custInst!.id, (creditUsed.get(custInst!.id) ?? 0) + finalTotal)
          openCredit.push({ saleId, customerId: custInst!.id, remaining: finalTotal, branchId: b.id, date: at })
        }
      }

      // Abonos: institutions pay older credit sales at this branch
      let abonosCash = 0
      for (const c of openCredit) {
        if (c.branchId !== b.id || c.remaining <= 0) continue
        const ageDays = (openedAt.getTime() - c.date.getTime()) / 86400_000
        if (ageDays < 7 || !chance(ageDays > 25 ? 0.25 : 0.04)) continue
        if (isToday && chance(0.5)) continue
        const amount = chance(0.6) ? c.remaining : r2(c.remaining * pick([0.3, 0.5]))
        const pm = weighted(['CASH', 'TRANSFER', 'CARD'], [40, 50, 10])
        const at = new Date(openedAt.getTime() + int(60, 600) * 60_000)
        if (at > NOW) continue
        payments.push({ id: randomUUID(), saleId: c.saleId, customerId: c.customerId, amount, paymentMethod: pm, paidById: cashier.id, cashRegisterId: regId, createdAt: at, transferDocumentNumber: pm === 'TRANSFER' ? String(int(10000000, 99999999)) : null })
        c.remaining = r2(c.remaining - amount)
        salePaid.set(c.saleId, r2((salePaid.get(c.saleId) ?? 0) + amount))
        creditUsed.set(c.customerId, r2((creditUsed.get(c.customerId) ?? 0) - amount))
        if (pm === 'CASH') abonosCash += amount
      }

      // Small expenses
      let movBalance = 0
      if (chance(0.25)) {
        const amt = pick([25, 35, 50, 80, 120])
        cashMoves.push({ id: randomUUID(), cashRegisterId: regId, type: 'EXPENSE', amount: amt, description: pick(['Garrafón de agua pura', 'Bolsas plásticas', 'Pago de mensajería', 'Artículos de limpieza', 'Refacción del personal']), performedById: cashier.id, createdAt: new Date(openedAt.getTime() + int(60, 500) * 60_000) })
        movBalance -= amt
      }
      const expected = r2(cash + abonosCash + movBalance)
      const diff = chance(0.85) ? 0 : pick([-20, -10, -5, 5, 10])
      registers.push({
        id: regId, branchId: b.id, name: 'Caja principal', registerNumber: '1', openedById: cashier.id, openedAt, initialAmount: 500,
        status: isToday ? 'OPEN' : 'CLOSED', closedAt: isToday ? null : closedAt, closedById: isToday ? null : cashier.id,
        expectedAmount: isToday ? null : expected, finalAmount: isToday ? null : r2(expected + diff), difference: isToday ? null : diff,
        totalSales: r2(total), salesCount: count, cashSales: r2(cash), cardSales: r2(card), transferSales: r2(transfer),
      })
    }

    // Transfers: Central supplies the branches a couple of times a week
    if ((day.dow === 2 || day.dow === 4) && !isToday) {
      for (const dest of [mixco, villa]) {
        if (!chance(0.7)) continue
        const tId = randomUUID()
        const sentAt = gt(day.y, day.m, day.d, 9, int(0, 50))
        const recvAt = gt(day.y, day.m, day.d, 15, int(0, 50))
        const list = products.filter(p => p.cat !== C.serv && (stock.get(key(central.id, p.id)) ?? 0) > p.min * 2 && (stock.get(key(dest.id, p.id)) ?? 0) < p.min).slice(0, int(3, 8))
        if (!list.length) continue
        const recent = di > totalDays - 6
        const status = recent ? pick(['PENDING', 'IN_TRANSIT', 'RECEIVED']) : chance(0.04) ? 'CANCELLED' : 'RECEIVED'
        transfers.push({ id: tId, fromBranchId: central.id, toBranchId: dest.id, status, requestedById: bodega.id, createdAt: sentAt,
          approvedById: status === 'IN_TRANSIT' || status === 'RECEIVED' ? admin.id : null, approvedAt: status === 'IN_TRANSIT' || status === 'RECEIVED' ? sentAt : null,
          receivedById: status === 'RECEIVED' ? cashiers[dest.id]![0]!.id : null, receivedAt: status === 'RECEIVED' ? recvAt : null,
          cancelledById: status === 'CANCELLED' ? admin.id : null, cancelledAt: status === 'CANCELLED' ? recvAt : null, cancelReason: status === 'CANCELLED' ? 'Se surtió con compra directa' : null,
          notes: 'Reabastecimiento de sucursal' })
        transferCount++
        for (const p of list) {
          const qty = Math.round(p.min * 1.5)
          transferItems.push({ id: randomUUID(), transferId: tId, productId: p.id, quantity: qty, conversionFactor: 1, unitCost: p.cost, unitPrice: p.price })
          if (status === 'IN_TRANSIT' || status === 'RECEIVED') move(central.id, p.id, -qty, 'TRANSFER', sentAt, { referenceId: tId, reason: 'Transferencia aprobada (salida de origen)', performedById: admin.id })
          if (status === 'RECEIVED') move(dest.id, p.id, qty, 'TRANSFER', recvAt, { referenceId: tId, reason: 'Recepción de transferencia', performedById: cashiers[dest.id]![0]!.id })
        }
      }
    }
  }

  // Make sure the "otras sucursales" demo works: the calculator is out at Mixco/Villa Nueva but stocked at Central
  for (const { b } of branches) {
    if (b.id === central.id) continue
    const have = stock.get(key(b.id, starvedOnlyVilla)) ?? 0
    if (have > 0) move(b.id, starvedOnlyVilla, -have, 'ADJUSTMENT', new Date(NOW.getTime() - 2 * 86400_000), { reason: 'Corrección de conteo (en contra)' })
  }

  // ── Write ────────────────────────────────────────────────────────────────
  const chunked = async (label: string, rows: any[], fn: (data: any[]) => Promise<unknown>) => {
    for (let i = 0; i < rows.length; i += 2000) await fn(rows.slice(i, i + 2000))
    console.log(`✅ ${rows.length.toLocaleString('es-GT')} ${label}`)
  }
  for (const s of sales) {
    if (s.saleType !== 'CREDIT') continue
    s.paidAmount = salePaid.get(s.id) ?? 0
    s.isPaid = s.paidAmount >= s.total - 0.01
  }
  await chunked('cajas (aperturas/cierres)', registers, d => prisma.cashRegister.createMany({ data: d }))
  await chunked('ventas', sales, d => prisma.sale.createMany({ data: d }))
  await chunked('líneas de venta', items, d => prisma.saleItem.createMany({ data: d }))
  await chunked('abonos a crédito', payments, d => prisma.creditPayment.createMany({ data: d }))
  await chunked('gastos de caja', cashMoves, d => prisma.cashMovement.createMany({ data: d }))
  await chunked('transferencias', transfers, d => prisma.transfer.createMany({ data: d }))
  await prisma.transferItem.createMany({ data: transferItems })
  await chunked('movimientos de inventario', movements, d => prisma.stockMovement.createMany({ data: d }))

  const invRows: any[] = []
  for (const { b } of branches) for (const p of products) {
    const k = key(b.id, p.id)
    invRows.push({ productId: p.id, branchId: b.id, quantity: Math.max(0, stock.get(k) ?? 0), lastSaleAt: lastSale.get(k) ?? null, lastRestockAt: lastRestock.get(k) ?? null })
  }
  await chunked('existencias (producto × sucursal)', invRows, d => prisma.inventory.createMany({ data: d }))
  for (const [id, n] of salesCount) await prisma.product.update({ where: { id }, data: { salesCount: n } })
  for (const [id, used] of creditUsed) await prisma.customer.update({ where: { id }, data: { creditUsed: Math.max(0, r2(used)) } })
  for (const [id, n] of receiptNo) await prisma.branch.update({ where: { id }, data: { receiptNextNumber: n } })
  await prisma.purchaseCounter.create({ data: { nextNumber: purchaseNo } })

  // Quotations: school supply lists
  const qProducts = products.filter(p => p.cat !== C.serv && p.cat !== C.tec)
  for (let i = 0; i < 28; i++) {
    const daysAgo = int(0, 120)
    const createdAt = new Date(NOW.getTime() - daysAgo * 86400_000 - int(1, 8) * 3600_000)
    const lines = Array.from(new Set(Array.from({ length: int(6, 18) }, () => pick(qProducts)))).map(p => {
      const quantity = int(10, 120)
      return { productId: p.id, quantity, unitPrice: p.price, discount: 0, total: r2(quantity * p.price) }
    })
    const subtotal = r2(lines.reduce((s, l) => s + l.total, 0))
    const discount = r2(subtotal * 0.07)
    await prisma.quotation.create({ data: {
      quotationNumber: `COT-${String(1001 + i)}`, branchId: pick(branches).b.id, customerId: pick(credit).id, subtotal, discount, tax: 0, total: r2(subtotal - discount),
      status: daysAgo < 10 ? pick(['DRAFT', 'SENT']) : weighted(['ACCEPTED', 'REJECTED', 'EXPIRED', 'SENT'], [5, 2, 3, 1]),
      validUntil: new Date(createdAt.getTime() + 15 * 86400_000), notes: 'Lista de útiles ciclo escolar 2027 — precio especial por volumen', createdById: admin.id, createdAt,
      items: { create: lines },
    } })
  }
  console.log('✅ 28 cotizaciones a colegios')

  // Monthly goals per branch
  // Goals around what each branch really sold, so some months are met and some aren't
  const monthly = new Map<string, number>()
  for (const s of sales) {
    if (s.isVoided) continue
    const k = `${s.branchId}:${new Date(s.createdAt.getTime() - 6 * 3600_000).getUTCMonth() + 1}`
    monthly.set(k, (monthly.get(k) ?? 0) + s.total)
  }
  const curMonth = new Date(NOW.getTime() - 6 * 3600_000).getUTCMonth() + 1
  const dayOfMonth = new Date(NOW.getTime() - 6 * 3600_000).getUTCDate()
  for (const { b } of branches) {
    for (let m = 1; m <= curMonth; m++) {
      let actual = monthly.get(`${b.id}:${m}`) ?? 0
      if (m === curMonth) actual = actual / dayOfMonth * 31
      const targetAmount = Math.round(actual * (0.9 + rnd() * 0.22) / 1000) * 1000
      await prisma.salesGoal.create({ data: { branchId: b.id, year: 2026, month: m, targetAmount, createdById: admin.id } })
    }
  }
  console.log('✅ Metas de venta mensuales')

  const totalSales = sales.filter(s => !s.isVoided).reduce((s, x) => s + x.total, 0)
  console.log(`\n🎉 Listo: ${sales.length.toLocaleString('es-GT')} ventas por Q${Math.round(totalSales).toLocaleString('es-GT')} desde el 5 de enero.`)
  console.log('   Producto para demo de "otras sucursales": Calculadora científica fx-82 (hay en Central, agotada en Mixco y Villa Nueva).')
}

main()
  .catch(e => { console.error('❌', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
