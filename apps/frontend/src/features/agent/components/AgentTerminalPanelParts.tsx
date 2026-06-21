import { ChevronDown, Play, Plus, Terminal as TerminalIcon, X } from 'lucide-react'
import { Button } from '@movscript/ui/primitives'

import { terminalStatusLabel, type ShellSession } from '@/features/agent/components/AgentTerminalRuntimeModel'

export function AgentTerminalDock({
  disabled,
  onOpen,
  statusLabel,
}: {
  disabled: boolean
  onOpen: () => void
  statusLabel: string
}) {
  return (
    <div className="agent-terminal-dock" data-open="false">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="agent-terminal-dock__toggle"
        onClick={onOpen}
        disabled={disabled}
        title={disabled ? '当前运行环境不支持本地 Terminal' : '打开 Terminal'}
      >
        <TerminalIcon size={15} />
        <span>Terminal</span>
      </Button>
      <span className="agent-terminal-dock__meta">{statusLabel}</span>
    </div>
  )
}

export function AgentTerminalHeader({
  activeSession,
  controlled,
  disabled,
  onCollapse,
  onStartShell,
  shortCwd,
  statusLabel,
}: {
  activeSession?: ShellSession
  controlled: boolean
  disabled: boolean
  onCollapse: () => void
  onStartShell: (shellId: string) => void
  shortCwd: string
  statusLabel: string
}) {
  return (
    <div className="agent-terminal-panel__header">
      <div className="agent-terminal-panel__title">
        <TerminalIcon size={15} />
        <span>Terminal</span>
        <span className="agent-terminal-panel__status" data-status={activeSession?.status ?? 'idle'}>{statusLabel}</span>
      </div>
      <div className="agent-terminal-panel__cwd" title={activeSession?.cwd || shortCwd}>{shortCwd}</div>
      <div className="agent-terminal-panel__actions">
        {activeSession && activeSession.status !== 'running' && activeSession.status !== 'starting' ? (
          <Button type="button" size="icon-sm" variant="ghost" onClick={() => onStartShell(activeSession.id)} disabled={disabled || !activeSession} aria-label="启动 shell" title="启动 shell">
            <Play size={14} />
          </Button>
        ) : null}
        {!controlled ? (
          <Button type="button" size="icon-sm" variant="ghost" onClick={onCollapse} aria-label="收起 Terminal" title="收起 Terminal">
            <ChevronDown size={15} />
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export function AgentTerminalShellList({
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
  return (
    <aside className="agent-terminal-panel__shells" aria-label="Shell sessions">
      <div className="agent-terminal-panel__shells-header">
        <span>Shells</span>
        <Button type="button" size="icon-sm" variant="ghost" onClick={onAddShell} disabled={disabled} aria-label="新增 shell" title="新增 shell">
          <Plus size={14} />
        </Button>
      </div>
      <div className="agent-terminal-panel__shell-list">
        {sessions.map((session) => (
          <button
            key={session.id}
            type="button"
            className="agent-terminal-panel__shell-item"
            data-active={session.id === activeShellId ? 'true' : undefined}
            data-status={session.status}
            onClick={() => onSelectShell(session.id)}
          >
            <span className="agent-terminal-panel__shell-dot" />
            <span className="agent-terminal-panel__shell-copy">
              <span className="agent-terminal-panel__shell-title">{session.title}</span>
              <span className="agent-terminal-panel__shell-meta">{terminalStatusLabel(session.status, disabled)}</span>
            </span>
            <span className="agent-terminal-panel__shell-actions">
              <span
                role="button"
                tabIndex={0}
                className="agent-terminal-panel__shell-action"
                aria-label={`关闭 ${session.title}`}
                title={`关闭 ${session.title}`}
                onClick={(event) => {
                  event.stopPropagation()
                  onCloseShell(session.id)
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return
                  event.preventDefault()
                  event.stopPropagation()
                  onCloseShell(session.id)
                }}
              >
                <X size={12} />
              </span>
            </span>
          </button>
        ))}
      </div>
    </aside>
  )
}
