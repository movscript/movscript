import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/types'

interface UserStore {
  currentUser: User | null
  token: string | null
  tokenExpiresAt: string | null
  setSession: (session: AuthSession | null) => void
  setCurrentUser: (u: User | null) => void
}

export interface AuthSession {
  user: User
  token: string
  expires_at: string
}

export const useUserStore = create<UserStore>()(
  persist(
    (set) => ({
      currentUser: null,
      token: null,
      tokenExpiresAt: null,
      setSession: (session) => set({
        currentUser: session?.user ?? null,
        token: session?.token ?? null,
        tokenExpiresAt: session?.expires_at ?? null,
      }),
      setCurrentUser: (u) => set((state) => ({
        currentUser: u,
        token: u ? state.token : null,
        tokenExpiresAt: u ? state.tokenExpiresAt : null,
      })),
    }),
    {
      name: 'movscript-user',
    }
  )
)
