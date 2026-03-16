import { prisma } from '../lib/prisma.js'

interface LogOptions {
  userId?: string
  action: string
  entity: string
  entityId?: string
  oldValues?: object
  newValues?: object
  ipAddress?: string
  userAgent?: string
}

export async function log(options: LogOptions): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: options.userId,
        action: options.action,
        entity: options.entity,
        entityId: options.entityId,
        oldValues: options.oldValues ? JSON.stringify(options.oldValues) : undefined,
        newValues: options.newValues ? JSON.stringify(options.newValues) : undefined,
        ipAddress: options.ipAddress,
        userAgent: options.userAgent,
      },
    })
  } catch {
    // Never throw – audit logging must not break main flow
  }
}
