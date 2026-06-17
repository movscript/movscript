import type { ElectronAPI } from '@/shared/contracts/electronApi'
import type { ElectronMediaPipelineTaskState } from '@/shared/contracts/electronApiMedia'

import type { EditingMediaAPI } from '../domain/types'

export function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return Boolean(target.closest('input, textarea, select, [role="textbox"]'))
}

export function readMediaAPI(): EditingMediaAPI | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as Window & { api?: ElectronAPI }).api
}

export function upsertTaskState(
  taskStates: ElectronMediaPipelineTaskState[],
  taskState: ElectronMediaPipelineTaskState,
) {
  return [taskState, ...taskStates.filter((candidate) => candidate.taskId !== taskState.taskId)].slice(0, 10)
}
