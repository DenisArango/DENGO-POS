import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma.js'
import type { User } from '@prisma/client'

const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_MINUTES = 15

export async function validateUser(email: string, password: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || !user.isActive) throw new Error('Credenciales incorrectas')

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000)
    throw new Error(`Cuenta bloqueada temporalmente por demasiados intentos fallidos. Intenta de nuevo en ${minutesLeft} minuto(s).`)
  }

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    const attempts = user.failedLoginAttempts + 1
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: attempts,
        ...(attempts >= MAX_FAILED_ATTEMPTS ? { lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60_000) } : {}),
      },
    })
    throw new Error(
      attempts >= MAX_FAILED_ATTEMPTS
        ? `Cuenta bloqueada temporalmente por demasiados intentos fallidos. Intenta de nuevo en ${LOCKOUT_MINUTES} minutos.`
        : 'Credenciales incorrectas'
    )
  }

  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } })
  }

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
