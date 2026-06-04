import { rmSync } from 'fs'
import { app } from 'electron'
import {
  ensureAgentSessionRuntime,
  fallbackUserAgentWorkspaceDir,
  getAgentSessionRuntimeHealth,
  resolveAgentSessionRuntimePaths,
  resolveDefaultAgentWorkspaceDir,
  type AgentSessionRuntimePaths,
} from '@movscript/agent-runtime'
import type { AgentRuntimeControlTransportInput } from './control-transport'

export interface AgentRuntimeSessionInput {
  agentRuntimeDirName?: string
  workspaceDir?: string
  sessionId?: string
}

export interface ResolvedAgentRuntimeSession {
  workspaceDir: string
  sessionId: string
  paths: AgentSessionRuntimePaths
  transportInput: AgentRuntimeControlTransportInput
}

export function resolveAgentRuntimeSession(input: AgentRuntimeSessionInput = {}): ResolvedAgentRuntimeSession | undefined {
  const sessionId = input.sessionId?.trim()
  if (!sessionId) return undefined
  const workspaceDir = input.workspaceDir || resolveDesktopDefaultAgentWorkspaceDir()
  const paths = resolveAgentSessionRuntimePaths({ workspaceDir, sessionId, runtimeDirName: input.agentRuntimeDirName })
  ensureAgentSessionRuntime(paths)
  return {
    workspaceDir: paths.workspaceDir,
    sessionId: paths.sessionId,
    paths,
    transportInput: {
      baseURL: `unix:${paths.socketPath}`,
      transportKind: 'unix-socket',
      socketPath: paths.socketPath,
    },
  }
}

export function resolveDesktopDefaultAgentWorkspaceDir(): string {
  if (process.env.MOVSCRIPT_AGENT_WORKSPACE_DIR || process.env.MOVSCRIPT_WORKSPACE_DIR) {
    return resolveDefaultAgentWorkspaceDir()
  }
  return app.isPackaged ? fallbackUserAgentWorkspaceDir() : process.cwd()
}

export function resolveAgentRuntimeTransportInputForSession<T extends AgentRuntimeControlTransportInput & AgentRuntimeSessionInput>(input?: T): AgentRuntimeControlTransportInput {
  const session = resolveAgentRuntimeSession(input)
  return session?.transportInput ?? input ?? {}
}

export function agentRuntimeSessionKey(session: ResolvedAgentRuntimeSession): string {
  return `${session.paths.agentDir}\n${session.sessionId}`
}

export function isAgentRuntimeSessionReusable(session: ResolvedAgentRuntimeSession): boolean {
  const health = getAgentSessionRuntimeHealth(session.paths)
  return health.alive && !health.stale
}

export function removeStaleAgentRuntimeSessionFiles(session: ResolvedAgentRuntimeSession): void {
  const health = getAgentSessionRuntimeHealth(session.paths)
  if (health.alive && !health.stale) return
  rmSync(session.paths.lockPath, { force: true })
  rmSync(session.paths.runtimePath, { force: true })
  rmSync(session.paths.heartbeatPath, { force: true })
  rmSync(session.paths.socketPath, { force: true })
}
