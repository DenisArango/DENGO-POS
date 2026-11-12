import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import './index.css'
import App from './App.tsx'
import { applyPrimaryColor, getSavedPrimaryColor } from './lib/theme'

// Brand colour chosen in Configuración → Apariencia, before the first paint.
applyPrimaryColor(getSavedPrimaryColor())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
