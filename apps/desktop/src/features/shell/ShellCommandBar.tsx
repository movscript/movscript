import { ChevronDown, Columns2, Play, Plus, Square, Terminal as TerminalIcon } from 'lucide-react'
import { Button } from '@movscript/ui/primitives'

import {
  shellStatusTone,
  type ShellSession,
} from '@/features/shell/ShellWorkbenchModel'
import { shellSessionScopeLabel } from '@/features/shell/shellViewModel'

export function ShellCommandBar({
  activeSession,
  controlled,
  disabled,
  onAddShell,
  onCollapse,
  onSplitShell,
  onStartShell,
  onStopShell,
  shortCwd,
  sessionCount,
  statusLabel,
}: {
  activeSession?: ShellSession
  controlled: boolean
  disabled: boolean
  onAddShell: () => void
  onCollapse: () => void
  onSplitShell: () => void
  onStartShell: (shellId: string) => void
  onStopShell: (shellId: string) => void
  shortCwd: string
  sessionCount: number
  statusLabel: string
}) {
  const status = activeSession?.status ?? 'idle'
  const activeSessionCanStop = activeSession?.status === 'running' || activeSession?.status === 'starting'
  const scopeLabel = shellSessionScopeLabel(activeSession)
  return (
    <div className="shell-workbench-panel__header">
      <div className="shell-workbench-panel__title">
        <TerminalIcon size={15} />
        <span>MovScript Shell</span>
        <span className="shell-workbench-panel__count">{sessionCount}</span>
      </div>
      <div className="shell-workbench-panel__context">
        <span className="shell-workbench-panel__active-title">{activeSession?.title ?? '暂无 Shell 会话'}</span>
        <span className="shell-workbench-panel__scope">{scopeLabel}</span>
        <span className="shell-workbench-panel__cwd" aria-label="工作目录" title={activeSession?.cwd || shortCwd}>{shortCwd}</span>
      </div>
      <div className="shell-workbench-panel__actions">
        <span className="shell-workbench-panel__status" data-status={status} data-tone={shellStatusTone(status, disabled)}>
          <span className="shell-workbench-panel__status-dot" aria-hidden="true" />
          <span>{statusLabel}</span>
        </span>
        <Button type="button" size="icon-sm" variant="ghost" onClick={onAddShell} disabled={disabled} aria-label="新增 Shell" title="新增 Shell">
          <Plus size={14} />
        </Button>
        <Button type="button" size="icon-sm" variant="ghost" onClick={onSplitShell} disabled={disabled || !activeSession} aria-label="拆分 Shell" title="拆分 Shell">
          <Columns2 size={14} />
        </Button>
        {activeSessionCanStop ? (
          <Button type="button" size="icon-sm" variant="ghost" onClick={() => activeSession && onStopShell(activeSession.id)} disabled={disabled || !activeSession} aria-label="停止 Shell" title="停止 Shell">
            <Square size={14} />
          </Button>
        ) : null}
        {activeSession && activeSession.status !== 'running' && activeSession.status !== 'starting' ? (
          <Button type="button" size="icon-sm" variant="ghost" onClick={() => onStartShell(activeSession.id)} disabled={disabled || !activeSession} aria-label="启动 Shell" title="启动 Shell">
            <Play size={14} />
          </Button>
        ) : null}
        {!controlled ? (
          <Button type="button" size="icon-sm" variant="ghost" onClick={onCollapse} aria-label="收起 Shell" title="收起 Shell">
            <ChevronDown size={15} />
          </Button>
        ) : null}
      </div>
    </div>
  )
}
