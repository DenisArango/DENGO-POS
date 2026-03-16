import { api } from './api'

export interface LoginResponse {
  token: string
  user: {
    id: string
    email: string
    name: string
    role: string
    branchId: string
  }
}

export const authApi = {
  login: (email: string, password: string) =>
    api.post<LoginResponse>('/api/auth/login', { email, password }),

  me: () => api.get('/api/auth/me'),

  logout: () => api.post('/api/auth/logout'),
}
