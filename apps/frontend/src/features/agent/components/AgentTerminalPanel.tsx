import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { ChevronDown, Play, Plus, Terminal as TerminalIcon, X } from 'lucide-react'
import { Button } from '@movscript/ui'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'

import {
  appServerRpcClientForURL,
  ensureAppServer,
  type AppServerRpcClient,
} from '@/shared/infrastructure/app-server/appServerRpcClient'
import {
  providerInstanceId,
  resolveAppServerProfile,
  resolveNewConversationProvider,
  usesAppServerProtocol,
  useProviderConfigStore,
  type MovScriptWorkspaceContext,
} from '@/shared/infrastructure/providerConfigStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'

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
  client: AppServerRpcClient | null
  processId: string | null
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
  const providerSettings = useProviderConfigStore((state) => state.settings)
  const currentUser = useUserStore((state) => state.currentUser)
  const provider = useMemo(() => resolveNewConversationProvider(providerSettings), [providerSettings])
  const appServerMode = usesAppServerProtocol(provider)
  const [internalOpen, setInternalOpen] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(AGENT_TERMINAL_PANEL_OPEN_KEY) === '1'
  })
  const open = controlledOpen ?? internalOpen
  const terminalStore = useAgentTerminalStore()
  const sessions = terminalStore.sessions
  const activeShellId = terminalStore.activeShellId
  const shellResetNonce = terminalStore.shellResetNonce

  const providerKey = `${provider.kind}:${provider.id}:${providerInstanceId(provider)}`
  const workspaceContextKey = JSON.stringify(workspaceContext)
  const contextKey = `${providerKey}:${workspaceContextKey}`
  const controlled = controlledOpen !== undefined
  const disabled = !appServerMode
  const terminalUser = terminalPromptUser(currentUser?.username)
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
        client: null,
        processId: null,
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
    try {
      fitAddon.fit()
    } catch (fitError) {
      console.warn('[agent-terminal] failed to fit terminal', fitError)
      return
    }
    if (!runtime.client || !runtime.processId) return
    void runtime.client.requestProtocol('command/exec/resize', {
      processId: runtime.processId,
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
    if (!runtime || runtime.status !== 'running' || !runtime.client || !runtime.processId) return
    runtime.writeChain = runtime.writeChain
      .catch(() => undefined)
      .then(() => runtime.client?.requestProtocol('command/exec/write', {
        processId: runtime.processId,
        deltaBase64: encodeUtf8Base64(data),
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
    stopTerminalProcess(runtime.client, runtime.processId)
    runtime.processId = null
    setShellStatus(id, 'exited')
  }, [setShellStatus])

  const startShell = useCallback(async (id: string) => {
    if (!appServerMode) {
      setShellStatus(id, 'error', { error: `${provider.label} does not expose an app-server terminal.` })
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
    const processId = `agent_terminal_${id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    runtime.processId = processId
    setShellStatus(id, 'starting', { error: '', cwd: '' })
    terminal.reset()
    appendShellOutput(runtime, `Starting shell: ${shellLabel(shellCommand())}\r\n`)

    try {
      const profile = resolveAppServerProfile(provider)
      const statusResult = await ensureAppServer({
        profile,
        workspaceContext,
      })
      if (!statusResult?.ok || !statusResult.endpoint) {
        throw new Error(statusResult?.error || `${provider.label} app-server failed to start: ${profile.id}`)
      }
      if (runtime.runToken !== token) return

      const client = appServerRpcClientForURL(statusResult.endpoint)
      runtime.client = client
      const resolvedCwd = statusResult.providerSessionCwd || ''
      updateSession(id, { cwd: resolvedCwd })

      runtime.unsubscribe = client.onNotification((notification) => {
        if (notification.method !== 'command/exec/outputDelta') return
        const params = notification.params
        if (!isRecord(params) || params.processId !== processId || typeof params.deltaBase64 !== 'string') return
        appendShellOutput(runtime, decodeBase64Utf8(params.deltaBase64))
      })

      setShellStatus(id, 'running')
      terminal.focus()

      client.requestProtocol<{ exitCode: number }>('command/exec', {
        command: shellCommand(),
        processId,
        tty: true,
        streamStdin: true,
        streamStdoutStderr: true,
        disableTimeout: true,
        cwd: resolvedCwd || undefined,
        env: shellEnvironment(statusResult.cliBinDir, statusResult.cliEnv, terminalUser),
        size: {
          rows: terminal.rows || AGENT_TERMINAL_DEFAULT_ROWS,
          cols: terminal.cols || AGENT_TERMINAL_DEFAULT_COLS,
        },
      }).then((result) => {
        if (runtime.runToken !== token) return
        appendShellOutput(runtime, `\r\nShell exited with code ${result.exitCode}.\r\n`)
        setShellStatus(id, 'exited')
      }).catch((requestError) => {
        if (runtime.runToken !== token) return
        setShellStatus(id, 'error', {
          error: requestError instanceof Error ? requestError.message : String(requestError),
        })
      }).finally(() => {
        runtime.unsubscribe?.()
        runtime.unsubscribe = null
        if (runtime.runToken === token) runtime.processId = null
      })
    } catch (startError) {
      if (runtime.runToken !== token) return
      runtime.processId = null
      setShellStatus(id, 'error', {
        error: startError instanceof Error ? startError.message : String(startError),
      })
    }
  }, [appServerMode, provider, runtimeFor, setShellStatus, terminalUser, updateSession, workspaceContext])

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
      agentTerminalContextKey = contextKey
      return
    }
    if (agentTerminalContextKey === contextKey) return
    agentTerminalContextKey = contextKey
    resetShells()
  }, [contextKey, resetShells])

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
          title={disabled ? '当前 Agent 不支持 app-server terminal' : '打开 Terminal'}
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
    resizeShell(sessionId)
    if (active) void startShell(sessionId)

    return () => {
      inputDisposable.dispose()
      resizeObserver.disconnect()
      terminal.dispose()
      if (runtime.terminal === terminal) runtime.terminal = null
      if (runtime.fitAddon === fitAddon) runtime.fitAddon = null
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

function shellCommand(): string[] {
  if (typeof navigator !== 'undefined' && /Win/i.test(navigator.platform)) return ['cmd.exe']
  if (typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)) return ['/bin/zsh', '-f']
  return ['/bin/bash', '--noprofile', '--norc']
}

function shellLabel(command: string[]): string {
  return command.join(' ')
}

function shellEnvironment(cliBinDir?: string, cliEnv?: Record<string, string>, promptUser = 'movscript'): Record<string, string> {
  const prompt = shellPrompt(promptUser)
  const env: Record<string, string> = {
    ...(cliEnv ?? {}),
    MOVSCRIPT_TERMINAL_USER: promptUser,
    PROMPT: prompt,
    PS1: prompt,
    PROMPT2: '',
    PS2: '',
    RPROMPT: '',
    RPS1: '',
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
  }
  if (cliBinDir) {
    env.MOVSCRIPT_CLI_BIN_DIR = cliBinDir
    env[pathEnvironmentKey()] = prependPathSegment(cliBinDir, defaultShellPath())
  }
  return env
}

function shellPrompt(promptUser: string): string {
  if (typeof navigator !== 'undefined' && /Win/i.test(navigator.platform)) {
    return `$T ${promptUser} $P$G `
  }
  if (typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)) {
    return `%F{cyan}[%D{%H:%M:%S} ${promptUser}]%f %F{blue}%1~%f %# `
  }
  return `\\[\\e[36m\\][\\t ${promptUser}]\\[\\e[0m\\] \\[\\e[34m\\]\\W\\[\\e[0m\\] \\$ `
}

function terminalPromptUser(username: string | undefined): string {
  const sanitized = username
    ?.replace(/[\x00-\x1F\x7F]/g, '')
    .trim()
    .replace(/[^A-Za-z0-9._@-]/g, '_')
  return sanitized || 'movscript'
}

function pathEnvironmentKey(): 'PATH' | 'Path' {
  if (typeof navigator !== 'undefined' && /Win/i.test(navigator.platform)) return 'Path'
  return 'PATH'
}

function defaultShellPath(): string {
  if (typeof navigator !== 'undefined' && /Win/i.test(navigator.platform)) {
    return 'C:\\Windows\\System32;C:\\Windows;C:\\Windows\\System32\\Wbem'
  }
  return '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin'
}

function prependPathSegment(segment: string, currentPath: string): string {
  const separator = pathEnvironmentKey() === 'Path' ? ';' : ':'
  const entries = currentPath.split(separator).filter(Boolean)
  const withoutDuplicate = entries.filter((entry) => entry !== segment)
  return [segment, ...withoutDuplicate].join(separator)
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

function encodeUtf8Base64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function decodeBase64Utf8(value: string): string {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new TextDecoder().decode(bytes)
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stopTerminalProcess(client: AppServerRpcClient | null, processId: string | null): void {
  if (!client || !processId) return
  void client.requestProtocol('command/exec/terminate', { processId }).catch((terminateError) => {
    console.warn('[agent-terminal] failed to terminate shell', terminateError)
  })
}
