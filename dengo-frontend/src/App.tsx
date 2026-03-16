import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { Toaster } from 'sonner'
import Router from './router'
import { StoreProvider } from './contexts/StoreContext'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minuto
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

function App() {
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