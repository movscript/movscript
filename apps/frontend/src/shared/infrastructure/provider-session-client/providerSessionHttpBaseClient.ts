import { performanceNow, recordAgentNetworkRequestMetric } from '@/features/agent/state/agentPerformanceStore'
import { getAPIV1BaseURL } from '@/shared/infrastructure/config'
import type { ProviderSessionTransport } from '@/shared/infrastructure/providerSessionTransport'
import { providerSessionTransport, DEFAULT_PROVIDER_SESSION_HEALTH_TIMEOUT_MS, DEFAULT_PROVIDER_SESSION_REQUEST_TIMEOUT_MS } from '@/shared/infrastructure/provider-session-client/config'
import { providerSessionResponseError } from '@/shared/infrastructure/provider-session-client/errors'
import { createProviderSessionRequestSignal, normalizePositiveTimeoutMs } from '@/shared/infrastructure/provider-session-client/requestSignal'
import { statusClass } from '@/shared/infrastructure/provider-session-client/providerSessionHttpProtocol'
import { useUserStore } from '@/shared/infrastructure/session/userStore'

export interface ProviderSessionHttpClientOptions {
  healthTimeoutMs?: number
  requestTimeoutMs?: number
  transport?: ProviderSessionTransport
  providerProfileKey?: string
  workspaceDir?: string
  sessionId?: string
}

export class ProviderSessionHttpBaseClient {
  readonly baseURL: string
  readonly transportKind: ProviderSessionTransport['kind']
  readonly providerProfileKey?: string
  readonly workspaceDir?: string
  readonly sessionId?: string
  protected readonly transport: ProviderSessionTransport
  protected readonly healthTimeoutMs: number
  protected readonly requestTimeoutMs: number

  constructor(
    transport?: ProviderSessionTransport,
    options: ProviderSessionHttpClientOptions = {},
  ) {
    this.transport = transport ?? options.transport ?? providerSessionTransport({ workspaceDir: options.workspaceDir, sessionId: options.sessionId })
    this.baseURL = this.transport.endpointLabel
    this.transportKind = this.transport.kind
    this.providerProfileKey = options.providerProfileKey
    this.workspaceDir = options.workspaceDir
    this.sessionId = options.sessionId
    this.healthTimeoutMs = normalizePositiveTimeoutMs(options.healthTimeoutMs) ?? DEFAULT_PROVIDER_SESSION_HEALTH_TIMEOUT_MS
    this.requestTimeoutMs = normalizePositiveTimeoutMs(options.requestTimeoutMs) ?? DEFAULT_PROVIDER_SESSION_REQUEST_TIMEOUT_MS
  }

  protected async getJSON<T>(path: string, options: { auth?: boolean; signal?: AbortSignal; timeoutMs?: number } = {}): Promise<T> {
    const request = createProviderSessionRequestSignal(options.signal, options.timeoutMs ?? this.requestTimeoutMs)
    try {
      const res = await this.requestMeasured(path, {
        headers: options.auth === false ? {} : this.authHeaders(),
        signal: request.signal,
      })
      if (!res.ok) throw await providerSessionResponseError(res)
      return await res.json() as T
    } finally {
      request.cleanup()
    }
  }

  protected async postJSON<T>(path: string, body: object, signal?: AbortSignal, options: { backendContext?: boolean } = {}): Promise<T> {
    const request = createProviderSessionRequestSignal(signal, this.requestTimeoutMs)
    try {
      const res = await this.requestMeasured(path, {
        method: 'POST',
        headers: this.authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(options.backendContext === false ? body : this.withBackendContext(body)),
        signal: request.signal,
      })
      if (!res.ok) throw await providerSessionResponseError(res)
      return await res.json() as T
    } finally {
      request.cleanup()
    }
  }

  protected async patchJSON<T>(path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    const request = createProviderSessionRequestSignal(signal, this.requestTimeoutMs)
    try {
      const res = await this.requestMeasured(path, {
        method: 'PATCH',
        headers: this.authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(this.withBackendContext(body)),
        signal: request.signal,
      })
      if (!res.ok) throw await providerSessionResponseError(res)
      return await res.json() as T
    } finally {
      request.cleanup()
    }
  }

  protected async deleteJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
    const request = createProviderSessionRequestSignal(signal, this.requestTimeoutMs)
    try {
      const res = await this.requestMeasured(path, {
        method: 'DELETE',
        headers: this.authHeaders(),
        signal: request.signal,
      })
      if (!res.ok) throw await providerSessionResponseError(res)
      return await res.json() as T
    } finally {
      request.cleanup()
    }
  }

  protected async openMeasuredEventStream(path: string, init: RequestInit = {}) {
    const started = performanceNow()
    const method = init.method ?? 'GET'
    try {
      const stream = await this.transport.openEventStream(path, init)
      this.recordNetworkMetric(path, method, statusClass(stream.status), started)
      return stream
    } catch (error) {
      this.recordNetworkMetric(path, method, init.signal?.aborted ? 'aborted' : 'network_error', started)
      throw error
    }
  }

  private async requestMeasured(path: string, init: RequestInit = {}): Promise<Response> {
    const started = performanceNow()
    const method = init.method ?? 'GET'
    try {
      const response = await this.transport.request(path, init)
      this.recordNetworkMetric(path, method, statusClass(response.status), started)
      return response
    } catch (error) {
      this.recordNetworkMetric(path, method, init.signal?.aborted ? 'aborted' : 'network_error', started)
      throw error
    }
  }

  private recordNetworkMetric(path: string, method: string, status: string, started: number): void {
    recordAgentNetworkRequestMetric({
      method,
      routeGroup: path,
      statusClass: status,
      durationMs: Math.max(0, performanceNow() - started),
      transport: this.transportKind,
    })
  }

  protected authHeaders(base: Record<string, string> = {}): Record<string, string> {
    const token = useUserStore.getState().token
    return token ? { ...base, Authorization: `Bearer ${token}` } : base
  }

  private withBackendContext(body: object): Record<string, unknown> {
    return {
      ...(body as Record<string, unknown>),
      backendAPIBaseURL: getAPIV1BaseURL(),
    }
  }
}
