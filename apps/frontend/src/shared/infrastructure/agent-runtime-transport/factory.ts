import type { ElectronAgentRuntimeEnsureInput } from '@/shared/contracts/electronApi'
import { ElectronAgentRuntimeTransport } from './electronTransport'
import { HttpAgentRuntimeTransport } from './httpTransport'
import type { AgentRuntimeTransport, AgentRuntimeTransportConfig, AgentRuntimeTransportMode } from './types'

export function createHttpAgentRuntimeTransport(baseURL: string): AgentRuntimeTransport {
  return new HttpAgentRuntimeTransport(baseURL)
}

export function createElectronAgentRuntimeTransport(input: ElectronAgentRuntimeEnsureInput = {}): AgentRuntimeTransport {
  return new ElectronAgentRuntimeTransport(input)
}

export function createAgentRuntimeTransport(config: AgentRuntimeTransportConfig): AgentRuntimeTransport {
  const mode = normalizeAgentRuntimeTransportMode(config.mode)
  if (mode === 'electron') {
    return createElectronAgentRuntimeTransport({ baseURL: config.baseURL })
  }
  if (mode === 'unix-socket') {
    if (!config.socketPath) throw new Error('VITE_LOCAL_AGENT_SOCKET_PATH is required when VITE_LOCAL_AGENT_TRANSPORT=unix-socket')
    return createElectronAgentRuntimeTransport({
      baseURL: config.baseURL,
      transportKind: 'unix-socket',
      socketPath: config.socketPath,
    })
  }
  if (mode === 'websocket') {
    throw new Error('VITE_LOCAL_AGENT_TRANSPORT=websocket is reserved but not implemented')
  }
  if (mode === 'named-pipe') {
    throw new Error('VITE_LOCAL_AGENT_TRANSPORT=named-pipe is reserved but not implemented')
  }
  return createHttpAgentRuntimeTransport(config.baseURL)
}

function normalizeAgentRuntimeTransportMode(value: string | undefined): AgentRuntimeTransportMode {
  if (value === 'electron' || value === 'unix-socket' || value === 'websocket' || value === 'named-pipe') return value
  return 'http'
}
