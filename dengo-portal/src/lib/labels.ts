export const PROGRAM_LABELS: Record<string, string> = {
  FOOD_PACKAGE: 'Alimentación Escolar',
  SCHOOL_SUPPLIES: 'Útiles Escolares',
  TEACHING_KIT: 'Valija Didáctica',
  GRATUITY: 'Gratuidades',
}

export const PROGRAM_ICONS: Record<string, string> = {
  FOOD_PACKAGE: '🍽️',
  SCHOOL_SUPPLIES: '✏️',
  TEACHING_KIT: '🎒',
  GRATUITY: '📚',
}

export const PROGRAM_DESCRIPTIONS: Record<string, string> = {
  FOOD_PACKAGE: 'Paquetes de alimentos para estudiantes del sector público',
  SCHOOL_SUPPLIES: 'Cuadernos, lápices, materiales básicos para el aula',
  TEACHING_KIT: 'Q600 por docente para materiales de enseñanza alineados al CNB',
  GRATUITY: 'Materiales educativos gratuitos para establecimientos',
}

export function programLabel(type: string): string {
  return PROGRAM_LABELS[type] ?? type
}

export function programIcon(type: string): string {
  return PROGRAM_ICONS[type] ?? '📦'
}

export interface StatusStyle {
  label: string
  className: string
}

export const ORDER_STATUS: Record<string, StatusStyle> = {
  PENDING: { label: 'En revisión', className: 'bg-yellow-100 text-yellow-700' },
  APPROVED: { label: 'Aprobado', className: 'bg-green-100 text-green-700' },
  REJECTED: { label: 'Rechazado', className: 'bg-red-100 text-red-700' },
  QUOTED: { label: 'Cotizado', className: 'bg-blue-100 text-blue-700' },
  INVOICED: { label: 'Facturado', className: 'bg-purple-100 text-purple-700' },
}

export function statusStyle(status: string): StatusStyle {
  return ORDER_STATUS[status] ?? { label: status, className: 'bg-gray-100 text-gray-600' }
}

export function money(value: number | string): string {
  const n = Number(value)
  return `Q${n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return value
  }
}
