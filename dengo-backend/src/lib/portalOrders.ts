// Teacher-portal order math, shared by the teacher routes (portal.ts) and the
// provider routes (portal-admin.ts) so both build and check orders the same way.
//
// Per-student ("kit") programs: the teacher builds the kit of ONE student and
// the order is that kit × the number of students. PortalOrderItem.quantity is
// always the full amount (what gets quoted, invoiced and bought);
// qtyPerStudent keeps the kit so the packing sheet can be printed.

import { prisma } from './prisma.js'

type ProgramLike = {
  type: string
  perStudent?: boolean | null
  limitPerStudent?: unknown
  maxAmountPerTeacher?: unknown
}

const KIT_TYPES_BY_DEFAULT = ['SCHOOL_SUPPLIES', 'FOOD_PACKAGE']

/** True when the program's orders are one kit per student. */
export function isPerStudent(program: ProgramLike): boolean {
  if (program.perStudent != null) return program.perStudent
  // Only útiles/alimentación default to kits: gratuidad and valija are usually
  // bought for the school or teacher — the provider can flip it per program.
  return KIT_TYPES_BY_DEFAULT.includes(program.type)
}

/**
 * The amount the order should add up to, if the program sets one: the
 * per-student amount × students, or else the fixed amount per teacher.
 */
export function expectedAmount(program: ProgramLike | undefined, totalStudents: number): number | null {
  if (!program) return null
  if (program.limitPerStudent != null && totalStudents > 0) {
    return round2(Number(program.limitPerStudent) * totalStudents)
  }
  if (program.maxAmountPerTeacher != null) return round2(Number(program.maxAmountPerTeacher))
  return null
}

/**
 * How far the order is from what the program allows: diff < 0 means money
 * left unused, diff > 0 means over the limit. null when the program has no amount.
 */
export function orderBalance(program: ProgramLike | undefined, totalAmount: unknown, totalStudents: number) {
  const expected = expectedAmount(program, totalStudents)
  if (expected == null) return null
  const diff = round2(Number(totalAmount) - expected)
  return { expected, diff, balanced: Math.abs(diff) < 0.01 }
}

export type ItemInput = { productId: string; quantity: number; notes?: string | undefined }

/**
 * Resolves products and prices (always the catalog price) and turns kit
 * quantities into full quantities. Returns an error message when a product
 * is gone.
 */
export async function buildOrderItems(input: ItemInput[], perStudent: boolean, totalStudents: number) {
  const products = await prisma.product.findMany({ where: { id: { in: input.map(i => i.productId) }, isActive: true } })
  const byId = new Map(products.map(p => [p.id, p]))
  if (input.some(i => !byId.has(i.productId))) {
    return { error: 'Uno de los productos ya no está disponible — actualiza el pedido e intenta de nuevo' as const }
  }
  const items = input.map(i => {
    const product = byId.get(i.productId)!
    const unitPrice = Number(product.basePrice)
    const quantity = perStudent ? i.quantity * totalStudents : i.quantity
    return {
      productId: product.id as string | null,
      productName: product.name,
      quantity,
      qtyPerStudent: perStudent ? i.quantity : null,
      unitPrice,
      unitCost: Number(product.cost ?? 0),
      total: round2(unitPrice * quantity),
      notes: i.notes ?? null,
    }
  })
  const totalAmount = round2(items.reduce((s, it) => s + it.total, 0))
  const kitAmount = perStudent ? round2(items.reduce((s, it) => s + it.unitPrice * (it.qtyPerStudent ?? 0), 0)) : null
  return { items, totalAmount, kitAmount }
}

export type AdminItemInput = {
  productId?: string | undefined
  /** Only for a product outside the catalog (productId empty). */
  customName?: string | undefined
  quantity: number
  /** Provider's sale price; defaults to the catalog price. */
  unitPrice?: number | undefined
  /** Provider's cost; defaults to the catalog cost. Never shown to teachers. */
  unitCost?: number | undefined
}

/**
 * Provider-side version of buildOrderItems: any catalog product (no program
 * category limits), products typed in by hand, and price/cost overrides.
 */
export async function buildAdminOrderItems(input: AdminItemInput[], perStudent: boolean, totalStudents: number) {
  const ids = input.map(i => i.productId).filter((id): id is string => !!id)
  const products = await prisma.product.findMany({ where: { id: { in: ids } } })
  const byId = new Map(products.map(p => [p.id, p]))
  for (const i of input) {
    if (i.productId && !byId.has(i.productId)) return { error: 'Uno de los productos ya no existe' as const }
    if (!i.productId && (!i.customName?.trim() || i.unitPrice == null)) {
      return { error: 'Un producto fuera del catálogo necesita nombre y precio de venta' as const }
    }
  }
  const items = input.map(i => {
    const product = i.productId ? byId.get(i.productId)! : null
    const unitPrice = round2(i.unitPrice ?? Number(product?.basePrice ?? 0))
    const quantity = perStudent ? i.quantity * totalStudents : i.quantity
    return {
      productId: product?.id ?? null,
      productName: product?.name ?? i.customName!.trim(),
      quantity,
      qtyPerStudent: perStudent ? i.quantity : null,
      unitPrice,
      unitCost: i.unitCost ?? Number(product?.cost ?? 0),
      total: round2(unitPrice * quantity),
      notes: null,
    }
  })
  return { items, totalAmount: round2(items.reduce((s, it) => s + it.total, 0)) }
}

/** Cost of a line (frozen unitCost, else today's catalog cost). */
export function lineCost(item: { unitCost?: unknown; quantity: unknown; product?: { cost?: unknown } | null }) {
  const unit = item.unitCost != null ? Number(item.unitCost) : Number(item.product?.cost ?? 0)
  return unit * Number(item.quantity)
}

export function round2(n: number) {
  return Number(n.toFixed(2))
}
