import type { Dispatch, SetStateAction } from 'react'
import type { Node } from '@xyflow/react'
import type { TFunction } from 'i18next'

import { CanvasRuntimeInputDialogs } from '@/features/canvas/components/CanvasRuntimeInputDialogs'
import { WorkflowRunResultsDialog, WorkflowSidePanel } from '@/features/canvas/ui/CanvasWorkflowPanels'
import {
  CANVAS_WORKFLOW_PANE_MAX_WIDTH,
  CANVAS_WORKFLOW_PANE_MIN_WIDTH,
} from '@/routes/routeLayoutRegistry'
import type { Canvas, CanvasPortDef, CanvasRunStatus } from '@/types'
import type { CanvasDebugOptions } from '@/features/canvas/presentation/canvasDebugOptions'

type WorkflowSidePanelProps = Parameters<typeof WorkflowSidePanel>[0]
type WorkflowRunResultsDialogProps = Parameters<typeof WorkflowRunResultsDialog>[0]

export function CanvasEditorAuxiliaryPanels({
  activeRunId,
  canvasDebug,
  currentCanvasId,
  inputNodes,
  inputValues,
  nodeRunDialog,
  nodeRunValues,
  nodes,
  onAddWorkflowReference,
  onCancelNodeRun,
  onCancelRun,
  onCloseRunResultDialog,
  onConfirmNodeRun,
  onConfirmRun,
  onRemoveRunResultResource,
  projectId,
  removingRunResultResourceId,
  resultDialogRun,
  runDialogOpen,
  runHistoryPage,
  runStatusFilter,
  setActiveRunId,
  setInputValues,
  setNodeRunValues,
  setRunHistoryPage,
  setRunStatusFilter,
  setWorkflowPanelTab,
  t,
  workflowPane,
  workflowPanelTab,
  workflowRunPageCount,
  workflowRuns,
  workflowRunTotal,
}: {
  activeRunId: string | null
  canvasDebug: CanvasDebugOptions
  currentCanvasId: number
  inputNodes: Node[]
  inputValues: Record<string, string>
  nodeRunDialog: { nodeId: string; ports: CanvasPortDef[] } | null
  nodeRunValues: Record<string, string>
  nodes: Node[]
  onAddWorkflowReference: (workflowCanvas: Canvas) => void
  onCancelNodeRun: () => void
  onCancelRun: () => void
  onCloseRunResultDialog: () => void
  onConfirmNodeRun: () => void
  onConfirmRun: () => void
  onRemoveRunResultResource: (resourceId: number) => Promise<void>
  projectId?: number
  removingRunResultResourceId?: number
  resultDialogRun?: WorkflowRunResultsDialogProps['run']
  runDialogOpen: boolean
  runHistoryPage: number
  runStatusFilter: 'all' | CanvasRunStatus
  setActiveRunId: (runId: string | null) => void
  setInputValues: Dispatch<SetStateAction<Record<string, string>>>
  setNodeRunValues: Dispatch<SetStateAction<Record<string, string>>>
  setRunHistoryPage: (page: number) => void
  setRunStatusFilter: (status: 'all' | CanvasRunStatus) => void
  setWorkflowPanelTab: (tab: WorkflowSidePanelProps['activeTab']) => void
  t: TFunction
  workflowPane: {
    collapsed: boolean
    collapse: () => void
    setSize: (size: number) => void
    show: () => void
    size: number
  }
  workflowPanelTab: WorkflowSidePanelProps['activeTab']
  workflowRunPageCount: number
  workflowRuns: WorkflowSidePanelProps['runs']
  workflowRunTotal: number
}) {
  return (
    <>
      {canvasDebug.shelf && (
        <WorkflowSidePanel
          projectId={projectId}
          disableResourcePreviews={!canvasDebug.media}
          width={workflowPane.size}
          minWidth={CANVAS_WORKFLOW_PANE_MIN_WIDTH}
          maxWidth={CANVAS_WORKFLOW_PANE_MAX_WIDTH}
          activeTab={workflowPanelTab}
          collapsed={workflowPane.collapsed}
          runs={workflowRuns}
          total={workflowRunTotal}
          page={runHistoryPage}
          pageCount={workflowRunPageCount}
          statusFilter={runStatusFilter}
          activeRunId={activeRunId}
          isLoading={false}
          onWidthChange={workflowPane.setSize}
          onTabChange={setWorkflowPanelTab}
          onCollapsedChange={(collapsed) => {
            if (collapsed) workflowPane.collapse()
            else workflowPane.show()
          }}
          onStatusFilterChange={setRunStatusFilter}
          onPageChange={setRunHistoryPage}
          onSelectRun={setActiveRunId}
          currentCanvasId={currentCanvasId}
          onAddWorkflowReference={onAddWorkflowReference}
        />
      )}

      {resultDialogRun && (
        <WorkflowRunResultsDialog
          run={resultDialogRun}
          nodes={nodes}
          removingResourceId={removingRunResultResourceId}
          onRemoveResource={onRemoveRunResultResource}
          onClose={onCloseRunResultDialog}
        />
      )}

      <CanvasRuntimeInputDialogs
        inputNodes={inputNodes}
        inputValues={inputValues}
        nodeRunDialog={nodeRunDialog}
        nodeRunValues={nodeRunValues}
        runDialogOpen={runDialogOpen}
        setInputValues={setInputValues}
        setNodeRunValues={setNodeRunValues}
        onCancelNodeRun={onCancelNodeRun}
        onCancelRun={onCancelRun}
        onConfirmNodeRun={onConfirmNodeRun}
        onConfirmRun={onConfirmRun}
        t={t}
      />
    </>
  )
}
