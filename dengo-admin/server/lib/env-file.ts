/** KEY=value pairs of a .env text (comments and blanks skipped, surrounding quotes removed). */
export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 0) continue
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return out
}

const needsQuotes = (v: string) => /[\s#"'$`\\]/.test(v)
// Quoted values use single quotes: the backend's .env reader only strips the surrounding quotes,
// and the deploy scripts `source` these files in bash, where single quotes keep $ and ` literal.
const fmt = (k: string, v: string) => {
  if (/[\r\n']/.test(v)) throw new Error(`El valor de ${k} no puede llevar comillas simples ni saltos de línea`)
  return `${k}=${needsQuotes(v) ? `'${v}'` : v}`
}

/** Sets keys in an existing .env text, keeping its comments and order; new keys go at the end. */
export function updateEnv(text: string, updates: Record<string, string | null>): string {
  const lines = text.split(/\r?\n/)
  const done = new Set<string>()
  const out: string[] = []
  for (const line of lines) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)
    if (m && m[1]! in updates) {
      const v = updates[m[1]!]
      done.add(m[1]!)
      if (v !== null) out.push(fmt(m[1]!, v!))
      continue
    }
    out.push(line)
  }
  while (out.length && out[out.length - 1] === '') out.pop()
  for (const [k, v] of Object.entries(updates)) if (!done.has(k) && v !== null) out.push(fmt(k, v))
  return out.join('\n') + '\n'
}

/** A new .env from titled sections: [['# título', {K: v}], …]. */
export function renderEnv(sections: [string, Record<string, string>][]): string {
  return sections.map(([title, vars]) => [title, ...Object.entries(vars).map(([k, v]) => fmt(k, v))].join('\n')).join('\n\n') + '\n'
}

/** The DATABASE_URL without Prisma's ?schema= (pg and pg_dump don't take it). */
export const plainDbUrl = (url: string) => url.split('?')[0]!
