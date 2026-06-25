import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import type { Project } from '@/types'
import { readBrowserStorageItem, removeBrowserStorageItem, writeBrowserStorageItem } from '@/shared/infrastructure/browserStorage'
import { createDesktopStateStorage } from '@/shared/infrastructure/desktopStateStorage'

export const LAST_WORKSPACE_STORAGE_KEY = 'movscript-last-workspace'

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

const memoryLastWorkspaceStorage: StateStorage = (() => {
  const values = new Map<string, string>()
  return {
    getItem: (name) => values.get(name) ?? null,
    setItem: (name, value) => {
      values.set(name, value)
    },
    removeItem: (name) => {
      values.delete(name)
    },
  }
})()

function getLastWorkspaceStorage(): StateStorage {
  const fallback: StateStorage = typeof window === 'undefined' ? memoryLastWorkspaceStorage : {
    getItem: (name) => readBrowserStorageItem('local', name),
    setItem: (name, value) => writeBrowserStorageItem('local', name, value),
    removeItem: (name) => removeBrowserStorageItem('local', name),
  }
  return createDesktopStateStorage(LAST_WORKSPACE_STORAGE_KEY, fallback)
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
      name: LAST_WORKSPACE_STORAGE_KEY,
      storage: createJSONStorage(getLastWorkspaceStorage),
      partialize: (state) => ({ last: state.last }),
    },
  ),
)
