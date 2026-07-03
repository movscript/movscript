import { Clipboard, ExternalLink, Square, Terminal as TerminalIcon } from 'lucide-react'
import { Button } from '@movscript/ui/primitives'

import {
  shellStatusLabel,
  shellStatusTone,
  type ShellJob,
} from '@/features/shell/ShellWorkbenchModel'
import { shellJobMetaItems, shellJobPreviewUrl, shellJobProgressPercent } from '@/features/shell/shellViewModel'

export function ShellJobBanner({
  job,
  onCopyCommand,
  onCopyLogs,
  onOpenPreview,
  onRevealLogs,
  onStop,
  logsAvailable = false,
}: {
  job?: ShellJob
  onCopyCommand?: (job: ShellJob) => void
  onCopyLogs?: (job: ShellJob) => void
  onOpenPreview?: (job: ShellJob) => void
  onRevealLogs?: (job: ShellJob) => void
  onStop?: (job: ShellJob) => void
  logsAvailable?: boolean
}) {
  if (!job) return null
  const previewUrl = shellJobPreviewUrl(job)
  const previewAvailable = Boolean(previewUrl)
  const commandAvailable = Boolean(job.command)
  const statusTone = shellStatusTone(job.status)
  const progressPercent = shellJobProgressPercent(job.progress)
  const metaItems = shellJobMetaItems(job)
  return (
    <div className="shell-workbench-panel__job-banner" data-status={job.status} data-tone={statusTone}>
      <span className="shell-workbench-panel__job-dot" aria-hidden="true" />
      <div className="shell-workbench-panel__job-copy">
        <div className="shell-workbench-panel__job-title-row">
          <strong>{job.title}</strong>
          <span className="shell-workbench-panel__job-source">{job.source}</span>
          <span>{shellStatusLabel(job.status)}</span>
          {typeof job.port === 'number' ? <span>端口 {job.port}</span> : null}
          {progressPercent !== undefined ? <span>{Math.round(progressPercent)}%</span> : null}
        </div>
        {metaItems.length > 0 ? (
          <div className="shell-workbench-panel__job-meta" aria-label="Shell Job 信息">
            {metaItems.map((item) => (
              <span key={item.label} title={item.value}>
                <b>{item.label}</b>
                {item.value}
              </span>
            ))}
          </div>
        ) : null}
        {previewUrl ? (
          <div className="shell-workbench-panel__job-preview" aria-label="Remotion 预览地址" title={previewUrl}>
            <span>预览地址</span>
            <code>{previewUrl}</code>
          </div>
        ) : null}
        {progressPercent !== undefined ? (
          <div className="shell-workbench-panel__job-progress" aria-label={`任务进度 ${Math.round(progressPercent)}%`}>
            <span style={{ width: `${progressPercent}%` }} />
          </div>
        ) : null}
      </div>
      <div className="shell-workbench-panel__job-actions">
        <Button type="button" size="sm" variant="ghost" className="shell-workbench-panel__job-action" disabled={!commandAvailable} onClick={() => job.command && onCopyCommand?.(job)}>
          <Clipboard size={14} />
          <span>复制命令</span>
        </Button>
        <Button type="button" size="sm" variant="ghost" className="shell-workbench-panel__job-action" disabled={!logsAvailable} onClick={() => logsAvailable && onCopyLogs?.(job)}>
          <Clipboard size={14} />
          <span>复制日志</span>
        </Button>
        <Button type="button" size="sm" variant="ghost" className="shell-workbench-panel__job-action" disabled={!previewAvailable} onClick={() => previewUrl && onOpenPreview?.(job)}>
          <ExternalLink size={14} />
          <span>打开预览</span>
        </Button>
        <Button type="button" size="sm" variant="ghost" className="shell-workbench-panel__job-action" onClick={() => onRevealLogs?.(job)}>
          <TerminalIcon size={14} />
          <span>查看日志</span>
        </Button>
        <Button type="button" size="sm" variant="ghost" className="shell-workbench-panel__job-action" disabled={!onStop} onClick={() => onStop?.(job)}>
          <Square size={14} />
          <span>停止</span>
        </Button>
      </div>
    </div>
  )
}
