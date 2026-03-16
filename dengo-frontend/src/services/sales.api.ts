import { api } from './api'

export const salesApi = {
  list: (params?: { branchId?: string; from?: string; to?: string; paymentMethod?: string; saleType?: string; search?: string }) =>
    api.get('/api/sales', { params }),

  getById: (id: string) => api.get(`/api/sales/${id}`),

  create: (data: object) => api.post('/api/sales', data),

  update: (id: string, data: object) => api.put(`/api/sales/${id}`, data),

  void: (id: string) => api.delete(`/api/sales/${id}`),
}

export const customersApi = {
  list: (params?: { search?: string }) => api.get('/api/customers', { params }),
  getById: (id: string) => api.get(`/api/customers/${id}`),
  create: (data: object) => api.post('/api/customers', data),
  update: (id: string, data: object) => api.put(`/api/customers/${id}`, data),
  remove: (id: string) => api.delete(`/api/customers/${id}`),
}
