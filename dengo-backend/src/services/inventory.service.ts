import { prisma } from '../lib/prisma.js'
import type { MovementType } from '@prisma/client'

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

    await tx.inventory.upsert({
      where: { productId_branchId: { productId, branchId } },
      create: { productId, branchId, quantity: after },
      update: {
        quantity: after,
        ...(options.type === 'SALE' ? { lastSaleAt: new Date() } : {}),
        ...(options.type === 'IN'   ? { lastRestockAt: new Date() } : {}),
      },
    })

    await tx.stockMovement.create({
      data: {
        productId, branchId,
        type: options.type,
        quantity: Math.abs(delta),
        quantityBefore: before,
        quantityAfter: after,
        reason: options.reason,
        referenceId: options.referenceId,
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
