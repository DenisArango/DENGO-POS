/// <reference types="vite/client" />

// Injected at build time from dengo-frontend/package.json's "version" field
// (see vite.config.ts) — bump that field before each deploy so the version
// shown in the app (Login screen footer) actually changes, letting you
// confirm at a glance whether a browser is still on the old cached build.
declare const __APP_VERSION__: string
