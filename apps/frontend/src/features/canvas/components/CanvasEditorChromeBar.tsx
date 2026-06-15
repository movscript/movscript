import type { Dispatch, KeyboardEvent, Ref, SetStateAction } from 'react'
import type { TFunction } from 'i18next'
import {
  ArrowLeft,
  Lightbulb,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  Play,
  Save,
  Workflow,
  Zap,
} from 'lucide-react'
import {
  CanvasEditorActionButton,
  CanvasEditorChrome,
  CanvasEditorChromeContent,
  CanvasEditorIconButton,
  CanvasEditorMetricBadge,
  CanvasEditorNameButton,
  CanvasEditorNameInput,
  CanvasEditorRunningBadge,
  CanvasEditorStats,
  CanvasEditorStatusBadge,
  CanvasEditorTitleArea,
  CanvasEditorTitleRow,
  CanvasEditorTypeBadge,
} from '@/features/canvas/ui/CanvasEditorUi'

import type { CanvasRunStatus, CanvasType } from '@/types'

type InlineTitleEditorView = {
  editing: boolean
  handleDisplayKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  handleInputKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  inputRef: Ref<HTMLInputElement>
  setWorkspace: Dispatch<SetStateAction<string>>
  startEditing: () => void
  workspace: string
  commitEditing: () => void
}

export function CanvasEditorChromeBar({
  activeRun,
  activeRunStatusLabel,
  canvasName,
  canvasType,
  doneCount,
  embedded,
  hasUnsavedChanges,
  libraryCollapsed,
  nodeCount,
  onBack,
  onClose,
  onRunWorkflow,
  onSave,
  onToggleLibrary,
  renamePending,
  runningCount,
  runtimeStarting,
  savingCanvas,
  t,
  titleEditor,
  workflowRunningCount,
  workflowStats,
}: {
  activeRun?: { id: string; status: CanvasRunStatus }
  activeRunStatusLabel?: string
  canvasName: string
  canvasType: CanvasType
  doneCount: number
  embedded: boolean
  hasUnsavedChanges: boolean
  libraryCollapsed: boolean
  nodeCount: number
  onBack: () => void
  onClose?: () => void
  onRunWorkflow: () => void
  onSave: () => void
  onToggleLibrary: () => void
  renamePending: boolean
  runningCount: number
  runtimeStarting: boolean
  savingCanvas: boolean
  t: TFunction
  titleEditor: InlineTitleEditorView
  workflowRunningCount: number
  workflowStats: { inputs: number; processors: number; outputs: number }
}) {
  return (
    <CanvasEditorChrome embedded={embedded}>
      <CanvasEditorChromeContent>
        {embedded ? (
          <CanvasEditorTypeBadge>
            {canvasType === 'workflow' ? <Zap size={12} /> : <Lightbulb size={12} />}
            {t(`canvas.editor.canvasType.${canvasType}`)}
          </CanvasEditorTypeBadge>
        ) : (
          <CanvasEditorIconButton onClick={onBack}>
            <ArrowLeft size={16} />
          </CanvasEditorIconButton>
        )}

        <CanvasEditorIconButton
          onClick={onToggleLibrary}
          title={libraryCollapsed
            ? t('canvas.editor.expandNodeLibrary', { defaultValue: '展开节点库' })
            : t('canvas.editor.collapseNodeLibrary', { defaultValue: '收起节点库' })}
          aria-label={libraryCollapsed
            ? t('canvas.editor.expandNodeLibrary', { defaultValue: '展开节点库' })
            : t('canvas.editor.collapseNodeLibrary', { defaultValue: '收起节点库' })}
        >
          {libraryCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
        </CanvasEditorIconButton>

        <CanvasEditorTitleArea>
          <CanvasEditorTitleRow>
            {titleEditor.editing ? (
              <CanvasEditorNameInput
                ref={titleEditor.inputRef}
                value={titleEditor.workspace}
                onChange={(event) => titleEditor.setWorkspace(event.target.value)}
                onBlur={titleEditor.commitEditing}
                onKeyDown={titleEditor.handleInputKeyDown}
                placeholder={t('canvas.editor.untitled')}
                aria-label={t('canvas.editor.untitled')}
                disabled={renamePending}
              />
            ) : (
              <CanvasEditorNameButton
                onDoubleClick={titleEditor.startEditing}
                onKeyDown={titleEditor.handleDisplayKeyDown}
                title={t('canvas.editor.renameTitle', { defaultValue: '双击重命名' })}
                aria-label={t('canvas.editor.renameTitle', { defaultValue: '双击重命名' })}
              >
                {canvasName.trim() || t('canvas.editor.untitled')}
              </CanvasEditorNameButton>
            )}
            <CanvasEditorMetricBadge icon={<Workflow size={12} />}>
              {t('canvas.editor.nodesCount', { count: nodeCount })}
            </CanvasEditorMetricBadge>
            {runningCount > 0 && (
              <CanvasEditorRunningBadge icon={<Loader2 size={12} />} loading>
                {t('canvas.editor.runningCount', { count: runningCount })}
              </CanvasEditorRunningBadge>
            )}
          </CanvasEditorTitleRow>
          <CanvasEditorStats
            items={[
              t('canvas.editor.stats.inputs', { count: workflowStats.inputs }),
              t('canvas.editor.stats.processors', { count: workflowStats.processors }),
              t('canvas.editor.stats.outputs', { count: workflowStats.outputs }),
              t('canvas.editor.stats.done', { count: doneCount }),
            ]}
          />
        </CanvasEditorTitleArea>

        {!embedded && (
          <CanvasEditorTypeBadge>
            {canvasType === 'workflow' ? <Zap size={12} /> : <Lightbulb size={12} />}
            {t(`canvas.editor.canvasType.${canvasType}`)}
          </CanvasEditorTypeBadge>
        )}

        {canvasType === 'workflow' && activeRun && activeRunStatusLabel && (
          <CanvasEditorStatusBadge
            tone={activeRun.status === 'failed' ? 'danger' : 'neutral'}
            icon={(activeRun.status === 'running' || activeRun.status === 'pending') ? <Loader2 size={12} /> : undefined}
            loading={activeRun.status === 'running' || activeRun.status === 'pending'}
          >
            {t('canvas.editor.activeRun', { id: activeRun.id.slice(-6), status: activeRunStatusLabel })}
          </CanvasEditorStatusBadge>
        )}
        {canvasType === 'workflow' && workflowRunningCount > 1 && (
          <CanvasEditorRunningBadge>
            {t('canvas.editor.parallelRuns', { count: workflowRunningCount })}
          </CanvasEditorRunningBadge>
        )}

        <CanvasEditorActionButton
          size="icon-sm"
          onClick={onRunWorkflow}
          disabled={runtimeStarting}
          title={runtimeStarting ? t('canvas.editor.starting') : t('canvas.editor.startRun')}
          aria-label={runtimeStarting ? t('canvas.editor.starting') : t('canvas.editor.startRun')}
        >
          {runtimeStarting ? <Loader2 size={14} className="canvas-editor-chrome__spin-icon" /> : <Play size={14} />}
        </CanvasEditorActionButton>

        <CanvasEditorActionButton
          size="icon-sm"
          onClick={onSave}
          disabled={savingCanvas}
          title={savingCanvas
            ? t('common.saving')
            : hasUnsavedChanges
              ? t('canvas.editor.unsaved', { defaultValue: '未保存' })
              : t('common.save')}
          aria-label={savingCanvas
            ? t('common.saving')
            : hasUnsavedChanges
              ? t('canvas.editor.unsaved', { defaultValue: '未保存' })
              : t('common.save')}
        >
          {savingCanvas ? <Loader2 size={14} className="canvas-editor-chrome__spin-icon" /> : <Save size={14} />}
        </CanvasEditorActionButton>

        {embedded && onClose && (
          <CanvasEditorIconButton onClick={onClose}>
            <PanelRightClose size={14} />
          </CanvasEditorIconButton>
        )}
      </CanvasEditorChromeContent>
    </CanvasEditorChrome>
  )
}
