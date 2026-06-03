import { setMCPAPIBaseURL } from '../mcp/server'
import {
  setAgentRuntimeAPIBaseURL,
} from '../services/agentRuntime'
import {
  getBackendLaunchPolicy,
  LOCAL_BACKEND_URL,
  startBackend,
} from '../services/backend'
import { broadcastBackendStatus } from './backendStatus'
import { ensureMCPServerReady } from './mcp'

async function bootstrapBackendServices(): Promise<boolean> {
  const policy = getBackendLaunchPolicy()
  console.info(`[bootstrap] backend policy=${policy}`)
  const status = await startBackend(policy, broadcastBackendStatus)
  if (policy !== 'spawn') return true

  if (status.state !== 'ready') {
    console.warn(`[backend] local bootstrap failed: ${status.message ?? status.state}`)
    return false
  }

  console.info(`[bootstrap] local backend ready at ${LOCAL_BACKEND_URL}; session agents will use this backend by default`)
  setMCPAPIBaseURL(LOCAL_BACKEND_URL)
  await setAgentRuntimeAPIBaseURL(LOCAL_BACKEND_URL)
  return true
}

export async function bootstrapManagedServicesBeforeWindow(): Promise<void> {
  void ensureMCPServerReady()
    .catch((error) => console.warn(`[mcp] bootstrap failed: ${error instanceof Error ? error.message : String(error)}`))
  await bootstrapBackendServices()
}
