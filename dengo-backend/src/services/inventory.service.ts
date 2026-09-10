import { prisma } from '../lib/prisma.js'

type MovementType = 'IN' | 'OUT' | 'ADJUSTMENT' | 'TRANSFER' | 'SALE' | 'RETURN'

interface UpdateStockOptions {
  type: MovementType
  reason?: string
  performedById: string
  referenceId?: string
}

// Shared by updateStock (relative delta) and setStock (absolute target) so
// both compute their final quantity from a `before` read while the row is
// still locked — setStock used to read `before` via a plain, unlocked
// findUnique *outside* this transaction, compute its delta from that, then
// hand the delta to updateStock; under true concurrent edits to the same
// product+branch, that stale `before` made the final quantity land somewhere
// other than the absolute value the caller asked for. Funneling both through
// one locked read closes that gap for setStock while leaving updateStock's
// own behavior (including the logged `quantity` = the raw requested delta,
// even when the clamp-at-zero below kicks in) unchanged.
async function applyStockChange(
  productId: string,
  branchId: string,
  resolveAfter: (before: number) => number,
  loggedQuantity: (before: number, after: number) => number,
  options: UpdateStockOptions,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Raw SELECT ... FOR UPDATE (not a plain Prisma findUnique) takes a row lock
    // on read, so two concurrent stock changes for the same product+branch
    // (e.g. two registers selling the last unit at the same instant) serialize
    // instead of both reading the same "before" quantity and one silently
    // clobbering the other's decrement (lost-update race). Identifiers are
    // double-quoted because @map gives these tables/columns UPPERCASE names —
    // Postgres folds unquoted identifiers to lowercase.
    const rows = await tx.$queryRaw<{ QUANTITY: unknown }[]>`
      SELECT "QUANTITY" FROM "INVENTORY"
      WHERE "PRODUCT_ID" = ${productId} AND "BRANCH_ID" = ${branchId}
      FOR UPDATE
    `
    const current = rows[0]
    const before = Number(current?.QUANTITY ?? 0)
    const after = Math.max(0, resolveAfter(before))

    // Explicit create/update instead of upsert keeps this in one obvious code
    // path with the row already locked above, rather than relying on upsert's
    // own internal race handling.
    if (current) {
      await tx.inventory.update({
        where: { productId_branchId: { productId, branchId } },
        data: {
          quantity: after,
          ...(options.type === 'SALE' ? { lastSaleAt: new Date() } : {}),
          ...(options.type === 'IN'   ? { lastRestockAt: new Date() } : {}),
        },
      })
    } else {
      await tx.inventory.create({
        data: { productId, branchId, quantity: after },
      })
    }

    const quantity = loggedQuantity(before, after)

    await tx.stockMovement.create({
      data: {
        productId, branchId,
        type: options.type,
        quantity,
        quantityBefore: before,
        quantityAfter: after,
        reason: options.reason ?? null,
        referenceId: options.referenceId ?? null,
        performedById: options.performedById,
      },
    })

    if (options.type === 'SALE') {
      await tx.product.update({
        where: { id: productId },
        data: { salesCount: { increment: quantity } },
      })
    }
  })
}

export async function updateStock(
  productId: string,
  branchId: string,
  delta: number,
  options: UpdateStockOptions,
): Promise<void> {
  return applyStockChange(
    productId, branchId,
    before => before + delta,
    () => Math.abs(delta),
    options,
  )
}

export async function setStock(
  productId: string,
  branchId: string,
  quantity: number,
  options: UpdateStockOptions,
): Promise<void> {
  return applyStockChange(
    productId, branchId,
    () => quantity,
    (before, after) => Math.abs(after - before),
    options,
  )
}

export async function getStock(productId: string, branchId: string): Promise<number> {
  const inv = await prisma.inventory.findUnique({
    where: { productId_branchId: { productId, branchId } },
  })
  return Number(inv?.quantity ?? 0)
}
