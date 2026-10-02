import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

// Without this, ANY uncaught error while rendering ANY screen unmounts the
// entire React tree, leaving a pure blank white page with no message — not
// for the person using it, and not for whoever has to diagnose it after the
// fact (this is the root cause behind "se queda en blanco toda la pantalla"
// reports with no further detail to go on). This catches that error, shows
// a plain-language message with a reload button, and keeps the real error
// text on screen (behind "Detalle técnico") so it can be photographed and
// sent back instead of the incident being an unreproducible mystery.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary atrapó un error:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: 'system-ui, sans-serif', background: '#f9fafb' }}>
          <div style={{ maxWidth: '480px', textAlign: 'center' }}>
            <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>
              Ocurrió un error inesperado
            </h1>
            <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '16px', lineHeight: 1.5 }}>
              Intenta recargar la página. Si esto vuelve a pasar, toma una foto de este mensaje (incluyendo el detalle técnico de abajo) y compártela con soporte — ayuda mucho a encontrar la causa exacta.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{ background: '#4f46e5', color: 'white', padding: '10px 20px', borderRadius: '8px', border: 'none', fontSize: '14px', fontWeight: 600, cursor: 'pointer', marginBottom: '16px' }}
            >
              Recargar página
            </button>
            <details style={{ textAlign: 'left', fontSize: '12px', color: '#9ca3af', marginTop: '12px' }}>
              <summary style={{ cursor: 'pointer' }}>Detalle técnico</summary>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: '8px' }}>
                {this.state.error.message}
                {'\n'}
                {this.state.error.stack}
              </pre>
            </details>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
