// How the four base roles read on screen (the enum stays in the data).
export const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrador',
  AUDITOR: 'Auditor',
  INVENTORY_CONTROL: 'Control de Inventario',
  OPERATOR: 'Cajero',
  TEACHER: 'Maestro/a',
}

export const roleLabel = (role?: string | null) => (role ? ROLE_LABEL[role] ?? role : '')
