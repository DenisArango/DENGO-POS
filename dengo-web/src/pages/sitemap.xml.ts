import type { APIRoute } from 'astro'
import { getContent } from '../core/api'

export const GET: APIRoute = async ({ url }) => {
  const content = await getContent()
  const base = content?.publicUrl?.replace(/\/$/, '') || url.origin
  const paths = ['/', '/ofertas', ...(content?.promotions ?? []).map(p => `/ofertas/${p.slug}`)]
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths
    .map(p => `  <url><loc>${base}${p}</loc></url>`).join('\n')}\n</urlset>\n`
  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8' } })
}
