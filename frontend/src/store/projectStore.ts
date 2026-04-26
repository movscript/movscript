import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Project } from '@/types'

interface ProjectStore {
  current: Project | null
  setCurrent: (p: Project | null) => void
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set) => ({
      current: null,
      setCurrent: (p) => set({ current: p })
    }),
    { name: 'movscript-project' }
  )
)
