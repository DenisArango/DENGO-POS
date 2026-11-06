// @ts-check
import { defineConfig } from 'astro/config'
import node from '@astrojs/node'

// One build serves every client: which design a client sees is decided at
// request time from its SiteConfig (or WEB_SITE in the environment), so a
// custom design never needs its own build pipeline.
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  server: { port: 4321, host: '127.0.0.1' },
  // Coupons are posted by the browser to /api/site/* on the same domain
  // (Caddy routes /api to the backend in production; Vite proxies in dev).
  vite: { server: { proxy: { '/api': 'http://127.0.0.1:3001' } } },
  security: { checkOrigin: true },
})
