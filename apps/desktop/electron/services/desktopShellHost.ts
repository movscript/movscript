import { randomUUID } from 'node:crypto'
import { chmodSync, existsSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { userInfo } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import {
  resolveMovScriptWorkspaceRootPaths,
  type MovScriptWorkspaceContextPaths,
} from '@movscript/workspace/home'
import { desktopShellHostEnv } from './desktopShellHostEnv'
import { resolveDesktopDefaultMovScriptWorkspaceDir } from './movscriptWorkspaceDefaults'
import { resolveDesktopWorkspaceContextPaths, resolveDesktopWorkspaceRealm } from './workspaceRealm'
import type {
  ElectronDesktopShellHostCreateInput,
  ElectronDesktopShellHostCreateResult,
  ElectronDesktopShellHostEvent,
  ElectronDesktopShellHostJob,
  ElectronDesktopShellHostJobInput,
  ElectronDesktopShellHostJobListInput,
  ElectronDesktopShellHostJobListResult,
  ElectronDesktopShellHostJobLogsResult,
  ElectronDesktopShellHostJobStatus,
  ElectronDesktopShellHostKillInput,
  ElectronDesktopShellHostListInput,
  ElectronDesktopShellHostListResult,
  ElectronDesktopShellHostLogsResult,
  ElectronDesktopShellHostReveal,
  ElectronDesktopShellHostResizeInput,
  ElectronDesktopShellHostRunInput,
  ElectronDesktopShellHostSession as ElectronDesktopShellHostSessionSnapshot,
  ElectronDesktopShellHostSessionInput,
  ElectronDesktopShellHostStatus,
  ElectronDesktopShellHostWriteInput,
  ElectronMovScriptWorkspaceContext,
} from '../../src/shared/contracts/electronApi'

type NodePtyModule = typeof import('node-pty')
type DesktopShellHostListener = (event: ElectronDesktopShellHostEvent) => void
const require = createRequire(import.meta.url)

type DesktopShellHostSession = {
  id: string
  title: string
  owner: NonNullable<ElectronDesktopShellHostCreateInput['owner']>
  scope: NonNullable<ElectronDesktopShellHostCreateInput['scope']>
  ownerFeature: string
  reveal: ElectronDesktopShellHostReveal
  status: ElectronDesktopShellHostStatus
  cwd: string
  shell: string
  command: string
  initialCommand: string
  outputBuffer: string
  windowId: string
  workspaceKey: string
  projectId: string
  projectUid: string
  projectDir: string
  previewUrl: string
  createdAt: number
  updatedAt: number
  exitCode?: number
  signal?: number
  pid?: number
  pty: ReturnType<NodePtyModule['spawn']> | null
  disposables: Array<{ dispose(): void }>
}

const DESKTOP_SHELL_HOST_OUTPUT_BUFFER_LIMIT = 200_000

class DesktopShellHostManager {
  private readonly sessions = new Map<string, DesktopShellHostSession>()
  private readonly listeners = new Set<DesktopShellHostListener>()
  private ptyModulePromise: Promise<NodePtyModule> | null = null

  onEvent(listener: DesktopShellHostListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  sessionsForReuse(): Iterable<DesktopShellHostSession> {
    return this.sessions.values()
  }

  async create(input: ElectronDesktopShellHostCreateInput = {}): Promise<ElectronDesktopShellHostCreateResult> {
    const requestedSessionId = input.sessionId?.trim()
    if (requestedSessionId) {
      const existing = this.sessions.get(requestedSessionId)
      if (existing?.status === 'running' && existing.pty) {
        existing.updatedAt = Date.now()
        return desktopShellHostCreateResult(existing)
      }
      if (existing) this.removeSession(existing)
    }

    const pty = await this.loadNodePty()
    const sessionId = requestedSessionId || randomUUID()
    const explicitProjectDir = input.projectDir?.trim()
    const explicitCwd = input.cwd?.trim()
    const workspace = resolveDesktopShellHostWorkspace(input)
    const workspaceProjectDir = workspace.scope === 'project' || workspace.scope === 'production'
      ? workspace.projectCwd
      : ''
    const projectDir = explicitProjectDir || workspaceProjectDir
    const projectId = input.projectId?.trim() || (projectDir ? workspace.context.projectId : undefined)
    const cwd = explicitCwd || explicitProjectDir || workspace.providerSessionCwd
    const shell = desktopShellHostShell()
    const size = input.size ?? { rows: 24, cols: 80 }
    const now = Date.now()
    const owner = input.owner ?? 'user'
    const scope = input.scope ?? (owner === 'system' ? 'workspace' : 'window')
    const child = pty.spawn(shell.command, shell.args, {
      name: 'xterm-256color',
      cols: clampTerminalCols(size.cols),
      rows: clampTerminalRows(size.rows),
      cwd,
      env: desktopShellHostEnv({
        inheritedEnv: process.env,
        workspaceDir: workspace.workspaceDir,
        ...(projectDir ? { projectDir } : {}),
        userId: workspace.context.userId,
        orgId: workspace.context.orgId,
        ...(projectId ? { projectId } : {}),
      }),
    })
    const session: DesktopShellHostSession = {
      id: sessionId,
      title: input.title?.trim() || 'Shell',
      owner,
      scope,
      ownerFeature: input.ownerFeature?.trim() || (owner === 'system' ? 'shell' : ''),
      reveal: input.reveal ?? 'always',
      status: 'running',
      cwd,
      shell: [shell.command, ...shell.args].join(' '),
      command: '',
      initialCommand: input.initialCommand?.trim() ?? '',
      outputBuffer: '',
      windowId: input.windowId?.trim() ?? '',
      workspaceKey: input.workspaceKey?.trim() ?? '',
      projectId: input.projectId?.trim() ?? '',
      projectUid: input.projectUid?.trim() ?? '',
      projectDir: input.projectDir?.trim() ?? '',
      previewUrl: input.previewUrl?.trim() ?? '',
      createdAt: now,
      updatedAt: now,
      pid: child.pid,
      pty: child,
      disposables: [],
    }
    session.disposables.push(child.onData((data) => {
      appendDesktopShellHostOutput(session, data)
      this.emit({ kind: 'output', sessionId, data })
    }))
    session.disposables.push(child.onExit((event) => {
      session.status = 'exited'
      session.exitCode = event.exitCode
      if (event.signal !== undefined) session.signal = event.signal
      session.updatedAt = Date.now()
      this.emit({
        kind: 'exit',
        sessionId,
        exitCode: event.exitCode,
        ...(event.signal !== undefined ? { signal: event.signal } : {}),
      })
      this.disposeSession(session)
    }))
    this.sessions.set(sessionId, session)
    return {
      sessionId,
      cwd,
      shell: session.shell,
      pid: child.pid,
    }
  }

  async runCommand(input: ElectronDesktopShellHostRunInput): Promise<ElectronDesktopShellHostCreateResult> {
    const command = input.command.trim()
    const reusable = findReusableDesktopShellHostCommandSession(input)
    if (reusable) {
      if (input.previewUrl?.trim() && !reusable.previewUrl) reusable.previewUrl = input.previewUrl.trim()
      reusable.updatedAt = Date.now()
      return desktopShellHostCreateResult(reusable)
    }
    const result = await this.create({
      ...input,
      owner: input.owner ?? 'system',
      scope: input.scope ?? 'workspace',
      ownerFeature: input.ownerFeature ?? 'shell',
      reveal: input.reveal ?? 'always',
      initialCommand: input.initialCommand ?? input.command,
    })
    const session = this.requireSession(result.sessionId)
    if (!session.pty) throw new Error(`shell session is not running: ${result.sessionId}`)
    session.command = command
    session.initialCommand = input.initialCommand?.trim() || command
    session.updatedAt = Date.now()
    if (command) session.pty.write(`${command}\r`)
    return result
  }

  listSessions(input: ElectronDesktopShellHostListInput = {}): ElectronDesktopShellHostListResult {
    return {
      sessions: Array.from(this.sessions.values())
        .filter((session) => desktopShellHostSessionMatches(session, input))
        .map(desktopShellHostSessionSnapshot),
    }
  }

  getSession(input: ElectronDesktopShellHostSessionInput): ElectronDesktopShellHostSessionSnapshot | undefined {
    const session = this.sessions.get(input.sessionId.trim())
    return session ? desktopShellHostSessionSnapshot(session) : undefined
  }

  getLogs(input: ElectronDesktopShellHostSessionInput): ElectronDesktopShellHostLogsResult {
    const sessionId = input.sessionId.trim()
    return {
      sessionId,
      text: this.sessions.get(sessionId)?.outputBuffer ?? '',
    }
  }

  listJobs(input: ElectronDesktopShellHostJobListInput = {}): ElectronDesktopShellHostJobListResult {
    return {
      jobs: Array.from(this.sessions.values())
        .filter((session) => desktopShellHostJobMatches(session, input))
        .map(desktopShellHostJobSnapshot)
        .filter((job): job is ElectronDesktopShellHostJob => Boolean(job)),
    }
  }

  getJob(input: ElectronDesktopShellHostJobInput): ElectronDesktopShellHostJob | undefined {
    const session = desktopShellHostSessionForJobInput(this.sessions, input)
    return session ? desktopShellHostJobSnapshot(session) : undefined
  }

  getJobLogs(input: ElectronDesktopShellHostJobInput): ElectronDesktopShellHostJobLogsResult {
    const session = desktopShellHostSessionForJobInput(this.sessions, input)
    const sessionId = session?.id ?? input.sessionId?.trim() ?? ''
    return {
      jobId: session ? desktopShellHostJobId(session) : input.jobId?.trim() ?? '',
      sessionId,
      text: session?.outputBuffer ?? '',
    }
  }

  write(input: ElectronDesktopShellHostWriteInput): void {
    const session = this.requireSession(input.sessionId)
    if (!session.pty) throw new Error(`shell session is not running: ${input.sessionId}`)
    session.updatedAt = Date.now()
    session.pty.write(input.data)
  }

  resize(input: ElectronDesktopShellHostResizeInput): void {
    const session = this.sessions.get(input.sessionId)
    if (!session?.pty) return
    session.updatedAt = Date.now()
    session.pty.resize(clampTerminalCols(input.size.cols), clampTerminalRows(input.size.rows))
  }

  kill(input: ElectronDesktopShellHostKillInput): void {
    const session = this.sessions.get(input.sessionId)
    if (!session?.pty) return
    session.updatedAt = Date.now()
    session.pty.kill()
  }

  stopWindowScopedSessions(windowId: string): void {
    const normalizedWindowId = windowId.trim()
    if (!normalizedWindowId) return
    for (const session of Array.from(this.sessions.values())) {
      if (session.scope !== 'window' || session.windowId !== normalizedWindowId) continue
      this.killSession(session)
    }
  }

  stopAll(): void {
    for (const session of Array.from(this.sessions.values())) {
      this.killSession(session)
    }
  }

  private requireSession(sessionId: string): DesktopShellHostSession {
    const normalized = sessionId.trim()
    const session = this.sessions.get(normalized)
    if (!session) throw new Error(`shell session not found: ${normalized}`)
    return session
  }

  private async loadNodePty(): Promise<NodePtyModule> {
    if (!this.ptyModulePromise) {
      ensureNodePtySpawnHelperExecutable()
      this.ptyModulePromise = import('node-pty')
    }
    return this.ptyModulePromise
  }

  private disposeSession(session: DesktopShellHostSession): void {
    for (const disposable of session.disposables.splice(0)) disposable.dispose()
    session.pty = null
  }

  private killSession(session: DesktopShellHostSession): void {
    session.updatedAt = Date.now()
    if (!session.pty) return
    try {
      session.pty.kill()
    } catch {
      session.status = 'exited'
      session.exitCode = session.exitCode ?? 1
      this.disposeSession(session)
    }
  }

  private removeSession(session: DesktopShellHostSession): void {
    if (session.pty) {
      try {
        session.pty.kill()
      } catch {
        // Best effort cleanup before replacing an exited/stale session id.
      }
    }
    this.sessions.delete(session.id)
    this.disposeSession(session)
  }

  private emit(event: ElectronDesktopShellHostEvent): void {
    for (const listener of Array.from(this.listeners)) listener(event)
  }
}

function appendDesktopShellHostOutput(session: DesktopShellHostSession, data: string): void {
  session.outputBuffer += data
  if (session.outputBuffer.length > DESKTOP_SHELL_HOST_OUTPUT_BUFFER_LIMIT) {
    session.outputBuffer = session.outputBuffer.slice(-DESKTOP_SHELL_HOST_OUTPUT_BUFFER_LIMIT)
  }
  session.updatedAt = Date.now()
}

function desktopShellHostSessionMatches(session: DesktopShellHostSession, input: ElectronDesktopShellHostListInput): boolean {
  if (input.owner && session.owner !== input.owner) return false
  if (input.scope && session.scope !== input.scope) return false
  if (input.windowId && session.windowId !== input.windowId) return false
  if (input.workspaceKey && session.workspaceKey !== input.workspaceKey) return false
  if (input.cwd && session.cwd !== input.cwd) return false
  if (input.projectId && session.projectId !== input.projectId) return false
  if (input.projectUid && session.projectUid !== input.projectUid) return false
  if (
    input.projectDir
    && !desktopShellHostPathMatches(session.projectDir, input.projectDir)
    && !desktopShellHostPathMatches(session.cwd, input.projectDir)
  ) return false
  return true
}

function desktopShellHostJobMatches(session: DesktopShellHostSession, input: ElectronDesktopShellHostJobListInput): boolean {
  if (session.owner !== 'system') return false
  if (!desktopShellHostJobCommandText(session)) return false
  if (input.ownerFeature && session.ownerFeature !== input.ownerFeature) return false
  return desktopShellHostSessionMatches(session, input)
}

function findReusableDesktopShellHostCommandSession(input: ElectronDesktopShellHostRunInput): DesktopShellHostSession | undefined {
  const owner = input.owner ?? 'system'
  const scope = input.scope ?? 'workspace'
  const title = input.title?.trim()
  const ownerFeature = input.ownerFeature?.trim() || (owner === 'system' ? 'shell' : '')
  if (owner !== 'system' || scope === 'window' || !title) return undefined
  return Array.from(desktopShellHostManager.sessionsForReuse()).find((session) => (
    session.owner === owner
    && session.scope === scope
    && session.status === 'running'
    && Boolean(session.pty)
    && session.title === title
    && session.ownerFeature === ownerFeature
    && desktopShellHostCommandMatches(session, input.command)
    && desktopShellHostWorkspaceMatches(session, input)
  ))
}

function desktopShellHostCommandMatches(session: DesktopShellHostSession, command: string): boolean {
  const current = desktopShellHostJobCommandText(session).trim()
  return Boolean(current && command.trim() && current === command.trim())
}

function desktopShellHostWorkspaceMatches(session: DesktopShellHostSession, input: ElectronDesktopShellHostRunInput): boolean {
  if ((input.scope ?? 'workspace') === 'home') return session.scope === 'home'
  const workspaceKey = input.workspaceKey?.trim()
  if (workspaceKey && session.workspaceKey) return session.workspaceKey === workspaceKey
  const projectUid = input.projectUid?.trim()
  const projectId = input.projectId?.trim()
  if (projectUid && (session.projectUid === projectUid || session.projectId === projectUid)) return true
  if (projectId && session.projectId === projectId) return true
  if (projectUid || projectId) return false
  const cwd = input.cwd?.trim() || input.projectDir?.trim()
  if (cwd) {
    return desktopShellHostPathMatches(session.cwd, cwd)
      || desktopShellHostPathMatches(session.projectDir, cwd)
  }
  return false
}

function desktopShellHostPathMatches(candidate: unknown, workspaceRoot: unknown): boolean {
  const candidatePath = normalizedDesktopShellHostPath(candidate)
  const rootPath = normalizedDesktopShellHostPath(workspaceRoot)
  return Boolean(candidatePath && rootPath && (
    candidatePath === rootPath
    || candidatePath.startsWith(`${rootPath}/`)
  ))
}

function normalizedDesktopShellHostPath(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().replace(/\\/g, '/').replace(/\/+$/, '')
    : ''
}

function desktopShellHostCreateResult(session: DesktopShellHostSession): ElectronDesktopShellHostCreateResult {
  return {
    sessionId: session.id,
    cwd: session.cwd,
    shell: session.shell,
    ...(session.pid !== undefined ? { pid: session.pid } : {}),
    status: session.status,
  }
}

function desktopShellHostSessionSnapshot(session: DesktopShellHostSession): ElectronDesktopShellHostSessionSnapshot {
  return {
    schema: 'movscript.shell_session.v1',
    sessionId: session.id,
    title: session.title,
    owner: session.owner,
    scope: session.scope,
    status: session.status,
    cwd: session.cwd,
    shell: session.shell,
    ...(session.pid !== undefined ? { pid: session.pid } : {}),
    ...(session.exitCode !== undefined ? { exitCode: session.exitCode } : {}),
    ...(session.signal !== undefined ? { signal: session.signal } : {}),
    ...(session.command ? { command: session.command } : {}),
    ...(session.initialCommand ? { initialCommand: session.initialCommand } : {}),
    ...(session.windowId ? { windowId: session.windowId } : {}),
    ...(session.workspaceKey ? { workspaceKey: session.workspaceKey } : {}),
    ...(session.projectId ? { projectId: session.projectId } : {}),
    ...(session.projectUid ? { projectUid: session.projectUid } : {}),
    ...(session.projectDir ? { projectDir: session.projectDir } : {}),
    ...(session.ownerFeature ? { ownerFeature: session.ownerFeature } : {}),
    ...(session.previewUrl ? { previewUrl: session.previewUrl } : {}),
    reveal: session.reveal,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  }
}

function desktopShellHostJobSnapshot(session: DesktopShellHostSession): ElectronDesktopShellHostJob | undefined {
  const commandText = desktopShellHostJobCommandText(session)
  if (session.owner !== 'system' || !commandText) return undefined
  const status = desktopShellHostJobStatus(session)
  return {
    schema: 'movscript.shell_job.v1',
    jobId: desktopShellHostJobId(session),
    sessionId: session.id,
    title: session.title,
    ownerFeature: session.ownerFeature || 'shell',
    scope: session.scope,
    status,
    cwd: session.cwd,
    commandText,
    reveal: session.reveal,
    ...(session.pid !== undefined ? { pid: session.pid } : {}),
    ...(session.exitCode !== undefined ? { exitCode: session.exitCode } : {}),
    ...(session.signal !== undefined ? { signal: session.signal } : {}),
    ...(session.projectId ? { projectId: session.projectId } : {}),
    ...(session.projectUid ? { projectUid: session.projectUid } : {}),
    ...(session.projectDir ? { projectDir: session.projectDir } : {}),
    ...(session.previewUrl ? { previewUrl: session.previewUrl } : {}),
    startedAt: session.createdAt,
    updatedAt: session.updatedAt,
    ...(status === 'running' ? {} : { endedAt: session.updatedAt }),
  }
}

function desktopShellHostJobId(session: DesktopShellHostSession): string {
  return `desktop-shell-host-job:${session.id}`
}

function desktopShellHostJobCommandText(session: DesktopShellHostSession): string {
  return session.command || session.initialCommand
}

function desktopShellHostJobStatus(session: DesktopShellHostSession): ElectronDesktopShellHostJobStatus {
  if (session.status === 'running') return 'running'
  if (session.signal !== undefined) return 'stopped'
  if (session.exitCode === 0) return 'succeeded'
  return 'failed'
}

function desktopShellHostSessionForJobInput(
  sessions: Map<string, DesktopShellHostSession>,
  input: ElectronDesktopShellHostJobInput,
): DesktopShellHostSession | undefined {
  const sessionId = input.sessionId?.trim() || desktopShellHostSessionIdFromJobId(input.jobId)
  return sessionId ? sessions.get(sessionId) : undefined
}

function desktopShellHostSessionIdFromJobId(jobId: string | undefined): string {
  const normalized = jobId?.trim() ?? ''
  const prefix = 'desktop-shell-host-job:'
  return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized
}

export const desktopShellHostManager = new DesktopShellHostManager()

function ensureNodePtySpawnHelperExecutable(): void {
  if (process.platform === 'win32') return
  let nodePtyRoot: string
  try {
    nodePtyRoot = dirname(dirname(require.resolve('node-pty')))
  } catch (error) {
    console.warn('[desktop-shell-host] failed to resolve node-pty before spawn', error)
    return
  }

  const normalizedRoots = Array.from(new Set([
    nodePtyRoot,
    nodePtyRoot.replace('app.asar', 'app.asar.unpacked').replace('node_modules.asar', 'node_modules.asar.unpacked'),
  ]))
  const helperCandidates = normalizedRoots.flatMap((root) => [
    join(root, 'build', 'Release', 'spawn-helper'),
    join(root, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper'),
  ])

  for (const helper of helperCandidates) {
    if (!existsSync(helper)) continue
    try {
      const mode = statSync(helper).mode
      if ((mode & 0o111) === 0) chmodSync(helper, mode | 0o755)
      return
    } catch (error) {
      console.warn('[desktop-shell-host] failed to make node-pty spawn-helper executable', helper, error)
    }
  }
}

function resolveDesktopShellHostWorkspace(input: ElectronDesktopShellHostCreateInput): MovScriptWorkspaceContextPaths {
  const explicitCwd = input.cwd?.trim()
  const explicitProjectDir = input.projectDir?.trim()
  if (!explicitCwd && !explicitProjectDir) {
    return resolveDesktopWorkspaceContextPaths({ workspaceContext: input.workspaceContext })
  }

  try {
    return resolveDesktopWorkspaceContextPaths({ workspaceContext: input.workspaceContext })
  } catch {
    return resolveExplicitDesktopShellHostWorkspace(input, explicitCwd || explicitProjectDir || process.cwd())
  }
}

function resolveExplicitDesktopShellHostWorkspace(
  input: ElectronDesktopShellHostCreateInput,
  fallbackCwd: string,
): MovScriptWorkspaceContextPaths {
  const workspaceDir = resolveDesktopDefaultMovScriptWorkspaceDir()
  const root = resolveMovScriptWorkspaceRootPaths(workspaceDir)
  const realm = resolveDesktopWorkspaceRealm(root.workspaceDir)
  const explicitProjectDir = input.projectDir?.trim()
  const cwd = resolve(fallbackCwd)
  const projectCwd = resolve(explicitProjectDir || cwd)
  const scope: MovScriptWorkspaceContextPaths['scope'] = explicitProjectDir ? 'project' : 'global'
  const ownerContext = desktopShellHostOwnerContext(input.workspaceContext)
  const context = {
    realm,
    scope,
    ...ownerContext,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(explicitProjectDir ? { projectDir: projectCwd } : {}),
  }

  return {
    workspaceDir: root.workspaceDir,
    controlDir: root.controlDir,
    scope,
    context,
    contextKey: [
      'explicit-shell',
      realm.kind,
      realm.id,
      ownerContext.orgId ? `org/${ownerContext.orgId}` : ownerContext.userId ? `user/${ownerContext.userId}` : 'anonymous',
      scope === 'project' ? `path/${projectCwd}` : `cwd/${cwd}`,
    ].join('/'),
    realmDir: realm.kind === 'local' ? join(root.realmsDir, 'local') : join(root.realmsDir, 'cloud', realm.id),
    projectCwd,
    providerSessionCwd: cwd,
  }
}

function desktopShellHostOwnerContext(context: ElectronMovScriptWorkspaceContext | undefined): { userId?: string; orgId?: string } {
  const orgId = desktopShellHostIdValue(context?.orgId)
  if (orgId) return { orgId }
  const userId = desktopShellHostIdValue(context?.userId)
  return userId ? { userId } : {}
}

function desktopShellHostIdValue(value: string | number | undefined): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function desktopShellHostShell(): { command: string; args: string[] } {
  if (process.platform === 'win32') return { command: process.env.ComSpec || 'cmd.exe', args: [] }
  const accountShell = typeof userInfo().shell === 'string' ? userInfo().shell : ''
  return { command: process.env.SHELL || accountShell || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash'), args: [] }
}

function clampTerminalRows(value: number): number {
  return Number.isFinite(value) ? Math.max(2, Math.min(200, Math.round(value))) : 24
}

function clampTerminalCols(value: number): number {
  return Number.isFinite(value) ? Math.max(10, Math.min(500, Math.round(value))) : 80
}
