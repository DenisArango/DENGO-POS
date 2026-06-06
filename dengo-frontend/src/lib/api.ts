// Central API client — reads JWT from localStorage, handles 401 globally

const BASE_URL = import.meta.env.VITE_API_URL as string

function getToken(): string | null {
  try {
    const raw = localStorage.getItem('auth-storage')
    if (!raw) return null
    return JSON.parse(raw)?.state?.token ?? null
  } catch {
    return null
  }
}

async function apiFetch<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401) {
    localStorage.removeItem('auth-storage')
    window.location.href = '/login'
    throw new Error('No autorizado')
  }

  let data: unknown
  try { data = await res.json() } catch { data = {} }

  if (!res.ok) {
    const msg = (data as Record<string, string>)?.error ?? `Error ${res.status}`
    throw new Error(msg)
  }

  return data as T
}

export const api = {
  get:    <T = unknown>(path: string)                  => apiFetch<T>('GET',    path),
  post:   <T = unknown>(path: string, body: unknown)   => apiFetch<T>('POST',   path, body),
  put:    <T = unknown>(path: string, body: unknown)   => apiFetch<T>('PUT',    path, body),
  patch:  <T = unknown>(path: string, body: unknown)   => apiFetch<T>('PATCH',  path, body),
  delete: <T = unknown>(path: string, body?: unknown)   => apiFetch<T>('DELETE', path, body),
}
