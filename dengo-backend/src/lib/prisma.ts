import { PrismaClient } from '@prisma/client'
import { config } from '../config.js'

const globalForPrisma = globalThis as unknown as { _prisma?: ReturnType<typeof makePrisma> }

function makePrisma() {
  const client = new PrismaClient({
    log: config.isDev ? ['query', 'warn', 'error'] : ['warn', 'error'],
  })

  // Automatic retry on P1001 (connection refused) — happens when SQL Server
  // is warming up the pool under concurrent requests.
  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }: { args: any; query: (a: any) => Promise<any> }) {
          for (let attempt = 0; attempt < 4; attempt++) {
            try {
              return await query(args)
            } catch (err: any) {
              if (err?.code === 'P1001' && attempt < 3) {
                await new Promise(r => setTimeout(r, 80 * Math.pow(2, attempt)))
                continue
              }
              throw err
            }
          }
        },
      },
    },
  })
}

export const prisma = globalForPrisma._prisma ?? makePrisma()

if (config.isDev) globalForPrisma._prisma = prisma
