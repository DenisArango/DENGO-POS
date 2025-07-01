import { useStore } from './useStore'

export const useStorePermissions = () => {
  const { currentStore } = useStore()
  
  const hasPermission = (permission: string): boolean => {
    if (!currentStore) return false
    
    // Lógica de permisos basada en la tienda
    if (permission === 'manage_all_stores' && currentStore.type !== 'main') {
      return false
    }
    
    // Verificar si la tienda está activa
    if (currentStore.status !== 'active') {
      const readOnlyPermissions = ['view_inventory', 'view_reports', 'view_sales']
      return readOnlyPermissions.includes(permission)
    }
    
    return true
  }
  
  const isMainStore = () => currentStore?.type === 'main'
  
  const isStoreActive = () => currentStore?.status === 'active'
  
  const canPerformSales = () => {
    return currentStore?.status === 'active' && hasPermission('create_sales')
  }
  
  const canManageInventory = () => {
    return currentStore?.status === 'active' && hasPermission('manage_inventory')
  }
  
  return { 
    hasPermission,
    isMainStore,
    isStoreActive,
    canPerformSales,
    canManageInventory
  }
}