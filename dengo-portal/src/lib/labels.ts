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
  PENDING: { label: 'En revisión', className: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/20' },
  APPROVED: { label: 'Aprobado', className: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-600/20' },
  REJECTED: { label: 'Rechazado', className: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20' },
  QUOTED: { label: 'Cotizado', className: 'bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-600/20' },
  INVOICED: { label: 'Facturado', className: 'bg-violet-50 text-violet-800 ring-1 ring-inset ring-violet-600/20' },
}

export function statusStyle(status: string): StatusStyle {
  return ORDER_STATUS[status] ?? { label: status, className: 'bg-gray-100 text-gray-700 ring-1 ring-inset ring-gray-500/20' }
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
