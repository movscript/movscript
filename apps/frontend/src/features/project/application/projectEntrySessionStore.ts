import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'

import type { ProjectEntryId } from '@/features/project/domain/projectEntryRegistry'
import { readBrowserStorageItem, removeBrowserStorageItem, writeBrowserStorageItem } from '@/shared/infrastructure/browserStorage'
import { createDesktopStateStorage } from '@/shared/infrastructure/desktopStateStorage'

export const PROJECT_ENTRY_SESSION_STORAGE_KEY = 'movscript-workbench-session-v1'
export const PROJECT_ENTRY_SESSION_SCHEMA_VERSION = 1

export type ProjectEntrySessionScalar = string | number | boolean | null
export type ProjectEntrySessionId = ProjectEntryId | 'scripts'

export interface ProjectEntrySessionEntityRef {
  entityType: string
  entityId: number
}

export interface ProjectEntrySessionSelection {
  primary?: ProjectEntrySessionEntityRef
  secondary?: ProjectEntrySessionEntityRef
  scopeLevel?: string
}

export interface ProjectEntrySessionSnapshot {
  schemaVersion: typeof PROJECT_ENTRY_SESSION_SCHEMA_VERSION
  projectId: number
  projectEntryId: ProjectEntrySessionId
  deckOrder?: number
  open?: boolean
  route?: string
  search?: string
  updatedAt: string
  filters?: Record<string, ProjectEntrySessionScalar>
  selection?: ProjectEntrySessionSelection
}

interface ProjectEntrySessionStore {
  snapshots: Record<string, ProjectEntrySessionSnapshot>
  hydrated: boolean
  snapshotFor: (projectId: number | null | undefined, projectEntryId: ProjectEntrySessionId) => ProjectEntrySessionSnapshot | null
  upsertSnapshot: (snapshot: Omit<ProjectEntrySessionSnapshot, 'schemaVersion' | 'updatedAt'> & { updatedAt?: string }) => void
  setEntryDeckOrders: (projectId: number | null | undefined, orders: Array<{ projectEntryId: ProjectEntrySessionId; deckOrder: number }>) => void
  setEntryOpen: (projectId: number | null | undefined, projectEntryId: ProjectEntrySessionId, open: boolean) => void
  clearSnapshot: (projectId: number | null | undefined, projectEntryId: ProjectEntrySessionId) => void
}

export function projectEntrySessionKey(projectId: number | null | undefined, projectEntryId: ProjectEntrySessionId): string {
  return `${Number(projectId) || 0}:${projectEntryId}`
}

export function hasExplicitProjectEntrySearchParam(searchParams: URLSearchParams, keys: string[]): boolean {
  return keys.some((key) => {
    const value = searchParams.get(key)
    return value !== null && value.trim() !== ''
  })
}

export function normalizeProjectEntrySessionSnapshots(input: unknown): Record<string, ProjectEntrySessionSnapshot> {
  if (!input || typeof input !== 'object') return {}
  const output: Record<string, ProjectEntrySessionSnapshot> = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const snapshot = normalizeProjectEntrySessionSnapshot(value)
    if (!snapshot) continue
    output[key] = snapshot
  }
  return output
}

const memoryProjectEntrySessionStorage: StateStorage = (() => {
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

function getProjectEntrySessionStorage(): StateStorage {
  const fallback: StateStorage = typeof window === 'undefined' ? memoryProjectEntrySessionStorage : {
    getItem: (name) => readBrowserStorageItem('local', name),
    setItem: (name, value) => writeBrowserStorageItem('local', name, value),
    removeItem: (name) => removeBrowserStorageItem('local', name),
  }
  return createDesktopStateStorage(PROJECT_ENTRY_SESSION_STORAGE_KEY, fallback)
}

function normalizeProjectEntrySessionSnapshot(input: unknown): ProjectEntrySessionSnapshot | null {
  if (!input || typeof input !== 'object') return null
  const record = input as Partial<ProjectEntrySessionSnapshot>
  const projectId = Number(record.projectId) || 0
  const projectEntryId = typeof record.projectEntryId === 'string'
    ? record.projectEntryId
    : legacyWorkbenchId(record)
  if (projectId <= 0 || !projectEntryId) return null
  return {
    schemaVersion: PROJECT_ENTRY_SESSION_SCHEMA_VERSION,
    projectId,
    projectEntryId: projectEntryId as ProjectEntrySessionId,
    deckOrder: normalizeProjectEntrySessionDeckOrder(record.deckOrder),
    open: typeof record.open === 'boolean' ? record.open : undefined,
    route: typeof record.route === 'string' ? record.route : undefined,
    search: typeof record.search === 'string' ? record.search : undefined,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date(0).toISOString(),
    filters: normalizeScalarRecord(record.filters),
    selection: normalizeProjectEntrySessionSelection(record.selection),
  }
}

function legacyWorkbenchId(record: Partial<ProjectEntrySessionSnapshot>): string | undefined {
  const value = (record as Partial<ProjectEntrySessionSnapshot> & { workbenchId?: unknown }).workbenchId
  if (value === 'content_orchestration') return 'content'
  return typeof value === 'string' && value.trim() ? value : undefined
}

function normalizeScalarRecord(input: unknown): Record<string, ProjectEntrySessionScalar> | undefined {
  if (!input || typeof input !== 'object') return undefined
  const output: Record<string, ProjectEntrySessionScalar> = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (
      value === null
      || typeof value === 'string'
      || typeof value === 'number'
      || typeof value === 'boolean'
    ) {
      output[key] = value
    }
  }
  return Object.keys(output).length > 0 ? output : undefined
}

function normalizeProjectEntrySessionSelection(input: unknown): ProjectEntrySessionSelection | undefined {
  if (!input || typeof input !== 'object') return undefined
  const record = input as Partial<ProjectEntrySessionSelection>
  const selection: ProjectEntrySessionSelection = {}
  const primary = normalizeProjectEntrySessionEntityRef(record.primary)
  const secondary = normalizeProjectEntrySessionEntityRef(record.secondary)
  if (primary) selection.primary = primary
  if (secondary) selection.secondary = secondary
  if (typeof record.scopeLevel === 'string' && record.scopeLevel.trim()) selection.scopeLevel = record.scopeLevel
  return Object.keys(selection).length > 0 ? selection : undefined
}

function normalizeProjectEntrySessionEntityRef(input: unknown): ProjectEntrySessionEntityRef | undefined {
  if (!input || typeof input !== 'object') return undefined
  const record = input as Partial<ProjectEntrySessionEntityRef>
  const entityId = Number(record.entityId) || 0
  if (entityId <= 0 || typeof record.entityType !== 'string' || !record.entityType.trim()) return undefined
  return { entityType: record.entityType, entityId }
}

export const useProjectEntrySessionStore = create<ProjectEntrySessionStore>()(
  persist(
    (set, get) => ({
      snapshots: {},
      hydrated: false,
      snapshotFor: (projectId, projectEntryId) => {
        const key = projectEntrySessionKey(projectId, projectEntryId)
        return get().snapshots[key] ?? null
      },
      upsertSnapshot: (snapshot) => {
        if (!snapshot.projectId) return
        const key = projectEntrySessionKey(snapshot.projectId, snapshot.projectEntryId)
        set((state) => ({
          snapshots: buildProjectEntrySessionSnapshots(state.snapshots, key, snapshot),
        }))
      },
      setEntryDeckOrders: (projectId, orders) => {
        const normalizedProjectId = Number(projectId) || 0
        if (normalizedProjectId <= 0 || orders.length === 0) return
        set((state) => {
          let snapshots = state.snapshots
          for (const order of orders) {
            const deckOrder = normalizeProjectEntrySessionDeckOrder(order.deckOrder)
            if (deckOrder === undefined) continue
            const key = projectEntrySessionKey(normalizedProjectId, order.projectEntryId)
            snapshots = buildProjectEntrySessionSnapshots(snapshots, key, {
              projectId: normalizedProjectId,
              projectEntryId: order.projectEntryId,
              deckOrder,
            })
          }
          return { snapshots }
        })
      },
      setEntryOpen: (projectId, projectEntryId, open) => {
        const normalizedProjectId = Number(projectId) || 0
        if (normalizedProjectId <= 0) return
        const key = projectEntrySessionKey(normalizedProjectId, projectEntryId)
        set((state) => ({
          snapshots: buildProjectEntrySessionSnapshots(state.snapshots, key, {
            projectId: normalizedProjectId,
            projectEntryId,
            open,
          }),
        }))
      },
      clearSnapshot: (projectId, projectEntryId) => {
        const key = projectEntrySessionKey(projectId, projectEntryId)
        set((state) => {
          const next = { ...state.snapshots }
          delete next[key]
          return { snapshots: next }
        })
      },
    }),
    {
      name: PROJECT_ENTRY_SESSION_STORAGE_KEY,
      storage: createJSONStorage(getProjectEntrySessionStorage),
      partialize: (state) => ({ snapshots: state.snapshots }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<ProjectEntrySessionStore> | undefined
        return {
          ...currentState,
          snapshots: normalizeProjectEntrySessionSnapshots(persisted?.snapshots),
          hydrated: true,
        }
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return
        state.snapshots = normalizeProjectEntrySessionSnapshots(state.snapshots)
        state.hydrated = true
      },
    },
  ),
)

function buildProjectEntrySessionSnapshots(
  snapshots: Record<string, ProjectEntrySessionSnapshot>,
  key: string,
  snapshot: Omit<ProjectEntrySessionSnapshot, 'schemaVersion' | 'updatedAt'> & { updatedAt?: string },
): Record<string, ProjectEntrySessionSnapshot> {
  const existing = snapshots[key]
  const hasSelection = Object.prototype.hasOwnProperty.call(snapshot, 'selection')
  return {
    ...snapshots,
    [key]: {
      ...existing,
      ...snapshot,
      schemaVersion: PROJECT_ENTRY_SESSION_SCHEMA_VERSION,
      updatedAt: snapshot.updatedAt ?? new Date().toISOString(),
      filters: {
        ...(existing?.filters ?? {}),
        ...(snapshot.filters ?? {}),
      },
      selection: hasSelection ? snapshot.selection : existing?.selection,
    },
  }
}

function normalizeProjectEntrySessionDeckOrder(value: unknown): number | undefined {
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : undefined
}
