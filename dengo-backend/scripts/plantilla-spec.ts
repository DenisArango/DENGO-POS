/**
 * Plantilla DENGO para migrar datos de un cliente nuevo: qué hojas y columnas lleva,
 * cómo se leen y qué se valida. La usan import-plantilla.ts (al importar) y dengo-admin
 * (descarga de la plantilla y vista previa con errores por fila), para que las dos
 * partes nunca discrepen. Sin Prisma aquí: solo xlsx y reglas puras.
 */
import * as XLSX from 'xlsx'

export type ColType = 'text' | 'number' | 'int' | 'bool' | 'email' | 'role'
export interface Col { key: string; header: string; required?: boolean; type: ColType; example: string | number; help: string }
export interface SheetSpec { key: SheetKey; name: string; help: string; cols: Col[] }
export type SheetKey = 'sucursales' | 'categorias' | 'productos' | 'inventario' | 'clientes' | 'proveedores' | 'empleados'

export const ROLES: Record<string, string> = {
  administrador: 'ADMIN', admin: 'ADMIN', auditor: 'AUDITOR', 'control de inventario': 'INVENTORY_CONTROL', inventario: 'INVENTORY_CONTROL',
  cajero: 'OPERATOR', operador: 'OPERATOR', vendedor: 'OPERATOR', operator: 'OPERATOR', inventory_control: 'INVENTORY_CONTROL',
}

export const SHEETS: SheetSpec[] = [
  { key: 'sucursales', name: 'Sucursales', help: 'Una fila por tienda. El código es corto y único (ej. CEN, Z10).', cols: [
    { key: 'code', header: 'Código', required: true, type: 'text', example: 'CEN', help: 'Hasta 20 letras/números, sin espacios' },
    { key: 'name', header: 'Nombre', required: true, type: 'text', example: 'Tienda Central', help: '' },
    { key: 'address', header: 'Dirección', type: 'text', example: '4a calle 3-21 zona 1', help: '' },
    { key: 'city', header: 'Ciudad', type: 'text', example: 'Cobán', help: '' },
    { key: 'phone', header: 'Teléfono', type: 'text', example: '7951 0000', help: '' },
  ] },
  { key: 'categorias', name: 'Categorias', help: 'Opcional: las categorías que se usen en Productos y no estén aquí se crean solas.', cols: [
    { key: 'name', header: 'Nombre', required: true, type: 'text', example: 'Cuadernos', help: '' },
    { key: 'color', header: 'Color', type: 'text', example: '#2563eb', help: 'Hexadecimal, opcional' },
  ] },
  { key: 'productos', name: 'Productos', help: 'Una fila por producto. El SKU es el código interno y es único.', cols: [
    { key: 'sku', header: 'SKU', required: true, type: 'text', example: 'CUA-100', help: 'Código interno único' },
    { key: 'barcode', header: 'Código de barras', type: 'text', example: '7401234567890', help: 'Único si se pone' },
    { key: 'name', header: 'Nombre', required: true, type: 'text', example: 'Cuaderno espiral 100 hojas', help: '' },
    { key: 'category', header: 'Categoría', required: true, type: 'text', example: 'Cuadernos', help: '' },
    { key: 'brand', header: 'Marca', type: 'text', example: 'Scribe', help: '' },
    { key: 'price', header: 'Precio', required: true, type: 'number', example: 18.5, help: 'Precio de venta en quetzales' },
    { key: 'cost', header: 'Costo', type: 'number', example: 11.25, help: 'Costo unitario' },
    { key: 'minStock', header: 'Stock mínimo', type: 'int', example: 10, help: '' },
    { key: 'maxStock', header: 'Stock máximo', type: 'int', example: 120, help: '' },
    { key: 'unit', header: 'Unidad', type: 'text', example: 'Unidad', help: 'Unidad, Caja, Docena… (por defecto Unidad)' },
    { key: 'active', header: 'Activo', type: 'bool', example: 'sí', help: 'sí / no (por defecto sí)' },
  ] },
  { key: 'inventario', name: 'Inventario', help: 'SKU y una columna por CÓDIGO de sucursal con la cantidad en existencia.', cols: [
    { key: 'sku', header: 'SKU', required: true, type: 'text', example: 'CUA-100', help: '' },
  ] },
  { key: 'clientes', name: 'Clientes', help: 'Saldo pendiente = lo que el cliente debe hoy (se carga como deuda migrada).', cols: [
    { key: 'name', header: 'Nombre', required: true, type: 'text', example: 'Colegio San José', help: '' },
    { key: 'nit', header: 'NIT', type: 'text', example: '1234567-8', help: 'Único si se pone' },
    { key: 'phone', header: 'Teléfono', type: 'text', example: '5555 1234', help: '' },
    { key: 'email', header: 'Correo', type: 'email', example: 'compras@colegio.edu.gt', help: '' },
    { key: 'address', header: 'Dirección', type: 'text', example: 'Zona 2, Cobán', help: '' },
    { key: 'credit', header: 'Crédito', type: 'bool', example: 'sí', help: 'sí / no' },
    { key: 'creditLimit', header: 'Límite de crédito', type: 'number', example: 5000, help: 'Vacío = sin límite' },
    { key: 'balance', header: 'Saldo pendiente', type: 'number', example: 1250, help: '' },
    { key: 'comments', header: 'Comentarios', type: 'text', example: 'Paga a fin de mes', help: 'Se le muestra al cajero' },
  ] },
  { key: 'proveedores', name: 'Proveedores', help: 'Una fila por proveedor.', cols: [
    { key: 'code', header: 'Código', required: true, type: 'text', example: 'PROV-01', help: 'Único' },
    { key: 'name', header: 'Nombre', required: true, type: 'text', example: 'Distribuidora La Fe', help: '' },
    { key: 'contact', header: 'Contacto', type: 'text', example: 'Luis Gómez', help: '' },
    { key: 'phone', header: 'Teléfono', type: 'text', example: '2222 3333', help: '' },
    { key: 'email', header: 'Correo', type: 'email', example: 'ventas@lafe.gt', help: '' },
    { key: 'nit', header: 'NIT', type: 'text', example: '765432-1', help: '' },
    { key: 'address', header: 'Dirección', type: 'text', example: 'Calzada Roosevelt 12-34', help: '' },
    { key: 'city', header: 'Ciudad', type: 'text', example: 'Guatemala', help: '' },
    { key: 'terms', header: 'Condición de pago', type: 'text', example: 'Crédito 30 días', help: 'Por defecto Contado' },
  ] },
  { key: 'empleados', name: 'Empleados', help: 'Cada uno recibe una contraseña temporal. Rol: Administrador, Auditor, Control de inventario o Cajero.', cols: [
    { key: 'name', header: 'Nombre', required: true, type: 'text', example: 'María López', help: '' },
    { key: 'email', header: 'Correo', required: true, type: 'email', example: 'maria@cliente.com', help: 'Con este entra al sistema' },
    { key: 'branch', header: 'Sucursal', required: true, type: 'text', example: 'CEN', help: 'Código o nombre de la sucursal' },
    { key: 'role', header: 'Rol', type: 'role', example: 'Cajero', help: 'Por defecto Cajero' },
  ] },
]

export type Row = Record<string, string> & { __row: string }
export type Workbook = Record<SheetKey, Row[]> & { inventoryBranches: string[] }

export interface Issue { sheet: string; row: number | null; column: string | null; message: string }
export interface Validation {
  errors: Issue[]
  warnings: Issue[]
  counts: Record<SheetKey, number>
  sheetsFound: string[]
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\*/g, '').trim().toLowerCase()

/** Builds the template: Instrucciones + one sheet per type, required headers marked with *. */
export function buildTemplate(): Buffer {
  const wb = XLSX.utils.book_new()
  const intro = [
    ['Plantilla DENGO POS — migración de datos'],
    [''],
    ['Cómo llenarla'],
    ['1. No cambies los nombres de las hojas ni de las columnas. Las columnas con * son obligatorias.'],
    ['2. Borra las filas de ejemplo de cada hoja antes de enviarla.'],
    ['3. Deja vacías (pero no borres) las hojas que no tengas.'],
    ['4. Números sin símbolo de moneda ni separador de miles: 1250.50, no Q1,250.50.'],
    ['5. Fotos: en un .zip aparte, cada archivo con el SKU o el código de barras del producto (CUA-100.jpg).'],
    [''],
    ['Hojas'],
    ...SHEETS.map(s => [`${s.name}: ${s.help}`]),
  ]
  const wsIntro = XLSX.utils.aoa_to_sheet(intro)
  wsIntro['!cols'] = [{ wch: 110 }]
  XLSX.utils.book_append_sheet(wb, wsIntro, 'Instrucciones')
  for (const s of SHEETS) {
    let headers = s.cols.map(c => (c.required ? `${c.header} *` : c.header))
    let example: (string | number)[] = s.cols.map(c => c.example)
    if (s.key === 'inventario') { headers = [...headers, 'CEN', 'Z10']; example = [...example, 35, 12] }
    const rows = [headers, example]
    if (s.key === 'sucursales') rows.push(['Z10', 'Zona 10', '', 'Guatemala', ''])
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = headers.map(h => ({ wch: Math.max(12, h.length + 4) }))
    XLSX.utils.book_append_sheet(wb, ws, s.name)
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

/** Reads a filled template (any sheet may be missing or empty). */
export function readTemplate(buf: Buffer): { data: Workbook; sheetsFound: string[]; headerIssues: Issue[] } {
  const wb = XLSX.read(buf, { type: 'buffer' })
  const byName = new Map(wb.SheetNames.map(n => [norm(n), n]))
  const data = { inventoryBranches: [] as string[] } as unknown as Workbook
  const headerIssues: Issue[] = []
  const sheetsFound: string[] = []
  for (const s of SHEETS) {
    data[s.key] = []
    const real = byName.get(norm(s.name))
    if (!real) continue
    sheetsFound.push(s.name)
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets[real]!, { header: 1, defval: '', raw: false, blankrows: false })
    if (!rows.length) continue
    const headers = rows[0]!.map(h => norm(String(h)))
    const colIndex = new Map<string, number>()
    for (const c of s.cols) {
      const i = headers.indexOf(norm(c.header))
      if (i >= 0) colIndex.set(c.key, i)
      else if (c.required && rows.length > 1) headerIssues.push({ sheet: s.name, row: 1, column: c.header, message: `Falta la columna «${c.header}»` })
    }
    let extra: { idx: number; code: string }[] = []
    if (s.key === 'inventario') {
      extra = rows[0]!.map((h, idx) => ({ idx, code: String(h).replace(/\*/g, '').trim().toUpperCase() })).filter(x => x.idx !== colIndex.get('sku') && x.code)
      data.inventoryBranches = extra.map(x => x.code)
    }
    rows.slice(1).forEach((r, i) => {
      const row: Row = { __row: String(i + 2) } as Row
      for (const [k, idx] of colIndex) row[k] = String(r[idx] ?? '').trim()
      for (const x of extra) row[`qty:${x.code}`] = String(r[x.idx] ?? '').trim()
      if (Object.entries(row).some(([k, v]) => k !== '__row' && v !== '')) data[s.key].push(row)
    })
  }
  return { data, sheetsFound, headerIssues }
}

/** Numbers as people type them: «1,250.50», «Q 18», «18,5». */
export function parseNumber(v: string): number | null {
  if (v === '') return null
  let s = v.replace(/[Qq$\s]/g, '')
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '')
  else if (/^-?\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
export const parseBool = (v: string, dflt: boolean) => (v === '' ? dflt : /^(s[ií]|si|yes|y|1|x|true|verdadero)$/i.test(v.trim()))
export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)

/**
 * Every problem with row numbers as Excel shows them. `existing` are the branches the
 * client already has (code and name), so Inventario/Empleados may refer to them too.
 */
export function validateTemplate(buf: Buffer, existing: { branchCodes: string[]; branchNames: string[] } = { branchCodes: [], branchNames: [] }): Validation & { data: Workbook } {
  const { data, sheetsFound, headerIssues } = readTemplate(buf)
  const errors: Issue[] = [...headerIssues]
  const warnings: Issue[] = []
  const err = (sheet: string, row: Row | null, column: string | null, message: string) => errors.push({ sheet, row: row ? Number(row.__row) : null, column, message })
  const warn = (sheet: string, row: Row | null, column: string | null, message: string) => warnings.push({ sheet, row: row ? Number(row.__row) : null, column, message })

  for (const s of SHEETS) {
    for (const row of data[s.key]) {
      for (const c of s.cols) {
        const v = row[c.key] ?? ''
        if (c.required && !v) { err(s.name, row, c.header, `«${c.header}» es obligatorio`); continue }
        if (!v) continue
        if ((c.type === 'number' || c.type === 'int')) {
          const n = parseNumber(v)
          if (n === null) err(s.name, row, c.header, `«${v}» no es un número`)
          else if (n < 0) err(s.name, row, c.header, 'No puede ser negativo')
          else if (c.type === 'int' && !Number.isInteger(n)) err(s.name, row, c.header, 'Debe ser un número entero')
        }
        if (c.type === 'email' && !isEmail(v)) err(s.name, row, c.header, `«${v}» no parece un correo`)
        if (c.type === 'bool' && !/^(s[ií]|si|no|yes|y|n|1|0|x|true|false|verdadero|falso)$/i.test(v)) err(s.name, row, c.header, 'Escribe sí o no')
        if (c.type === 'role' && !ROLES[norm(v)]) err(s.name, row, c.header, `Rol «${v}» desconocido (Administrador, Auditor, Control de inventario, Cajero)`)
      }
    }
  }

  const dup = (sheet: string, rows: Row[], key: string, header: string, level: 'error' | 'warning' = 'error') => {
    const seen = new Map<string, Row>()
    for (const r of rows) {
      const v = (r[key] ?? '').toUpperCase()
      if (!v) continue
      const first = seen.get(v)
      if (first) (level === 'error' ? err : warn)(sheet, r, header, `«${r[key]}» repetido (ya está en la fila ${first.__row})`)
      else seen.set(v, r)
    }
  }
  dup('Sucursales', data.sucursales, 'code', 'Código')
  dup('Productos', data.productos, 'sku', 'SKU')
  dup('Productos', data.productos, 'barcode', 'Código de barras')
  dup('Clientes', data.clientes, 'nit', 'NIT')
  dup('Proveedores', data.proveedores, 'code', 'Código')
  dup('Empleados', data.empleados, 'email', 'Correo')
  dup('Inventario', data.inventario, 'sku', 'SKU')
  for (const r of data.sucursales) if (r.code && !/^[A-Za-z0-9_-]{1,20}$/.test(r.code)) err('Sucursales', r, 'Código', 'Solo letras, números, - y _ (máx. 20)')

  const codes = new Set([...existing.branchCodes, ...data.sucursales.map(r => r.code)].map(c => c.toUpperCase()))
  const names = new Set([...existing.branchNames, ...data.sucursales.map(r => r.name)].map(n => norm(n)))
  for (const code of data.inventoryBranches) if (!codes.has(code)) err('Inventario', null, code, `La columna «${code}» no es el código de ninguna sucursal`)
  for (const r of data.inventario) {
    for (const code of data.inventoryBranches) {
      const v = r[`qty:${code}`] ?? ''
      if (v && parseNumber(v) === null) err('Inventario', r, code, `«${v}» no es una cantidad`)
    }
  }
  for (const r of data.empleados) if (r.branch && !codes.has(r.branch.toUpperCase()) && !names.has(norm(r.branch))) err('Empleados', r, 'Sucursal', `Sucursal «${r.branch}» no existe`)

  const skus = new Set(data.productos.map(r => r.sku.toUpperCase()))
  for (const r of data.inventario) if (r.sku && !skus.has(r.sku.toUpperCase())) warn('Inventario', r, 'SKU', `SKU «${r.sku}» no está en Productos: solo se cargará si ya existe en el sistema`)
  const cats = new Set(data.categorias.map(r => norm(r.name)))
  const newCats = new Set(data.productos.map(r => r.category).filter(c => c && !cats.has(norm(c))))
  if (newCats.size && data.categorias.length) warn('Productos', null, 'Categoría', `${newCats.size} categorías no están en la hoja Categorias y se crearán solas`)
  for (const r of data.clientes) {
    const bal = parseNumber(r.balance ?? '') ?? 0
    if (bal > 0 && !parseBool(r.credit ?? '', false)) warn('Clientes', r, 'Crédito', 'Tiene saldo pendiente pero Crédito = no: se le activará el crédito')
  }
  if (!sheetsFound.length) err('Libro', null, null, 'No encontré ninguna hoja de la plantilla DENGO (¿es otro formato?)')

  const counts = Object.fromEntries(SHEETS.map(s => [s.key, data[s.key].length])) as Record<SheetKey, number>
  return { errors, warnings, counts, sheetsFound, data }
}
