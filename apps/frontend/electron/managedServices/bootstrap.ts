import { setMCPAPIBaseURL } from '../mcp/server'
import {
  ensureAgentRuntimeRunning,
  getAgentRuntimeLaunchPolicy,
  setAgentRuntimeAPIBaseURL,
} from '../services/agentRuntime'
import {
  getBackendLaunchPolicy,
  LOCAL_BACKEND_URL,
  startBackend,
} from '../services/backend'
import { broadcastBackendStatus } from './backendStatus'
import { ensureMCPServerReady } from './mcp'

async function startAgentRuntimeOnAppReady(): Promise<void> {
  if (getAgentRuntimeLaunchPolicy() === 'external') {
    console.info('[agent] launch policy=external; not spawning local agent runtime')
    return
  }
  await ensureMCPServerReady()
  const status = await ensureAgentRuntimeRunning()
  if (!status.ok) {
    console.warn(`[agent] auto-start failed: ${status.error ?? 'unknown error'}`)
    return
  }
  console.info(`[agent] auto-start ${status.started ? 'started' : 'ready'} at ${status.baseURL}${status.pid ? ` pid=${status.pid}` : ''}`)
}

async function bootstrapBackendBeforeAgent(): Promise<boolean> {
  const policy = getBackendLaunchPolicy()
  console.info(`[bootstrap] backend policy=${policy}`)
  const status = await startBackend(policy, broadcastBackendStatus)
  if (policy !== 'spawn') return true

  if (status.state !== 'ready') {
    console.warn(`[backend] local bootstrap failed: ${status.message ?? status.state}`)
    return false
  }

  console.info(`[bootstrap] local backend ready at ${LOCAL_BACKEND_URL}; starting agent after backend`)
  setMCPAPIBaseURL(LOCAL_BACKEND_URL)
  await setAgentRuntimeAPIBaseURL(LOCAL_BACKEND_URL)
  return true
}

export async function bootstrapManagedServicesBeforeWindow(): Promise<void> {
  await ensureMCPServerReady()
  if (await bootstrapBackendBeforeAgent()) {
    void startAgentRuntimeOnAppReady()
  }
}
