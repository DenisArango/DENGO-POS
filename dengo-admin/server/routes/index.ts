import type { RouteModule } from '../app.js'
import { clientRoutes } from './clients.js'
import { jobRoutes } from './jobs.js'
import { provisionRoutes } from './provision.js'
import { clientOpsRoutes } from './client-ops.js'
import { migrationRoutes } from './migration.js'

export const allRoutes: RouteModule[] = [clientRoutes, jobRoutes, provisionRoutes, clientOpsRoutes, migrationRoutes]
