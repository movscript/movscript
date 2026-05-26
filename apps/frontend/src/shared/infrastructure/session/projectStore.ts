import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Project } from '@/types'

interface ProjectStore {
  current: Project | null
  hydrated: boolean
  setCurrent: (p: Project | null) => void
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set) => ({
      current: null,
      hydrated: false,
      setCurrent: (p) => set({ current: p })
    }),
    {
      name: 'movscript-project',
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true
      },
    }
  )
)
