import type { EditingHostApi } from '@movscript/editing-surface/host-api'
import type { ElectronMediaPipelineTaskState } from '@movscript/editing-surface/contracts'

import type { EditingMediaAPI } from '../domain/types'

export function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return Boolean(target.closest('input, textarea, select, [role="textbox"]'))
}

export function readMediaAPI(): EditingMediaAPI | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as Window & { api?: EditingHostApi }).api
}

export function upsertTaskState(
  taskStates: ElectronMediaPipelineTaskState[],
  taskState: ElectronMediaPipelineTaskState,
) {
  return [taskState, ...taskStates.filter((candidate) => candidate.taskId !== taskState.taskId)].slice(0, 10)
}
