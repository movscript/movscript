import type { RequestListener, Server } from 'node:http'

export type AgentRuntimeServerTransportKind = 'http' | 'unix-socket' | 'named-pipe' | 'websocket'

export interface AgentRuntimeServerEndpoint {
  kind: AgentRuntimeServerTransportKind
  host?: string
  port?: number
  path?: string
  label: string
}

export interface AgentRuntimeServerTransport {
  readonly kind: AgentRuntimeServerTransportKind
  createServer(listener: RequestListener): Server
  listen(server: Server, endpoint: AgentRuntimeServerEndpoint, onReady: () => void): void
}
