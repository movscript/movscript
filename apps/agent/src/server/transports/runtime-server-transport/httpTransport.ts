import { createServer, type RequestListener, type Server } from 'node:http'
import type { AgentRuntimeServerEndpoint, AgentRuntimeServerTransport } from './types.js'

export class HttpAgentRuntimeServerTransport implements AgentRuntimeServerTransport {
  readonly kind = 'http'

  createServer(listener: RequestListener): Server {
    return createServer(listener)
  }

  listen(server: Server, endpoint: AgentRuntimeServerEndpoint, onReady: () => void): void {
    server.listen(endpoint.port, endpoint.host, onReady)
  }
}

export function httpAgentRuntimeEndpoint(host: string, port: number): AgentRuntimeServerEndpoint {
  return {
    kind: 'http',
    host,
    port,
    label: `${host}:${port}`,
  }
}
