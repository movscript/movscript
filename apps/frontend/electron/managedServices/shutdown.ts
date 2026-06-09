import { stopMCPServer } from '@movscript/core/mcp/node'
import { stopBackend } from '../services/backend'
import { appServerManager } from '../services/appServerManager'
import { localTerminalManager } from '../services/localTerminal'
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
      localTerminalManager.stopAll()
      await appServerManager.stopAll()
      await stopMCPServer()
      await stopBackend(broadcastBackendStatus)
    } finally {
      shutdownCompleted = true
    }
  })()
  return shutdownPromise
}
