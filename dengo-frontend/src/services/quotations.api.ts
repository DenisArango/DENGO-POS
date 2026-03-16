import { api } from './api'

export const quotationsApi = {
  list: (params?: { status?: string; customerId?: string }) => api.get('/api/quotations', { params }),
  getById: (id: string) => api.get(`/api/quotations/${id}`),
  create: (data: object) => api.post('/api/quotations', data),
  update: (id: string, data: object) => api.put(`/api/quotations/${id}`, data),
  send: (id: string) => api.put(`/api/quotations/${id}/send`),
  accept: (id: string) => api.put(`/api/quotations/${id}/accept`),
  reject: (id: string) => api.put(`/api/quotations/${id}/reject`),
  convert: (id: string, data: object) => api.post(`/api/quotations/${id}/convert`, data),
  remove: (id: string) => api.delete(`/api/quotations/${id}`),
}
