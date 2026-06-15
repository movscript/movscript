import { useEffect } from 'react'
import type { TFunction } from 'i18next'

import { useCanvasHeaderStore } from '@/features/canvas/presentation/canvasHeaderStore'
import type { CanvasRunStatus, CanvasType } from '@/types'

export function useCanvasAppHeaderSync({
  activeRun,
  activeRunStatusLabel,
  canvasName,
  canvasType,
  doneCount,
  inputCount,
  libraryCollapsed,
  nodeCount,
  onNameChange,
  onRun,
  onSave,
  onToggleLibrary,
  onToggleWorkflowPanel,
  outputCount,
  processorCount,
  runningCount,
  saving,
  startingRun,
  t,
  useAppHeader,
  workflowPanelCollapsed,
  workflowRunningCount,
}: {
  activeRun?: { id: string; status: CanvasRunStatus }
  activeRunStatusLabel?: string
  canvasName: string
  canvasType: CanvasType
  doneCount: number
  inputCount: number
  libraryCollapsed: boolean
  nodeCount: number
  onNameChange: (name: string) => void
  onRun: () => void
  onSave: () => void
  onToggleLibrary: () => void
  onToggleWorkflowPanel: () => void
  outputCount: number
  processorCount: number
  runningCount: number
  saving: boolean
  startingRun: boolean
  t: TFunction
  useAppHeader: boolean
  workflowPanelCollapsed: boolean
  workflowRunningCount: number
}) {
  const setCanvasHeader = useCanvasHeaderStore((s) => s.setHeader)
  const resetCanvasHeader = useCanvasHeaderStore((s) => s.reset)

  useEffect(() => {
    if (!useAppHeader) return
    setCanvasHeader({
      active: true,
      canvasName,
      canvasType,
      nodeCount,
      runningCount,
      doneCount,
      inputCount,
      processorCount,
      outputCount,
      activeRunLabel: canvasType === 'workflow' && activeRun && activeRunStatusLabel
        ? t('canvas.editor.activeRun', { id: activeRun.id.slice(-6), status: activeRunStatusLabel })
        : undefined,
      workflowRunningCount,
      saving,
      startingRun,
      libraryCollapsed,
      workflowPanelCollapsed,
      onNameChange,
      onToggleLibrary,
      onToggleWorkflowPanel,
      onRun,
      onSave,
    })
  }, [activeRun?.id, activeRunStatusLabel, canvasName, canvasType, doneCount, inputCount, libraryCollapsed, nodeCount, onNameChange, onRun, onSave, onToggleLibrary, onToggleWorkflowPanel, outputCount, processorCount, runningCount, saving, setCanvasHeader, startingRun, t, useAppHeader, workflowPanelCollapsed, workflowRunningCount])

  useEffect(() => {
    if (!useAppHeader) return
    return () => resetCanvasHeader()
  }, [resetCanvasHeader, useAppHeader])
}
