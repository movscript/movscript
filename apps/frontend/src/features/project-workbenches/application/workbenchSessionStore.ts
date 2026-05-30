import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'

import type { ProjectWorkbenchId } from '@/features/project-workbenches/domain/projectWorkbenchRegistry'

export const WORKBENCH_SESSION_STORAGE_KEY = 'movscript-workbench-session-v1'
export const WORKBENCH_SESSION_SCHEMA_VERSION = 1

export type WorkbenchSessionScalar = string | number | boolean | null
export type WorkbenchSessionId = ProjectWorkbenchId | 'scripts'

export interface WorkbenchSessionEntityRef {
  entityType: string
  entityId: number
}

export interface WorkbenchSessionSelection {
  primary?: WorkbenchSessionEntityRef
  secondary?: WorkbenchSessionEntityRef
  scopeLevel?: string
}

export interface WorkbenchSessionSnapshot {
  schemaVersion: typeof WORKBENCH_SESSION_SCHEMA_VERSION
  projectId: number
  workbenchId: WorkbenchSessionId
  route?: string
  search?: string
  updatedAt: string
  filters?: Record<string, WorkbenchSessionScalar>
  selection?: WorkbenchSessionSelection
}

interface WorkbenchSessionStore {
  snapshots: Record<string, WorkbenchSessionSnapshot>
  hydrated: boolean
  snapshotFor: (projectId: number | null | undefined, workbenchId: WorkbenchSessionId) => WorkbenchSessionSnapshot | null
  upsertSnapshot: (snapshot: Omit<WorkbenchSessionSnapshot, 'schemaVersion' | 'updatedAt'> & { updatedAt?: string }) => void
  clearSnapshot: (projectId: number | null | undefined, workbenchId: WorkbenchSessionId) => void
}

export function workbenchSessionKey(projectId: number | null | undefined, workbenchId: WorkbenchSessionId): string {
  return `${Number(projectId) || 0}:${workbenchId}`
}

export function hasExplicitWorkbenchSearchParam(searchParams: URLSearchParams, keys: string[]): boolean {
  return keys.some((key) => {
    const value = searchParams.get(key)
    return value !== null && value.trim() !== ''
  })
}

export function normalizeWorkbenchSessionSnapshots(input: unknown): Record<string, WorkbenchSessionSnapshot> {
  if (!input || typeof input !== 'object') return {}
  const output: Record<string, WorkbenchSessionSnapshot> = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const snapshot = normalizeWorkbenchSessionSnapshot(value)
    if (!snapshot) continue
    output[key] = snapshot
  }
  return output
}

const memoryWorkbenchSessionStorage: StateStorage = (() => {
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

function getWorkbenchSessionStorage(): StateStorage {
  return typeof localStorage === 'undefined' ? memoryWorkbenchSessionStorage : localStorage
}

function normalizeWorkbenchSessionSnapshot(input: unknown): WorkbenchSessionSnapshot | null {
  if (!input || typeof input !== 'object') return null
  const record = input as Partial<WorkbenchSessionSnapshot>
  const projectId = Number(record.projectId) || 0
  if (projectId <= 0 || typeof record.workbenchId !== 'string') return null
  return {
    schemaVersion: WORKBENCH_SESSION_SCHEMA_VERSION,
    projectId,
    workbenchId: record.workbenchId as WorkbenchSessionId,
    route: typeof record.route === 'string' ? record.route : undefined,
    search: typeof record.search === 'string' ? record.search : undefined,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date(0).toISOString(),
    filters: normalizeScalarRecord(record.filters),
    selection: normalizeWorkbenchSessionSelection(record.selection),
  }
}

function normalizeScalarRecord(input: unknown): Record<string, WorkbenchSessionScalar> | undefined {
  if (!input || typeof input !== 'object') return undefined
  const output: Record<string, WorkbenchSessionScalar> = {}
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

function normalizeWorkbenchSessionSelection(input: unknown): WorkbenchSessionSelection | undefined {
  if (!input || typeof input !== 'object') return undefined
  const record = input as Partial<WorkbenchSessionSelection>
  const selection: WorkbenchSessionSelection = {}
  const primary = normalizeWorkbenchSessionEntityRef(record.primary)
  const secondary = normalizeWorkbenchSessionEntityRef(record.secondary)
  if (primary) selection.primary = primary
  if (secondary) selection.secondary = secondary
  if (typeof record.scopeLevel === 'string' && record.scopeLevel.trim()) selection.scopeLevel = record.scopeLevel
  return Object.keys(selection).length > 0 ? selection : undefined
}

function normalizeWorkbenchSessionEntityRef(input: unknown): WorkbenchSessionEntityRef | undefined {
  if (!input || typeof input !== 'object') return undefined
  const record = input as Partial<WorkbenchSessionEntityRef>
  const entityId = Number(record.entityId) || 0
  if (entityId <= 0 || typeof record.entityType !== 'string' || !record.entityType.trim()) return undefined
  return { entityType: record.entityType, entityId }
}

export const useWorkbenchSessionStore = create<WorkbenchSessionStore>()(
  persist(
    (set, get) => ({
      snapshots: {},
      hydrated: false,
      snapshotFor: (projectId, workbenchId) => {
        const key = workbenchSessionKey(projectId, workbenchId)
        return get().snapshots[key] ?? null
      },
      upsertSnapshot: (snapshot) => {
        if (!snapshot.projectId) return
        const key = workbenchSessionKey(snapshot.projectId, snapshot.workbenchId)
        set((state) => ({
          snapshots: buildWorkbenchSessionSnapshots(state.snapshots, key, snapshot),
        }))
      },
      clearSnapshot: (projectId, workbenchId) => {
        const key = workbenchSessionKey(projectId, workbenchId)
        set((state) => {
          const next = { ...state.snapshots }
          delete next[key]
          return { snapshots: next }
        })
      },
    }),
    {
      name: WORKBENCH_SESSION_STORAGE_KEY,
      storage: createJSONStorage(getWorkbenchSessionStorage),
      partialize: (state) => ({ snapshots: state.snapshots }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<WorkbenchSessionStore> | undefined
        return {
          ...currentState,
          snapshots: normalizeWorkbenchSessionSnapshots(persisted?.snapshots),
          hydrated: true,
        }
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return
        state.snapshots = normalizeWorkbenchSessionSnapshots(state.snapshots)
        state.hydrated = true
      },
    },
  ),
)

function buildWorkbenchSessionSnapshots(
  snapshots: Record<string, WorkbenchSessionSnapshot>,
  key: string,
  snapshot: Omit<WorkbenchSessionSnapshot, 'schemaVersion' | 'updatedAt'> & { updatedAt?: string },
): Record<string, WorkbenchSessionSnapshot> {
  const existing = snapshots[key]
  return {
    ...snapshots,
    [key]: {
      ...existing,
      ...snapshot,
      schemaVersion: WORKBENCH_SESSION_SCHEMA_VERSION,
      updatedAt: snapshot.updatedAt ?? new Date().toISOString(),
      filters: {
        ...(existing?.filters ?? {}),
        ...(snapshot.filters ?? {}),
      },
      selection: snapshot.selection,
    },
  }
}
