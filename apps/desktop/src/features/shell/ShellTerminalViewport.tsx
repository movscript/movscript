import { useEffect, useRef } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'

import {
  SHELL_TERMINAL_FONT_FAMILY,
  SHELL_TERMINAL_FONT_SIZE,
  SHELL_TERMINAL_LINE_HEIGHT,
  shellTerminalThemeFromStyle,
} from '@/features/shell/shellTheme'
import {
  SHELL_WORKBENCH_DEFAULT_COLS,
  SHELL_WORKBENCH_DEFAULT_ROWS,
  type ShellRuntime,
} from '@/features/shell/ShellWorkbenchModel'

export function ShellTerminalViewport({
  active,
  disabled,
  shellId,
  runtimeFor,
  resizeShell,
  sendShellData,
  startShell,
}: {
  active: boolean
  disabled: boolean
  shellId: string
  runtimeFor: (id: string) => ShellRuntime
  resizeShell: (id: string) => void
  sendShellData: (id: string, data: string) => void
  startShell: (id: string) => Promise<void>
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined
    const runtime = runtimeFor(shellId)
    if (runtime.terminal) return undefined
    runtime.host = host

    const terminal = new Terminal({
      allowProposedApi: false,
      convertEol: true,
      cursorBlink: true,
      disableStdin: disabled,
      fontFamily: SHELL_TERMINAL_FONT_FAMILY,
      fontSize: SHELL_TERMINAL_FONT_SIZE,
      lineHeight: SHELL_TERMINAL_LINE_HEIGHT,
      rows: SHELL_WORKBENCH_DEFAULT_ROWS,
      cols: SHELL_WORKBENCH_DEFAULT_COLS,
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

    const inputDisposable = terminal.onData((data) => sendShellData(shellId, data))
    const resizeObserver = new ResizeObserver(() => resizeShell(shellId))
    resizeObserver.observe(host)
    const frame = window.requestAnimationFrame(() => {
      resizeShell(shellId)
      if (active) void startShell(shellId)
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
  }, [active, disabled, resizeShell, runtimeFor, sendShellData, shellId, startShell])

  useEffect(() => {
    if (!active) return
    runtimeFor(shellId).terminal?.focus()
    resizeShell(shellId)
  }, [active, resizeShell, runtimeFor, shellId])

  return (
    <div
      ref={hostRef}
      className="shell-workbench-panel__xterm"
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
    console.warn('[shell-workbench] failed to dispose terminal', disposeError)
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
  return shellTerminalThemeFromStyle(window.getComputedStyle(host))
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
