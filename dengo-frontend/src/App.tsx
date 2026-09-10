import { useEffect } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { Toaster, toast } from 'sonner'
import Router from './router'
import { StoreProvider } from './contexts/StoreContext'
import { CONNECTIVITY_ERROR_MESSAGE, api } from './lib/api'
import { useLicenseStore } from './store'

// Dozens of call sites across the app do `.catch(e => toast.error(e.message))`
// with no knowledge of each other — a moment offline can fail several
// requests at once, each showing its own "Sin conexión" toast unless
// something dedupes them. lib/api.ts already normalizes every network
// failure and 5xx to this exact message; overriding toast.error here (once,
// at module load — `toast` is a shared singleton, so this patches every
// caller regardless of which file imports it) reuses sonner's own `id`
// dedup instead of stacking one toast per failed request. Any other message
// (a genuine 4xx business error) passes through unchanged.
const originalToastError = toast.error
toast.error = ((message: Parameters<typeof toast.error>[0], data?: Parameters<typeof toast.error>[1]) => {
  if (message === CONNECTIVITY_ERROR_MESSAGE) {
    return originalToastError(message, { ...data, id: 'connectivity-error' })
  }
  return originalToastError(message, data)
}) as typeof toast.error

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minuto
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

// Chrome/Edge change a focused <input type="number">'s value when the user
// scrolls over it instead of scrolling the page — surprising and easy to
// trigger by accident. Blurring it on wheel makes the scroll act on the page
// like every other input, app-wide, without touching each individual field.
function useDisableNumberInputScroll() {
  useEffect(() => {
    const handler = () => {
      const el = document.activeElement
      if (el instanceof HTMLInputElement && el.type === 'number') el.blur()
    }
    document.addEventListener('wheel', handler, { passive: true })
    return () => document.removeEventListener('wheel', handler)
  }, [])
}

// GET /api/license is public and cheap — fetched once per app load (not
// per-login, since a logged-out visitor on the login screen should also
// never see a licensed-off module flash into view before this resolves).
// Deliberately fire-and-forget: a failure here just leaves the store's
// fail-open defaults (everything enabled) in place, same as the backend's
// own DEFAULT_LICENSE fallback when no LicenseConfig row exists yet.
function useLicense() {
  useEffect(() => {
    api.get<{ posEnabled: boolean; maestrosEnabled: boolean; pageEnabled: boolean }>('/api/license')
      .then(license => useLicenseStore.getState().setLicense(license))
      .catch(() => {})
  }, [])
}

function App() {
  useDisableNumberInputScroll()
  useLicense()
  return (
    <StoreProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Router />
          <Toaster 
            position="top-right"
            richColors
            closeButton
            expand={false}
            duration={3000}
          />
        </BrowserRouter>
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </StoreProvider>
  )
}

export default App