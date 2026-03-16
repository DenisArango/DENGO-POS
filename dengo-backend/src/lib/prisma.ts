import { PrismaClient } from '@prisma/client'
import { config } from '../config.js'

const globalForPrisma = globalThis as unknown as { _prisma?: PrismaClient }

export const prisma =
  globalForPrisma._prisma ??
  new PrismaClient({
    log: config.isDev ? ['query', 'warn', 'error'] : ['warn', 'error'],
  })

if (config.isDev) globalForPrisma._prisma = prisma
