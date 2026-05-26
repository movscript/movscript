import { spawn, type ChildProcess } from 'child_process'
import { join } from 'path'
import { app } from 'electron'
import {
  DEFAULT_AGENT_USER_DATA_DIR,
  DEFAULT_MCP_ENDPOINT,
  resolvePort,
} from './config'
import { resolveAgentRuntimeLaunch } from './launch'

export interface SpawnAgentRuntimeInput {
  baseURL: string
  backendAPIBaseURL: string
  detached: boolean
  spawnStartedAt: number
  onExit?: (child: ChildProcess, code: number | null, signal: NodeJS.Signals | null) => void
}

export function spawnAgentRuntimeProcess(input: SpawnAgentRuntimeInput): ChildProcess {
  const launchResolveStartedAt = Date.now()
  const launch = resolveAgentRuntimeLaunch()
  console.info(`[agent] resolved runtime launch elapsed=${Date.now() - launchResolveStartedAt}ms command=${launch.command} args=${launch.args.join(' ')} cwd=${launch.cwd}`)

  const port = resolvePort(input.baseURL)
  const mcpEndpoint = process.env.MOVSCRIPT_MCP_ENDPOINT || DEFAULT_MCP_ENDPOINT
  const agentUserDataDir = process.env.MOVSCRIPT_AGENT_USER_DATA_DIR || join(app.getPath('userData'), DEFAULT_AGENT_USER_DATA_DIR)
  console.info(`[agent] spawning ${launch.command} ${launch.args.join(' ')} cwd=${launch.cwd}`)
  console.info(`[agent] spawn env MOVSCRIPT_AGENT_PORT=${port} MOVSCRIPT_MCP_ENDPOINT=${mcpEndpoint} MOVSCRIPT_BACKEND_API_BASE_URL=${input.backendAPIBaseURL || '(unset)'} MOVSCRIPT_AGENT_USER_DATA_DIR=${agentUserDataDir} parentPid=${process.pid}`)

  const child = spawn(launch.command, launch.args, {
    cwd: launch.cwd,
    detached: input.detached,
    env: {
      ...process.env,
      ...launch.env,
      MOVSCRIPT_AGENT_PORT: String(port),
      MOVSCRIPT_MCP_ENDPOINT: mcpEndpoint,
      MOVSCRIPT_AGENT_USER_DATA_DIR: agentUserDataDir,
      ...(input.backendAPIBaseURL ? {
        MOVSCRIPT_BACKEND_API_BASE_URL: input.backendAPIBaseURL,
        MOVSCRIPT_API_BASE_URL: input.backendAPIBaseURL,
      } : {}),
      MOVSCRIPT_AGENT_PARENT_PID: String(process.pid),
      MOVSCRIPT_AGENT_SERVER_CHILD_STARTED_AT: String(input.spawnStartedAt),
    },
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
