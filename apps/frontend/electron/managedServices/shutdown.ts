import { stopMCPServer } from '../mcp/server'
import { stopAgentRuntime } from '../services/agentRuntime'
import { stopBackend } from '../services/backend'
import { broadcastBackendStatus } from './backendStatus'

let shutdownCompleted = false
let shutdownPromise: Promise<void> | null = null

export function hasManagedServicesShutdownCompleted(): boolean {
  return shutdownCompleted
}

export async function shutdownManagedServices(): Promise<void> {
  if (shutdownPromise) return shutdownPromise
  shutdownPromise = (async () => {
    try {
      await stopAgentRuntime()
      await stopMCPServer()
      await stopBackend(broadcastBackendStatus)
    } finally {
      shutdownCompleted = true
    }
  })()
  return shutdownPromise
}
