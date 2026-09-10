import type {
  PortalConfig, TeacherUser, Program, Product, Category, PortalOrder, ProgramOption, PortalMessage,
} from '../types'

const BASE = '/api/portal'

function getToken(): string | null {
  try {
    const s = localStorage.getItem('portal-auth')
    if (!s) return null
    return JSON.parse(s).state?.token ?? null
  } catch { return null }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Error de red' }))
    throw new Error(typeof err.error === 'string' ? err.error : `HTTP ${res.status}`)
  }
  return res.json()
}

export interface ProductsResponse {
  data: Product[]
  total: number
  page: number
  limit: number
}

export interface GradeRow {
  gradeName: string
  studentCount: number
}

export interface CreateOrderBody {
  schoolId: string
  educationalLevel?: string
  programType: string
  grades: GradeRow[]
  notes?: string
  items: Array<{ productId: string; quantity: number; unitPrice: number; notes?: string }>
}

export const api = {
  getConfig: () => request<PortalConfig>('/config'),
  login: (email: string, password: string) =>
    request<{ token: string; user: TeacherUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  getMe: () => request<TeacherUser & { programs: Program[] }>('/me'),
  getPrograms: () => request<Program[]>('/programs'),
  getProgramOptions: (programType?: string, level?: string) => {
    const params = new URLSearchParams()
    if (programType) params.set('programType', programType)
    if (level) params.set('level', level)
    const qs = params.toString()
    return request<ProgramOption[]>(`/programs/options${qs ? `?${qs}` : ''}`)
  },
  getProducts: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString()
    return request<ProductsResponse>(`/products?${qs}`)
  },
  getCategories: (programType?: string) => {
    const qs = programType ? `?programType=${encodeURIComponent(programType)}` : ''
    return request<Category[]>(`/categories${qs}`)
  },
  createOrder: (body: CreateOrderBody) =>
    request<PortalOrder>('/orders', { method: 'POST', body: JSON.stringify(body) }),
  getOrders: () => request<PortalOrder[]>('/orders'),
  getOrder: (id: string) => request<PortalOrder>(`/orders/${id}`),
  // Messages — single thread per teacher (not tied to a specific order)
  getMessages: () => request<{ data: PortalMessage[] }>('/messages'),
  getUnreadMessages: () => request<{ count: number }>('/messages/unread'),
  sendMessage: (body: string, portalOrderId?: string) =>
    request<PortalMessage>('/messages', {
      method: 'POST',
      body: JSON.stringify({ body, ...(portalOrderId ? { portalOrderId } : {}) }),
    }),
}
