import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import Router from './router'

export default function App() {
  return (
    <BrowserRouter>
      <Router />
      <Toaster position="top-right" richColors closeButton duration={3000} />
    </BrowserRouter>
  )
}
