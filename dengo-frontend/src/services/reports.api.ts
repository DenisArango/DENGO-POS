import { api } from './api'

export const reportsApi = {
  dashboard: (params?: { branchId?: string }) => api.get('/api/reports/dashboard', { params }),
  salesHistory: (params?: object) => api.get('/api/reports/sales-history', { params }),
  inventoryStatus: (params?: { branchId?: string }) => api.get('/api/reports/inventory-status', { params }),
  topProducts: () => api.get('/api/reports/top-products'),
  dailySales: (params?: { branchId?: string; from?: string; to?: string }) =>
    api.get('/api/reports/daily-sales', { params }),
  stockMovements: (params?: object) => api.get('/api/reports/stock-movements', { params }),
}

export const cashRegistersApi = {
  list: (params?: { branchId?: string; status?: string }) => api.get('/api/cash-registers', { params }),
  getCurrent: () => api.get('/api/cash-registers/current'),
  getById: (id: string) => api.get(`/api/cash-registers/${id}`),
  open: (data: { branchId: string; initialAmount: number }) => api.post('/api/cash-registers/open', data),
  close: (id: string, finalAmount: number) => api.post(`/api/cash-registers/${id}/close`, { finalAmount }),
  addMovement: (id: string, data: { type: 'INCOME' | 'EXPENSE'; amount: number; description: string }) =>
    api.post(`/api/cash-registers/${id}/movements`, data),
}
