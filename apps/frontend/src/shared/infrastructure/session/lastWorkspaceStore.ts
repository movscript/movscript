import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Project } from '@/types'

export interface LastWorkspaceSnapshot {
  projectId: number
  project?: Project
  route: string
  search: string
  updatedAt: string
}

interface LastWorkspaceStore {
  last: LastWorkspaceSnapshot | null
  rememberProjectRoute: (snapshot: Omit<LastWorkspaceSnapshot, 'updatedAt'>) => void
  clear: () => void
}

export const useLastWorkspaceStore = create<LastWorkspaceStore>()(
  persist(
    (set) => ({
      last: null,
      rememberProjectRoute: (snapshot) => set({
        last: {
          ...snapshot,
          updatedAt: new Date().toISOString(),
        },
      }),
      clear: () => set({ last: null }),
    }),
    {
      name: 'movscript-last-workspace',
      partialize: (state) => ({ last: state.last }),
    },
  ),
)
