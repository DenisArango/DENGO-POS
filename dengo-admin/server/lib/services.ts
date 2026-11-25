import type { Config } from '../config.js'
import type { Sh } from './shell.js'
import { shellFor } from './runtime.js'
import { JobManager } from '../jobs/engine.js'

const cache = new WeakMap<Config, { sh: Sh; jobs: JobManager }>()

/** One shell and one job manager per running panel. */
export function services(config: Config) {
  let s = cache.get(config)
  if (!s) {
    const sh = shellFor(config)
    s = { sh, jobs: new JobManager(config, sh) }
    cache.set(config, s)
  }
  return s
}
