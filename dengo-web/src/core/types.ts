// Shapes returned by the backend's public API (dengo-backend/src/routes/site.ts).

export type BlockType = 'hero' | 'features' | 'about' | 'offers' | 'categories' | 'gallery' | 'branches' | 'contact' | 'cta'
export interface Block { id: string; type: BlockType; enabled: boolean; props: Record<string, unknown> }

export interface Branch { id: string; name: string; address: string; city: string; phone: string; openTime: string; closeTime: string }

export interface Promotion {
  slug: string
  name: string
  description: string | null
  terms: string | null
  image: string | null
  type: 'PERCENT' | 'FIXED' | 'BUY_X_GET_Y' | 'SPECIAL_PRICE'
  summary: string
  percent: number | null
  amount: number | null
  specialPrice: number | null
  buyQty: number | null
  payQty: number | null
  minPurchase: number | null
  startsAt: string | null
  endsAt: string | null
  featured: boolean
  couponsLeft: number | null
  live?: boolean
}

export interface SiteContent {
  site: string
  theme: 'clasico' | 'moderno' | 'editorial' | string
  published: boolean
  publicUrl: string | null
  businessName: string
  tagline: string | null
  about: string | null
  heroTitle: string | null
  heroSubtitle: string | null
  heroImage: string | null
  logo: string | null
  primaryColor: string | null
  accentColor: string | null
  sections: Block[]
  contact: { whatsapp: string | null; phone: string | null; email: string | null; facebook: string | null; instagram: string | null; tiktok: string | null }
  seo: { title: string | null; description: string | null }
  branches: Branch[]
  promotions: Promotion[]
  categories: { id: string; name: string }[]
  /** Which doors "Ingresar" opens (older backends omit it: no button). */
  access?: { staff: boolean; teachers: boolean }
  updatedAt: string
}

export interface CouponView {
  code: string
  display: string
  payload: string
  status: 'ISSUED' | 'REDEEMED' | 'VOID' | 'EXPIRED'
  firstName: string
  issuedAt: string
  expiresAt: string | null
  redeemedAt: string | null
  promotion: Promotion
}
