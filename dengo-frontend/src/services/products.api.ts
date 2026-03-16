import { api } from './api'

export const productsApi = {
  list: (params?: { search?: string; categoryId?: string; isActive?: boolean }) =>
    api.get('/api/products', { params }),

  getById: (id: string) => api.get(`/api/products/${id}`),

  getByBarcode: (code: string) => api.get(`/api/products/barcode/${encodeURIComponent(code)}`),

  create: (data: object) => api.post('/api/products', data),

  update: (id: string, data: object) => api.put(`/api/products/${id}`, data),

  remove: (id: string) => api.delete(`/api/products/${id}`),
}

export const categoriesApi = {
  list: () => api.get('/api/categories'),
  create: (data: object) => api.post('/api/categories', data),
  update: (id: string, data: object) => api.put(`/api/categories/${id}`, data),
  remove: (id: string) => api.delete(`/api/categories/${id}`),
}
