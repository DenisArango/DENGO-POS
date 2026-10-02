// Client-side counterpart to the backend's multiWordSearch (dengo-backend/src/lib/search.ts)
// — requires every word of the query to appear somewhere across the given
// fields (any field, any order), so "hojas bond" matches "Hojas de Papel
// Bond Carta" even though the words aren't adjacent. Used for local/already-
// loaded-list filtering (e.g. a supplier picker with the full list in
// memory) where a server round-trip isn't needed.
export function matchesSearch(fields: (string | undefined | null)[], query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = fields.filter(Boolean).join(' ').toLowerCase()
  return words.every(w => haystack.includes(w))
}
