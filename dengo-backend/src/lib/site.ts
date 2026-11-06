// Public website content: defaults for the block template and the shape the
// public API returns (shared by routes/website.ts and routes/site.ts).

import { prisma } from './prisma.js'
import { parseIds } from './promotions.js'

/** Block types the template (dengo-web/src/sites/plantilla) knows how to render. */
export const BLOCK_TYPES = ['hero', 'features', 'about', 'offers', 'categories', 'gallery', 'branches', 'contact', 'cta'] as const
export type BlockType = (typeof BLOCK_TYPES)[number]

export type Block = { id: string; type: BlockType; enabled: boolean; props: Record<string, unknown> }

export const THEMES = ['clasico', 'moderno', 'editorial'] as const

export const DEFAULT_SECTIONS: Block[] = [
  { id: 'hero', type: 'hero', enabled: true, props: {} },
  { id: 'features', type: 'features', enabled: true, props: {
    title: 'Por qué comprar con nosotros',
    items: [
      { title: 'Todo en un solo lugar', text: 'Útiles, papelería y más, para la escuela, la oficina y la casa.' },
      { title: 'Precios justos', text: 'Ofertas reales cada temporada y descuentos para compras grandes.' },
      { title: 'Atención cercana', text: 'Te ayudamos a encontrar justo lo que buscas.' },
    ],
  } },
  { id: 'offers', type: 'offers', enabled: true, props: { title: 'Ofertas vigentes', subtitle: 'Obtén tu cupón y preséntalo en caja.' } },
  { id: 'categories', type: 'categories', enabled: true, props: { title: 'Lo que encontrarás' } },
  { id: 'about', type: 'about', enabled: true, props: { title: 'Nuestra historia' } },
  { id: 'gallery', type: 'gallery', enabled: false, props: { title: 'Nuestras tiendas', images: [] } },
  { id: 'branches', type: 'branches', enabled: true, props: { title: 'Visítanos' } },
  { id: 'contact', type: 'contact', enabled: true, props: { title: 'Escríbenos' } },
]

export function parseSections(raw: string | null | undefined): Block[] {
  if (!raw) return DEFAULT_SECTIONS
  try {
    const v = JSON.parse(raw)
    if (!Array.isArray(v)) return DEFAULT_SECTIONS
    return v.filter(b => b && (BLOCK_TYPES as readonly string[]).includes(b.type))
  } catch { return DEFAULT_SECTIONS }
}

export async function getSiteConfig() {
  const existing = await prisma.siteConfig.findFirst({ orderBy: { createdAt: 'asc' } })
  if (existing) return existing
  const company = await prisma.companyProfile.findFirst({ select: { name: true, phone: true, email: true } }).catch(() => null)
  return prisma.siteConfig.create({
    data: {
      businessName: company?.name ?? null,
      phone: company?.phone ?? null,
      email: company?.email ?? null,
      sections: JSON.stringify(DEFAULT_SECTIONS),
    },
  })
}

/** Branches the site shows — only public fields. */
export async function publicBranches(branchIdsRaw: string | null) {
  const ids = parseIds(branchIdsRaw)
  const rows = await prisma.branch.findMany({
    where: { ...(ids.length ? { id: { in: ids } } : {}), status: 'active' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, address: true, city: true, phone: true, openTime: true, closeTime: true },
  })
  return rows
}
