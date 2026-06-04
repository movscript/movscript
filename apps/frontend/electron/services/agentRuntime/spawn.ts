import { spawn, type ChildProcess } from 'child_process'
import { join } from 'path'
import { app } from 'electron'
import {
  DEFAULT_AGENT_USER_DATA_DIR,
  DEFAULT_MCP_ENDPOINT,
} from './config'
import { ensureAgentCatalogPackStoreDirs } from '../agentCatalogPackStore'
import { resolveAgentRuntimeLaunch } from './launch'
import { buildAgentRuntimeSpawnEnv, resolveAgentRuntimeSpawnPort } from './spawnEnv'
import type { AgentRuntimeControlTransport } from './transport'

export interface SpawnAgentRuntimeInput {
  baseURL: string
  transport: AgentRuntimeControlTransport
  backendAPIBaseURL: string
  detached: boolean
  spawnStartedAt: number
  session?: {
    workspaceDir: string
    sessionId: string
    agentRuntimeDirName?: string
  }
  onExit?: (child: ChildProcess, code: number | null, signal: NodeJS.Signals | null) => void
}

export function spawnAgentRuntimeProcess(input: SpawnAgentRuntimeInput): ChildProcess {
  const launchResolveStartedAt = Date.now()
  const launch = resolveAgentRuntimeLaunch()
  console.info(`[agent] resolved runtime launch elapsed=${Date.now() - launchResolveStartedAt}ms command=${launch.command} args=${launch.args.join(' ')} cwd=${launch.cwd}`)

  const port = resolveAgentRuntimeSpawnPort(input)
  const mcpEndpoint = process.env.MOVSCRIPT_MCP_ENDPOINT || DEFAULT_MCP_ENDPOINT
  const agentUserDataDir = process.env.MOVSCRIPT_AGENT_USER_DATA_DIR || join(app.getPath('userData'), DEFAULT_AGENT_USER_DATA_DIR)
  const agentCatalogDirs = ensureAgentCatalogPackStoreDirs()
  console.info(`[agent] spawning ${launch.command} ${launch.args.join(' ')} cwd=${launch.cwd}`)
  console.info(`[agent] spawn env MOVSCRIPT_AGENT_TRANSPORT=${input.transport.kind} MOVSCRIPT_AGENT_PORT=${port ?? '(unset)'} MOVSCRIPT_AGENT_SOCKET_PATH=${input.transport.socketPath ?? '(unset)'} MOVSCRIPT_MCP_ENDPOINT=${mcpEndpoint} MOVSCRIPT_BACKEND_API_BASE_URL=${input.backendAPIBaseURL || '(unset)'} MOVSCRIPT_AGENT_USER_DATA_DIR=${agentUserDataDir} MOVSCRIPT_AGENT_CATALOG_STORE_DIR=${agentCatalogDirs.rootDir} MOVSCRIPT_AGENT_WORKSPACE_DIR=${input.session?.workspaceDir ?? '(unset)'} MOVSCRIPT_AGENT_SESSION_ID=${input.session?.sessionId ?? '(unset)'} parentPid=${process.pid}`)

  const child = spawn(launch.command, launch.args, {
    cwd: launch.cwd,
    detached: input.detached,
    env: buildAgentRuntimeSpawnEnv(input, {
      baseEnv: process.env,
      launchEnv: launch.env,
      mcpEndpoint,
      agentUserDataDir,
      agentCatalogDirs,
    }),
    stdio: app.isPackaged ? 'ignore' : 'inherit',
  })

  if (input.detached) child.unref()
  child.on('error', (err) => console.error('[agent]', err))
  child.on('exit', (code, signal) => {
    console.info(`[agent] movscript-agent exited code=${code ?? 'null'} signal=${signal ?? 'null'} pid=${child.pid ?? 'unknown'} elapsedMs=${Date.now() - input.spawnStartedAt}`)
    input.onExit?.(child, code, signal)
  })

  return child
}
