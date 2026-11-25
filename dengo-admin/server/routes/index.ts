import type { RouteModule } from '../app.js'
import { clientRoutes } from './clients.js'
import { jobRoutes } from './jobs.js'
import { provisionRoutes } from './provision.js'

export const allRoutes: RouteModule[] = [clientRoutes, jobRoutes, provisionRoutes]
