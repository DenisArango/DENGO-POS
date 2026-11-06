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
      // The manifest is served by the backend (/api/app/manifest.webmanifest)
      // so the installed app shows the client's name and logo, not DENGO's.
      manifest: false,
      workbox: {
        // Only precache the built app shell; every /api/* request bypasses
        // the service worker entirely (see comment above).
        navigateFallbackDenylist: [/^\/api\//],
        // Web Push handlers (public/push-sw.js) run inside the generated SW.
        importScripts: ['/push-sw.js'],
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
        target: process.env.API_PROXY ?? 'http://localhost:3001', // API_PROXY: point the dev server at another backend
        changeOrigin: true,
      }
    }
  }
})
