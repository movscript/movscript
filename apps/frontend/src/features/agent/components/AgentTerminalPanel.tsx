import type { MovScriptWorkspaceContext } from '@/shared/infrastructure/providerConfigStore'
import { ShellTerminalViewport } from '@/features/agent/components/AgentTerminalViewport'
import { useAgentTerminalController } from '@/features/agent/components/useAgentTerminalController'
import {
  AgentTerminalDock,
  AgentTerminalHeader,
  AgentTerminalShellList,
} from '@/features/agent/components/AgentTerminalPanelParts'

export interface AgentTerminalPanelProps {
  workspaceContext: MovScriptWorkspaceContext
  open?: boolean
  onOpenChange?: (open: boolean) => void
  shellPlacement?: 'center' | 'center-right'
}

export function AgentTerminalPanel({ workspaceContext, open: controlledOpen, onOpenChange, shellPlacement = 'center' }: AgentTerminalPanelProps) {
  const terminal = useAgentTerminalController({
    controlledOpen,
    onOpenChange,
    workspaceContext,
  })

  if (!terminal.open && terminal.controlled) return null

  if (!terminal.open) {
    return (
      <AgentTerminalDock
        disabled={terminal.disabled}
        onOpen={() => terminal.setOpen(true)}
        statusLabel={terminal.statusLabel}
      />
    )
  }

  return (
    <section
      className="agent-terminal-panel"
      data-shell-placement={shellPlacement}
      aria-label="Agent terminal"
      onClick={() => {
        if (terminal.activeShellId) terminal.runtimeSnapshot(terminal.activeShellId)?.terminal?.focus()
      }}
    >
      <AgentTerminalHeader
        activeSession={terminal.activeSession}
        controlled={terminal.controlled}
        disabled={terminal.disabled}
        onCollapse={() => terminal.setOpen(false)}
        onStartShell={(shellId) => void terminal.startShell(shellId)}
        shortCwd={terminal.shortCwd}
        statusLabel={terminal.statusLabel}
      />
      <div className="agent-terminal-panel__body">
        <div className="agent-terminal-panel__terminal-stack">
          {terminal.sessions.map((session) => (
            <ShellTerminalViewport
              key={`${terminal.shellResetNonce}_${session.id}`}
              active={session.id === terminal.activeShellId}
              disabled={terminal.disabled}
              shellId={session.id}
              runtimeFor={terminal.runtimeFor}
              resizeShell={terminal.resizeShell}
              sendShellData={terminal.sendShellData}
              startShell={terminal.startShell}
            />
          ))}
          {terminal.activeSession?.status === 'starting' && !terminal.runtimeSnapshot(terminal.activeSession.id)?.terminal ? (
            <div className="agent-terminal-panel__placeholder">Starting shell...</div>
          ) : null}
          {terminal.activeSession?.error ? <div className="agent-terminal-panel__error">{terminal.activeSession.error}</div> : null}
        </div>
        <AgentTerminalShellList
          activeShellId={terminal.activeShellId}
          disabled={terminal.disabled}
          onAddShell={terminal.addShell}
          onCloseShell={terminal.closeShell}
          onSelectShell={terminal.setActiveShellId}
          sessions={terminal.sessions}
        />
      </div>
    </section>
  )
}
