import { normalizeBaseURL } from '../config'
import { createHttpAgentRuntimeControlTransport } from './httpTransport'
import { createUnixSocketAgentRuntimeControlTransport } from './unixSocketTransport'
import type { AgentRuntimeControlTransport, AgentRuntimeControlTransportInput, AgentRuntimeControlTransportKind } from './types'

export function resolveAgentRuntimeControlTransport(input: string | AgentRuntimeControlTransport): AgentRuntimeControlTransport {
  return typeof input === 'string' ? createHttpAgentRuntimeControlTransport(input) : input
}

export function resolveAgentRuntimeControlTransportInput(input: AgentRuntimeControlTransportInput = {}): {
  baseURL: string
  transport: AgentRuntimeControlTransport
} {
  const baseURL = normalizeBaseURL(input.baseURL)
  const env = input.env ?? process.env
  const transportKind = input.transportKind ?? normalizeRuntimeTransportKind(env.MOVSCRIPT_AGENT_TRANSPORT)
  if (transportKind === 'unix-socket') {
    const socketPath = input.socketPath || env.MOVSCRIPT_AGENT_SOCKET_PATH
    if (!socketPath) {
      throw new Error('MOVSCRIPT_AGENT_SOCKET_PATH is required when MOVSCRIPT_AGENT_TRANSPORT=unix-socket')
    }
    return { baseURL, transport: createUnixSocketAgentRuntimeControlTransport(socketPath) }
  }
  if (transportKind === 'websocket') {
    throw new Error('MOVSCRIPT_AGENT_TRANSPORT=websocket is reserved but not implemented')
  }
  if (transportKind === 'named-pipe') {
    throw new Error('MOVSCRIPT_AGENT_TRANSPORT=named-pipe is reserved but not implemented')
  }
  return { baseURL, transport: createHttpAgentRuntimeControlTransport(baseURL) }
}

function normalizeRuntimeTransportKind(value: string | undefined): AgentRuntimeControlTransportKind | undefined {
  if (value === 'http' || value === 'unix-socket' || value === 'named-pipe' || value === 'websocket') return value
  return undefined
}
