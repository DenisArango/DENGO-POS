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

    const [todaySales, totalProducts, lowStockItems, topProducts, hourlyData] = await Promise.all([
      prisma.sale.aggregate({
        where: { branchId, isVoided: false, createdAt: { gte: startOfDay, lte: endOfDay } },
        _count: { id: true },
        _sum: { total: true },
      }),
      prisma.product.count({ where: { isActive: true } }),
      prisma.inventory.count({
        where: {
          branchId,
          product: { isActive: true },
          quantity: { lte: prisma.product.fields.minStock as any },
        },
      }),
      prisma.product.findMany({
        where: { isActive: true },
        orderBy: { salesCount: 'desc' },
        take: 10,
        include: { category: true },
      }),
      prisma.sale.findMany({
        where: { branchId, isVoided: false, createdAt: { gte: startOfDay, lte: endOfDay } },
        select: { createdAt: true, total: true },
      }),
    ])

    // Group sales by hour
    const salesByHour: Record<number, number> = {}
    for (let h = 0; h < 24; h++) salesByHour[h] = 0
    for (const sale of hourlyData) {
      const hour = new Date(sale.createdAt).getHours()
      salesByHour[hour] = (salesByHour[hour] ?? 0) + Number(sale.total)
    }

    return reply.send({
      totalSalesCount: todaySales._count.id,
      totalRevenue: Number(todaySales._sum.total ?? 0),
      totalProducts,
      lowStockProducts: lowStockItems,
      topSellingProducts: topProducts,
      salesByHour: Object.entries(salesByHour).map(([hour, sales]) => ({ hour: Number(hour), sales })),
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
}
