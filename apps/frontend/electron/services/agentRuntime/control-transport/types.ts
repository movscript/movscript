export type AgentRuntimeControlTransportKind = 'http' | 'unix-socket' | 'named-pipe' | 'websocket'

export interface AgentRuntimeControlTransport {
  readonly kind: AgentRuntimeControlTransportKind
  readonly endpointLabel: string
  readonly port?: number
  readonly socketPath?: string
  request(path: string, init?: RequestInit): Promise<Response>
  openEventStream(path: string, init?: RequestInit): Promise<AgentRuntimeControlEventStream>
}

export interface AgentRuntimeControlEventStream {
  readonly ok: boolean
  readonly status: number
  readonly statusText?: string
  readonly headers: Record<string, string>
  responseText(): Promise<string>
  messages(): AsyncIterable<string>
}

export interface AgentRuntimeControlTransportInput {
  baseURL?: string
  transportKind?: AgentRuntimeControlTransportKind
  socketPath?: string
  env?: NodeJS.ProcessEnv
}
