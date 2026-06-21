import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import type { Project } from '@/types'
import { readBrowserStorageItem, removeBrowserStorageItem, writeBrowserStorageItem } from '@/shared/infrastructure/browserStorage'
import { createDesktopStateStorage } from '@/shared/infrastructure/desktopStateStorage'

export const LOCAL_PROJECT_RECENTS_STORAGE_KEY = 'movscript-local-project-recents'
const MAX_LOCAL_PROJECT_RECENTS = 20

interface LocalProjectRecentsStore {
  projects: Project[]
  dismissedKeys: string[]
  remember: (project: Project) => void
  remove: (projectDir: string) => void
  dismiss: (project: Project) => void
  clear: () => void
}

const memoryLocalProjectRecentsStorage: StateStorage = (() => {
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

function getLocalProjectRecentsStorage(): StateStorage {
  const fallback: StateStorage = typeof window === 'undefined' ? memoryLocalProjectRecentsStorage : {
    getItem: (name) => readBrowserStorageItem('local', name),
    setItem: (name, value) => writeBrowserStorageItem('local', name, value),
    removeItem: (name) => removeBrowserStorageItem('local', name),
  }
  return createDesktopStateStorage(LOCAL_PROJECT_RECENTS_STORAGE_KEY, fallback)
}

export const useLocalProjectRecentsStore = create<LocalProjectRecentsStore>()(
  persist(
    (set) => ({
      projects: [],
      dismissedKeys: [],
      remember: (project) => {
        const projectDir = projectDirForProject(project)
        if (!projectDir) return
        const key = projectKey(project)
        const now = new Date().toISOString()
        const localProject: Project = {
          ...project,
          workspace_path: projectDir,
          project_path: projectDir,
          local: true,
          UpdatedAt: now,
          CreatedAt: project.CreatedAt || now,
        }
        set((state) => ({
          projects: [
            localProject,
            ...state.projects.filter((candidate) => projectDirForProject(candidate) !== projectDir),
          ].slice(0, MAX_LOCAL_PROJECT_RECENTS),
          dismissedKeys: key ? state.dismissedKeys.filter((candidate) => candidate !== key) : state.dismissedKeys,
        }))
      },
      remove: (projectDir) => {
        const normalized = projectDir.trim()
        if (!normalized) return
        const key = `path:${normalized}`
        set((state) => ({
          projects: state.projects.filter((project) => projectDirForProject(project) !== normalized),
          dismissedKeys: state.dismissedKeys.includes(key) ? state.dismissedKeys : [...state.dismissedKeys, key],
        }))
      },
      dismiss: (project) => {
        const key = projectKey(project)
        if (!key) return
        set((state) => ({
          projects: state.projects.filter((candidate) => projectKey(candidate) !== key),
          dismissedKeys: state.dismissedKeys.includes(key) ? state.dismissedKeys : [...state.dismissedKeys, key],
        }))
      },
      clear: () => set({ projects: [], dismissedKeys: [] }),
    }),
    {
      name: LOCAL_PROJECT_RECENTS_STORAGE_KEY,
      storage: createJSONStorage(getLocalProjectRecentsStorage),
      partialize: (state) => ({ projects: state.projects, dismissedKeys: state.dismissedKeys }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<LocalProjectRecentsStore> | undefined
        return {
          ...currentState,
          projects: Array.isArray(persisted?.projects)
            ? persisted.projects.filter(isPersistableLocalProject)
            : [],
          dismissedKeys: Array.isArray(persisted?.dismissedKeys)
            ? persisted.dismissedKeys.filter((key): key is string => typeof key === 'string' && key.trim().length > 0)
            : [],
        }
      },
    },
  ),
)

export function rememberLocalProject(project: Project): void {
  useLocalProjectRecentsStore.getState().remember(project)
}

export function rememberTouchedLocalProject(input: {
  projectDir: string
  name?: string
  description?: string
  projectUid?: string
  updatedAt?: string
}): void {
  const projectDir = input.projectDir.trim()
  if (!projectDir) return
  const now = new Date().toISOString()
  rememberLocalProject({
    ID: -stablePositiveHash(projectDir),
    name: input.name?.trim() || projectDir.split(/[\\/]/).filter(Boolean).pop() || 'Local Project',
    description: input.description?.trim() || projectDir,
    owner_id: 0,
    ...(input.projectUid?.trim() ? { project_uid: input.projectUid.trim() } : {}),
    workspace_path: projectDir,
    project_path: projectDir,
    local: true,
    CreatedAt: input.updatedAt || now,
    UpdatedAt: input.updatedAt || now,
  })
}

export function removeLocalProjectRecent(projectDir: string): void {
  useLocalProjectRecentsStore.getState().remove(projectDir)
}

export function dismissRecentProject(project: Project): void {
  useLocalProjectRecentsStore.getState().dismiss(project)
}

export function mergeRecentProjects(primaryProjects: Project[], localProjects: Project[], dismissedKeys: string[] = []): Project[] {
  const dismissed = new Set(dismissedKeys)
  const merged = new Map<string, Project>()
  const positiveIds = new Set<number>()
  for (const project of [...localProjects, ...primaryProjects]) {
    const key = projectKey(project)
    if (project.ID > 0 && positiveIds.has(project.ID)) continue
    if (!key || dismissed.has(key) || merged.has(key)) continue
    merged.set(key, project)
    if (project.ID > 0) positiveIds.add(project.ID)
  }
  return sortRecentProjects([...merged.values()])
}

export function sortRecentProjects(projects: Project[]): Project[] {
  return [...projects].sort((left, right) => timestampForProject(right) - timestampForProject(left))
}

export function isLocalProjectEntry(project: Project): boolean {
  return project.local === true || project.ID < 0
}

function isPersistableLocalProject(value: unknown): value is Project {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const project = value as Partial<Project>
  return typeof project.ID === 'number'
    && project.ID !== 0
    && typeof project.name === 'string'
    && Boolean(projectDirForProject(project as Project))
}

export function recentProjectKey(project: Project): string | undefined {
  return projectKey(project)
}

function projectKey(project: Project): string | undefined {
  const projectDir = projectDirForProject(project)
  if (projectDir) return `path:${projectDir}`
  return project.ID ? `id:${project.ID}` : undefined
}

function projectDirForProject(project: Project): string | undefined {
  return (project.workspace_path || project.project_path)?.trim() || undefined
}

function timestampForProject(project: Project): number {
  const timestamp = Date.parse(project.UpdatedAt || project.CreatedAt)
  return Number.isFinite(timestamp) ? timestamp : 0
}

function stablePositiveHash(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) || 1
}
