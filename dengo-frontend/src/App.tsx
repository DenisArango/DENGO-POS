import { useEffect } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { Toaster, toast } from 'sonner'
import Router from './router'
import { StoreProvider } from './contexts/StoreContext'
import { CONNECTIVITY_ERROR_MESSAGE } from './lib/api'

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

function App() {
  useDisableNumberInputScroll()
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