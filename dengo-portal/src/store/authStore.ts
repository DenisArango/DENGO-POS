import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { TeacherUser } from '../types'

interface AuthState {
  user: TeacherUser | null
  token: string | null
  isAuthenticated: boolean
  login: (user: TeacherUser, token: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      login: (user, token) => set({ user, token, isAuthenticated: true }),
      logout: () => set({ user: null, token: null, isAuthenticated: false }),
    }),
    { name: 'portal-auth', storage: createJSONStorage(() => localStorage) }
  )
)
