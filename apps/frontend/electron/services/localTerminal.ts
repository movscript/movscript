import { randomUUID } from 'node:crypto'
import { chmodSync, existsSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { userInfo } from 'node:os'
import { dirname, join } from 'node:path'
import {
  ensureMovScriptWorkspaceContext,
  resolveMovScriptWorkspaceContextPaths,
  type MovScriptWorkspaceContextInput,
  type MovScriptWorkspaceContextPaths,
} from '@movscript/core/workspace/node'
import { localTerminalEnv } from './localTerminalEnv'
import { resolveDesktopDefaultMovScriptWorkspaceDir } from './movscriptWorkspaceDefaults'
import type {
  ElectronLocalTerminalCreateInput,
  ElectronLocalTerminalCreateResult,
  ElectronLocalTerminalEvent,
  ElectronLocalTerminalKillInput,
  ElectronLocalTerminalResizeInput,
  ElectronLocalTerminalWriteInput,
  ElectronMovScriptWorkspaceContext,
} from '../../src/shared/contracts/electronApi'

type NodePtyModule = typeof import('node-pty')
type LocalTerminalListener = (event: ElectronLocalTerminalEvent) => void
const require = createRequire(import.meta.url)

type LocalTerminalSession = {
  id: string
  cwd: string
  shell: string
  pty: ReturnType<NodePtyModule['spawn']>
  disposables: Array<{ dispose(): void }>
}

class LocalTerminalManager {
  private readonly sessions = new Map<string, LocalTerminalSession>()
  private readonly listeners = new Set<LocalTerminalListener>()
  private ptyModulePromise: Promise<NodePtyModule> | null = null

  onEvent(listener: LocalTerminalListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async create(input: ElectronLocalTerminalCreateInput = {}): Promise<ElectronLocalTerminalCreateResult> {
    const requestedSessionId = input.sessionId?.trim()
    if (requestedSessionId) {
      const existing = this.sessions.get(requestedSessionId)
      if (existing) {
        return {
          sessionId: existing.id,
          cwd: existing.cwd,
          shell: existing.shell,
          pid: existing.pty.pid,
        }
      }
    }

    const pty = await this.loadNodePty()
    const sessionId = requestedSessionId || randomUUID()
    const workspace = resolveLocalTerminalWorkspace(input.workspaceContext)
    const cwd = workspace.providerSessionCwd
    const shell = localTerminalShell()
    const size = input.size ?? { rows: 24, cols: 80 }
    const child = pty.spawn(shell.command, shell.args, {
      name: 'xterm-256color',
      cols: clampTerminalCols(size.cols),
      rows: clampTerminalRows(size.rows),
      cwd,
      env: localTerminalEnv({
        inheritedEnv: process.env,
        workspaceDir: workspace.workspaceDir,
        projectDir: workspace.providerSessionCwd,
        userId: workspace.context.userId,
        orgId: workspace.context.orgId,
        projectId: workspace.context.projectId,
      }),
    })
    const session: LocalTerminalSession = {
      id: sessionId,
      cwd,
      shell: [shell.command, ...shell.args].join(' '),
      pty: child,
      disposables: [],
    }
    session.disposables.push(child.onData((data) => {
      this.emit({ kind: 'output', sessionId, data })
    }))
    session.disposables.push(child.onExit((event) => {
      this.sessions.delete(sessionId)
      this.disposeSession(session)
      this.emit({
        kind: 'exit',
        sessionId,
        exitCode: event.exitCode,
        ...(event.signal !== undefined ? { signal: event.signal } : {}),
      })
    }))
    this.sessions.set(sessionId, session)
    return {
      sessionId,
      cwd,
      shell: session.shell,
      pid: child.pid,
    }
  }

  write(input: ElectronLocalTerminalWriteInput): void {
    const session = this.requireSession(input.sessionId)
    session.pty.write(input.data)
  }

  resize(input: ElectronLocalTerminalResizeInput): void {
    const session = this.sessions.get(input.sessionId)
    if (!session) return
    session.pty.resize(clampTerminalCols(input.size.cols), clampTerminalRows(input.size.rows))
  }

  kill(input: ElectronLocalTerminalKillInput): void {
    const session = this.sessions.get(input.sessionId)
    if (!session) return
    session.pty.kill()
  }

  stopAll(): void {
    for (const session of Array.from(this.sessions.values())) {
      try {
        session.pty.kill()
      } catch {
        this.sessions.delete(session.id)
        this.disposeSession(session)
      }
    }
  }

  private requireSession(sessionId: string): LocalTerminalSession {
    const normalized = sessionId.trim()
    const session = this.sessions.get(normalized)
    if (!session) throw new Error(`terminal session not found: ${normalized}`)
    return session
  }

  private async loadNodePty(): Promise<NodePtyModule> {
    if (!this.ptyModulePromise) {
      ensureNodePtySpawnHelperExecutable()
      this.ptyModulePromise = import('node-pty')
    }
    return this.ptyModulePromise
  }

  private disposeSession(session: LocalTerminalSession): void {
    for (const disposable of session.disposables.splice(0)) disposable.dispose()
  }

  private emit(event: ElectronLocalTerminalEvent): void {
    for (const listener of Array.from(this.listeners)) listener(event)
  }
}

export const localTerminalManager = new LocalTerminalManager()

function ensureNodePtySpawnHelperExecutable(): void {
  if (process.platform === 'win32') return
  let nodePtyRoot: string
  try {
    nodePtyRoot = dirname(dirname(require.resolve('node-pty')))
  } catch (error) {
    console.warn('[local-terminal] failed to resolve node-pty before spawn', error)
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
      console.warn('[local-terminal] failed to make node-pty spawn-helper executable', helper, error)
    }
  }
}

function resolveLocalTerminalWorkspace(context: ElectronMovScriptWorkspaceContext | undefined): MovScriptWorkspaceContextPaths {
  const scope = context?.scope === 'project' || context?.scope === 'production'
    ? 'project'
    : 'global'
  const normalizedContext: MovScriptWorkspaceContextInput = {
    scope,
    ...(context?.userId !== undefined ? { userId: String(context.userId) } : {}),
    ...(context?.orgId !== undefined ? { orgId: String(context.orgId) } : {}),
    ...(context?.projectId !== undefined ? { projectId: String(context.projectId) } : {}),
  }
  return ensureMovScriptWorkspaceContext(resolveMovScriptWorkspaceContextPaths({
    workspaceDir: resolveDesktopDefaultMovScriptWorkspaceDir(),
    ...normalizedContext,
  }))
}

function localTerminalShell(): { command: string; args: string[] } {
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
