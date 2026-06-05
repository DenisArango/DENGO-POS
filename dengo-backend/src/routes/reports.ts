import type { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma.js'

export default async function reportRoutes(fastify: FastifyInstance) {
  // GET /api/reports/dashboard
  fastify.get('/dashboard', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const q = request.query as { branchId?: string }
    const branchId = q.branchId ?? request.user.branchId

    const today = new Date()
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const endOfDay   = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999)

    const todaySales = await prisma.sale.aggregate({
      where: { branchId, isVoided: false, createdAt: { gte: startOfDay, lte: endOfDay } },
      _count: { id: true },
      _sum: { total: true },
    })
    const allInventory = await prisma.inventory.findMany({
      where: { branchId, product: { isActive: true } },
      select: { quantity: true, product: { select: { id: true, name: true, minStock: true } } },
    })
    const topProducts = await prisma.product.findMany({
      where: { isActive: true },
      orderBy: { salesCount: 'desc' },
      take: 10,
      include: { category: { select: { name: true } } },
    })
    const recentSales = await prisma.sale.findMany({
      where: { branchId, isVoided: false, createdAt: { gte: startOfDay, lte: endOfDay } },
      select: {
        id: true, createdAt: true, total: true, paymentMethod: true,
        customer: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    })

    // Low stock: quantity <= minStock
    const inventoryAlerts = allInventory
      .filter(i => Number(i.quantity) <= Number(i.product.minStock))
      .map(i => ({
        id: i.product.id,
        name: i.product.name,
        currentStock: Number(i.quantity),
        minStock: Number(i.product.minStock),
      }))

    // Group sales by hour
    const salesByHour: Record<number, number> = {}
    for (let h = 0; h < 24; h++) salesByHour[h] = 0
    for (const sale of recentSales) {
      const hour = new Date(sale.createdAt).getHours()
      salesByHour[hour] = (salesByHour[hour] ?? 0) + Number(sale.total)
    }

    return reply.send({
      stats: {
        dailySales: Number(todaySales._sum.total ?? 0),
        dailyTransactions: todaySales._count.id,
        lowStockCount: inventoryAlerts.length,
        cashBalance: 0,
      },
      hourlySales: Object.entries(salesByHour).map(([hour, amount]) => ({
        hour: `${String(hour).padStart(2, '0')}:00`,
        amount,
      })),
      topSellingProducts: topProducts,
      inventoryAlerts,
      recentTransactions: recentSales.map(s => ({ ...s, total: Number(s.total) })),
    })
  })

  // GET /api/reports/sales-history
  fastify.get('/sales-history', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const q = request.query as { branchId?: string; from?: string; to?: string; paymentMethod?: string; search?: string }
    return reply.send(await prisma.sale.findMany({
      where: {
        isVoided: false,
        ...(q.branchId ? { branchId: q.branchId } : {}),
        ...(q.paymentMethod ? { paymentMethod: q.paymentMethod as any } : {}),
        ...(q.from || q.to ? {
          createdAt: {
            ...(q.from ? { gte: new Date(q.from) } : {}),
            ...(q.to ? { lte: new Date(q.to) } : {}),
          },
        } : {}),
        ...(q.search ? {
          OR: [
            { invoiceNumber: { contains: q.search } },
            { customer: { name: { contains: q.search } } },
          ],
        } : {}),
      },
      include: {
        branch: { select: { id: true, name: true } },
        cashier: { select: { id: true, name: true } },
        customer: true,
        items: { include: { product: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }))
  })

  // GET /api/reports/inventory-status
  fastify.get('/inventory-status', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const q = request.query as { branchId?: string }
    return reply.send(await prisma.inventory.findMany({
      where: q.branchId ? { branchId: q.branchId } : {},
      include: {
        product: { include: { category: true, baseUnit: true } },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { product: { name: 'asc' } },
    }))
  })

  // GET /api/reports/top-products
  fastify.get('/top-products', { preHandler: [fastify.authenticate] }, async (_req, reply) => {
    return reply.send(await prisma.product.findMany({
      where: { isActive: true },
      orderBy: { salesCount: 'desc' },
      take: 50,
      include: { category: true },
    }))
  })

  // GET /api/reports/daily-sales
  fastify.get('/daily-sales', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const q = request.query as { branchId?: string; from?: string; to?: string }
    const sales = await prisma.sale.findMany({
      where: {
        isVoided: false,
        ...(q.branchId ? { branchId: q.branchId } : {}),
        ...(q.from || q.to ? {
          createdAt: {
            ...(q.from ? { gte: new Date(q.from) } : {}),
            ...(q.to ? { lte: new Date(q.to) } : {}),
          },
        } : {}),
      },
      select: { createdAt: true, total: true, paymentMethod: true },
      orderBy: { createdAt: 'asc' },
    })

    const grouped: Record<string, { date: string; count: number; total: number }> = {}
    for (const sale of sales) {
      const date = sale.createdAt.toISOString().slice(0, 10)
      if (!grouped[date]) grouped[date] = { date, count: 0, total: 0 }
      grouped[date]!.count++
      grouped[date]!.total += Number(sale.total)
    }
    return reply.send(Object.values(grouped))
  })

  // GET /api/reports/stock-movements
  fastify.get('/stock-movements', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const q = request.query as { branchId?: string; from?: string; to?: string; type?: string }
    return reply.send(await prisma.stockMovement.findMany({
      where: {
        ...(q.branchId ? { branchId: q.branchId } : {}),
        ...(q.type ? { type: q.type as any } : {}),
        ...(q.from || q.to ? {
          createdAt: {
            ...(q.from ? { gte: new Date(q.from) } : {}),
            ...(q.to ? { lte: new Date(q.to) } : {}),
          },
        } : {}),
      },
      include: {
        product: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        performedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    }))
  })

  // GET /api/reports/sales-by-product  — aggregates SaleItems for real revenue/qty per product
  fastify.get('/sales-by-product', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const q = request.query as { branchId?: string; from?: string; to?: string; limit?: string }
    const limit = Math.min(parseInt(q.limit ?? '50'), 200)
    const items = await prisma.saleItem.findMany({
      where: {
        sale: {
          isVoided: false,
          ...(q.branchId ? { branchId: q.branchId } : {}),
          ...(q.from || q.to ? {
            createdAt: {
              ...(q.from ? { gte: new Date(q.from) } : {}),
              ...(q.to ? { lte: new Date(q.to) } : {}),
            },
          } : {}),
        },
      },
      include: { product: { include: { category: true } } },
    })

    const map = new Map<string, { name: string; category: string; sku: string; cost: number; quantitySold: number; revenue: number }>()
    for (const item of items) {
      if (!map.has(item.productId)) {
        map.set(item.productId, {
          name: item.product.name,
          category: item.product.category?.name ?? 'Sin categoría',
          sku: item.product.barcode ?? item.product.sku ?? '',
          cost: Number(item.product.cost ?? 0),
          quantitySold: 0,
          revenue: 0,
        })
      }
      const p = map.get(item.productId)!
      p.quantitySold += Number(item.quantity)
      p.revenue += Number(item.total)
    }

    const result = Array.from(map.entries())
      .map(([productId, p], idx) => ({
        rank: idx + 1,
        productId,
        ...p,
        totalCost: p.cost * p.quantitySold,
        profit: p.revenue - p.cost * p.quantitySold,
        marginPercent: p.revenue > 0 ? ((p.revenue - p.cost * p.quantitySold) / p.revenue) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .map((p, idx) => ({ ...p, rank: idx + 1 }))
      .slice(0, limit)

    return reply.send(result)
  })

  // GET /api/reports/cash-registers-history
  fastify.get('/cash-registers-history', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const q = request.query as { branchId?: string; from?: string; to?: string }
    return reply.send(await prisma.cashRegister.findMany({
      where: {
        ...(q.branchId ? { branchId: q.branchId } : {}),
        ...(q.from || q.to ? {
          openedAt: {
            ...(q.from ? { gte: new Date(q.from) } : {}),
            ...(q.to ? { lte: new Date(q.to) } : {}),
          },
        } : {}),
      },
      include: {
        openedBy: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        movements: {
          include: { performedBy: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { openedAt: 'desc' },
      take: 60,
    }))
  })

  // GET /api/reports/product-rotation  — inventory + sales last 30 days
  fastify.get('/product-rotation', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const q = request.query as { branchId?: string }
    const since = new Date()
    since.setDate(since.getDate() - 30)

    const [inventory, saleItems] = await Promise.all([
      prisma.inventory.findMany({
        where: q.branchId ? { branchId: q.branchId } : {},
        include: { product: { include: { category: true } } },
      }),
      prisma.saleItem.findMany({
        where: {
          sale: {
            isVoided: false,
            createdAt: { gte: since },
            ...(q.branchId ? { branchId: q.branchId } : {}),
          },
        },
        select: { productId: true, quantity: true },
      }),
    ])

    const salesMap = new Map<string, number>()
    for (const si of saleItems) salesMap.set(si.productId, (salesMap.get(si.productId) ?? 0) + Number(si.quantity))

    const result = inventory.map(inv => {
      const stock = Number(inv.quantity)
      const sales30 = salesMap.get(inv.productId) ?? 0
      const avgDaily = sales30 / 30
      const daysOfInventory = avgDaily > 0 ? Math.min(999, Math.round(stock / avgDaily)) : 999
      const rotationIndex = stock > 0 ? Math.round((sales30 / stock) * 100) / 100 : 0
      let status: 'high' | 'normal' | 'low' | 'critical' = 'normal'
      if (rotationIndex >= 3) status = 'high'
      else if (rotationIndex >= 1) status = 'normal'
      else if (rotationIndex >= 0.3) status = 'low'
      else status = 'critical'
      return {
        id: inv.productId,
        name: inv.product.name,
        category: inv.product.category?.name ?? 'Sin categoría',
        currentStock: stock,
        salesLast30Days: Math.round(sales30 * 100) / 100,
        rotationIndex,
        daysOfInventory,
        status,
        averageDailySales: Math.round(avgDaily * 100) / 100,
        lastRestockDate: inv.lastRestockAt ?? inv.updatedAt,
      }
    }).sort((a, b) => b.rotationIndex - a.rotationIndex)

    return reply.send(result)
  })
}
