import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

import {
  createDesktopShellHostSession,
  getDesktopShellHostLogs,
  killDesktopShellHostSession,
  listDesktopShellHostJobs,
  listDesktopShellHostSessions,
  desktopShellHostAvailable,
  resizeDesktopShellHostSession,
  runDesktopShellHostCommand,
  subscribeDesktopShellHostEvents,
  writeDesktopShellHost,
  type DesktopShellHostListInput,
  type DesktopShellHostJob,
  type DesktopShellHostSession,
} from '@/features/shell/application/desktopShellHostElectron'
import type { MovScriptWorkspaceContext } from '@/shared/infrastructure/providerConfigStore'
import {
  SHELL_WORKBENCH_DEFAULT_COLS,
  SHELL_WORKBENCH_DEFAULT_ROWS,
  appendShellOutput,
  compactPath,
  createInitialShellWorkbenchStore,
  createShellSessionFromInput,
  shellStatusLabel,
  type ShellWorkbenchStoreState,
  type ShellRuntime,
  type ShellSession,
  type ShellStatus,
  type ShellJobReveal,
} from '@/features/shell/ShellWorkbenchModel'
import { canFitTerminal } from '@/features/shell/ShellTerminalViewport'

const shellWorkbenchRuntimes = new Map<string, ShellRuntime>()
const shellWorkbenchHostStartPromises = new Map<string, Promise<void>>()
const shellWorkbenchListeners = new Set<() => void>()
const shellWorkbenchRevealListeners = new Set<(sessionId?: string) => void>()
export const SHELL_WORKBENCH_REVEAL_EVENT = 'movscript:shell-workbench-reveal'
let shellWorkbenchContextKey = ''
let shellWorkbenchHydrationToken = 0
let shellWorkbenchPendingRevealSessionId: string | undefined
let shellWorkbenchStore: ShellWorkbenchStoreState = createInitialShellWorkbenchStore()

function getShellWorkbenchStoreSnapshot(): ShellWorkbenchStoreState {
  return shellWorkbenchStore
}

function subscribeShellWorkbenchStore(listener: () => void): () => void {
  shellWorkbenchListeners.add(listener)
  return () => shellWorkbenchListeners.delete(listener)
}

function useShellWorkbenchStore(): ShellWorkbenchStoreState {
  return useSyncExternalStore(
    subscribeShellWorkbenchStore,
    getShellWorkbenchStoreSnapshot,
    getShellWorkbenchStoreSnapshot,
  )
}

function updateShellWorkbenchStore(updater: (current: ShellWorkbenchStoreState) => ShellWorkbenchStoreState): void {
  shellWorkbenchStore = updater(shellWorkbenchStore)
  for (const listener of Array.from(shellWorkbenchListeners)) listener()
}

function runtimeForShellWorkbenchSession(id: string): ShellRuntime {
  let runtime = shellWorkbenchRuntimes.get(id)
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
    shellWorkbenchRuntimes.set(id, runtime)
  }
  return runtime
}

export type ShellWorkbenchSessionInput = {
  title?: string
  owner?: ShellSession['owner']
  scope?: ShellSession['scope']
  cwd?: string
  command?: string
  initialCommand?: string
  ownerFeature?: string
  jobReveal?: ShellJobReveal
  projectId?: string
  projectUid?: string
  projectDir?: string
  workspaceKey?: string
  previewUrl?: string
  reveal?: boolean
}

export function subscribeShellWorkbenchReveal(listener: (sessionId?: string) => void): () => void {
  shellWorkbenchRevealListeners.add(listener)
  return () => shellWorkbenchRevealListeners.delete(listener)
}

export function selectShellWorkbenchSession(sessionId?: string): void {
  if (!sessionId) return
  shellWorkbenchPendingRevealSessionId = sessionId
  let selectedExistingSession = false
  updateShellWorkbenchStore((current) => ({
    ...current,
    activeShellId: current.sessions.some((session) => {
      const matches = session.id === sessionId
      if (matches) selectedExistingSession = true
      return matches
    }) ? sessionId : current.activeShellId,
  }))
  if (selectedExistingSession) shellWorkbenchPendingRevealSessionId = undefined
}

export function revealShellWorkbenchSession(sessionId?: string): void {
  selectShellWorkbenchSession(sessionId)
  for (const listener of Array.from(shellWorkbenchRevealListeners)) listener(sessionId)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SHELL_WORKBENCH_REVEAL_EVENT, { detail: { sessionId } }))
  }
}

export function createShellWorkbenchSession(input: ShellWorkbenchSessionInput = {}): ShellSession {
  let created: ShellSession | undefined
  const reveal = shellWorkbenchInputShouldReveal(input)
  const workspaceKey = input.workspaceKey ?? shellWorkbenchWorkspaceKey(input)
  updateShellWorkbenchStore((current) => {
    const nextShellIndex = current.nextShellIndex + 1
    const next = createShellSessionFromInput(nextShellIndex, {
      title: input.title ?? (input.owner === 'system' ? `Shell Job ${nextShellIndex}` : `Shell ${nextShellIndex}`),
      owner: input.owner ?? 'user',
      scope: input.scope ?? (input.owner === 'system' ? 'workspace' : 'window'),
      cwd: input.cwd ?? '',
      command: input.command ?? '',
      initialCommand: input.initialCommand ?? '',
      ...(input.ownerFeature ? { ownerFeature: input.ownerFeature } : {}),
      ...(input.jobReveal ? { jobReveal: input.jobReveal } : {}),
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.projectUid ? { projectUid: input.projectUid } : {}),
      ...(input.projectDir ? { projectDir: input.projectDir } : {}),
      ...(workspaceKey ? { workspaceKey } : {}),
      ...(input.previewUrl ? { previewUrl: input.previewUrl } : {}),
    })
    created = next
    const activeShellId = shellWorkbenchActiveShellIdAfterSystemSession(current, next, reveal)
    return {
      ...current,
      nextShellIndex,
      sessions: [...current.sessions, next],
      activeShellId,
    }
  })
  if (!created) throw new Error('无法创建 Shell 会话。')
  if (reveal) revealShellWorkbenchSession(created.id)
  return created
}

export function runShellWorkbenchCommand(input: ShellWorkbenchSessionInput & { command: string }): ShellSession {
  const owner = input.owner ?? 'system'
  const scope = input.scope ?? (owner === 'system' ? 'workspace' : 'window')
  const ownerFeature = input.ownerFeature ?? (owner === 'system' ? 'shell' : undefined)
  const workspaceKey = input.workspaceKey ?? shellWorkbenchWorkspaceKey({ ...input, scope })
  const reusable = findReusableShellWorkbenchSession({ ...input, owner, scope, ownerFeature, workspaceKey })
  if (reusable) {
    const session = reuseShellWorkbenchSession(reusable, { ...input, owner, scope, ownerFeature, workspaceKey })
    if (owner === 'system') {
      void startShellWorkbenchHostCommand(session)
    }
    return session
  }
  const session = createShellWorkbenchSession({
    ...input,
    owner,
    scope,
    ownerFeature,
    command: input.command,
    initialCommand: input.initialCommand ?? input.command,
    workspaceKey,
    reveal: input.reveal ?? true,
  })
  if (owner === 'system') {
    void startShellWorkbenchHostCommand(session)
  }
  return session
}

function findReusableShellWorkbenchSession(input: ShellWorkbenchSessionInput & { command: string }): ShellSession | undefined {
  if (input.owner !== 'system' || input.scope === 'window') return undefined
  const hasStableWorkspaceKey = input.scope === 'home' || Boolean(input.workspaceKey || input.projectUid || input.projectId || input.projectDir || input.cwd)
  if (!input.title || !hasStableWorkspaceKey) return undefined
  return shellWorkbenchStore.sessions.find((session) => (
    session.owner === 'system'
    && session.scope === input.scope
    && session.title === input.title
    && (!input.ownerFeature || session.ownerFeature === input.ownerFeature)
    && shellSessionCommandMatches(session, input.command)
    && session.status !== 'failed'
    && session.status !== 'exited'
    && shellSessionWorkspaceMatches(session, input)
  ))
}

function shellSessionCommandMatches(session: ShellSession, command: string): boolean {
  const current = (session.command || session.initialCommand).trim()
  return Boolean(current && command.trim() && current === command.trim())
}

function shellSessionWorkspaceMatches(session: ShellSession, input: ShellWorkbenchSessionInput): boolean {
  if (input.scope === 'home') return session.scope === 'home'
  const inputWorkspaceKey = input.workspaceKey ?? shellWorkbenchWorkspaceKey(input)
  const sessionWorkspaceKey = session.workspaceKey ?? shellWorkbenchWorkspaceKey(session)
  if (inputWorkspaceKey && sessionWorkspaceKey) return inputWorkspaceKey === sessionWorkspaceKey
  if (input.projectUid && (session.projectUid === input.projectUid || session.projectId === input.projectUid)) return true
  if (input.projectId) return session.projectId === input.projectId
  if (input.projectUid) return false
  if (input.projectDir) {
    return shellWorkspacePathMatches(session.projectDir, input.projectDir)
      || shellWorkspacePathMatches(session.cwd, input.projectDir)
  }
  if (input.cwd) return shellWorkspacePathMatches(session.cwd, input.cwd)
  return false
}

function reuseShellWorkbenchSession(
  session: ShellSession,
  input: ShellWorkbenchSessionInput & { command: string },
): ShellSession {
  let reused = session
  const reveal = input.reveal ?? true
  const workspaceKey = input.workspaceKey ?? shellWorkbenchWorkspaceKey(input)
  updateShellWorkbenchStore((current) => {
    const now = Date.now()
    return {
      ...current,
      activeShellId: shellWorkbenchActiveShellIdAfterSystemSession(current, session, reveal),
      sessions: current.sessions.map((item) => {
        if (item.id !== session.id) return item
        reused = {
          ...item,
          command: item.command || input.command,
          initialCommand: item.initialCommand || input.initialCommand || input.command,
          ...(item.ownerFeature || !input.ownerFeature ? {} : { ownerFeature: input.ownerFeature }),
          ...(item.jobReveal || !input.jobReveal ? {} : { jobReveal: input.jobReveal }),
          ...(item.projectDir || !input.projectDir ? {} : { projectDir: input.projectDir }),
          ...(item.workspaceKey || !workspaceKey ? {} : { workspaceKey }),
          ...(item.previewUrl || !input.previewUrl ? {} : { previewUrl: input.previewUrl }),
          updatedAt: now,
        }
        return reused
      }),
    }
  })
  if (reveal) revealShellWorkbenchSession(session.id)
  return reused
}

function shellWorkbenchInputShouldReveal(input: ShellWorkbenchSessionInput): boolean {
  if (input.reveal !== undefined) return input.reveal
  return input.jobReveal === 'always'
}

function shellWorkbenchActiveShellIdAfterSystemSession(
  current: ShellWorkbenchStoreState,
  session: ShellSession,
  reveal: boolean,
): string {
  if (reveal) return session.id
  if (!current.activeShellId) return session.id
  if (session.owner !== 'system') return current.activeShellId
  const activeSession = current.sessions.find((item) => item.id === current.activeShellId)
  return shellSessionIsPristineIdleWindowShell(activeSession) ? session.id : current.activeShellId
}

function shellSessionIsPristineIdleWindowShell(session: ShellSession | undefined): boolean {
  return Boolean(
    session
    && session.owner === 'user'
    && session.scope === 'window'
    && session.status === 'idle'
    && !session.command
    && !session.initialCommand
    && !session.cwd,
  )
}

function revealShellWorkbenchSessionOnError(sessionId: string): void {
  const session = getShellWorkbenchSession(sessionId)
  if (session?.jobReveal === 'on_error') revealShellWorkbenchSession(sessionId)
}

function updateShellWorkbenchSessionStatus(id: string, status: ShellStatus, patch: Partial<ShellSession> = {}): void {
  updateShellWorkbenchStore((current) => ({
    ...current,
    sessions: current.sessions.map((session) => (
      session.id === id ? { ...session, ...patch, status, updatedAt: Date.now() } : session
    )),
  }))
  if (status === 'failed') revealShellWorkbenchSessionOnError(id)
}

function shellSessionProjectContext(session: ShellSession | undefined): {
  projectId?: string
  projectUid?: string
  projectDir?: string
} {
  if (!session || session.scope === 'home') return {}
  const projectId = normalizedWorkspaceString(session.projectId)
  const projectUid = normalizedWorkspaceString(session.projectUid)
  const explicitProjectDir = normalizedWorkspaceString(session.projectDir)
  const projectDir = explicitProjectDir || (projectId || projectUid ? normalizedWorkspaceString(session.cwd) : '')
  return {
    ...(projectId ? { projectId } : {}),
    ...(projectUid ? { projectUid } : {}),
    ...(projectDir ? { projectDir } : {}),
  }
}

function shellSessionWorkspaceContext(session: ShellSession | undefined): MovScriptWorkspaceContext | undefined {
  const projectContext = shellSessionProjectContext(session)
  if (!projectContext.projectDir) return undefined
  return {
    scope: 'project',
    ...projectContext,
  }
}

function shellWorkbenchWorkspaceKey(input: Pick<ShellWorkbenchSessionInput, 'scope' | 'projectUid' | 'projectId' | 'projectDir' | 'cwd'>): string | undefined {
  if (input.scope === 'home') {
    return JSON.stringify({ schema: 'movscript.shell_workspace_key.v1', scope: 'home' })
  }
  const projectUid = normalizedWorkspaceString(input.projectUid)
  const projectId = normalizedWorkspaceString(input.projectId)
  const projectDir = normalizedWorkspaceString(input.projectDir)
  const cwd = normalizedWorkspaceString(input.cwd)
  if (!projectUid && !projectId && !projectDir && !cwd) return undefined
  return JSON.stringify({
    schema: 'movscript.shell_workspace_key.v1',
    scope: input.scope ?? 'workspace',
    ...(projectUid ? { projectUid } : {}),
    ...(projectId ? { projectId } : {}),
    ...(projectDir ? { projectDir } : {}),
    ...(!projectDir && cwd ? { cwd } : {}),
  })
}

function windowShellInputFromWorkspaceContext(workspaceContext: MovScriptWorkspaceContext): Pick<ShellWorkbenchSessionInput, 'cwd' | 'projectId' | 'projectUid' | 'projectDir' | 'workspaceKey'> {
  const projectId = normalizedWorkspaceString(workspaceContext.projectId)
  const projectUid = normalizedWorkspaceString(workspaceContext.projectUid)
  const projectDir = normalizedWorkspaceString(workspaceContext.projectDir)
  const cwd = projectDir
  const workspaceKey = shellWorkbenchWorkspaceKey({
    scope: 'window',
    ...(projectUid ? { projectUid } : {}),
    ...(projectId ? { projectId } : {}),
    ...(projectDir ? { projectDir } : {}),
    ...(cwd ? { cwd } : {}),
  })
  return {
    ...(cwd ? { cwd } : {}),
    ...(projectId ? { projectId } : {}),
    ...(projectUid ? { projectUid } : {}),
    ...(projectDir ? { projectDir } : {}),
    ...(workspaceKey ? { workspaceKey } : {}),
  }
}

function splitShellInputFromSession(
  session: ShellSession | undefined,
  workspaceContext: MovScriptWorkspaceContext,
): Pick<ShellWorkbenchSessionInput, 'cwd' | 'projectId' | 'projectUid' | 'projectDir' | 'workspaceKey'> {
  if (!session) return windowShellInputFromWorkspaceContext(workspaceContext)
  const workspaceKey = session.workspaceKey ?? shellWorkbenchWorkspaceKey({
    scope: 'window',
    projectUid: session.projectUid,
    projectId: session.projectId,
    projectDir: session.projectDir,
    cwd: session.projectDir || session.cwd,
  })
  return {
    ...(session.cwd ? { cwd: session.cwd } : {}),
    ...(session.projectId ? { projectId: session.projectId } : {}),
    ...(session.projectUid ? { projectUid: session.projectUid } : {}),
    ...(session.projectDir ? { projectDir: session.projectDir } : {}),
    ...(workspaceKey ? { workspaceKey } : {}),
  }
}

function shellHostWorkspaceContext(
  session: ShellSession | undefined,
  workspaceContext: MovScriptWorkspaceContext,
): MovScriptWorkspaceContext | undefined {
  const explicitWorkspaceContext = shellSessionWorkspaceContext(session)
  if (explicitWorkspaceContext) return shellWorkspaceContextWithHostOwner(explicitWorkspaceContext, workspaceContext)
  if (workspaceContext.scope === 'project' || workspaceContext.projectId || workspaceContext.projectUid || workspaceContext.projectDir) {
    return neutralShellWorkspaceContext(workspaceContext)
  }
  return workspaceContext
}

function neutralShellWorkspaceContext(workspaceContext: MovScriptWorkspaceContext): MovScriptWorkspaceContext {
  return {
    scope: 'global',
    ...shellWorkspaceContextHostOwner(workspaceContext),
  } as MovScriptWorkspaceContext
}

function shellWorkspaceContextWithHostOwner(
  context: MovScriptWorkspaceContext,
  workspaceContext: MovScriptWorkspaceContext,
): MovScriptWorkspaceContext {
  return {
    ...context,
    ...shellWorkspaceContextHostOwner(workspaceContext),
  } as MovScriptWorkspaceContext
}

function shellWorkspaceContextHostOwner(workspaceContext: MovScriptWorkspaceContext): { userId?: string; orgId?: string } {
  const extra = workspaceContext as MovScriptWorkspaceContext & { userId?: string; orgId?: string }
  const orgId = normalizedWorkspaceString(extra.orgId)
  if (orgId) return { orgId }
  const userId = normalizedWorkspaceString(extra.userId)
  return userId ? { userId } : {}
}

async function startShellWorkbenchHostCommand(session: ShellSession): Promise<void> {
  const initialCommand = session.initialCommand.trim() || session.command.trim()
  if (!initialCommand) return
  const runtime = runtimeForShellWorkbenchSession(session.id)
  if (runtime.status === 'starting' || runtime.status === 'running') return
  const pendingStart = shellWorkbenchHostStartPromises.get(session.id)
  if (pendingStart) return pendingStart
  const startPromise = startShellWorkbenchHostCommandOnce(session, runtime, initialCommand)
  shellWorkbenchHostStartPromises.set(session.id, startPromise)
  try {
    await startPromise
  } finally {
    if (shellWorkbenchHostStartPromises.get(session.id) === startPromise) {
      shellWorkbenchHostStartPromises.delete(session.id)
    }
  }
}

async function startShellWorkbenchHostCommandOnce(
  session: ShellSession,
  runtime: ShellRuntime,
  initialCommand: string,
): Promise<void> {
  if (!desktopShellHostAvailable()) {
    runtime.status = 'failed'
    updateShellWorkbenchSessionStatus(session.id, 'failed', { error: '当前运行环境不支持 Desktop Shell Host。' })
    return
  }

  const token = runtime.runToken + 1
  runtime.runToken = token
  runtime.unsubscribe?.()
  runtime.unsubscribe = null
  runtime.outputBuffer = ''
  runtime.terminalSessionId = session.id
  runtime.status = 'starting'
  updateShellWorkbenchSessionStatus(session.id, 'starting', { error: '' })
  appendShellOutput(runtime, '正在启动 Shell...\r\n')

  try {
    const projectContext = shellSessionProjectContext(session)
    const sessionWorkspaceContext = shellSessionWorkspaceContext(session)
    const workspaceKey = session.workspaceKey ?? shellWorkbenchWorkspaceKey(session)
    const result = await runDesktopShellHostCommand({
      sessionId: session.id,
      ...(workspaceKey ? { workspaceKey } : {}),
      title: session.title,
      owner: session.owner,
      scope: session.scope,
      ownerFeature: session.ownerFeature,
      reveal: session.jobReveal,
      ...(sessionWorkspaceContext ? { workspaceContext: sessionWorkspaceContext } : {}),
      cwd: session.cwd,
      command: initialCommand,
      initialCommand,
      previewUrl: session.previewUrl,
      ...(projectContext.projectId ? { projectId: projectContext.projectId } : {}),
      ...(projectContext.projectUid ? { projectUid: projectContext.projectUid } : {}),
      ...(projectContext.projectDir ? { projectDir: projectContext.projectDir } : {}),
      size: {
        rows: runtime.terminal?.rows || SHELL_WORKBENCH_DEFAULT_ROWS,
        cols: runtime.terminal?.cols || SHELL_WORKBENCH_DEFAULT_COLS,
      },
    })
    if (runtime.runToken !== token) return
    if (!result) throw new Error('当前运行环境不支持 Desktop Shell Host。')
    runtime.terminalSessionId = result.sessionId
    runtime.status = 'running'
    updateShellWorkbenchSessionStatus(session.id, 'running', {
      cwd: session.cwd || result.cwd,
      command: session.command || result.shell,
      ...(projectContext.projectDir ? { projectDir: projectContext.projectDir } : {}),
    })
    runtime.terminal?.focus()
  } catch (startError) {
    if (runtime.runToken !== token) return
    runtime.terminalSessionId = null
    runtime.status = 'failed'
    updateShellWorkbenchSessionStatus(session.id, 'failed', {
      error: startError instanceof Error ? startError.message : String(startError),
    })
  }
}

export function listShellWorkbenchSessions(): ShellSession[] {
  return shellWorkbenchStore.sessions
}

export function getShellWorkbenchSession(sessionId: string): ShellSession | undefined {
  return shellWorkbenchStore.sessions.find((session) => session.id === sessionId)
}

export function getShellWorkbenchSessionLogs(sessionId: string): string {
  return shellWorkbenchRuntimes.get(sessionId)?.outputBuffer ?? ''
}

export async function writeShellWorkbenchSession(sessionId: string, data: string): Promise<void> {
  const runtime = shellWorkbenchRuntimes.get(sessionId)
  if (!runtime?.terminalSessionId || runtime.status !== 'running') return
  await writeDesktopShellHost({
    sessionId: runtime.terminalSessionId,
    data,
  })
}

export async function stopShellWorkbenchSession(sessionId: string): Promise<void> {
  const runtime = shellWorkbenchRuntimes.get(sessionId)
  if (runtime) {
    runtime.runToken += 1
    runtime.unsubscribe?.()
    runtime.unsubscribe = null
    if (runtime.terminalSessionId) await killDesktopShellHostSession({ sessionId: runtime.terminalSessionId })
    runtime.terminalSessionId = null
    runtime.status = 'exited'
  }
  updateShellWorkbenchStore((current) => ({
    ...current,
    sessions: current.sessions.map((session) => (
      session.id === sessionId ? { ...session, status: 'exited', updatedAt: Date.now() } : session
    )),
  }))
}

export async function hydrateShellWorkbenchSessionsFromHost(workspaceContext: MovScriptWorkspaceContext): Promise<void> {
  if (!desktopShellHostAvailable()) return
  const hydrationToken = ++shellWorkbenchHydrationToken
  let hostSessions: DesktopShellHostSession[] = []
  try {
    const results = await Promise.all(shellHostListInputsForWorkspace().map((input) => listDesktopShellHostSessions(input)))
    if (hydrationToken !== shellWorkbenchHydrationToken) return
    hostSessions = uniqueShellHostSessions(results.flatMap((result) => result?.sessions ?? []))
      .filter((session) => shellHostSessionMatchesWorkspace(session, workspaceContext))
  } catch (listError) {
    console.warn('[shell-workbench] failed to hydrate shell sessions', listError)
    return
  }
  let hostJobs: DesktopShellHostJob[] = []
  try {
    const results = await Promise.all(shellHostListInputsForWorkspace().map((input) => listDesktopShellHostJobs(input)))
    if (hydrationToken !== shellWorkbenchHydrationToken) return
    hostJobs = uniqueShellHostJobs(results.flatMap((result) => result?.jobs ?? []))
      .filter((job) => shellHostJobMatchesWorkspace(job, workspaceContext))
  } catch (listError) {
    console.warn('[shell-workbench] failed to hydrate shell jobs', listError)
  }
  const hostJobsBySessionId = new Map(hostJobs.map((job) => [job.sessionId, job]))

  const hydratedSessions = await Promise.all(hostSessions.map(async (session) => {
    try {
      const logs = await getDesktopShellHostLogs({ sessionId: session.sessionId })
      return { session, job: hostJobsBySessionId.get(session.sessionId), logs: logs?.text ?? '' }
    } catch (logsError) {
      console.warn('[shell-workbench] failed to hydrate shell logs', logsError)
      return { session, job: hostJobsBySessionId.get(session.sessionId), logs: '' }
    }
  }))
  if (hydrationToken !== shellWorkbenchHydrationToken) return

  for (const { session, job, logs } of hydratedSessions) {
    hydrateShellWorkbenchRuntimeFromHost(session, logs, job)
  }

  updateShellWorkbenchStore((current) => {
    let nextShellIndex = current.nextShellIndex
    const sessions = [...current.sessions]
    for (const { session, job } of hydratedSessions) {
      const existingIndex = sessions.findIndex((item) => item.id === session.sessionId)
      if (existingIndex >= 0) {
        sessions[existingIndex] = updateShellSessionFromHost(sessions[existingIndex]!, session, job)
        continue
      }
      nextShellIndex += 1
      sessions.push(createShellSessionFromHost(session, nextShellIndex, job))
    }
    const currentActiveSession = sessions.find((session) => session.id === current.activeShellId)
    const pendingRevealSessionId = shellWorkbenchPendingRevealSessionId
    const pendingRevealSession = pendingRevealSessionId
      ? sessions.find((session) => session.id === pendingRevealSessionId)
      : undefined
    if (pendingRevealSession) shellWorkbenchPendingRevealSessionId = undefined
    const promotedSystemSession = sessions.find((session) => (
      session.owner === 'system' && (session.status === 'running' || session.status === 'starting')
    )) ?? sessions.find((session) => session.owner === 'system')
    return {
      ...current,
      nextShellIndex,
      sessions,
      activeShellId: pendingRevealSession
        ? pendingRevealSession.id
        : shellSessionIsPristineIdleWindowShell(currentActiveSession) && promotedSystemSession
        ? promotedSystemSession.id
        : sessions.some((session) => session.id === current.activeShellId)
        ? current.activeShellId
        : sessions[0]?.id ?? '',
    }
  })
}

function shellHostListInputsForWorkspace(): DesktopShellHostListInput[] {
  return [
    {
      owner: 'system',
      scope: 'workspace',
    },
    {
      owner: 'system',
      scope: 'home',
    },
  ]
}

function uniqueShellHostSessions(sessions: DesktopShellHostSession[]): DesktopShellHostSession[] {
  return Array.from(new Map(sessions.map((session) => [session.sessionId, session])).values())
}

function uniqueShellHostJobs(jobs: DesktopShellHostJob[]): DesktopShellHostJob[] {
  return Array.from(new Map(jobs.map((job) => [job.jobId, job])).values())
}

function shellHostSessionMatchesWorkspace(
  session: DesktopShellHostSession,
  workspaceContext: MovScriptWorkspaceContext,
): boolean {
  if (session.scope === 'home') return true
  const projectUid = normalizedWorkspaceString(workspaceContext.projectUid)
  const projectId = normalizedWorkspaceString(workspaceContext.projectId)
  if (projectUid && (session.projectUid === projectUid || session.projectId === projectUid)) return true
  if (projectId && session.projectId === projectId) return true
  if (projectUid || projectId) return false
  const projectDir = normalizedWorkspaceString(workspaceContext.projectDir)
  if (projectDir) {
    return shellWorkspacePathMatches(session.projectDir, projectDir)
      || shellWorkspacePathMatches(session.cwd, projectDir)
  }
  return !session.projectId && !session.projectUid && !session.projectDir
}

function shellHostJobMatchesWorkspace(
  job: DesktopShellHostJob,
  workspaceContext: MovScriptWorkspaceContext,
): boolean {
  if (job.scope === 'home') return true
  const projectUid = normalizedWorkspaceString(workspaceContext.projectUid)
  const projectId = normalizedWorkspaceString(workspaceContext.projectId)
  if (projectUid && (job.projectUid === projectUid || job.projectId === projectUid)) return true
  if (projectId && job.projectId === projectId) return true
  if (projectUid || projectId) return false
  const projectDir = normalizedWorkspaceString(workspaceContext.projectDir)
  if (projectDir) {
    return shellWorkspacePathMatches(job.projectDir, projectDir)
      || shellWorkspacePathMatches(job.cwd, projectDir)
  }
  return !job.projectId && !job.projectUid && !job.projectDir
}

function hydrateShellWorkbenchRuntimeFromHost(
  session: DesktopShellHostSession,
  logs: string,
  job?: DesktopShellHostJob,
): void {
  const runtime = runtimeForShellWorkbenchSession(session.sessionId)
  runtime.terminalSessionId = session.status === 'running' ? session.sessionId : null
  runtime.status = shellStatusFromHostSession(session, job)
  if (!runtime.outputBuffer) {
    runtime.outputBuffer = logs
    if (logs) runtime.terminal?.write(logs)
  }
}

function createShellSessionFromHost(
  session: DesktopShellHostSession,
  index: number,
  job?: DesktopShellHostJob,
): ShellSession {
  return createShellSessionFromInput(index, {
    id: session.sessionId,
    ...(job?.jobId ? { jobId: job.jobId } : {}),
    index,
    title: session.title || `Shell Job ${index}`,
    owner: session.owner,
    scope: session.scope,
    ...(session.ownerFeature ? { ownerFeature: session.ownerFeature } : {}),
    ...(session.reveal ? { jobReveal: session.reveal } : {}),
    status: shellStatusFromHostSession(session, job),
    cwd: session.cwd,
    command: job?.commandText ?? session.command ?? session.shell,
    initialCommand: session.initialCommand ?? session.command ?? '',
    error: '',
    ...(session.exitCode !== undefined ? { exitCode: session.exitCode } : {}),
    ...(session.signal !== undefined ? { signal: session.signal } : {}),
    ...(session.projectId ? { projectId: session.projectId } : {}),
    ...(session.projectUid ? { projectUid: session.projectUid } : {}),
    ...(session.projectDir ?? job?.projectDir ? { projectDir: session.projectDir ?? job?.projectDir } : {}),
    ...(session.workspaceKey ? { workspaceKey: session.workspaceKey } : {}),
    ...(session.previewUrl ?? job?.previewUrl ? { previewUrl: session.previewUrl ?? job?.previewUrl } : {}),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  })
}

function updateShellSessionFromHost(
  current: ShellSession,
  session: DesktopShellHostSession,
  job?: DesktopShellHostJob,
): ShellSession {
  return {
    ...current,
    ...(job?.jobId ? { jobId: job.jobId } : {}),
    title: session.title || current.title,
    owner: session.owner,
    scope: session.scope,
    ...(session.ownerFeature ? { ownerFeature: session.ownerFeature } : {}),
    ...(session.reveal ? { jobReveal: session.reveal } : {}),
    status: shellStatusFromHostSession(session, job),
    cwd: session.cwd || current.cwd,
    command: job?.commandText ?? session.command ?? current.command ?? session.shell,
    initialCommand: session.initialCommand ?? current.initialCommand,
    ...(session.exitCode !== undefined ? { exitCode: session.exitCode } : {}),
    ...(session.signal !== undefined ? { signal: session.signal } : {}),
    ...(session.projectId ? { projectId: session.projectId } : {}),
    ...(session.projectUid ? { projectUid: session.projectUid } : {}),
    ...(session.projectDir ?? job?.projectDir ? { projectDir: session.projectDir ?? job?.projectDir } : {}),
    ...(session.workspaceKey ? { workspaceKey: session.workspaceKey } : {}),
    ...(session.previewUrl ?? job?.previewUrl ? { previewUrl: session.previewUrl ?? job?.previewUrl } : {}),
    updatedAt: session.updatedAt,
  }
}

function shellStatusFromHostSession(
  session: DesktopShellHostSession,
  job?: DesktopShellHostJob,
): ShellStatus {
  if (job?.status === 'failed') return 'failed'
  if (job?.status === 'succeeded' || job?.status === 'stopped') return 'exited'
  if (session.status === 'exited' && session.exitCode !== undefined && session.exitCode !== 0) return 'failed'
  return session.status === 'exited' ? 'exited' : 'running'
}

function normalizedWorkspaceString(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function shellWorkspacePathMatches(candidate: unknown, workspaceRoot: unknown): boolean {
  const candidatePath = normalizedShellWorkspacePath(candidate)
  const rootPath = normalizedShellWorkspacePath(workspaceRoot)
  return Boolean(candidatePath && rootPath && (
    candidatePath === rootPath
    || candidatePath.startsWith(`${rootPath}/`)
  ))
}

function normalizedShellWorkspacePath(value: unknown): string {
  return normalizedWorkspaceString(value)
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
}

export function useShellWorkbenchController({
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
  const terminalStore = useShellWorkbenchStore()
  const sessions = terminalStore.sessions
  const activeShellId = terminalStore.activeShellId
  const shellResetNonce = terminalStore.shellResetNonce

  const workspaceContextKey = JSON.stringify(workspaceContext)
  const controlled = controlledOpen !== undefined
  const disabled = !desktopShellHostAvailable()
  const activeSession = sessions.find((session) => session.id === activeShellId) ?? sessions[0]
  const statusLabel = shellStatusLabel(activeSession?.status ?? 'idle', disabled)
  const shortCwd = activeSession?.cwd
    ? compactPath(activeSession.cwd)
    : workspaceContext.scope === 'project' ? '项目工作目录' : '工作区工作目录'

  const setOpen = useCallback((nextOpen: boolean) => {
    if (!controlled) setInternalOpen(nextOpen)
    onOpenChange?.(nextOpen)
  }, [controlled, onOpenChange])

  const updateSession = useCallback((id: string, patch: Partial<ShellSession>) => {
    updateShellWorkbenchStore((current) => ({
      ...current,
      sessions: current.sessions.map((session) => (
        session.id === id ? { ...session, ...patch, updatedAt: Date.now() } : session
      )),
    }))
  }, [])

  const setActiveShellId = useCallback((id: string) => {
    updateShellWorkbenchStore((current) => ({
      ...current,
      activeShellId: id,
    }))
  }, [])

  const runtimeFor = useCallback((id: string): ShellRuntime => {
    return runtimeForShellWorkbenchSession(id)
  }, [])

  const runtimeSnapshot = useCallback((id: string): ShellRuntime | undefined => {
    return shellWorkbenchRuntimes.get(id)
  }, [])

  const setShellStatus = useCallback((id: string, status: ShellStatus, patch: Partial<ShellSession> = {}) => {
    const runtime = runtimeFor(id)
    runtime.status = status
    updateShellWorkbenchSessionStatus(id, status, patch)
  }, [runtimeFor])

  const resizeShell = useCallback((id: string) => {
    const runtime = shellWorkbenchRuntimes.get(id)
    const terminal = runtime?.terminal
    const fitAddon = runtime?.fitAddon
    if (!runtime || !terminal || !fitAddon) return
    if (!canFitTerminal(runtime, terminal)) return
    try {
      fitAddon.fit()
    } catch (fitError) {
      console.warn('[shell-workbench] failed to fit terminal', fitError)
      return
    }
    if (!runtime.terminalSessionId) return
    void resizeDesktopShellHostSession({
      sessionId: runtime.terminalSessionId,
      size: {
        rows: terminal.rows,
        cols: terminal.cols,
      },
    }).catch((resizeError) => {
      console.warn('[shell-workbench] failed to resize shell', resizeError)
    })
  }, [])

  const sendShellData = useCallback((id: string, data: string) => {
    const runtime = shellWorkbenchRuntimes.get(id)
    if (!runtime || runtime.status !== 'running' || !runtime.terminalSessionId) return
    runtime.writeChain = runtime.writeChain
      .catch(() => undefined)
      .then(() => writeDesktopShellHost({
        sessionId: runtime.terminalSessionId ?? id,
        data,
      }))
      .catch((writeError) => {
        setShellStatus(id, 'failed', {
          error: writeError instanceof Error ? writeError.message : String(writeError),
        })
      })
  }, [setShellStatus])

  const stopShell = useCallback((id: string) => {
    void stopShellWorkbenchSession(id)
  }, [setShellStatus])

  const startShell = useCallback(async (id: string) => {
    if (!desktopShellHostAvailable()) {
      setShellStatus(id, 'failed', { error: '当前运行环境不支持 Desktop Shell Host。' })
      return
    }

    const session = getShellWorkbenchSession(id)
    const runtime = runtimeFor(id)
    const terminal = runtime.terminal
    if (!terminal) return
    const pendingStart = shellWorkbenchHostStartPromises.get(id)
    if (pendingStart) {
      resizeShell(id)
      terminal.focus()
      void pendingStart
        .then(() => {
          resizeShell(id)
          runtimeFor(id).terminal?.focus()
        })
        .catch((startError) => {
          setShellStatus(id, 'failed', {
            error: startError instanceof Error ? startError.message : String(startError),
          })
        })
      return
    }
    if (runtime.status === 'starting' || runtime.status === 'running') return

    const token = runtime.runToken + 1
    runtime.runToken = token
    runtime.unsubscribe?.()
    runtime.unsubscribe = null
    runtime.outputBuffer = ''
    runtime.terminalSessionId = id
    setShellStatus(id, 'starting', { command: 'Shell', error: '', cwd: '' })
    terminal.clear()
    appendShellOutput(runtime, '正在启动 Shell...\r\n')

    try {
      const initialCommand = session?.initialCommand?.trim()
      const sessionScope = session?.scope
      const projectContext = shellSessionProjectContext(session)
      const sessionWorkspaceContext = shellHostWorkspaceContext(session, workspaceContext)
      const workspaceKey = session?.workspaceKey ?? shellWorkbenchWorkspaceKey(session ?? {})
      const shellHostInput = {
        sessionId: id,
        ...(workspaceKey ? { workspaceKey } : {}),
        ...(sessionScope === 'home' || !sessionWorkspaceContext ? {} : { workspaceContext: sessionWorkspaceContext }),
        title: session?.title,
        owner: session?.owner,
        scope: sessionScope,
        ownerFeature: session?.ownerFeature,
        reveal: session?.jobReveal,
        cwd: session?.cwd,
        command: session?.command,
        initialCommand: session?.initialCommand,
        previewUrl: session?.previewUrl,
        ...(projectContext.projectId ? { projectId: projectContext.projectId } : {}),
        ...(projectContext.projectUid ? { projectUid: projectContext.projectUid } : {}),
        ...(projectContext.projectDir ? { projectDir: projectContext.projectDir } : {}),
        size: {
          rows: terminal.rows || SHELL_WORKBENCH_DEFAULT_ROWS,
          cols: terminal.cols || SHELL_WORKBENCH_DEFAULT_COLS,
        },
      }
      const result = initialCommand
        ? await runDesktopShellHostCommand({ ...shellHostInput, command: initialCommand })
        : await createDesktopShellHostSession(shellHostInput)
      if (runtime.runToken !== token) return
      if (!result) throw new Error('当前运行环境不支持 Desktop Shell Host。')
      runtime.terminalSessionId = result.sessionId
      updateSession(id, {
        cwd: session?.cwd || result.cwd,
        command: session?.command || result.shell,
        ...(projectContext.projectDir ? { projectDir: projectContext.projectDir } : {}),
      })
      setShellStatus(id, 'running')
      terminal.focus()
    } catch (startError) {
      if (runtime.runToken !== token) return
      runtime.terminalSessionId = null
      setShellStatus(id, 'failed', {
        error: startError instanceof Error ? startError.message : String(startError),
      })
    }
  }, [resizeShell, runtimeFor, setShellStatus, updateSession, workspaceContext])

  const addShell = useCallback(() => {
    updateShellWorkbenchStore((current) => {
      const nextShellIndex = current.nextShellIndex + 1
      const next = createShellSessionFromInput(nextShellIndex, windowShellInputFromWorkspaceContext(workspaceContext))
      return {
        ...current,
        nextShellIndex,
        sessions: [...current.sessions, next],
        activeShellId: next.id,
      }
    })
  }, [workspaceContext])

  const splitShell = useCallback(() => {
    updateShellWorkbenchStore((current) => {
      const nextShellIndex = current.nextShellIndex + 1
      const sourceSession = current.sessions.find((session) => session.id === current.activeShellId)
      const next = createShellSessionFromInput(nextShellIndex, splitShellInputFromSession(sourceSession, workspaceContext))
      return {
        ...current,
        nextShellIndex,
        sessions: [...current.sessions, next],
        activeShellId: next.id,
      }
    })
  }, [workspaceContext])

  const closeShell = useCallback((id: string) => {
    stopShell(id)
    const runtime = shellWorkbenchRuntimes.get(id)
    runtime?.unsubscribe?.()
    shellWorkbenchRuntimes.delete(id)
    updateShellWorkbenchStore((current) => {
      const nextSessions = current.sessions.filter((session) => session.id !== id)
      const fallback = nextSessions.find((session) => session.owner === 'system') ?? nextSessions[0]
      return {
        ...current,
        sessions: nextSessions,
        activeShellId: current.activeShellId === id ? fallback?.id ?? '' : current.activeShellId,
      }
    })
  }, [stopShell])

  const resetWindowShells = useCallback(() => {
    const windowSessionIds = new Set(sessions.filter((session) => session.scope === 'window').map((session) => session.id))
    for (const sessionId of windowSessionIds) {
      const runtime = shellWorkbenchRuntimes.get(sessionId)
      runtime?.unsubscribe?.()
      if (runtime?.terminalSessionId) {
        void killDesktopShellHostSession({ sessionId: runtime.terminalSessionId }).catch((killError) => {
          console.warn('[shell-workbench] failed to stop window shell during workspace reset', killError)
        })
      }
      shellWorkbenchRuntimes.delete(sessionId)
    }
    updateShellWorkbenchStore((current) => {
      const sessions = current.sessions.filter((session) => session.scope !== 'window')
      const fallback = sessions.find((session) => session.owner === 'system') ?? sessions[0]
      return {
        ...current,
        sessions,
        activeShellId: current.sessions.some((session) => session.id === current.activeShellId && session.scope !== 'window')
          ? current.activeShellId
          : fallback?.id ?? '',
        shellResetNonce: current.shellResetNonce + 1,
      }
    })
  }, [sessions])

  useEffect(() => {
    if (!shellWorkbenchContextKey) {
      shellWorkbenchContextKey = workspaceContextKey
      return
    }
    if (shellWorkbenchContextKey === workspaceContextKey) return
    shellWorkbenchContextKey = workspaceContextKey
    resetWindowShells()
  }, [resetWindowShells, workspaceContextKey])

  useEffect(() => {
    return subscribeDesktopShellHostEvents((event) => {
      const runtime = shellWorkbenchRuntimes.get(event.sessionId)
      if (!runtime) return
      if (event.kind === 'output') {
        appendShellOutput(runtime, event.data)
        return
      }
      if (event.kind === 'exit') {
        runtime.terminalSessionId = null
        appendShellOutput(runtime, `\r\nShell 已退出，退出码 ${event.exitCode}。\r\n`)
        setShellStatus(event.sessionId, event.exitCode === 0 ? 'exited' : 'failed', {
          exitCode: event.exitCode,
          ...(event.signal !== undefined ? { signal: event.signal } : {}),
        })
        return
      }
      runtime.terminalSessionId = null
      setShellStatus(event.sessionId, 'failed', { error: event.error })
    })
  }, [setShellStatus])

  useEffect(() => {
    void hydrateShellWorkbenchSessionsFromHost(workspaceContext)
  }, [workspaceContextKey])

  useEffect(() => {
    if (!open || !activeSession) return
    const runtime = shellWorkbenchRuntimes.get(activeSession.id)
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
    splitShell,
    startShell,
    statusLabel,
    stopShell,
  }
}
