export type AgentRuntimeTransportKind = 'http' | 'unix-socket' | 'named-pipe' | 'websocket'
export type AgentRuntimeTransportMode = 'http' | 'electron' | 'unix-socket' | 'named-pipe' | 'websocket'

export interface AgentRuntimeTransportConfig {
  baseURL: string
  mode?: string
  socketPath?: string
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
