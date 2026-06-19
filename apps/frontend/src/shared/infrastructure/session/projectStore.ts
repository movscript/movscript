import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import type { Project } from '@/types'
import { projectAppEventScope, publishAppEvent } from '@/shared/application/appEvents'
import { readBrowserStorageItem, removeBrowserStorageItem, writeBrowserStorageItem } from '@/shared/infrastructure/browserStorage'
import { createDesktopStateStorage } from '@/shared/infrastructure/desktopStateStorage'

export type ProjectSessionSyncStatus = 'idle' | 'syncing' | 'dirty' | 'conflict' | 'error'
export const PROJECT_SESSION_STORAGE_KEY = 'movscript-project'

const memoryProjectStorage: StateStorage = (() => {
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

function getProjectStorage(): StateStorage {
  const fallback: StateStorage = typeof window === 'undefined' ? memoryProjectStorage : {
    getItem: (name) => readBrowserStorageItem('local', name),
    setItem: (name, value) => writeBrowserStorageItem('local', name, value),
    removeItem: (name) => removeBrowserStorageItem('local', name),
  }
  return createDesktopStateStorage(PROJECT_SESSION_STORAGE_KEY, fallback)
}

interface ProjectStore {
  current: Project | null
  currentProjectId: number | null
  workspaceRoot: string | null
  lastRoute: string | null
  syncStatus: ProjectSessionSyncStatus
  dirtyScopes: string[]
  hydrated: boolean
  setCurrent: (p: Project | null) => void
  setWorkspaceRoot: (root: string | null) => void
  setLastRoute: (route: string | null) => void
  setSyncStatus: (status: ProjectSessionSyncStatus) => void
  markDirtyScope: (scope: string) => void
  clearDirtyScope: (scope: string) => void
  clearDirtyScopes: () => void
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set, get) => ({
      current: null,
      currentProjectId: null,
      workspaceRoot: null,
      lastRoute: null,
      syncStatus: 'idle',
      dirtyScopes: [],
      hydrated: false,
      setCurrent: (p) => {
        set({
          current: p,
          currentProjectId: p?.ID ?? null,
          syncStatus: p ? get().syncStatus : 'idle',
          dirtyScopes: p ? get().dirtyScopes : [],
        })
        publishProjectSessionChanged({ current: p, currentProjectId: p?.ID ?? null })
      },
      setWorkspaceRoot: (root) => {
        const workspaceRoot = root?.trim() || null
        set({ workspaceRoot })
        publishProjectSessionChanged({ workspaceRoot })
      },
      setLastRoute: (route) => {
        const lastRoute = route?.trim() || null
        set({ lastRoute })
        publishProjectSessionChanged({ lastRoute })
      },
      setSyncStatus: (syncStatus) => {
        set({ syncStatus })
        publishProjectSessionChanged({ syncStatus })
      },
      markDirtyScope: (scope) => {
        const trimmed = scope.trim()
        if (!trimmed) return
        set((state) => ({
          dirtyScopes: state.dirtyScopes.includes(trimmed) ? state.dirtyScopes : [...state.dirtyScopes, trimmed],
          syncStatus: 'dirty',
        }))
        publishProjectSessionChanged({ dirtyScope: trimmed, syncStatus: 'dirty' })
      },
      clearDirtyScope: (scope) => {
        const trimmed = scope.trim()
        if (!trimmed) return
        set((state) => {
          const dirtyScopes = state.dirtyScopes.filter((candidate) => candidate !== trimmed)
          return {
            dirtyScopes,
            syncStatus: dirtyScopes.length > 0 ? state.syncStatus : 'idle',
          }
        })
        publishProjectSessionChanged({ clearedDirtyScope: trimmed })
      },
      clearDirtyScopes: () => {
        set({ dirtyScopes: [], syncStatus: 'idle' })
        publishProjectSessionChanged({ dirtyScopes: [], syncStatus: 'idle' })
      },
    }),
    {
      name: PROJECT_SESSION_STORAGE_KEY,
      storage: createJSONStorage(getProjectStorage),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<ProjectStore> | undefined
        const current = persisted?.current ?? null
        return {
          ...currentState,
          ...persisted,
          current,
          currentProjectId: current?.ID ?? persisted?.currentProjectId ?? null,
          workspaceRoot: persisted?.workspaceRoot ?? null,
          lastRoute: persisted?.lastRoute ?? null,
          syncStatus: persisted?.syncStatus ?? 'idle',
          dirtyScopes: Array.isArray(persisted?.dirtyScopes) ? persisted.dirtyScopes.filter((scope): scope is string => typeof scope === 'string') : [],
          hydrated: true,
        }
      },
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true
      },
    }
  )
)

function publishProjectSessionChanged(payload: Record<string, unknown>): void {
  const projectId = typeof payload.currentProjectId === 'number'
    ? payload.currentProjectId
    : useProjectStore.getState().currentProjectId
  publishAppEvent({
    topic: 'project.session.changed',
    scope: projectAppEventScope(projectId),
    source: 'project-session-store',
    payload: {
      area: 'project-session',
      projectId,
      ...payload,
    },
  })
}
