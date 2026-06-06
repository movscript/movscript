export type ProviderSessionTransportKind = 'http'

export interface ProviderSessionTransportConfig {
  baseURL?: string
  workspaceDir?: string
  sessionId?: string
}

export interface ProviderSessionTransport {
  readonly kind: ProviderSessionTransportKind
  readonly endpointLabel: string
  request(path: string, init?: RequestInit): Promise<Response>
  openEventStream(path: string, init?: RequestInit): Promise<ProviderSessionEventStream>
}

export interface ProviderSessionEventStream {
  readonly ok: boolean
  readonly status: number
  responseText(): Promise<string>
  messages(): AsyncIterable<string>
}
