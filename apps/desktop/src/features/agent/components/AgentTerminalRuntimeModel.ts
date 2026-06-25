import type { FitAddon } from '@xterm/addon-fit'
import type { Terminal } from '@xterm/xterm'

export const AGENT_TERMINAL_DEFAULT_ROWS = 12
export const AGENT_TERMINAL_DEFAULT_COLS = 100
export const FIRST_SHELL_ID = 'shell_1'

const AGENT_TERMINAL_OUTPUT_BUFFER_LIMIT = 200_000

export type TerminalStatus = 'idle' | 'starting' | 'running' | 'exited' | 'error'

export type ShellSession = {
  id: string
  index: number
  title: string
  status: TerminalStatus
  cwd: string
  error: string
}

export type ShellRuntime = {
  terminal: Terminal | null
  fitAddon: FitAddon | null
  host: HTMLDivElement | null
  terminalSessionId: string | null
  status: TerminalStatus
  outputBuffer: string
  writeChain: Promise<unknown>
  runToken: number
  unsubscribe: (() => void) | null
}

export type AgentTerminalStoreState = {
  sessions: ShellSession[]
  activeShellId: string
  shellResetNonce: number
  nextShellIndex: number
}

export function createInitialAgentTerminalStore(): AgentTerminalStoreState {
  return {
    sessions: [createShellSession(1)],
    activeShellId: FIRST_SHELL_ID,
    shellResetNonce: 0,
    nextShellIndex: 1,
  }
}

export function createShellSession(index: number): ShellSession {
  return {
    id: `shell_${index}`,
    index,
    title: `Shell ${index}`,
    status: 'idle',
    cwd: '',
    error: '',
  }
}

export function appendShellOutput(runtime: ShellRuntime, data: string): void {
  runtime.outputBuffer += data
  if (runtime.outputBuffer.length > AGENT_TERMINAL_OUTPUT_BUFFER_LIMIT) {
    runtime.outputBuffer = runtime.outputBuffer.slice(-AGENT_TERMINAL_OUTPUT_BUFFER_LIMIT)
  }
  runtime.terminal?.write(data)
}

export function terminalStatusLabel(status: TerminalStatus, disabled: boolean): string {
  if (disabled) return 'unavailable'
  if (status === 'starting') return 'starting'
  if (status === 'running') return 'running'
  if (status === 'exited') return 'exited'
  if (status === 'error') return 'error'
  return 'idle'
}

export function compactPath(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  if (parts.length <= 3) return path
  return `.../${parts.slice(-3).join('/')}`
}
