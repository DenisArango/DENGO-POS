import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { buildTemplate, validateTemplate, parseNumber } from '../../../dengo-backend/scripts/plantilla-spec.js'

function book(sheets: Record<string, (string | number)[][]>) {
  const wb = XLSX.utils.book_new()
  for (const [n, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), n)
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

test('la plantilla descargada se valida limpia (solo con su fila de ejemplo)', () => {
  const v = validateTemplate(buildTemplate())
  assert.deepEqual(v.errors, [])
  assert.equal(v.counts.productos, 1)
  assert.deepEqual(v.data.inventoryBranches, ['CEN', 'Z10'])
})

test('errores por fila con el número que muestra Excel', () => {
  const v = validateTemplate(book({
    Sucursales: [['Código *', 'Nombre *'], ['CEN', 'Central'], ['cen', 'Otra']],
    Productos: [['SKU *', 'Nombre *', 'Categoría *', 'Precio *', 'Activo'],
      ['A1', 'Lápiz', 'Útiles', 'Q 1,250.50', 'sí'],
      ['A1', 'Borrador', 'Útiles', 'diez', 'quizás'],
      ['', 'Sin SKU', 'Útiles', 5, '']],
    Inventario: [['SKU', 'CEN', 'NOEXISTE'], ['A1', 10, 2], ['ZZ', 'x', 1]],
    Empleados: [['Nombre', 'Correo', 'Sucursal', 'Rol'], ['Ana', 'ana@x.com', 'Central', 'Cajero'], ['Luis', 'luis', 'Norte', 'Jefe']],
  }))
  const has = (sheet: string, row: number | null, re: RegExp) => v.errors.some(e => e.sheet === sheet && e.row === row && re.test(e.message))
  assert.ok(has('Sucursales', 3, /repetido.*fila 2/))
  assert.ok(has('Productos', 3, /repetido/))
  assert.ok(has('Productos', 3, /no es un número/))
  assert.ok(has('Productos', 3, /sí o no/))
  assert.ok(has('Productos', 4, /SKU.*obligatorio/))
  assert.ok(has('Inventario', null, /NOEXISTE/))
  assert.ok(has('Inventario', 3, /no es una cantidad/))
  assert.ok(has('Empleados', 3, /correo/))
  assert.ok(has('Empleados', 3, /Norte/))
  assert.ok(has('Empleados', 3, /Rol/))
  assert.ok(!v.errors.some(e => e.sheet === 'Productos' && e.row === 2), 'la fila 2 está bien')
  assert.ok(v.warnings.some(w => w.sheet === 'Inventario' && /ZZ/.test(w.message)))
})

test('sucursales existentes del cliente valen en Inventario y Empleados', () => {
  const v = validateTemplate(book({
    Inventario: [['SKU', 'PRINCIPAL'], ['A1', 3]],
    Empleados: [['Nombre', 'Correo', 'Sucursal'], ['Ana', 'ana@x.com', 'Sucursal Principal']],
  }), { branchCodes: ['PRINCIPAL'], branchNames: ['Sucursal Principal'] })
  assert.deepEqual(v.errors, [])
})

test('otro formato (sin hojas de la plantilla) se rechaza', () => {
  const v = validateTemplate(book({ Hoja1: [['Artículo', 'Precio'], ['x', 1]] }))
  assert.ok(v.errors.some(e => /ninguna hoja/.test(e.message)))
})

test('números como los escribe la gente', () => {
  assert.equal(parseNumber('Q 1,250.50'), 1250.5)
  assert.equal(parseNumber('18,5'), 18.5)
  assert.equal(parseNumber('abc'), null)
  assert.equal(parseNumber(''), null)
})
