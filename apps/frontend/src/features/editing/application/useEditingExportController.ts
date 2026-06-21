import { useCallback, useEffect, useMemo, useState } from 'react'

import type { EditingMediaAPI, SaveState } from '@/features/editing/domain/types'
import type {
  ElectronMediaPipelineEditingProject,
  ElectronMediaPipelineTaskState,
} from '@/shared/contracts/electronApiMedia'

import {
  defaultExportFilename,
  normalizeExportFilename,
  type EditingExportDialogState,
  type EditingExportFormat,
} from './editingExportModel'

type SetSaveState = (saveState: SaveState | ((current: SaveState) => SaveState)) => void

export function useEditingExportController({
  activeProject,
  mediaAPI,
  saveProject,
  setSaveState,
  taskStates,
  upsertEditingTaskState,
}: {
  activeProject: ElectronMediaPipelineEditingProject | null
  mediaAPI: EditingMediaAPI | undefined
  saveProject: (project?: ElectronMediaPipelineEditingProject | null, options?: { auto?: boolean }) => Promise<ElectronMediaPipelineEditingProject | undefined>
  setSaveState: SetSaveState
  taskStates: ElectronMediaPipelineTaskState[]
  upsertEditingTaskState: (task: ElectronMediaPipelineTaskState) => void
}) {
  const [exportDialog, setExportDialog] = useState<EditingExportDialogState>({
    open: false,
    phase: 'settings',
    format: 'mp4',
    filename: '',
  })
  const currentExportTask = useMemo(() => {
    if (!exportDialog.taskId) return null
    return taskStates.find((task) => task.taskId === exportDialog.taskId) ?? null
  }, [exportDialog.taskId, taskStates])

  useEffect(() => {
    if (!currentExportTask || exportDialog.phase !== 'progress') return
    if (currentExportTask.status === 'succeeded' || currentExportTask.status === 'failed' || currentExportTask.status === 'canceled') {
      setExportDialog((current) => ({
        ...current,
        phase: 'result',
        errorMessage: currentExportTask.errorMessage ?? current.errorMessage,
      }))
    }
  }, [currentExportTask, exportDialog.phase])

  const openExportDialog = useCallback((format: EditingExportFormat) => {
    setExportDialog({
      open: true,
      phase: 'settings',
      format,
      filename: defaultExportFilename(activeProject?.title ?? 'movscript-export', format),
      taskId: undefined,
      errorMessage: undefined,
    })
  }, [activeProject?.title])

  const updateExportDialog = useCallback((patch: Partial<Pick<EditingExportDialogState, 'format' | 'filename'>>) => {
    setExportDialog((current) => {
      const format = patch.format ?? current.format
      return {
        ...current,
        ...patch,
        filename: patch.filename ?? (patch.format ? normalizeExportFilename(current.filename, activeProject?.title ?? 'movscript-export', format) : current.filename),
      }
    })
  }, [activeProject?.title])

  const createRenderTask = useCallback(async (
    format: EditingExportFormat,
    filename = defaultExportFilename(activeProject?.title ?? 'movscript-export', format),
  ) => {
    if (!activeProject || !mediaAPI?.createMediaPipelineTask) return null
    const savedProject = await saveProject(activeProject)
    if (!savedProject) return null
    setSaveState({ status: 'saving', message: '正在创建渲染任务' })
    try {
      const task = await mediaAPI.createMediaPipelineTask({
        projectId: savedProject.projectId,
        taskType: format === 'hls' ? 'timeline_hls' : 'timeline_render',
        editingProject: savedProject,
        output: {
          format,
          filename,
        },
      })
      upsertEditingTaskState(task)
      setSaveState({ status: 'saved', message: `${format === 'hls' ? '预览' : '渲染'}任务已创建` })
      return task
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setSaveState({ status: 'error', message })
      setExportDialog((current) => ({ ...current, phase: 'result', errorMessage: message }))
      return null
    }
  }, [activeProject, mediaAPI, saveProject, setSaveState, upsertEditingTaskState])

  const confirmExportTask = useCallback(async () => {
    if (!activeProject || !mediaAPI?.createMediaPipelineTask) return
    const filename = normalizeExportFilename(exportDialog.filename, activeProject.title, exportDialog.format)
    setExportDialog((current) => ({
      ...current,
      phase: 'progress',
      filename,
      taskId: undefined,
      errorMessage: undefined,
    }))
    const task = await createRenderTask(exportDialog.format, filename)
    setExportDialog((current) => ({
      ...current,
      phase: task ? 'progress' : 'result',
      taskId: task?.taskId,
      errorMessage: task ? undefined : current.errorMessage,
    }))
  }, [activeProject, createRenderTask, exportDialog.filename, exportDialog.format, mediaAPI])

  return {
    confirmExportTask,
    currentExportTask,
    exportDialog,
    openExportDialog,
    setExportDialog,
    updateExportDialog,
  }
}
