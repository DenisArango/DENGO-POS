import { createConnection } from 'node:net'

/** Whether something already listens on 127.0.0.1:port. */
export function isListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = createConnection({ host: '127.0.0.1', port })
    const done = (v: boolean) => { s.destroy(); resolve(v) }
    s.setTimeout(500, () => done(false))
    s.once('connect', () => done(true))
    s.once('error', () => done(false))
  })
}

/** First port ≥ start that no client claims and nothing listens on. */
export async function nextFreePort(start: number, taken: Set<number>, listening: (p: number) => Promise<boolean> = isListening): Promise<number> {
  for (let p = start; p < start + 500; p++) {
    if (taken.has(p)) continue
    if (await listening(p)) continue
    return p
  }
  throw new Error(`No hay puertos libres desde ${start}`)
}
