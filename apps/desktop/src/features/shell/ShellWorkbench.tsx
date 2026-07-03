import type { MovScriptWorkspaceContext } from '@/shared/infrastructure/providerConfigStore'
import { Plus } from 'lucide-react'
import { Button } from '@movscript/ui/primitives'
import { toast } from '@movscript/ui/toast'
import { ShellCollapsedDock } from '@/features/shell/ShellCollapsedDock'
import { ShellCommandBar } from '@/features/shell/ShellCommandBar'
import { ShellIntentCard } from '@/features/shell/ShellIntentCard'
import { ShellJobBanner } from '@/features/shell/ShellJobBanner'
import { ShellSessionRail } from '@/features/shell/ShellSessionRail'
import { ShellStatusBar } from '@/features/shell/ShellStatusBar'
import { ShellTerminalViewport } from '@/features/shell/ShellTerminalViewport'
import { useShellWorkbenchController } from '@/features/shell/useShellWorkbenchController'
import { copyTextToClipboard } from '@/shared/ui/browserActions'
import type { ShellIntent, ShellJob, ShellSession, ShellWorkbenchMode } from '@/features/shell/ShellWorkbenchModel'
import './ShellWorkbench.css'

export interface ShellWorkbenchProps {
  workspaceContext: MovScriptWorkspaceContext
  open?: boolean
  onOpenChange?: (open: boolean) => void
  shellPlacement?: 'center' | 'center-right'
  activeJob?: ShellJob
  activeIntent?: ShellIntent
  onCheckIntent?: (intent: ShellIntent) => void
  onCopyIntentCommand?: (intent: ShellIntent) => void
  onCopyJobCommand?: (job: ShellJob) => void
  onCopyJobLogs?: (job: ShellJob) => void
  onOpenJobPreview?: (job: ShellJob) => void
  onRevealJobLogs?: (job: ShellJob) => void
  onStopJob?: (job: ShellJob) => void
}

export function ShellWorkbench({
  workspaceContext,
  open: controlledOpen,
  onOpenChange,
  shellPlacement = 'center',
  activeJob,
  activeIntent,
  onCheckIntent,
  onCopyIntentCommand,
  onCopyJobCommand,
  onCopyJobLogs,
  onOpenJobPreview,
  onRevealJobLogs,
  onStopJob,
}: ShellWorkbenchProps) {
  const terminal = useShellWorkbenchController({
    controlledOpen,
    onOpenChange,
    workspaceContext,
  })
  const shellMode: ShellWorkbenchMode = activeIntent ? 'external_shell_intent' : 'desktop_shell_host'
  const derivedActiveJob = activeJob ?? shellJobFromSession(terminal.activeSession)
  const activeShellLogText = terminal.activeSession
    ? terminal.runtimeSnapshot(terminal.activeSession.id)?.outputBuffer ?? ''
    : ''
  const activeJobLogText = derivedActiveJob?.sessionId
    ? terminal.runtimeSnapshot(derivedActiveJob.sessionId)?.outputBuffer ?? ''
    : ''
  const handleCopyIntentCommand = onCopyIntentCommand ?? ((intent: ShellIntent) => {
    copyShellWorkbenchText(intent.commandText, '命令已复制', '没有可复制的命令。')
  })
  const handleCopyJobCommand = onCopyJobCommand ?? ((job: ShellJob) => {
    copyShellWorkbenchText(job.command, '命令已复制', '这个 Shell Job 没有可复制的命令。')
  })
  const handleCopyJobLogs = onCopyJobLogs ?? ((job: ShellJob) => {
    const logs = job.sessionId ? terminal.runtimeSnapshot(job.sessionId)?.outputBuffer ?? '' : ''
    copyShellWorkbenchText(logs, '日志已复制', '当前 Shell Job 还没有日志。')
  })
  const handleCopySessionCwd = (session: ShellSession) => {
    copyShellWorkbenchText(session.cwd, '工作目录已复制', '当前 Shell 没有工作目录。')
  }
  const handleCopySessionLogs = (session: ShellSession) => {
    const logs = terminal.runtimeSnapshot(session.id)?.outputBuffer ?? ''
    copyShellWorkbenchText(logs, '日志已复制', '当前 Shell 还没有日志。')
  }
  const handleOpenJobPreview = onOpenJobPreview ?? ((job: ShellJob) => {
    if (job.previewUrl) window.open(job.previewUrl, '_blank', 'noopener,noreferrer')
  })
  const handleRevealJobLogs = onRevealJobLogs ?? ((job: ShellJob) => {
    if (job.sessionId) terminal.setActiveShellId(job.sessionId)
  })
  const handleStopJob = onStopJob ?? ((job: ShellJob) => {
    if (job.sessionId) terminal.stopShell(job.sessionId)
  })

  if (!terminal.open && terminal.controlled) return null

  if (!terminal.open) {
    return (
      <ShellCollapsedDock
        disabled={terminal.disabled}
        onOpen={() => terminal.setOpen(true)}
        statusLabel={terminal.statusLabel}
      />
    )
  }

  return (
    <section
      className="shell-workbench-panel"
      data-shell-mode={shellMode}
      data-shell-placement={shellPlacement}
      aria-label="Shell 工作台"
      onClick={() => {
        if (terminal.activeShellId) terminal.runtimeSnapshot(terminal.activeShellId)?.terminal?.focus()
      }}
    >
      <ShellCommandBar
        activeSession={terminal.activeSession}
        controlled={terminal.controlled}
        disabled={terminal.disabled}
        onAddShell={terminal.addShell}
        onCollapse={() => terminal.setOpen(false)}
        onSplitShell={terminal.splitShell}
        onStartShell={(shellId) => void terminal.startShell(shellId)}
        onStopShell={terminal.stopShell}
        shortCwd={terminal.shortCwd}
        sessionCount={terminal.sessions.length}
        statusLabel={terminal.statusLabel}
      />
      <div className="shell-workbench-panel__body">
        <div className="shell-workbench-panel__terminal-stack">
          <ShellJobBanner
            job={derivedActiveJob}
            onCopyCommand={handleCopyJobCommand}
            onCopyLogs={handleCopyJobLogs}
            onOpenPreview={handleOpenJobPreview}
            onRevealLogs={handleRevealJobLogs}
            onStop={handleStopJob}
            logsAvailable={Boolean(activeJobLogText)}
          />
          {activeIntent ? (
            <ShellIntentCard
              intent={activeIntent}
              onCheckAgain={onCheckIntent}
              onCopyCommand={handleCopyIntentCommand}
            />
          ) : (
            <div className="shell-workbench-panel__terminal-canvas">
              {terminal.sessions.length === 0 ? (
                <div className="shell-workbench-panel__empty">
                  <span>暂无 Shell 会话</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    disabled={terminal.disabled}
                    onClick={(event) => {
                      event.stopPropagation()
                      terminal.addShell()
                    }}
                  >
                    <Plus size={14} />
                    新建 Shell
                  </Button>
                </div>
              ) : null}
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
                <div className="shell-workbench-panel__placeholder">正在启动 Shell...</div>
              ) : null}
              {terminal.activeSession?.error ? <div className="shell-workbench-panel__error">{terminal.activeSession.error}</div> : null}
            </div>
          )}
        </div>
        <ShellSessionRail
          activeShellId={terminal.activeShellId}
          disabled={terminal.disabled}
          onAddShell={terminal.addShell}
          onCloseShell={terminal.closeShell}
          onSelectShell={terminal.setActiveShellId}
          sessions={terminal.sessions}
        />
      </div>
      <ShellStatusBar
        activeSession={terminal.activeSession}
        disabled={terminal.disabled}
        logText={activeShellLogText}
        onCopyCwd={handleCopySessionCwd}
        onCopyLogs={handleCopySessionLogs}
      />
    </section>
  )
}

function shellJobFromSession(session: ShellSession | undefined): ShellJob | undefined {
  if (!session || session.owner !== 'system') return undefined
  return {
    schema: 'movscript.shell_job.v1',
    id: session.jobId ?? `session-job:${session.id}`,
    title: session.title,
    source: shellJobSourceLabel(session),
    ...(session.ownerFeature ? { ownerFeature: session.ownerFeature } : {}),
    status: session.status,
    cwd: session.cwd,
    command: session.command || session.initialCommand,
    sessionId: session.id,
    ...(session.exitCode !== undefined ? { exitCode: session.exitCode } : {}),
    ...(session.signal !== undefined ? { signal: session.signal } : {}),
    ...(session.previewUrl ? { previewUrl: session.previewUrl } : {}),
    ...(session.previewUrl ? { port: shellJobPortFromPreviewUrl(session.previewUrl) } : {}),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  }
}

function shellJobSourceLabel(session: ShellSession): string {
  if (session.ownerFeature === 'remotion_studio') return 'Remotion'
  if (session.ownerFeature) return session.ownerFeature.replace(/_/g, ' ')
  return session.projectId ? 'project' : 'desktop'
}

function shellJobPortFromPreviewUrl(previewUrl: string): number | undefined {
  try {
    const port = Number(new URL(previewUrl).port)
    return Number.isInteger(port) && port > 0 ? port : undefined
  } catch {
    return undefined
  }
}

function copyShellWorkbenchText(text: string | undefined, successMessage: string, emptyMessage: string): void {
  const nextText = text?.trim()
  if (!nextText) {
    toast.info(emptyMessage)
    return
  }
  if (!navigator.clipboard?.writeText) {
    toast.error('无法复制', '剪贴板 API 不可用。')
    return
  }
  void copyTextToClipboard(nextText)
    .then(() => toast.success(successMessage))
    .catch((error) => {
      toast.error('无法复制', error instanceof Error ? error.message : String(error))
    })
}
