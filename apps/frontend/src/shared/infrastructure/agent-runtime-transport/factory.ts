import type { ElectronAgentRuntimeEnsureInput } from '@/shared/contracts/electronApi'
import { ElectronAgentRuntimeTransport } from './electronTransport'
import type { AgentRuntimeTransport, AgentRuntimeTransportConfig } from './types'

export function createElectronAgentRuntimeTransport(input: ElectronAgentRuntimeEnsureInput = {}): AgentRuntimeTransport {
  return new ElectronAgentRuntimeTransport(input)
}

export function createAgentRuntimeTransport(config: AgentRuntimeTransportConfig): AgentRuntimeTransport {
  return createElectronAgentRuntimeTransport({
    ...(config.workspaceDir ? { workspaceDir: config.workspaceDir } : {}),
    ...(config.sessionId ? { sessionId: config.sessionId } : {}),
  })
}
