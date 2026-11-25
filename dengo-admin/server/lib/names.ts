const words = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ñ/gi, 'n').split(/[^A-Za-z0-9]+/).filter(Boolean)

/** «Librería Él» → `LibreriaEl`: folder and pm2 name. */
export function pascalName(s: string): string {
  const out = words(s).map(w => w[0]!.toUpperCase() + w.slice(1)).join('').slice(0, 40)
  return /^[A-Za-z]/.test(out) ? out : `C${out}`
}

/** «Librería Él» → `libreria_el`: database name. */
export function dbName(s: string): string {
  const out = words(s).map(w => w.toLowerCase()).join('_').slice(0, 50)
  return /^[a-z]/.test(out) ? out : `c_${out}`
}

/** `https://www.Cliente.com/` → `cliente.com`. Null when it doesn't look like a domain. */
export function normalizeDomain(input: string): string | null {
  const d = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '')
  return /^(?=.{4,190}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(d) ? d : null
}

/** «VariedadesDayana» → «Variedades Dayana» (display name for clients without cliente.json). */
export function splitPascal(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, '$1 $2')
}
