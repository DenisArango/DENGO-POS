import { useStore } from './useStore'

export const useStoreConfig = () => {
  const { currentStore } = useStore()
  
  return {
    currency: currentStore?.config?.currency || 'GTQ',
    currencySymbol: currentStore?.config?.currency === 'GTQ' ? 'Q' : '$',
    timezone: currentStore?.config?.timezone || 'America/Guatemala',
    taxRate: currentStore?.config?.taxRate || 12,
    printerEnabled: currentStore?.config?.printerEnabled || false,
    formatCurrency: (amount: number) => {
      const symbol = currentStore?.config?.currency === 'GTQ' ? 'Q' : '$'
      return `${symbol}${amount.toFixed(2)}`
    },
    formatTax: (amount: number) => {
      const taxRate = currentStore?.config?.taxRate || 12
      const taxAmount = (amount * taxRate) / 100
      return taxAmount.toFixed(2)
    },
    calculateWithTax: (amount: number) => {
      const taxRate = currentStore?.config?.taxRate || 12
      return amount + (amount * taxRate) / 100
    }
  }
}