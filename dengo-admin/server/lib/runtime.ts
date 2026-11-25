import type { Config } from '../config.js'
import { makeShell, type Sh } from './shell.js'
import { pm2SimHook } from './pm2.js'

/** The shell every route and job uses: real, or simulated with a fake pm2 list. */
export function shellFor(c: Config): Sh {
  return makeShell(c.mode, c.mode === 'simulate' ? pm2SimHook(c) : undefined)
}
