import type { FitAddon } from '@xterm/addon-fit'
import type { Terminal } from '@xterm/xterm'

export const SHELL_WORKBENCH_DEFAULT_ROWS = 12
export const SHELL_WORKBENCH_DEFAULT_COLS = 100
const SHELL_WORKBENCH_SESSION_PREFIX = `shell_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

const SHELL_WORKBENCH_OUTPUT_BUFFER_LIMIT = 200_000

export type ShellStatus = 'idle' | 'starting' | 'running' | 'blocked' | 'failed' | 'exited' | 'needs_external_shell'
export type ShellOwnerKind = 'user' | 'system'
export type ShellScope = 'window' | 'workspace' | 'home'
export type ShellJobReveal = 'always' | 'on_error' | 'silent'
export type ShellSessionSchema = 'movscript.shell_session.v1'
export type ShellJobSchema = 'movscript.shell_job.v1'
export type ShellIntentSchema = 'movscript.shell_intent.v1'
export type ShellWorkbenchMode = 'desktop_shell_host' | 'external_shell_intent'

export type ShellSession = {
  schema: ShellSessionSchema
  id: string
  jobId?: string
  index: number
  title: string
  owner: ShellOwnerKind
  scope: ShellScope
  ownerFeature?: string
  jobReveal?: ShellJobReveal
  status: ShellStatus
  cwd: string
  command: string
  initialCommand: string
  error: string
  exitCode?: number
  signal?: number
  projectId?: string
  projectUid?: string
  projectDir?: string
  workspaceKey?: string
  previewUrl?: string
  createdAt: number
  updatedAt: number
}

export type ShellRuntime = {
  terminal: Terminal | null
  fitAddon: FitAddon | null
  host: HTMLDivElement | null
  terminalSessionId: string | null
  status: ShellStatus
  outputBuffer: string
  writeChain: Promise<unknown>
  runToken: number
  unsubscribe: (() => void) | null
}

export type ShellWorkbenchStoreState = {
  sessions: ShellSession[]
  activeShellId: string
  shellResetNonce: number
  nextShellIndex: number
}

export type ShellJob = {
  schema: ShellJobSchema
  id: string
  title: string
  source: string
  ownerFeature?: string
  status: ShellStatus
  cwd: string
  command: string
  sessionId?: string
  exitCode?: number
  signal?: number
  port?: number
  previewUrl?: string
  progress?: number
  error?: string
  createdAt?: number
  updatedAt?: number
}

export type ShellIntent = {
  schema: ShellIntentSchema
  intentId: string
  title: string
  reason: string
  cwd: string
  command: string[]
  commandText: string
  ownerFeature: string
  expectedPreviewUrl?: string
  destructive: boolean
  status?: ShellStatus
}

export type ShellWorkbenchItem =
  | { kind: 'session'; id: string; session: ShellSession }
  | { kind: 'job'; id: string; job: ShellJob; session?: ShellSession }
  | { kind: 'intent'; id: string; intent: ShellIntent }

export type ShellWorkbenchViewModel = {
  mode: ShellWorkbenchMode
  activeItemId?: string
  items: ShellWorkbenchItem[]
  workspaceLabel?: string
  cwd?: string
  activeJob?: ShellJob
  activeIntent?: ShellIntent
}

export function createInitialShellWorkbenchStore(): ShellWorkbenchStoreState {
  return {
    sessions: [],
    activeShellId: '',
    shellResetNonce: 0,
    nextShellIndex: 0,
  }
}

export function createShellSession(index: number): ShellSession {
  return createShellSessionFromInput(index)
}

export function createShellSessionFromInput(index: number, input: Partial<ShellSession> = {}): ShellSession {
  const now = Date.now()
  const id = input.id ?? `${SHELL_WORKBENCH_SESSION_PREFIX}_${index}`
  const owner = input.owner ?? 'user'
  const command = input.command ?? ''
  const initialCommand = input.initialCommand ?? ''
  const jobId = input.jobId ?? (owner === 'system' && (command || initialCommand) ? shellJobIdForSessionId(id) : undefined)
  const {
    id: _inputId,
    owner: _inputOwner,
    command: _inputCommand,
    initialCommand: _inputInitialCommand,
    jobId: _inputJobId,
    ...restInput
  } = input
  return {
    schema: 'movscript.shell_session.v1',
    id,
    index,
    title: `Shell ${index}`,
    owner,
    scope: 'window',
    status: 'idle',
    cwd: '',
    command,
    initialCommand,
    error: '',
    createdAt: now,
    updatedAt: now,
    ...restInput,
    ...(jobId ? { jobId } : {}),
  }
}

export function shellJobIdForSessionId(sessionId: string): string {
  return `desktop-shell-host-job:${sessionId}`
}

export function appendShellOutput(runtime: ShellRuntime, data: string): void {
  runtime.outputBuffer += data
  if (runtime.outputBuffer.length > SHELL_WORKBENCH_OUTPUT_BUFFER_LIMIT) {
    runtime.outputBuffer = runtime.outputBuffer.slice(-SHELL_WORKBENCH_OUTPUT_BUFFER_LIMIT)
  }
  runtime.terminal?.write(data)
}

export function shellStatusLabel(status: ShellStatus, disabled = false): string {
  if (disabled) return '不可用'
  if (status === 'starting') return '启动中'
  if (status === 'running') return '运行中'
  if (status === 'blocked') return '已阻塞'
  if (status === 'failed') return '失败'
  if (status === 'exited') return '已退出'
  if (status === 'needs_external_shell') return '需要外部 Shell'
  return '空闲'
}

export function shellStatusTone(status: ShellStatus, disabled = false): 'neutral' | 'busy' | 'success' | 'warning' | 'danger' {
  if (disabled) return 'neutral'
  if (status === 'running') return 'success'
  if (status === 'starting') return 'busy'
  if (status === 'blocked' || status === 'needs_external_shell') return 'warning'
  if (status === 'failed') return 'danger'
  return 'neutral'
}

export function shellItemTimestamp(value?: number): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function compactPath(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  if (parts.length <= 3) return path
  return `.../${parts.slice(-3).join('/')}`
}
