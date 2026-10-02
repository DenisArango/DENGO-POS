import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  // npm sets this automatically from package.json's "version" field whenever
  // this config runs via an npm script (npm run build/dev) — baked into the
  // bundle as a plain string constant, not a runtime env lookup, so it's
  // always accurate for whatever was actually built. See vite-env.d.ts.
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
  },
  plugins: [
    react(),
    // Caches the app shell (JS/CSS/HTML/icons) in the browser so the app
    // still LOADS with no network — needed once this is deployed off
    // localhost, where "no internet" today means the page can't even be
    // fetched. Deliberately does NOT cache /api/* responses: the app's own
    // IndexedDB-based offline handling (lib/offlineDb.ts, offlineSync.ts,
    // StoreContext's branch cache) already owns "what data to show and what
    // writes to queue" — a service worker also caching API responses would
    // fight that logic instead of complementing it, so API calls are left
    // as NetworkOnly and simply fail through to the existing offline paths.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['vite.svg'],
      manifest: {
        name: 'DENGO POS',
        short_name: 'DENGO POS',
        description: 'Sistema de punto de venta DENGO',
        theme_color: '#2563eb',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/pos',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Only precache the built app shell; every /api/* request bypasses
        // the service worker entirely (see comment above).
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^\/api\//,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  }
})
