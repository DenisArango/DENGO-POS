import { prisma } from '../lib/prisma.js'

type MovementType = 'IN' | 'OUT' | 'ADJUSTMENT' | 'TRANSFER' | 'SALE' | 'RETURN'

interface UpdateStockOptions {
  type: MovementType
  reason?: string
  performedById: string
  referenceId?: string
}

export async function updateStock(
  productId: string,
  branchId: string,
  delta: number,
  options: UpdateStockOptions,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const current = await tx.inventory.findUnique({
      where: { productId_branchId: { productId, branchId } },
    })
    const before = Number(current?.quantity ?? 0)
    const after = Math.max(0, before + delta)

    // Use explicit create/update instead of upsert — Prisma's SQL Server upsert
    // can incorrectly attempt INSERT when a record already exists, violating the unique constraint.
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

    await tx.stockMovement.create({
      data: {
        productId, branchId,
        type: options.type,
        quantity: Math.abs(delta),
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
        data: { salesCount: { increment: Math.abs(delta) } },
      })
    }
  })
}

export async function setStock(
  productId: string,
  branchId: string,
  quantity: number,
  options: UpdateStockOptions,
): Promise<void> {
  const current = await prisma.inventory.findUnique({
    where: { productId_branchId: { productId, branchId } },
  })
  const before = Number(current?.quantity ?? 0)
  await updateStock(productId, branchId, quantity - before, options)
}

export async function getStock(productId: string, branchId: string): Promise<number> {
  const inv = await prisma.inventory.findUnique({
    where: { productId_branchId: { productId, branchId } },
  })
  return Number(inv?.quantity ?? 0)
}
