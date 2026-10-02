/**
 * Splits a search query into words and requires EVERY word to appear
 * somewhere across the given fields (independently, any field, any order) —
 * so "hojas bond" matches a product named "Hojas de Papel Bond" even though
 * the two words aren't adjacent in the stored name, which a single
 * `contains(query)` check misses entirely (it only matches the exact
 * phrase as a contiguous substring).
 *
 * `buildFieldFilters` returns the OR branches for one word (e.g. name OR
 * barcode OR sku contains that word) — kept as a builder instead of a flat
 * field-name list so callers can include relation filters too (see
 * products.ts's altBarcodes.some(...)), not just plain scalar columns.
 */
export function multiWordSearch<T extends object>(
  query: string,
  buildFieldFilters: (word: string) => T[]
): { AND: { OR: T[] }[] } | Record<string, never> {
  const words = query.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return {}
  return { AND: words.map(word => ({ OR: buildFieldFilters(word) })) }
}
