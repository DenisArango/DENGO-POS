import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma.js'
import type { User } from '@prisma/client'

export async function validateUser(email: string, password: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || !user.isActive) throw new Error('Credenciales incorrectas')

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) throw new Error('Credenciales incorrectas')

  return user
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function logLogin(options: {
  email: string
  userId?: string
  success: boolean
  ipAddress?: string
  userAgent?: string
  failReason?: string
}): Promise<void> {
  await prisma.loginHistory.create({
    data: {
      email: options.email,
      userId: options.userId,
      success: options.success,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      failReason: options.failReason,
    },
  })
}
