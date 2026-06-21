import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

import {
  createLocalTerminal,
  killLocalTerminal,
  localTerminalAvailable,
  resizeLocalTerminal,
  subscribeLocalTerminalEvents,
  writeLocalTerminal,
} from '@/features/agent/application/localTerminalElectron'
import type { MovScriptWorkspaceContext } from '@/shared/infrastructure/providerConfigStore'
import {
  AGENT_TERMINAL_DEFAULT_COLS,
  AGENT_TERMINAL_DEFAULT_ROWS,
  FIRST_SHELL_ID,
  appendShellOutput,
  compactPath,
  createInitialAgentTerminalStore,
  createShellSession,
  terminalStatusLabel,
  type AgentTerminalStoreState,
  type ShellRuntime,
  type ShellSession,
  type TerminalStatus,
} from '@/features/agent/components/AgentTerminalRuntimeModel'
import { canFitTerminal } from '@/features/agent/components/AgentTerminalViewport'

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

export function useAgentTerminalController({
  controlledOpen,
  onOpenChange,
  workspaceContext,
}: {
  controlledOpen?: boolean
  onOpenChange?: (open: boolean) => void
  workspaceContext: MovScriptWorkspaceContext
}) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const terminalStore = useAgentTerminalStore()
  const sessions = terminalStore.sessions
  const activeShellId = terminalStore.activeShellId
  const shellResetNonce = terminalStore.shellResetNonce

  const workspaceContextKey = JSON.stringify(workspaceContext)
  const controlled = controlledOpen !== undefined
  const disabled = !localTerminalAvailable()
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
        host: null,
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

  const runtimeSnapshot = useCallback((id: string): ShellRuntime | undefined => {
    return agentTerminalRuntimes.get(id)
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
    if (!canFitTerminal(runtime, terminal)) return
    try {
      fitAddon.fit()
    } catch (fitError) {
      console.warn('[agent-terminal] failed to fit terminal', fitError)
      return
    }
    if (!runtime.terminalSessionId) return
    void resizeLocalTerminal({
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
      .then(() => writeLocalTerminal({
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
    if (runtime.terminalSessionId) void killLocalTerminal({ sessionId: runtime.terminalSessionId })
    runtime.terminalSessionId = null
    setShellStatus(id, 'exited')
  }, [setShellStatus])

  const startShell = useCallback(async (id: string) => {
    if (!localTerminalAvailable()) {
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
    terminal.clear()
    appendShellOutput(runtime, 'Starting host shell...\r\n')

    try {
      const result = await createLocalTerminal({
        sessionId: id,
        workspaceContext,
        size: {
          rows: terminal.rows || AGENT_TERMINAL_DEFAULT_ROWS,
          cols: terminal.cols || AGENT_TERMINAL_DEFAULT_COLS,
        },
      })
      if (runtime.runToken !== token) return
      if (!result) throw new Error('Local terminal is not available in this runtime.')
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
      runtime.unsubscribe?.()
    }
    agentTerminalRuntimes.clear()
    updateAgentTerminalStore((current) => ({
      ...createInitialAgentTerminalStore(),
      shellResetNonce: current.shellResetNonce + 1,
    }))
  }, [sessions, stopShell])

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
    return subscribeLocalTerminalEvents((event) => {
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

  return {
    activeSession,
    activeShellId,
    addShell,
    closeShell,
    controlled,
    disabled,
    open,
    resizeShell,
    runtimeFor,
    runtimeSnapshot,
    sendShellData,
    sessions,
    setActiveShellId,
    setOpen,
    shellResetNonce,
    shortCwd,
    startShell,
    statusLabel,
  }
}
