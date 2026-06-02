import { normalizeBaseURL, resolvePort } from '../config'
import { ResponseAgentRuntimeControlEventStream } from './sse'
import type { AgentRuntimeControlEventStream, AgentRuntimeControlTransport } from './types'

export class HttpAgentRuntimeControlTransport implements AgentRuntimeControlTransport {
  readonly kind = 'http'
  readonly endpointLabel: string
  readonly port: number

  constructor(baseURL: string) {
    this.endpointLabel = normalizeBaseURL(baseURL)
    this.port = resolvePort(this.endpointLabel)
  }

  request(path: string, init?: RequestInit): Promise<Response> {
    return fetch(`${this.endpointLabel}${path}`, init)
  }

  async openEventStream(path: string, init?: RequestInit): Promise<AgentRuntimeControlEventStream> {
    return new ResponseAgentRuntimeControlEventStream(await this.request(path, init))
  }
}

export function createHttpAgentRuntimeControlTransport(baseURL: string): AgentRuntimeControlTransport {
  return new HttpAgentRuntimeControlTransport(baseURL)
}
