import { api } from './api'

export const inventoryApi = {
  list: (params?: { branchId?: string }) => api.get('/api/inventory', { params }),

  movements: (params?: { branchId?: string; productId?: string; from?: string; to?: string; type?: string }) =>
    api.get('/api/inventory/movements', { params }),

  getStock: (productId: string, branchId: string) =>
    api.get(`/api/inventory/${productId}/${branchId}`),

  setStock: (productId: string, branchId: string, data: { quantity: number; reason?: string }) =>
    api.put(`/api/inventory/${productId}/${branchId}`, data),

  addMovement: (data: object) => api.post('/api/inventory/movements', data),
}
