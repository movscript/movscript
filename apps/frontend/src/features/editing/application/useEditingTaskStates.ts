import { useEffect, useMemo, useState } from 'react'

import type { ElectronMediaPipelineTaskState } from '@/shared/contracts/electronApiMedia'

import type { EditingMediaAPI } from '../domain/types'
import { upsertTaskState } from './browser'

export function useEditingTaskStates(mediaAPI: EditingMediaAPI | undefined, projectId: string) {
  const [taskStates, setTaskStates] = useState<ElectronMediaPipelineTaskState[]>([])

  useEffect(() => {
    if (!mediaAPI?.onMediaPipelineTaskEvent) return undefined
    return mediaAPI.onMediaPipelineTaskEvent((event) => {
      if (!event.state || event.state.projectId !== projectId) return
      setTaskStates((current) => upsertTaskState(current, event.state!))
    })
  }, [mediaAPI, projectId])

  const activeTaskStates = useMemo(() => {
    return taskStates.filter((task) => task.projectId === projectId).slice(0, 5)
  }, [projectId, taskStates])

  return {
    activeTaskStates,
    taskStates,
    upsertTaskState: (taskState: ElectronMediaPipelineTaskState) => {
      setTaskStates((current) => upsertTaskState(current, taskState))
    },
  }
}
