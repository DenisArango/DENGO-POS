export type PromoType = 'PERCENT' | 'FIXED' | 'BUY_X_GET_Y' | 'SPECIAL_PRICE'
export type PromoScope = 'ALL' | 'CATEGORY' | 'PRODUCT'

export interface Promotion {
  id: string
  name: string
  slug: string
  description: string | null
  terms: string | null
  image: string | null
  type: PromoType
  scope: PromoScope
  productIds: string[]
  categoryIds: string[]
  branchIds: string[]
  percent: string | number | null
  amount: string | number | null
  specialPrice: string | number | null
  buyQty: number | null
  payQty: number | null
  minPurchase: string | number | null
  maxDiscount: string | number | null
  allowManualDiscount: boolean
  startsAt: string | null
  endsAt: string | null
  isActive: boolean
  showOnWebsite: boolean
  featured: boolean
  maxCoupons: number | null
  perPhoneLimit: number
  couponValidDays: number | null
  summary: string
  live: boolean
  issued?: number
  redeemed?: number
}

export interface Coupon {
  id: string
  code: string
  display: string
  name: string
  phone: string
  email: string | null
  status: 'ISSUED' | 'REDEEMED' | 'VOID'
  effectiveStatus: 'ISSUED' | 'REDEEMED' | 'VOID' | 'EXPIRED'
  source: 'WEB' | 'POS'
  issuedAt: string
  expiresAt: string | null
  redeemedAt: string | null
  discountAmount: string | null
  promotion: { id: string; name: string }
  sale: { id: string; invoiceNumber: string; total: string; branch: { name: string } } | null
}

export type BlockType = 'hero' | 'features' | 'about' | 'offers' | 'categories' | 'gallery' | 'branches' | 'contact' | 'cta'
export interface Block { id: string; type: BlockType; enabled: boolean; props: Record<string, unknown> }

export interface SiteConfig {
  id: string
  site: string
  theme: string
  published: boolean
  publicUrl: string | null
  posUrl: string | null
  portalUrl: string | null
  businessName: string | null
  tagline: string | null
  about: string | null
  heroTitle: string | null
  heroSubtitle: string | null
  heroImage: string | null
  logo: string | null
  primaryColor: string | null
  accentColor: string | null
  sections: Block[]
  whatsapp: string | null
  phone: string | null
  email: string | null
  facebook: string | null
  instagram: string | null
  tiktok: string | null
  seoTitle: string | null
  seoDescription: string | null
  branchIds: string[]
  themes?: string[]
}

export const PROMO_TYPE_LABEL: Record<PromoType, string> = {
  PERCENT: '% de descuento',
  FIXED: 'Monto fijo',
  BUY_X_GET_Y: 'Lleva X, paga Y',
  SPECIAL_PRICE: 'Precio especial',
}

export const money = (v: number | string | null | undefined) =>
  `Q${Number(v ?? 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const fmtDate = (iso: string | null | undefined, withTime = false) =>
  iso ? new Date(iso).toLocaleString('es-GT', { timeZone: 'America/Guatemala', day: 'numeric', month: 'short', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) }) : '—'
