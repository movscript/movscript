import { create } from 'zustand'

import { editingAppEventScope, publishAppEvent } from '@movscript/editing-surface/app-events'
import type {
  ElectronMediaPipelineEditingProject,
  ElectronMediaPipelineTaskState,
} from '@movscript/editing-surface/contracts'
import type { SaveState } from '../domain/types'
import { upsertTaskState } from './browser'

type ValueOrUpdater<T> = T | ((current: T) => T)

interface EditingSessionStore {
  activeProject: ElectronMediaPipelineEditingProject | null
  selectedClipId: string
  playheadMs: number
  isDirty: boolean
  saveState: SaveState
  taskStates: ElectronMediaPipelineTaskState[]
  setActiveProject: (project: ElectronMediaPipelineEditingProject | null) => void
  setSelectedClipId: (clipId: string) => void
  setPlayheadMs: (playheadMs: ValueOrUpdater<number>) => void
  setDirty: (dirty: boolean) => void
  setSaveState: (saveState: ValueOrUpdater<SaveState>) => void
  upsertTaskState: (taskState: ElectronMediaPipelineTaskState) => void
  resetSession: () => void
}

const INITIAL_EDITING_SESSION_STATE: Pick<
  EditingSessionStore,
  'activeProject' | 'selectedClipId' | 'playheadMs' | 'isDirty' | 'saveState' | 'taskStates'
> = {
  activeProject: null,
  selectedClipId: '',
  playheadMs: 0,
  isDirty: false,
  saveState: { status: 'idle' },
  taskStates: [],
}

export const useEditingSessionStore = create<EditingSessionStore>((set, get) => ({
  ...INITIAL_EDITING_SESSION_STATE,
  setActiveProject: (project) => {
    set({ activeProject: project })
    publishEditingSessionEvent('editing.project.changed', project, { activeProject: project })
  },
  setSelectedClipId: (clipId) => {
    set({ selectedClipId: clipId })
    publishEditingSessionEvent('editing.session.changed', get().activeProject, { selectedClipId: clipId })
  },
  setPlayheadMs: (playheadMs) => {
    const nextPlayheadMs = typeof playheadMs === 'function' ? playheadMs(get().playheadMs) : playheadMs
    set({ playheadMs: nextPlayheadMs })
    publishEditingSessionEvent('editing.session.changed', get().activeProject, { playheadMs: nextPlayheadMs })
  },
  setDirty: (dirty) => {
    set({ isDirty: dirty })
    publishEditingSessionEvent('editing.session.changed', get().activeProject, { isDirty: dirty })
  },
  setSaveState: (saveState) => {
    const nextSaveState = typeof saveState === 'function' ? saveState(get().saveState) : saveState
    set({ saveState: nextSaveState })
    publishEditingSessionEvent('editing.session.changed', get().activeProject, { saveState: nextSaveState })
  },
  upsertTaskState: (taskState) => {
    set((state) => ({ taskStates: upsertTaskState(state.taskStates, taskState) }))
    publishEditingSessionEvent('editing.task.changed', get().activeProject, { taskState })
  },
  resetSession: () => {
    set(INITIAL_EDITING_SESSION_STATE)
    publishEditingSessionEvent('editing.session.changed', null, { reset: true })
  },
}))

function publishEditingSessionEvent(
  topic: 'editing.session.changed' | 'editing.project.changed' | 'editing.task.changed',
  project: ElectronMediaPipelineEditingProject | null,
  payload: Record<string, unknown>,
): void {
  publishAppEvent({
    topic,
    scope: editingAppEventScope(project?.id),
    source: 'editing-session-store',
    payload: {
      editingProjectId: project?.id,
      projectId: project?.projectId,
      ...payload,
    },
  })
}
