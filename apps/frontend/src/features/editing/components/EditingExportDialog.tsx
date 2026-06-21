import { useEffect, useState } from 'react'
import { CheckCircle2, Copy, Loader2, XCircle } from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Progress,
} from '@movscript/ui/primitives'

import { clampNumber, formatDuration } from '@/features/editing/domain/utils'
import type {
  ElectronMediaPipelineEditingProject,
  ElectronMediaPipelineTaskState,
} from '@/shared/contracts/electronApiMedia'
import { toast } from '@/shared/ui/toastStore'
import type { EditingExportDialogState, EditingExportFormat } from '../application/editingExportModel'
import './EditingExportDialog.css'

export function EditingExportDialog({
  dialog,
  project,
  task,
  onConfirm,
  onDialogChange,
  onOpenChange,
  onUpdate,
}: {
  dialog: EditingExportDialogState
  project: ElectronMediaPipelineEditingProject | null
  task: ElectronMediaPipelineTaskState | null
  onConfirm: () => void
  onDialogChange: (patch: Partial<EditingExportDialogState>) => void
  onOpenChange: (open: boolean) => void
  onUpdate: (patch: Partial<Pick<EditingExportDialogState, 'format' | 'filename'>>) => void
}) {
  const progress = clampNumber(task?.progressPercent ?? (dialog.phase === 'progress' ? 3 : 0), 0, 100, 0)
  const terminalStatus = task?.status === 'succeeded' || task?.status === 'failed' || task?.status === 'canceled'
  const succeeded = task?.status === 'succeeded'
  const failed = task?.status === 'failed' || task?.status === 'canceled' || Boolean(dialog.errorMessage && !task)
  const errorDetail = dialog.phase === 'result' && failed ? taskStatusDetail(task, dialog) : ''
  const [copiedError, setCopiedError] = useState(false)
  const title = dialog.phase === 'settings'
    ? '导出设置'
    : dialog.phase === 'progress'
      ? '正在导出'
      : succeeded
        ? '导出成功'
        : '导出失败'

  useEffect(() => {
    setCopiedError(false)
  }, [errorDetail])

  const copyExportError = () => {
    if (!errorDetail) return
    void copyTextToClipboard(errorDetail)
      .then(() => {
        setCopiedError(true)
        toast.success('已复制错误信息')
      })
      .catch((error) => {
        toast.error('复制失败', error instanceof Error ? error.message : String(error))
      })
  }

  return (
    <Dialog open={dialog.open} onOpenChange={onOpenChange}>
      <DialogContent className="editing-workspace-export-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {dialog.phase === 'settings'
              ? '确认导出格式和文件名后开始创建导出任务。'
              : dialog.phase === 'progress'
                ? '导出任务正在运行，进度会随任务状态自动更新。'
                : succeeded
                  ? '导出任务已完成。'
                  : '导出任务没有完成，请查看失败信息。'}
          </DialogDescription>
        </DialogHeader>

        {dialog.phase === 'settings' ? (
          <div className="editing-workspace-export-form">
            <label>
              <span>导出格式</span>
              <select
                value={dialog.format}
                className="editing-workspace-select"
                onChange={(event) => onUpdate({ format: event.target.value as EditingExportFormat })}
              >
                <option value="mp4">MP4 文件</option>
                <option value="hls">HLS 预览</option>
              </select>
            </label>
            <label>
              <span>文件名</span>
              <Input
                value={dialog.filename}
                onChange={(event) => onUpdate({ filename: event.target.value })}
                className="h-8"
              />
            </label>
            <dl className="editing-workspace-export-summary">
              <div>
                <dt>画面</dt>
                <dd>{project ? `${project.timeline.width} x ${project.timeline.height}` : '-'}</dd>
              </div>
              <div>
                <dt>帧率</dt>
                <dd>{project?.timeline.fps ?? '-'}</dd>
              </div>
              <div>
                <dt>时长</dt>
                <dd>{formatDuration(project?.timeline.durationMs ?? 0)}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <div className="editing-workspace-export-progress">
            <div className="editing-workspace-export-status" data-status={succeeded ? 'success' : failed ? 'error' : 'running'}>
              {dialog.phase === 'progress' ? <Loader2 size={18} className="animate-spin" /> : succeeded ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
              <div>
                <strong>{taskStatusTitle(task, dialog)}</strong>
                <span>{taskStatusDetail(task, dialog)}</span>
              </div>
            </div>
            {errorDetail ? (
              <div className="editing-workspace-export-error-detail">
                <div className="editing-workspace-export-error-detail__header">
                  <span>错误信息</span>
                  <Button type="button" size="sm" variant="outline" className="gap-2" onClick={copyExportError}>
                    <Copy size={13} />
                    {copiedError ? '已复制' : '复制'}
                  </Button>
                </div>
                <pre>{errorDetail}</pre>
              </div>
            ) : null}
            {!terminalStatus && !failed ? <Progress value={progress} /> : null}
            <dl className="editing-workspace-export-summary">
              <div>
                <dt>任务</dt>
                <dd>{task?.taskId ?? dialog.taskId ?? '创建中'}</dd>
              </div>
              <div>
                <dt>输出</dt>
                <dd title={taskOutputLabel(task, dialog)}>{taskOutputLabel(task, dialog)}</dd>
              </div>
            </dl>
          </div>
        )}

        <DialogFooter>
          {dialog.phase === 'settings' ? (
            <>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
              <Button type="button" onClick={onConfirm}>确认导出</Button>
            </>
          ) : dialog.phase === 'progress' ? (
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>后台运行</Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => onDialogChange({ phase: 'settings', taskId: undefined, errorMessage: undefined })}>
                再次导出
              </Button>
              <Button type="button" onClick={() => onOpenChange(false)}>关闭</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '0'
  document.body.append(textarea)
  textarea.select()
  try {
    if (!document.execCommand('copy')) throw new Error('浏览器拒绝复制请求')
  } finally {
    textarea.remove()
  }
}

function taskStatusTitle(task: ElectronMediaPipelineTaskState | null, dialog: EditingExportDialogState) {
  if (dialog.errorMessage && !task) return '任务创建失败'
  if (!task) return '正在创建任务'
  if (task.status === 'succeeded') return '任务完成'
  if (task.status === 'failed') return '任务失败'
  if (task.status === 'canceled') return '任务已取消'
  return `${Math.round(clampNumber(task.progressPercent, 0, 100, 0))}%`
}

function taskStatusDetail(task: ElectronMediaPipelineTaskState | null, dialog: EditingExportDialogState) {
  if (dialog.errorMessage) return dialog.errorMessage
  if (!task) return '正在保存项目并提交导出任务'
  return task.errorMessage ?? task.currentStep ?? task.status
}

function taskOutputLabel(task: ElectronMediaPipelineTaskState | null, dialog: EditingExportDialogState) {
  return task?.outputPath
    ?? task?.hlsManifestPath
    ?? task?.hls_manifest_path
    ?? task?.hlsManifestUrl
    ?? task?.hls_manifest_url
    ?? task?.outputName
    ?? dialog.filename
    ?? '-'
}
