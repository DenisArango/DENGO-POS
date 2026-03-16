import { useContext } from 'react'
import { StoreContext } from '../contexts/StoreContext'

export const useStore = () => {
  const context = useContext(StoreContext)
  if (!context) {
    throw new Error('useStore debe ser usado dentro de StoreProvider')
  }
  return context
}