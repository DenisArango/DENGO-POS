import type { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma.js'

// Build branch/register filter enforcing non-admin scope
// cashRegisterId can be:
//   - a composite key "name:registerNumber:branchId" (from the filter dropdown)
//   - a real cashRegister.id (from direct session filter)
function buildSaleFilter(
  user: { role: string; branchId: string },
  q: { branchId?: string; cashRegisterId?: string; from?: string; to?: string }
) {
  const branchId = user.role !== 'ADMIN' ? user.branchId : (q.branchId ?? undefined)

  // Detect composite key vs session ID
  let registerFilter: object = {}
  if (q.cashRegisterId) {
    const parts = q.cashRegisterId.split(':')
    if (parts.length === 3) {
      // Composite key "name:registerNumber:branchId" → filter by name+number
      const [regName, regNumber] = parts
      registerFilter = { cashRegister: { name: regName, registerNumber: regNumber } }
    } else {
      // Direct session ID
      registerFilter = { cashRegisterId: q.cashRegisterId }
    }
  }

  return {
    isVoided: false,
    ...(branchId ? { branchId } : {}),
    ...registerFilter,
    ...(q.from || q.to ? {
      createdAt: {
        ...(q.from ? { gte: new Date(q.from) } : {}),
        ...(q.to ? { lte: new Date(q.to) } : {}),
      },
    } : {}),
  }
}

export default async function reportRoutes(fastify: FastifyInstance) {
  // GET /api/reports/dashboard
  fastify.get('/dashboard', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const q = request.query as { branchId?: string }
    const branchId = request.user.role !== 'ADMIN' ? request.user.branchId : (q.branchId ?? request.user.branchId)

    const today = new Date()
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const endOfDay   = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999)

    const todaySales = await prisma.sale.aggregate({
      where: { branchId, isVoided: false, createdAt: { gte: startOfDay, lte: endOfDay } },
      _count: { id: true },
      _sum: { total: true },
    })
    const [allInventory, todaySaleItems, allTodayHourly, recentSales] = await Promise.all([
      prisma.inventory.findMany({
        where: { branchId, product: { isActive: true } },
        select: { quantity: true, product: { select: { id: true, name: true, minStock: true } } },
      }),
      // Today's sale items for category breakdown (actual today data, not all-time salesCount)
      prisma.saleItem.findMany({
        where: { sale: { branchId, isVoided: false, createdAt: { gte: startOfDay, lte: endOfDay } } },
        select: { total: true, product: { select: { category: { select: { name: true } } } } },
      }),
      // All today's sales for the hourly chart (not limited to 10)
      prisma.sale.findMany({
        where: { branchId, isVoided: false, createdAt: { gte: startOfDay, lte: endOfDay } },
        select: { createdAt: true, total: true },
      }),
      // Recent transactions list (limited, includes saleType for correct label)
      prisma.sale.findMany({
        where: { branchId, isVoided: false, createdAt: { gte: startOfDay, lte: endOfDay } },
        select: {
          id: true, createdAt: true, total: true,
          paymentMethod: true, saleType: true,
          customer: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ])

    const inventoryAlerts = allInventory
      .filter(i => Number(i.quantity) <= Number(i.product.minStock))
      .map(i => ({
        id: i.product.id,
        name: i.product.name,
        currentStock: Number(i.quantity),
        minStock: Number(i.product.minStock),
      }))

    // Hourly distribution from ALL today's sales
    const salesByHour: Record<number, number> = {}
    for (let h = 0; h < 24; h++) salesByHour[h] = 0
    for (const sale of allTodayHourly) {
      const hour = new Date(sale.createdAt).getHours()
      salesByHour[hour] = (salesByHour[hour] ?? 0) + Number(sale.total)
    }

    // Top categories from today's actual sold items
    const catRevenue: Record<string, number> = {}
    for (const item of todaySaleItems) {
      const cat = item.product.category?.name ?? 'Sin categoría'
      catRevenue[cat] = (catRevenue[cat] ?? 0) + Number(item.total)
    }
    const topCategoriesToday = Object.entries(catRevenue)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6)

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
      topCategoriesToday,
      inventoryAlerts,
      recentTransactions: recentSales.map(s => ({ ...s, total: Number(s.total) })),
    })
  })

  // GET /api/reports/sales-history
  fastify.get('/sales-history', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const q = request.query as {
      branchId?: string; from?: string; to?: string; paymentMethod?: string
      saleType?: string; search?: string; cashRegisterId?: string; includeVoided?: string
    }
    const filter = buildSaleFilter(request.user, q)
    // Spread the full filter (handles both cashRegisterId and cashRegister: {name,registerNumber})
    const { isVoided: _iv, ...registerAndDateFilter } = filter as any
    const where: any = {
      ...(q.includeVoided === 'true' ? {} : { isVoided: false }),
      ...registerAndDateFilter,
      ...(q.paymentMethod ? { paymentMethod: q.paymentMethod as any } : {}),
      ...(q.saleType ? { saleType: q.saleType as any } : {}),
      ...(q.search ? {
        OR: [
          { invoiceNumber: { contains: q.search } },
          { customer: { name: { contains: q.search } } },
        ],
      } : {}),
    }

    const sales = await prisma.sale.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true } },
        cashier: { select: { id: true, name: true } },
        cashRegister: { select: { id: true, name: true, registerNumber: true } },
        customer: true,
        items: {
          include: {
            product: { select: { id: true, name: true, cost: true } },
            variation: { select: { id: true, name: true, conversionFactor: true } },
          },
        },
        creditPayments: {
          include: { paidBy: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    })

    // Enrich items with profit data — multiply cost by conversionFactor for variations
    const enriched = sales.map(sale => ({
      ...sale,
      items: sale.items.map(item => {
        const cost = Number(item.product.cost ?? 0)
        const convFactor = Number((item.variation as any)?.conversionFactor ?? 1)
        const qty = Number(item.quantity)
        const revenue = Number(item.total)
        const totalCost = cost * convFactor * qty
        return { ...item, cost, convFactor, totalCost, profit: revenue - totalCost }
      }),
      saleProfit: sale.items.reduce((acc, item) => {
        const cost = Number(item.product.cost ?? 0)
        const convFactor = Number((item.variation as any)?.conversionFactor ?? 1)
        return acc + Number(item.total) - cost * convFactor * Number(item.quantity)
      }, 0),
    }))

    return reply.send(enriched)
  })

  // GET /api/reports/inventory-status
  fastify.get('/inventory-status', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const q = request.query as { branchId?: string }
    const branchId = request.user.role !== 'ADMIN' ? request.user.branchId : (q.branchId ?? undefined)
    return reply.send(await prisma.inventory.findMany({
      where: branchId ? { branchId } : {},
      include: {
        product: { include: { category: true, baseUnit: true } },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { product: { name: 'asc' } },
    }))
  })

  // GET /api/reports/top-products
  fastify.get('/top-products', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const q = request.query as { branchId?: string; cashRegisterId?: string; from?: string; to?: string }
    const filter = buildSaleFilter(request.user, q)

    // Aggregate by saleItems to get per-branch accuracy
    const items = await prisma.saleItem.findMany({
      where: { sale: filter },
      include: { product: { include: { category: true } } },
    })
    const map = new Map<string, { name: string; category: string; quantity: number; revenue: number }>()
    for (const item of items) {
      if (!map.has(item.productId)) {
        map.set(item.productId, { name: item.product.name, category: item.product.category?.name ?? '', quantity: 0, revenue: 0 })
      }
      const p = map.get(item.productId)!
      p.quantity += Number(item.quantity)
      p.revenue += Number(item.total)
    }
    const result = Array.from(map.entries())
      .map(([productId, p], i) => ({ rank: i + 1, productId, ...p }))
      .sort((a, b) => b.revenue - a.revenue)
      .map((p, i) => ({ ...p, rank: i + 1 }))
      .slice(0, 50)

    return reply.send(result)
  })

  // GET /api/reports/daily-sales
  fastify.get('/daily-sales', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const q = request.query as { branchId?: string; cashRegisterId?: string; from?: string; to?: string }
    const filter = buildSaleFilter(request.user, q)

    const sales = await prisma.sale.findMany({
      where: filter,
      select: {
        createdAt: true, total: true, paymentMethod: true,
        cashAmount: true, cardAmount: true, transferAmount: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    const grouped: Record<string, {
      date: string; count: number; total: number
      cash: number; card: number; transfer: number; credit: number
    }> = {}

    for (const sale of sales) {
      const date = sale.createdAt.toISOString().slice(0, 10)
      if (!grouped[date]) grouped[date] = { date, count: 0, total: 0, cash: 0, card: 0, transfer: 0, credit: 0 }
      grouped[date]!.count++
      grouped[date]!.total += Number(sale.total)
      const m = (sale.paymentMethod ?? '').toUpperCase()
      if (m === 'CASH')          grouped[date]!.cash     += Number(sale.total)
      else if (m === 'CARD')     grouped[date]!.card     += Number(sale.total)
      else if (m === 'TRANSFER') grouped[date]!.transfer += Number(sale.total)
      else if (m === 'CREDIT')   grouped[date]!.credit   += Number(sale.total)
      else if (m === 'MIXED') {
        grouped[date]!.cash     += Number(sale.cashAmount ?? 0)
        grouped[date]!.card     += Number(sale.cardAmount ?? 0)
        grouped[date]!.transfer += Number(sale.transferAmount ?? 0)
      }
    }
    return reply.send(Object.values(grouped))
  })

  // GET /api/reports/stock-movements
  fastify.get('/stock-movements', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const q = request.query as { branchId?: string; from?: string; to?: string; type?: string }
    const branchId = request.user.role !== 'ADMIN' ? request.user.branchId : (q.branchId ?? undefined)
    return reply.send(await prisma.stockMovement.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
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

  // GET /api/reports/sales-by-product
  fastify.get('/sales-by-product', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const q = request.query as { branchId?: string; cashRegisterId?: string; from?: string; to?: string; limit?: string }
    const limit = Math.min(parseInt(q.limit ?? '50'), 200)
    const filter = buildSaleFilter(request.user, q)

    const items = await prisma.saleItem.findMany({
      where: { sale: filter },
      include: {
        product: { include: { category: true } },
        variation: { select: { conversionFactor: true } },
      },
    })

    const map = new Map<string, { name: string; category: string; sku: string; cost: number; quantitySold: number; revenue: number; totalCostAcc: number }>()
    for (const item of items) {
      if (!map.has(item.productId)) {
        map.set(item.productId, {
          name: item.product.name,
          category: item.product.category?.name ?? 'Sin categoría',
          sku: item.product.barcode ?? item.product.sku ?? '',
          cost: Number(item.product.cost ?? 0),
          quantitySold: 0,
          revenue: 0,
          totalCostAcc: 0,
        })
      }
      const p = map.get(item.productId)!
      const convFactor = Number((item.variation as any)?.conversionFactor ?? 1)
      const qty = Number(item.quantity)
      p.quantitySold += qty
      p.revenue += Number(item.total)
      p.totalCostAcc += p.cost * convFactor * qty
    }

    const result = Array.from(map.entries())
      .map(([productId, p], idx) => ({
        rank: idx + 1,
        productId,
        name: p.name, category: p.category, sku: p.sku, cost: p.cost,
        quantitySold: p.quantitySold, revenue: p.revenue,
        totalCost: p.totalCostAcc,
        profit: p.revenue - p.totalCostAcc,
        marginPercent: p.revenue > 0 ? ((p.revenue - p.totalCostAcc) / p.revenue) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .map((p, idx) => ({ ...p, rank: idx + 1 }))
      .slice(0, limit)

    return reply.send(result)
  })

  // GET /api/reports/cash-registers-history
  fastify.get('/cash-registers-history', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const q = request.query as { branchId?: string; from?: string; to?: string }
    const branchId = request.user.role !== 'ADMIN' ? request.user.branchId : (q.branchId ?? undefined)
    return reply.send(await prisma.cashRegister.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
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
      take: 100,
    }))
  })

  // GET /api/reports/product-rotation
  fastify.get('/product-rotation', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const q = request.query as { branchId?: string; cashRegisterId?: string }
    const branchId = request.user.role !== 'ADMIN' ? request.user.branchId : (q.branchId ?? undefined)
    const since = new Date()
    since.setDate(since.getDate() - 30)

    const [inventory, saleItems] = await Promise.all([
      prisma.inventory.findMany({
        where: branchId ? { branchId } : {},
        include: { product: { include: { category: true } } },
      }),
      prisma.saleItem.findMany({
        where: {
          sale: {
            isVoided: false,
            createdAt: { gte: since },
            ...(branchId ? { branchId } : {}),
            ...(q.cashRegisterId ? { cashRegisterId: q.cashRegisterId } : {}),
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

  // GET /api/reports/cash-registers — DISTINCT name+number combos for filter dropdowns
  fastify.get('/cash-registers', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const q = request.query as { branchId?: string }
    const branchId = request.user.role !== 'ADMIN' ? request.user.branchId : (q.branchId ?? undefined)

    // Distinct name+registerNumber combinations (one entry per physical register)
    const rows = await prisma.cashRegister.findMany({
      where: branchId ? { branchId } : {},
      select: { name: true, registerNumber: true, branchId: true },
      distinct: ['name', 'registerNumber', 'branchId'],
      orderBy: [{ registerNumber: 'asc' }, { name: 'asc' }],
    })

    // Composite key: "name:registerNumber:branchId" — used by frontend as filter value
    return reply.send(rows.map(r => ({
      id: `${r.name}:${r.registerNumber}:${r.branchId}`,
      name: r.name,
      registerNumber: r.registerNumber,
      branchId: r.branchId,
    })))
  })
}
