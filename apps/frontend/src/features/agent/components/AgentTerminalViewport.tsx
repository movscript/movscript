import { useEffect, useRef } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'

import {
  AGENT_TERMINAL_DEFAULT_COLS,
  AGENT_TERMINAL_DEFAULT_ROWS,
  type ShellRuntime,
} from '@/features/agent/components/AgentTerminalRuntimeModel'

export function ShellTerminalViewport({
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
    runtime.host = host

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
    terminal.open(host)
    terminal.loadAddon(fitAddon)
    const disposeThemeObserver = observeTerminalTheme(host, terminal)
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
      disposeThemeObserver()
      inputDisposable.dispose()
      resizeObserver.disconnect()
      if (runtime.terminal === terminal) runtime.terminal = null
      if (runtime.fitAddon === fitAddon) runtime.fitAddon = null
      if (runtime.host === host) runtime.host = null
      disposeTerminal(terminal)
    }
  }, [active, disabled, resizeShell, runtimeFor, sendShellData, sessionId, startShell])

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

export function canFitTerminal(runtime: ShellRuntime, terminal: Terminal): boolean {
  const host = runtime.host
  const element = terminal.element
  if (!element || !host || !element.isConnected || !host.isConnected) return false
  if (host.getAttribute('data-active') !== 'true') return false
  const hostBounds = host.getBoundingClientRect()
  if (hostBounds.width <= 0 || hostBounds.height <= 0) return false
  const dimensions = terminalRenderDimensions(terminal)
  return (
    Number(dimensions?.css.cell.width) > 0 &&
    Number(dimensions?.css.cell.height) > 0
  )
}

function terminalRenderDimensions(terminal: Terminal): {
  css: { cell: { width: number; height: number } }
} | null {
  const core = (terminal as Terminal & {
    _core?: {
      _renderService?: {
        dimensions?: {
          css: { cell: { width: number; height: number } }
        }
      }
    }
  })._core

  try {
    return core?._renderService?.dimensions ?? null
  } catch {
    return null
  }
}

function disposeTerminal(terminal: Terminal): void {
  try {
    disableTerminalViewportSync(terminal)
    terminal.dispose()
  } catch (disposeError) {
    console.warn('[agent-terminal] failed to dispose terminal', disposeError)
  }
}

function disableTerminalViewportSync(terminal: Terminal): void {
  const core = (terminal as Terminal & {
    _core?: {
      viewport?: {
        syncScrollArea?: () => void
      }
    }
  })._core

  if (core?.viewport) core.viewport.syncScrollArea = () => undefined
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

function observeTerminalTheme(host: HTMLElement, terminal: Terminal): () => void {
  const applyTheme = () => {
    terminal.options.theme = { ...terminalTheme(host) }
  }
  applyTheme()

  const root = document.documentElement
  const shell = host.closest('.app-shell')
  const observer = new MutationObserver(() => applyTheme())
  observer.observe(root, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] })
  if (shell) observer.observe(shell, { attributes: true, attributeFilter: ['data-surface', 'data-chrome', 'data-layout', 'style'] })

  return () => observer.disconnect()
}
