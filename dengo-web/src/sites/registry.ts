// Every design the website can render. A client's SiteConfig.site picks one:
//   plantilla  → the block template, assembled from the POS (default)
//   <client>   → a custom design made for that client (billed separately)
// To add a custom design: create src/sites/<key>/ with an index.ts that
// exports the same four pages, register it here, and set SiteConfig.site to
// <key> for that client. It can reuse any block from src/blocks or none.

import * as plantilla from './plantilla/index'
import * as aurora from './aurora/index'
import * as dayana from './dayana/index'

export type SiteModule = typeof plantilla

export const SITES: Record<string, SiteModule> = {
  plantilla,
  aurora,
  dayana,
}

export const getSite = (key: string): SiteModule => SITES[key] ?? plantilla
