const qf = new Intl.NumberFormat('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const money = (n: number) => `Q${qf.format(n)}`
export const moneyShort = (n: number) => (n >= 10_000 ? `Q${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : money(n))

export function bytes(n: number) {
  if (!n) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), u.length - 1)
  return `${(n / 1024 ** i).toFixed(i >= 2 ? 1 : 0)} ${u[i]}`
}

export function since(iso: string | null | undefined) {
  if (!iso) return 'nunca'
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'hace un momento'
  if (s < 3600) return `hace ${Math.round(s / 60)} min`
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`
  const d = Math.round(s / 86400)
  return d === 1 ? 'ayer' : `hace ${d} días`
}

export function duration(ms: number) {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  if (s < 3600) return `${Math.round(s / 60)} min`
  const h = Math.floor(s / 3600)
  return h < 48 ? `${h} h` : `${Math.floor(h / 24)} días`
}

/** «1 archivo», «2 archivos» */
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export const dayLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-GT', { weekday: 'short', day: 'numeric' })
export const dateTime = (iso: string) => new Date(iso).toLocaleString('es-GT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
