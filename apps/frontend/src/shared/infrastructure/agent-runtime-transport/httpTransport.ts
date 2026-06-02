import { ResponseAgentRuntimeEventStream } from './eventStream'
import type { AgentRuntimeEventStream, AgentRuntimeTransport } from './types'

export class HttpAgentRuntimeTransport implements AgentRuntimeTransport {
  readonly kind = 'http'
  readonly endpointLabel: string

  constructor(baseURL: string) {
    this.endpointLabel = baseURL.replace(/\/+$/, '')
  }

  request(path: string, init?: RequestInit): Promise<Response> {
    return fetch(`${this.endpointLabel}${path}`, init)
  }

  async openEventStream(path: string, init?: RequestInit): Promise<AgentRuntimeEventStream> {
    return new ResponseAgentRuntimeEventStream(await this.request(path, init))
  }
}
