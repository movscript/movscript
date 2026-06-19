import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import type { CanvasPortValue, CanvasRunStatus, CanvasTaskStatus, RawResource } from '@/types'
import { readBrowserStorageItem, removeBrowserStorageItem, writeBrowserStorageItem } from '@/shared/infrastructure/browserStorage'
import { createDesktopStateStorage } from '@/shared/infrastructure/desktopStateStorage'

export interface CanvasRuntimeTask {
  id: string
  runId: string
  canvasId: string
  nodeId: string
  nodeType?: string
  nodeLabel?: string
  status: Exclude<CanvasTaskStatus, 'idle'>
  inputValues: Record<string, CanvasPortValue[]>
  outputValues: Record<string, CanvasPortValue>
  resourceId?: number
  resource?: RawResource
  jobId?: number
  error?: string
  startedAt: string
  finishedAt?: string
}

export interface CanvasRuntimeRun {
  id: string
  canvasId: string
  status: CanvasRunStatus
  nodeIds: string[]
  tasks: Record<string, CanvasRuntimeTask>
  outputValues: Record<string, CanvasPortValue>
  startedAt: string
  finishedAt?: string
  error?: string
  snapshotNodeCount: number
  snapshotEdgeCount: number
}

interface CanvasRuntimeStore {
  runsByCanvasId: Record<string, CanvasRuntimeRun[]>
  startRun: (input: { canvasId: string; nodeIds: string[]; snapshotNodeCount: number; snapshotEdgeCount: number }) => CanvasRuntimeRun
  startTask: (input: Omit<CanvasRuntimeTask, 'id' | 'status' | 'outputValues' | 'startedAt'> & { id?: string }) => CanvasRuntimeTask
  completeTask: (canvasId: string, runId: string, nodeId: string, patch: Pick<CanvasRuntimeTask, 'outputValues'> & Partial<CanvasRuntimeTask>) => void
  failTask: (canvasId: string, runId: string, nodeId: string, error: string) => void
  finishRun: (canvasId: string, runId: string, status: CanvasRunStatus, outputValues?: Record<string, CanvasPortValue>, error?: string) => void
  clearCanvasRuns: (canvasId: string) => void
}

export const CANVAS_RUNTIME_STORAGE_KEY = 'movscript.canvasRuntime.v1'

const memoryCanvasRuntimeStorage: StateStorage = (() => {
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

function getCanvasRuntimeStorage(): StateStorage {
  const fallback: StateStorage = typeof window === 'undefined' ? memoryCanvasRuntimeStorage : {
    getItem: (name) => readBrowserStorageItem('local', name),
    setItem: (name, value) => writeBrowserStorageItem('local', name, value),
    removeItem: (name) => removeBrowserStorageItem('local', name),
  }
  return createDesktopStateStorage(CANVAS_RUNTIME_STORAGE_KEY, fallback)
}

export const useCanvasRuntimeStore = create<CanvasRuntimeStore>()(
  persist(
    (set, get) => ({
      runsByCanvasId: {},
      startRun: (input) => {
        const run: CanvasRuntimeRun = {
          id: `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          canvasId: input.canvasId,
          status: 'running',
          nodeIds: input.nodeIds,
          tasks: {},
          outputValues: {},
          startedAt: new Date().toISOString(),
          snapshotNodeCount: input.snapshotNodeCount,
          snapshotEdgeCount: input.snapshotEdgeCount,
        }
        set((state) => ({
          runsByCanvasId: {
            ...state.runsByCanvasId,
            [input.canvasId]: [run, ...(state.runsByCanvasId[input.canvasId] ?? [])].slice(0, 50),
          },
        }))
        return run
      },
      startTask: (input) => {
        const task: CanvasRuntimeTask = {
          ...input,
          id: input.id ?? `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          status: 'running',
          outputValues: {},
          startedAt: new Date().toISOString(),
        }
        set((state) => updateRunState(state, input.canvasId, input.runId, (run) => ({
          ...run,
          tasks: { ...run.tasks, [input.nodeId]: task },
        })))
        return task
      },
      completeTask: (canvasId, runId, nodeId, patch) => {
        set((state) => updateRunState(state, canvasId, runId, (run) => {
          const task = run.tasks[nodeId]
          if (!task) return run
          const nextTask: CanvasRuntimeTask = {
            ...task,
            ...patch,
            outputValues: patch.outputValues,
            status: 'done',
            finishedAt: new Date().toISOString(),
          }
          return {
            ...run,
            tasks: { ...run.tasks, [nodeId]: nextTask },
          }
        }))
      },
      failTask: (canvasId, runId, nodeId, error) => {
        set((state) => updateRunState(state, canvasId, runId, (run) => {
          const task = run.tasks[nodeId]
          if (!task) return run
          return {
            ...run,
            tasks: {
              ...run.tasks,
              [nodeId]: { ...task, status: 'failed', error, finishedAt: new Date().toISOString() },
            },
          }
        }))
      },
      finishRun: (canvasId, runId, status, outputValues = {}, error) => {
        set((state) => updateRunState(state, canvasId, runId, (run) => ({
          ...run,
          status,
          outputValues,
          error,
          finishedAt: new Date().toISOString(),
        })))
      },
      clearCanvasRuns: (canvasId) => {
        const next = { ...get().runsByCanvasId }
        delete next[canvasId]
        set({ runsByCanvasId: next })
      },
    }),
    {
      name: CANVAS_RUNTIME_STORAGE_KEY,
      storage: createJSONStorage(getCanvasRuntimeStorage),
      partialize: (state) => ({ runsByCanvasId: state.runsByCanvasId }),
    },
  ),
)

function updateRunState(
  state: CanvasRuntimeStore,
  canvasId: string,
  runId: string,
  updater: (run: CanvasRuntimeRun) => CanvasRuntimeRun,
) {
  const runs = state.runsByCanvasId[canvasId] ?? []
  return {
    runsByCanvasId: {
      ...state.runsByCanvasId,
      [canvasId]: runs.map((run) => run.id === runId ? updater(run) : run),
    },
  }
}
