import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted Inter (one variable font file, every weight) — no request to
// Google before the first paint.
import '@fontsource-variable/inter'
import './index.css'
import App from './App'
import { applyBrandColor, getCachedConfig } from './lib/brand'
import { registerServiceWorker } from './lib/push'

// Client colour from the last config seen, before the first paint.
applyBrandColor(getCachedConfig()?.primaryColor)
// Needed to receive notifications (and to install the portal on a phone).
void registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
