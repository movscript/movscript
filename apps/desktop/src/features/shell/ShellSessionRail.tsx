import { Plus, X } from 'lucide-react'
import { Button } from '@movscript/ui/primitives'

import {
  shellItemTimestamp,
  shellStatusTone,
  type ShellSession,
} from '@/features/shell/ShellWorkbenchModel'
import { shellSessionSubtitle } from '@/features/shell/shellViewModel'

export function ShellSessionRail({
  activeShellId,
  disabled,
  onAddShell,
  onCloseShell,
  onSelectShell,
  sessions,
}: {
  activeShellId: string
  disabled: boolean
  onAddShell: () => void
  onCloseShell: (shellId: string) => void
  onSelectShell: (shellId: string) => void
  sessions: ShellSession[]
}) {
  const systemSessions = sessions.filter((session) => session.owner === 'system')
  const userSessions = sessions.filter((session) => session.owner !== 'system')
  return (
    <aside className="shell-workbench-panel__shells" aria-label="Shell 会话">
      <div className="shell-workbench-panel__shells-header">
        <span>Shell 会话</span>
        <Button type="button" size="icon-sm" variant="ghost" onClick={onAddShell} disabled={disabled} aria-label="新增 Shell" title="新增 Shell">
          <Plus size={14} />
        </Button>
      </div>
      <div className="shell-workbench-panel__shell-list">
        {systemSessions.length > 0 ? (
          <ShellSessionRailGroup
            activeShellId={activeShellId}
            disabled={disabled}
            label="系统"
            onCloseShell={onCloseShell}
            onSelectShell={onSelectShell}
            sessions={systemSessions}
          />
        ) : null}
        <ShellSessionRailGroup
          activeShellId={activeShellId}
          disabled={disabled}
          label="用户"
          onCloseShell={onCloseShell}
          onSelectShell={onSelectShell}
          sessions={userSessions}
        />
      </div>
    </aside>
  )
}

function ShellSessionRailGroup({
  activeShellId,
  disabled,
  label,
  onCloseShell,
  onSelectShell,
  sessions,
}: {
  activeShellId: string
  disabled: boolean
  label: string
  onCloseShell: (shellId: string) => void
  onSelectShell: (shellId: string) => void
  sessions: ShellSession[]
}) {
  if (sessions.length === 0) return null
  return (
    <div className="shell-workbench-panel__shell-group">
      <div className="shell-workbench-panel__shell-group-label">{label}</div>
      {sessions.map((session) => (
        <div
          key={session.id}
          className="shell-workbench-panel__shell-item"
          data-active={session.id === activeShellId ? 'true' : undefined}
          data-status={session.status}
          data-tone={shellStatusTone(session.status, disabled)}
        >
          <button
            type="button"
            className="shell-workbench-panel__shell-select"
            disabled={disabled}
            onClick={() => onSelectShell(session.id)}
          >
            <span className="shell-workbench-panel__shell-dot" />
            <span className="shell-workbench-panel__shell-copy">
              <span className="shell-workbench-panel__shell-title">{session.title}</span>
              <span className="shell-workbench-panel__shell-meta">{shellSessionSubtitle(session, disabled)}</span>
            </span>
            <span className="shell-workbench-panel__shell-time">{shellItemTimestamp(session.updatedAt)}</span>
          </button>
          <span className="shell-workbench-panel__shell-actions">
            <button
              type="button"
              className="shell-workbench-panel__shell-action"
              disabled={disabled}
              aria-label={`关闭 ${session.title}`}
              title={`关闭 ${session.title}`}
              onClick={() => onCloseShell(session.id)}
            >
              <X size={12} />
            </button>
          </span>
        </div>
      ))}
    </div>
  )
}
