import { api } from './api'

export const transfersApi = {
  list: (params?: { fromBranchId?: string; toBranchId?: string; status?: string }) =>
    api.get('/api/transfers', { params }),
  getById: (id: string) => api.get(`/api/transfers/${id}`),
  create: (data: object) => api.post('/api/transfers', data),
  approve: (id: string) => api.put(`/api/transfers/${id}/approve`),
  receive: (id: string) => api.put(`/api/transfers/${id}/receive`),
  reject: (id: string) => api.put(`/api/transfers/${id}/reject`),
}
