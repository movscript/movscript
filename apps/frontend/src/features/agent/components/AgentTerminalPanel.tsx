import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ChevronDown, Play, Plus, Terminal as TerminalIcon, X } from 'lucide-react'
import { Button } from '@movscript/ui'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'

import type { MovScriptWorkspaceContext } from '@/shared/infrastructure/providerConfigStore'

const AGENT_TERMINAL_PANEL_OPEN_KEY = 'movscript.agentMode.terminal.open'
const AGENT_TERMINAL_DEFAULT_ROWS = 12
const AGENT_TERMINAL_DEFAULT_COLS = 100
const AGENT_TERMINAL_OUTPUT_BUFFER_LIMIT = 200_000
const FIRST_SHELL_ID = 'shell_1'

export interface AgentTerminalPanelProps {
  workspaceContext: MovScriptWorkspaceContext
  open?: boolean
  onOpenChange?: (open: boolean) => void
  shellPlacement?: 'center' | 'center-right'
}

type TerminalStatus = 'idle' | 'starting' | 'running' | 'exited' | 'error'

type ShellSession = {
  id: string
  index: number
  title: string
  status: TerminalStatus
  cwd: string
  error: string
}

type ShellRuntime = {
  terminal: Terminal | null
  fitAddon: FitAddon | null
  terminalSessionId: string | null
  status: TerminalStatus
  outputBuffer: string
  writeChain: Promise<unknown>
  runToken: number
  unsubscribe: (() => void) | null
}

type AgentTerminalStoreState = {
  sessions: ShellSession[]
  activeShellId: string
  shellResetNonce: number
  nextShellIndex: number
}

const agentTerminalRuntimes = new Map<string, ShellRuntime>()
const agentTerminalListeners = new Set<() => void>()
let agentTerminalContextKey = ''
let agentTerminalStore: AgentTerminalStoreState = createInitialAgentTerminalStore()

function getAgentTerminalStoreSnapshot(): AgentTerminalStoreState {
  return agentTerminalStore
}

function subscribeAgentTerminalStore(listener: () => void): () => void {
  agentTerminalListeners.add(listener)
  return () => agentTerminalListeners.delete(listener)
}

function useAgentTerminalStore(): AgentTerminalStoreState {
  return useSyncExternalStore(
    subscribeAgentTerminalStore,
    getAgentTerminalStoreSnapshot,
    getAgentTerminalStoreSnapshot,
  )
}

function updateAgentTerminalStore(updater: (current: AgentTerminalStoreState) => AgentTerminalStoreState): void {
  agentTerminalStore = updater(agentTerminalStore)
  for (const listener of Array.from(agentTerminalListeners)) listener()
}

function createInitialAgentTerminalStore(): AgentTerminalStoreState {
  return {
    sessions: [createShellSession(1)],
    activeShellId: FIRST_SHELL_ID,
    shellResetNonce: 0,
    nextShellIndex: 1,
  }
}

export function AgentTerminalPanel({ workspaceContext, open: controlledOpen, onOpenChange, shellPlacement = 'center' }: AgentTerminalPanelProps) {
  const [internalOpen, setInternalOpen] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(AGENT_TERMINAL_PANEL_OPEN_KEY) === '1'
  })
  const open = controlledOpen ?? internalOpen
  const terminalStore = useAgentTerminalStore()
  const sessions = terminalStore.sessions
  const activeShellId = terminalStore.activeShellId
  const shellResetNonce = terminalStore.shellResetNonce

  const workspaceContextKey = JSON.stringify(workspaceContext)
  const controlled = controlledOpen !== undefined
  const disabled = typeof window === 'undefined' || !window.api?.createLocalTerminal
  const activeSession = sessions.find((session) => session.id === activeShellId) ?? sessions[0]
  const statusLabel = terminalStatusLabel(activeSession?.status ?? 'idle', disabled)
  const shortCwd = activeSession?.cwd
    ? compactPath(activeSession.cwd)
    : workspaceContext.scope === 'project' ? 'project cwd' : 'workspace cwd'

  const setOpen = useCallback((nextOpen: boolean) => {
    if (!controlled) setInternalOpen(nextOpen)
    onOpenChange?.(nextOpen)
  }, [controlled, onOpenChange])

  const updateSession = useCallback((id: string, patch: Partial<ShellSession>) => {
    updateAgentTerminalStore((current) => ({
      ...current,
      sessions: current.sessions.map((session) => (
        session.id === id ? { ...session, ...patch } : session
      )),
    }))
  }, [])

  const setActiveShellId = useCallback((id: string) => {
    updateAgentTerminalStore((current) => ({
      ...current,
      activeShellId: id,
    }))
  }, [])

  const runtimeFor = useCallback((id: string): ShellRuntime => {
    let runtime = agentTerminalRuntimes.get(id)
    if (!runtime) {
      runtime = {
        terminal: null,
        fitAddon: null,
        terminalSessionId: null,
        status: 'idle',
        outputBuffer: '',
        writeChain: Promise.resolve(),
        runToken: 0,
        unsubscribe: null,
      }
      agentTerminalRuntimes.set(id, runtime)
    }
    return runtime
  }, [])

  const setShellStatus = useCallback((id: string, status: TerminalStatus, patch: Partial<ShellSession> = {}) => {
    const runtime = runtimeFor(id)
    runtime.status = status
    updateSession(id, { ...patch, status })
  }, [runtimeFor, updateSession])

  const resizeShell = useCallback((id: string) => {
    const runtime = agentTerminalRuntimes.get(id)
    const terminal = runtime?.terminal
    const fitAddon = runtime?.fitAddon
    if (!runtime || !terminal || !fitAddon) return
    if (!canFitTerminal(terminal)) return
    try {
      fitAddon.fit()
    } catch (fitError) {
      console.warn('[agent-terminal] failed to fit terminal', fitError)
      return
    }
    if (!runtime.terminalSessionId) return
    void window.api?.resizeLocalTerminal?.({
      sessionId: runtime.terminalSessionId,
      size: {
        rows: terminal.rows,
        cols: terminal.cols,
      },
    }).catch((resizeError) => {
      console.warn('[agent-terminal] failed to resize shell', resizeError)
    })
  }, [])

  const sendShellData = useCallback((id: string, data: string) => {
    const runtime = agentTerminalRuntimes.get(id)
    if (!runtime || runtime.status !== 'running' || !runtime.terminalSessionId) return
    runtime.writeChain = runtime.writeChain
      .catch(() => undefined)
      .then(() => window.api?.writeLocalTerminal?.({
        sessionId: runtime.terminalSessionId ?? id,
        data,
      }))
      .catch((writeError) => {
        setShellStatus(id, 'error', {
          error: writeError instanceof Error ? writeError.message : String(writeError),
        })
      })
  }, [setShellStatus])

  const stopShell = useCallback((id: string) => {
    const runtime = agentTerminalRuntimes.get(id)
    if (!runtime) return
    runtime.runToken += 1
    runtime.unsubscribe?.()
    runtime.unsubscribe = null
    if (runtime.terminalSessionId) void window.api?.killLocalTerminal?.({ sessionId: runtime.terminalSessionId })
    runtime.terminalSessionId = null
    setShellStatus(id, 'exited')
  }, [setShellStatus])

  const startShell = useCallback(async (id: string) => {
    if (!window.api?.createLocalTerminal) {
      setShellStatus(id, 'error', { error: 'Local terminal is not available in this runtime.' })
      return
    }

    const runtime = runtimeFor(id)
    const terminal = runtime.terminal
    if (!terminal) return
    if (runtime.status === 'starting' || runtime.status === 'running') return

    const token = runtime.runToken + 1
    runtime.runToken = token
    runtime.unsubscribe?.()
    runtime.unsubscribe = null
    runtime.outputBuffer = ''
    runtime.terminalSessionId = id
    setShellStatus(id, 'starting', { error: '', cwd: '' })
    terminal.reset()
    appendShellOutput(runtime, 'Starting host shell...\r\n')

    try {
      const result = await window.api.createLocalTerminal({
        sessionId: id,
        workspaceContext,
        size: {
          rows: terminal.rows || AGENT_TERMINAL_DEFAULT_ROWS,
          cols: terminal.cols || AGENT_TERMINAL_DEFAULT_COLS,
        },
      })
      if (runtime.runToken !== token) return
      runtime.terminalSessionId = result.sessionId
      updateSession(id, { cwd: result.cwd })
      setShellStatus(id, 'running')
      terminal.focus()
    } catch (startError) {
      if (runtime.runToken !== token) return
      runtime.terminalSessionId = null
      setShellStatus(id, 'error', {
        error: startError instanceof Error ? startError.message : String(startError),
      })
    }
  }, [runtimeFor, setShellStatus, updateSession, workspaceContext])

  const addShell = useCallback(() => {
    updateAgentTerminalStore((current) => {
      const nextShellIndex = current.nextShellIndex + 1
      const next = createShellSession(nextShellIndex)
      return {
        ...current,
        nextShellIndex,
        sessions: [...current.sessions, next],
        activeShellId: next.id,
      }
    })
  }, [])

  const closeShell = useCallback((id: string) => {
    if (sessions.length <= 1) {
      stopShell(id)
      return
    }
    stopShell(id)
    const runtime = agentTerminalRuntimes.get(id)
    runtime?.terminal?.dispose()
    runtime?.unsubscribe?.()
    agentTerminalRuntimes.delete(id)
    updateAgentTerminalStore((current) => {
      const fallback = sessions.find((session) => session.id !== id)
      return {
        ...current,
        sessions: current.sessions.filter((session) => session.id !== id),
        activeShellId: current.activeShellId === id ? fallback?.id ?? FIRST_SHELL_ID : current.activeShellId,
      }
    })
  }, [sessions, stopShell])

  const resetShells = useCallback(() => {
    for (const session of sessions) stopShell(session.id)
    for (const runtime of agentTerminalRuntimes.values()) {
      runtime.terminal?.dispose()
      runtime.unsubscribe?.()
    }
    agentTerminalRuntimes.clear()
    updateAgentTerminalStore((current) => ({
      ...createInitialAgentTerminalStore(),
      shellResetNonce: current.shellResetNonce + 1,
    }))
  }, [sessions, stopShell])

  useEffect(() => {
    window.localStorage.setItem(AGENT_TERMINAL_PANEL_OPEN_KEY, open ? '1' : '0')
  }, [open])

  useEffect(() => {
    if (!agentTerminalContextKey) {
      agentTerminalContextKey = workspaceContextKey
      return
    }
    if (agentTerminalContextKey === workspaceContextKey) return
    agentTerminalContextKey = workspaceContextKey
    resetShells()
  }, [resetShells, workspaceContextKey])

  useEffect(() => {
    return window.api?.onLocalTerminalEvent?.((event) => {
      const runtime = agentTerminalRuntimes.get(event.sessionId)
      if (!runtime) return
      if (event.kind === 'output') {
        appendShellOutput(runtime, event.data)
        return
      }
      if (event.kind === 'exit') {
        runtime.terminalSessionId = null
        appendShellOutput(runtime, `\r\nShell exited with code ${event.exitCode}.\r\n`)
        setShellStatus(event.sessionId, 'exited')
        return
      }
      runtime.terminalSessionId = null
      setShellStatus(event.sessionId, 'error', { error: event.error })
    })
  }, [setShellStatus])

  useEffect(() => {
    if (!open || !activeSession) return
    const runtime = agentTerminalRuntimes.get(activeSession.id)
    runtime?.terminal?.focus()
    resizeShell(activeSession.id)
    if (activeSession.status === 'idle') void startShell(activeSession.id)
  }, [activeSession, open, resizeShell, startShell])

  if (!open && controlled) return null

  if (!open) {
    return (
      <div className="agent-terminal-dock" data-open="false">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="agent-terminal-dock__toggle"
          onClick={() => setOpen(true)}
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

  return (
    <section
      className="agent-terminal-panel"
      data-shell-placement={shellPlacement}
      aria-label="Agent terminal"
      onClick={() => {
        if (activeShellId) agentTerminalRuntimes.get(activeShellId)?.terminal?.focus()
      }}
    >
      <div className="agent-terminal-panel__header">
        <div className="agent-terminal-panel__title">
          <TerminalIcon size={15} />
          <span>Terminal</span>
          <span className="agent-terminal-panel__status" data-status={activeSession?.status ?? 'idle'}>{statusLabel}</span>
        </div>
        <div className="agent-terminal-panel__cwd" title={activeSession?.cwd || shortCwd}>{shortCwd}</div>
        <div className="agent-terminal-panel__actions">
          {activeSession && activeSession.status !== 'running' && activeSession.status !== 'starting' ? (
            <Button type="button" size="icon-sm" variant="ghost" onClick={() => activeSession && void startShell(activeSession.id)} disabled={disabled || !activeSession} aria-label="启动 shell" title="启动 shell">
              <Play size={14} />
            </Button>
          ) : null}
          {!controlled ? (
            <Button type="button" size="icon-sm" variant="ghost" onClick={() => setOpen(false)} aria-label="收起 Terminal" title="收起 Terminal">
              <ChevronDown size={15} />
            </Button>
          ) : null}
        </div>
      </div>
      <div className="agent-terminal-panel__body">
        <div className="agent-terminal-panel__terminal-stack">
          {sessions.map((session) => (
            <ShellTerminalViewport
              key={`${shellResetNonce}_${session.id}`}
              active={session.id === activeShellId}
              disabled={disabled}
              sessionId={session.id}
              runtimeFor={runtimeFor}
              resizeShell={resizeShell}
              sendShellData={sendShellData}
              startShell={startShell}
            />
          ))}
          {activeSession?.status === 'starting' && !agentTerminalRuntimes.get(activeSession.id)?.terminal ? (
            <div className="agent-terminal-panel__placeholder">Starting shell...</div>
          ) : null}
          {activeSession?.error ? <div className="agent-terminal-panel__error">{activeSession.error}</div> : null}
        </div>
        <aside className="agent-terminal-panel__shells" aria-label="Shell sessions">
          <div className="agent-terminal-panel__shells-header">
            <span>Shells</span>
            <Button type="button" size="icon-sm" variant="ghost" onClick={addShell} disabled={disabled} aria-label="新增 shell" title="新增 shell">
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
                onClick={() => setActiveShellId(session.id)}
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
                      closeShell(session.id)
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return
                      event.preventDefault()
                      event.stopPropagation()
                      closeShell(session.id)
                    }}
                  >
                    <X size={12} />
                  </span>
                </span>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </section>
  )
}

function ShellTerminalViewport({
  active,
  disabled,
  sessionId,
  runtimeFor,
  resizeShell,
  sendShellData,
  startShell,
}: {
  active: boolean
  disabled: boolean
  sessionId: string
  runtimeFor: (id: string) => ShellRuntime
  resizeShell: (id: string) => void
  sendShellData: (id: string, data: string) => void
  startShell: (id: string) => Promise<void>
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined
    const runtime = runtimeFor(sessionId)
    if (runtime.terminal) return undefined

    const terminal = new Terminal({
      allowProposedApi: false,
      convertEol: true,
      cursorBlink: true,
      disableStdin: disabled,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      fontSize: 12,
      lineHeight: 1.42,
      rows: AGENT_TERMINAL_DEFAULT_ROWS,
      cols: AGENT_TERMINAL_DEFAULT_COLS,
      scrollback: 5000,
      theme: terminalTheme(host),
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(host)
    runtime.terminal = terminal
    runtime.fitAddon = fitAddon
    if (runtime.outputBuffer) terminal.write(runtime.outputBuffer)

    const inputDisposable = terminal.onData((data) => sendShellData(sessionId, data))
    const resizeObserver = new ResizeObserver(() => resizeShell(sessionId))
    resizeObserver.observe(host)
    const frame = window.requestAnimationFrame(() => {
      resizeShell(sessionId)
      if (active) void startShell(sessionId)
    })

    return () => {
      window.cancelAnimationFrame(frame)
      inputDisposable.dispose()
      resizeObserver.disconnect()
      if (runtime.terminal === terminal) runtime.terminal = null
      if (runtime.fitAddon === fitAddon) runtime.fitAddon = null
      terminal.dispose()
    }
  }, [disabled, resizeShell, runtimeFor, sendShellData, sessionId])

  useEffect(() => {
    if (!active) return
    runtimeFor(sessionId).terminal?.focus()
    resizeShell(sessionId)
  }, [active, resizeShell, runtimeFor, sessionId])

  return (
    <div
      ref={hostRef}
      className="agent-terminal-panel__xterm"
      data-active={active ? 'true' : undefined}
      aria-hidden={active ? undefined : true}
    />
  )
}

function createShellSession(index: number): ShellSession {
  return {
    id: `shell_${index}`,
    index,
    title: `Shell ${index}`,
    status: 'idle',
    cwd: '',
    error: '',
  }
}

function appendShellOutput(runtime: ShellRuntime, data: string): void {
  runtime.outputBuffer += data
  if (runtime.outputBuffer.length > AGENT_TERMINAL_OUTPUT_BUFFER_LIMIT) {
    runtime.outputBuffer = runtime.outputBuffer.slice(-AGENT_TERMINAL_OUTPUT_BUFFER_LIMIT)
  }
  runtime.terminal?.write(data)
}

function canFitTerminal(terminal: Terminal): boolean {
  const element = terminal.element
  const host = element?.parentElement
  if (!element || !host || !element.isConnected || !host.isConnected) return false
  return host.clientWidth > 0 && host.clientHeight > 0
}

function terminalStatusLabel(status: TerminalStatus, disabled: boolean): string {
  if (disabled) return 'unavailable'
  if (status === 'starting') return 'starting'
  if (status === 'running') return 'running'
  if (status === 'exited') return 'exited'
  if (status === 'error') return 'error'
  return 'idle'
}

function compactPath(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  if (parts.length <= 3) return path
  return `.../${parts.slice(-3).join('/')}`
}

function terminalTheme(host: HTMLElement) {
  const style = window.getComputedStyle(host)
  const value = (name: string, fallback: string) => cssColorValue(style.getPropertyValue(name), fallback)
  const primary = value('--agent-terminal-primary', '#38bdf8')
  const accent = value('--agent-terminal-accent', '#f5c542')
  return {
    background: value('--agent-terminal-background', '#14161a'),
    foreground: value('--agent-terminal-text', '#e5e7eb'),
    cursor: accent,
    selectionBackground: value('--agent-terminal-selection', '#334155'),
    black: '#0b0d10',
    red: '#ef4444',
    green: '#22c55e',
    yellow: '#eab308',
    blue: primary,
    magenta: '#d946ef',
    cyan: '#2dd4bf',
    white: '#e5e7eb',
    brightBlack: '#64748b',
    brightRed: '#f87171',
    brightGreen: '#4ade80',
    brightYellow: '#facc15',
    brightBlue: primary,
    brightMagenta: '#e879f9',
    brightCyan: '#67e8f9',
    brightWhite: '#ffffff',
  }
}

function cssColorValue(value: string, fallback: string): string {
  const trimmed = value.trim()
  return trimmed || fallback
}
