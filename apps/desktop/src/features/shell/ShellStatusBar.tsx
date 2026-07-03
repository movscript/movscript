import { Clipboard } from 'lucide-react'
import { Button } from '@movscript/ui/primitives'

import {
  shellStatusLabel,
  shellStatusTone,
  type ShellSession,
} from '@/features/shell/ShellWorkbenchModel'
import { compactShellId } from '@/features/shell/shellViewModel'

export function ShellStatusBar({
  activeSession,
  disabled,
  logText,
  onCopyCwd,
  onCopyLogs,
}: {
  activeSession?: ShellSession
  disabled: boolean
  logText: string
  onCopyCwd: (session: ShellSession) => void
  onCopyLogs: (session: ShellSession) => void
}) {
  const status = activeSession?.status ?? 'idle'
  return (
    <div className="shell-workbench-panel__statusbar" data-status={status} data-tone={shellStatusTone(status, disabled)}>
      <div className="shell-workbench-panel__statusbar-meta">
        <span className="shell-workbench-panel__statusbar-state">
          <span className="shell-workbench-panel__status-dot" aria-hidden="true" />
          {shellStatusLabel(status, disabled)}
        </span>
        {activeSession?.jobId ? <span title={activeSession.jobId}>任务 {compactShellId(activeSession.jobId)}</span> : null}
        {activeSession?.id ? <span title={activeSession.id}>会话 {compactShellId(activeSession.id)}</span> : null}
        {activeSession?.cwd ? <span title={activeSession.cwd}>{activeSession.cwd}</span> : null}
      </div>
      <div className="shell-workbench-panel__statusbar-actions">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="shell-workbench-panel__statusbar-action"
          disabled={disabled || !activeSession?.cwd}
          onClick={(event) => {
            event.stopPropagation()
            if (activeSession) onCopyCwd(activeSession)
          }}
        >
          <Clipboard size={13} />
          <span>复制工作目录</span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="shell-workbench-panel__statusbar-action"
          disabled={disabled || !activeSession || !logText}
          onClick={(event) => {
            event.stopPropagation()
            if (activeSession) onCopyLogs(activeSession)
          }}
        >
          <Clipboard size={13} />
          <span>复制日志</span>
        </Button>
      </div>
    </div>
  )
}
