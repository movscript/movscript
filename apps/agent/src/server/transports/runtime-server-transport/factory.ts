import { HttpAgentRuntimeServerTransport, httpAgentRuntimeEndpoint } from './httpTransport.js'
import { UnixSocketAgentRuntimeServerTransport, unixSocketAgentRuntimeEndpoint } from './unixSocketTransport.js'
import type { AgentRuntimeServerEndpoint, AgentRuntimeServerTransport } from './types.js'

export function resolveAgentRuntimeServerTransport(defaultPort: number): {
  transport: AgentRuntimeServerTransport
  endpoint: AgentRuntimeServerEndpoint
} {
  const transportKind = process.env.MOVSCRIPT_AGENT_TRANSPORT
  const socketPath = process.env.MOVSCRIPT_AGENT_SOCKET_PATH
  if (transportKind === 'websocket') {
    throw new Error('MOVSCRIPT_AGENT_TRANSPORT=websocket is reserved but not implemented')
  }
  if (transportKind === 'named-pipe') {
    throw new Error('MOVSCRIPT_AGENT_TRANSPORT=named-pipe is reserved but not implemented')
  }
  if (transportKind === 'unix-socket' || socketPath) {
    if (!socketPath) throw new Error('MOVSCRIPT_AGENT_SOCKET_PATH is required for unix-socket agent runtime transport')
    return {
      transport: new UnixSocketAgentRuntimeServerTransport(),
      endpoint: unixSocketAgentRuntimeEndpoint(socketPath),
    }
  }
  return {
    transport: new HttpAgentRuntimeServerTransport(),
    endpoint: httpAgentRuntimeEndpoint('127.0.0.1', defaultPort),
  }
}
