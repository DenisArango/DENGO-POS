// "Abierto ahora · cierra a las 20:00" from the branch's hours, in
// Guatemala time (UTC-6, no DST) regardless of where the server runs.

export function guatemalaMinutes(now = new Date()) {
  const gt = new Date(now.getTime() - 6 * 3_600_000)
  return gt.getUTCHours() * 60 + gt.getUTCMinutes()
}

const toMin = (hhmm: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '')
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

export function openState(openTime: string, closeTime: string, now = new Date()) {
  const o = toMin(openTime), c = toMin(closeTime)
  if (o === null || c === null) return { open: false, label: '' }
  const t = guatemalaMinutes(now)
  if (t >= o && t < c) return { open: true, label: `Abierto ahora · cierra a las ${closeTime}` }
  if (t < o) return { open: false, label: `Cerrado · abre hoy a las ${openTime}` }
  return { open: false, label: `Cerrado · abre mañana a las ${openTime}` }
}
