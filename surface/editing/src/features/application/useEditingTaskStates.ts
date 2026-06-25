import { useEffect, useMemo } from 'react'

import type { ElectronMediaPipelineTaskState } from '@movscript/editing-surface/contracts'

import type { EditingMediaAPI } from '../domain/types'
import { useEditingSessionStore } from './editingSessionStore'

export function useEditingTaskStates(mediaAPI: EditingMediaAPI | undefined, projectId: string) {
  const taskStates = useEditingSessionStore((state) => state.taskStates)
  const upsertEditingTaskState = useEditingSessionStore((state) => state.upsertTaskState)

  useEffect(() => {
    if (!mediaAPI?.onMediaPipelineTaskEvent) return undefined
    return mediaAPI.onMediaPipelineTaskEvent((event) => {
      if (!event.state || event.state.projectId !== projectId) return
      upsertEditingTaskState(event.state)
    })
  }, [mediaAPI, projectId, upsertEditingTaskState])

  const activeTaskStates = useMemo(() => {
    return taskStates.filter((task) => task.projectId === projectId).slice(0, 5)
  }, [projectId, taskStates])

  return {
    activeTaskStates,
    taskStates,
    upsertTaskState: (taskState: ElectronMediaPipelineTaskState) => {
      upsertEditingTaskState(taskState)
    },
  }
}
