import { api } from './api'

export const purchasesApi = {
  list: (params?: { status?: string; supplierId?: string }) => api.get('/api/purchases', { params }),
  getById: (id: string) => api.get(`/api/purchases/${id}`),
  create: (data: object) => api.post('/api/purchases', data),
  update: (id: string, data: object) => api.put(`/api/purchases/${id}`, data),
  receive: (id: string, receivedItems: { itemId: string; receivedQuantity: number }[]) =>
    api.post(`/api/purchases/${id}/receive`, { receivedItems }),
  cancel: (id: string) => api.put(`/api/purchases/${id}/cancel`),
  remove: (id: string) => api.delete(`/api/purchases/${id}`),
}

export const suppliersApi = {
  list: (params?: { isActive?: boolean }) => api.get('/api/suppliers', { params }),
  getById: (id: string) => api.get(`/api/suppliers/${id}`),
  create: (data: object) => api.post('/api/suppliers', data),
  update: (id: string, data: object) => api.put(`/api/suppliers/${id}`, data),
  remove: (id: string) => api.delete(`/api/suppliers/${id}`),
}
