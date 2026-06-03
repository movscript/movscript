export type AgentRuntimeTransportKind = 'electron' | 'unix-socket'

export interface AgentRuntimeTransportConfig {
  workspaceDir?: string
  sessionId?: string
}

export interface AgentRuntimeTransport {
  readonly kind: AgentRuntimeTransportKind
  readonly endpointLabel: string
  readonly socketPath?: string
  request(path: string, init?: RequestInit): Promise<Response>
  openEventStream(path: string, init?: RequestInit): Promise<AgentRuntimeEventStream>
}

export interface AgentRuntimeEventStream {
  readonly ok: boolean
  readonly status: number
  responseText(): Promise<string>
  messages(): AsyncIterable<string>
}
