import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/types'

interface UserStore {
  currentUser: User | null
  setCurrentUser: (u: User | null) => void
}

function syncUserId(user: User | null) {
  // Only available in Electron (not plain browser).
  const api = (window as { api?: { setUserId?: (id: string) => void } }).api
  api?.setUserId?.(user ? String(user.ID) : '')
}

export const useUserStore = create<UserStore>()(
  persist(
    (set) => ({
      currentUser: null,
      setCurrentUser: (u) => {
        set({ currentUser: u })
        syncUserId(u)
      },
    }),
    {
      name: 'movscript-user',
      onRehydrateStorage: () => (state) => {
        if (state?.currentUser) syncUserId(state.currentUser)
      },
    }
  )
)
