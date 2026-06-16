import {
  type AppServerJsonRpcId,
  type AppServerJsonRpcNotification,
  type AppServerJsonRpcResponse,
  type AppServerJsonRpcServerRequest,
  type AppServerNotificationHandler,
  type AppServerServerRequestHandler,
  type AppServerThreadListResponse,
  type AppServerThreadReadResponse,
  type AppServerThreadTurnsListParams,
  type AppServerThreadTurnsListResponse,
  type AppServerThreadResumeParams,
  type AppServerThreadResumeResponse,
  type AppServerThreadSettingsUpdateParams,
  type AppServerThreadSettingsUpdateResponse,
  type AppServerThreadStartParams,
  type AppServerThreadStartResponse,
  type AppServerTurnInterruptParams,
  type AppServerTurnInterruptResponse,
  type AppServerTurnStartParams,
  type AppServerTurnStartResponse,
  type AppServerTurnSteerParams,
  type AppServerTurnSteerResponse,
} from '@/shared/infrastructure/app-server/appServerProtocol'
import {
  appServerInitializeParams,
  appServerTextTurnParams,
  appServerThreadListParams,
  appServerThreadReadParams,
} from '@/shared/infrastructure/app-server/appServerRpcRequestParams'
import {
  type ProviderConfig,
} from '@/shared/infrastructure/providerConfigStore'
import {
  debugAppServerRpc,
  shouldDebugAppServerRpcMethod,
  shouldDebugAppServerRpcNotification,
} from '@/shared/infrastructure/app-server/appServerRpcClientConfig'
import {
  AppServerRpcError,
  compactProtocolParams,
  compactRecord,
  fallbackServerRequestResult,
  hasOwn,
  isAlreadyInitializedError,
  isJsonRpcId,
  isRecord,
} from '@/shared/infrastructure/app-server/appServerRpcProtocolUtils'
import {
  distributeAppServerConfig as distributeAppServerConfigFromLifecycle,
  ensureAppServer as ensureAppServerFromLifecycle,
  getAppServerStatus as getAppServerStatusFromLifecycle,
  resolveAppServerEndpoint,
  stopAppServer as stopAppServerFromLifecycle,
  type ElectronAppServerEnsureInput,
  type ElectronAppServerProfile,
  type ElectronAppServerStatus,
  type ElectronAppServerStatusInput,
  type ElectronAppServerStopInput,
} from '@/shared/infrastructure/app-server/appServerLifecycleClient'
import {
  extractAgentConnectionDebugThreadId,
  recordAgentConnectionDebugEvent,
} from '@/shared/infrastructure/agentConnectionDebugStore'
import {
  createAppServerRpcTransport,
  type AppServerTransport,
} from '@/shared/infrastructure/app-server/appServerRpcTransport'
import type { AgentChatThreadReadInput } from '@movscript/core/agent/chat'

export { appServerScopedEnvURLKeys, appServerURL } from '@/shared/infrastructure/app-server/appServerRpcClientConfig'
export type {
  ElectronAppServerEnsureInput,
  ElectronAppServerProfile,
  ElectronAppServerStatus,
  ElectronAppServerStatusInput,
  ElectronAppServerStopInput,
} from '@/shared/infrastructure/app-server/appServerLifecycleClient'

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

type PendingDebugRequest = {
  method: string
  threadId?: string
}

type DeferredServerRequest = {
  request: AppServerJsonRpcServerRequest
}

let configuredClient: AppServerRpcClient | undefined

export function appServerRpcClientForURL(url: string): AppServerRpcClient {
  if (!configuredClient || configuredClient.url !== url) configuredClient = new AppServerRpcClient(url)
  return configuredClient
}

export async function ensureAppServerURL(provider?: ProviderConfig): Promise<string | undefined> {
  return resolveAppServerEndpoint(provider)
}

export async function ensureAppServerRpcClient(provider?: ProviderConfig): Promise<AppServerRpcClient | undefined> {
  const url = await ensureAppServerURL(provider)
  if (!url) return undefined
  return appServerRpcClientForURL(url)
}

export function getAppServerStatus(input?: ElectronAppServerStatusInput): Promise<ElectronAppServerStatus | undefined> {
  return getAppServerStatusFromLifecycle(input)
}

export function distributeAppServerConfig(input: ElectronAppServerEnsureInput): Promise<ElectronAppServerStatus | undefined> {
  return distributeAppServerConfigFromLifecycle(input)
}

export function ensureAppServer(input: ElectronAppServerEnsureInput): Promise<ElectronAppServerStatus | undefined> {
  return ensureAppServerFromLifecycle(input)
}

export function stopAppServer(input?: ElectronAppServerStopInput): Promise<ElectronAppServerStatus | undefined> {
  return stopAppServerFromLifecycle(input)
}

export class AppServerRpcClient {
  private transport?: AppServerTransport
  private connectPromise?: Promise<void>
  private initializePromise?: Promise<void>
  private initialized = false
  private nextRequestId = 1
  private readonly pending = new Map<AppServerJsonRpcId, PendingRequest>()
  private readonly pendingDebugRequests = new Map<AppServerJsonRpcId, PendingDebugRequest>()
  private readonly listeners = new Set<AppServerNotificationHandler>()
  private readonly serverRequestHandlers = new Set<AppServerServerRequestHandler>()
  private readonly deferredServerRequests = new Map<AppServerJsonRpcId, DeferredServerRequest>()

  constructor(
    readonly url: string,
    _serverRequestHandlerGraceMs?: number,
  ) {}

  async initialize(): Promise<void> {
    await this.connect()
    if (this.initialized) return
    if (this.initializePromise) return this.initializePromise
    this.initializePromise = this.performInitialize()
      .finally(() => {
        this.initializePromise = undefined
      })
    return this.initializePromise
  }

  private async performInitialize(): Promise<void> {
    try {
      await this.request('initialize', appServerInitializeParams())
    } catch (error) {
      if (!isAlreadyInitializedError(error)) throw error
    }
    await this.notify('initialized')
    this.initialized = true
  }

  async startThread(params: AppServerThreadStartParams = {}) {
    await this.initialize()
    return this.request<AppServerThreadStartResponse>('thread/start', compactRecord(params))
  }

  async listThreads(input: { limit?: number; cursor?: string | null } = {}) {
    await this.initialize()
    return this.request<AppServerThreadListResponse>('thread/list', appServerThreadListParams(input))
  }

  async readThread(threadId: string, input: AgentChatThreadReadInput = {}) {
    await this.initialize()
    return this.request<AppServerThreadReadResponse>('thread/read', appServerThreadReadParams(threadId, input))
  }

  async listThreadTurns(input: AppServerThreadTurnsListParams) {
    await this.initialize()
    return this.request<AppServerThreadTurnsListResponse>('thread/turns/list', compactRecord({
      threadId: input.threadId,
      cursor: input.cursor ?? undefined,
      limit: input.limit ?? undefined,
      sortDirection: input.sortDirection ?? undefined,
      itemsView: input.itemsView ?? undefined,
    }))
  }

  async resumeThread(params: AppServerThreadResumeParams) {
    await this.initialize()
    return this.request<AppServerThreadResumeResponse>('thread/resume', compactRecord(params))
  }

  async updateThreadSettings(params: AppServerThreadSettingsUpdateParams) {
    await this.initialize()
    return this.request<AppServerThreadSettingsUpdateResponse>('thread/settings/update', compactRecord(params))
  }

  async startTurn(params: AppServerTurnStartParams) {
    await this.initialize()
    return this.request<AppServerTurnStartResponse>('turn/start', compactRecord(params))
  }

  async steerTurn(params: AppServerTurnSteerParams) {
    await this.initialize()
    return this.request<AppServerTurnSteerResponse>('turn/steer', compactRecord(params))
  }

  async interruptTurn(params: AppServerTurnInterruptParams) {
    await this.initialize()
    return this.request<AppServerTurnInterruptResponse>('turn/interrupt', params)
  }

  async startTextTurn(input: Omit<AppServerTurnStartParams, 'input'> & { text: string }) {
    return this.startTurn(appServerTextTurnParams(input))
  }

  async requestProtocol<T = unknown>(method: string, params?: unknown): Promise<T> {
    await this.initialize()
    return this.request<T>(method, compactProtocolParams(params))
  }

  async notifyProtocol(method: string, params?: unknown): Promise<void> {
    await this.initialize()
    await this.notify(method, compactProtocolParams(params))
  }

  onNotification(listener: AppServerNotificationHandler): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  onServerRequest(handler: AppServerServerRequestHandler): () => void {
    this.serverRequestHandlers.add(handler)
    this.flushDeferredServerRequests()
    return () => this.serverRequestHandlers.delete(handler)
  }

  async close(): Promise<void> {
    this.initialized = false
    this.initializePromise = undefined
    this.connectPromise = undefined
    for (const pending of this.pending.values()) pending.reject(new Error(`app-server disconnected: ${this.url}`))
    this.pending.clear()
    this.clearDeferredServerRequests()
    const transport = this.transport
    this.transport = undefined
    await transport?.close()
  }

  private async connect(): Promise<void> {
    if (this.transport) return
    if (this.connectPromise) return this.connectPromise
    this.connectPromise = this.createTransport()
      .then((transport) => {
        this.transport = transport
      })
      .finally(() => {
        this.connectPromise = undefined
      })
    return this.connectPromise
  }

  private async createTransport(): Promise<AppServerTransport> {
    return createAppServerRpcTransport({
      url: this.url,
      onMessage: (data) => this.handleMessage(data),
      onRelayError: (error) => this.failPending(error),
      onClosed: (error) => {
        this.initialized = false
        this.initializePromise = undefined
        this.transport = undefined
        this.failPending(error)
      },
    })
  }

  private async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    await this.connect()
    const id = this.nextRequestId++
    const rawPayload = compactRecord({ id, method, params })
    const payload = JSON.stringify(rawPayload)
    const threadId = extractAgentConnectionDebugThreadId(params)
    this.pendingDebugRequests.set(id, { method, threadId })
    recordAgentConnectionDebugEvent({
      direction: 'request',
      source: 'app-server-rpc',
      connectionId: this.url,
      requestId: id,
      method,
      threadId,
      raw: rawPayload,
    })
    debugAppServerRpc('request', { url: this.url, id, method, params }, { trace: shouldDebugAppServerRpcMethod(method) })
    const promise = new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject })
    })
    await this.transport?.send(payload)
    return promise
  }

  private async notify(method: string, params?: unknown): Promise<void> {
    await this.connect()
    const rawPayload = compactRecord({ method, params })
    recordAgentConnectionDebugEvent({
      direction: 'request',
      source: 'app-server-rpc',
      connectionId: this.url,
      method,
      threadId: extractAgentConnectionDebugThreadId(params),
      raw: rawPayload,
    })
    await this.transport?.send(JSON.stringify(rawPayload))
  }

  private handleMessage(data: unknown): void {
    let message: unknown
    try {
      message = JSON.parse(typeof data === 'string' ? data : String(data))
    } catch {
      return
    }
    if (!isRecord(message)) return
    if (isJsonRpcId(message.id) && (hasOwn(message, 'result') || hasOwn(message, 'error'))) {
      const response = message as AppServerJsonRpcResponse
      const debugRequest = this.pendingDebugRequests.get(response.id)
      this.pendingDebugRequests.delete(response.id)
      recordAgentConnectionDebugEvent({
        direction: 'response',
        source: 'app-server-rpc',
        connectionId: this.url,
        requestId: response.id,
        method: debugRequest?.method,
        threadId: extractAgentConnectionDebugThreadId(response.result)
          || extractAgentConnectionDebugThreadId(response.error)
          || debugRequest?.threadId,
        raw: response,
      })
      const pending = this.pending.get(response.id)
      if (!pending) return
      this.pending.delete(response.id)
      if (response.error) {
        debugAppServerRpc('response:error', { url: this.url, id: response.id, error: response.error }, { trace: false })
        pending.reject(new AppServerRpcError(
          response.error.message || `app-server request ${response.id} failed`,
          response.error.code,
          response.error.data,
        ))
      } else {
        debugAppServerRpc('response', { url: this.url, id: response.id }, { trace: false })
        pending.resolve(response.result)
      }
      return
    }
    if (typeof message.method === 'string') {
      const notification = message as AppServerJsonRpcNotification
      if (isJsonRpcId(message.id)) {
        recordAgentConnectionDebugEvent({
          direction: 'response',
          source: 'app-server-rpc',
          connectionId: this.url,
          requestId: message.id,
          method: notification.method,
          threadId: extractAgentConnectionDebugThreadId(notification.params),
          raw: message,
        })
        debugAppServerRpc('server-request', { url: this.url, id: message.id, method: notification.method, params: notification.params }, { trace: false })
        this.handleServerRequest(message as AppServerJsonRpcServerRequest)
        return
      }
      recordAgentConnectionDebugEvent({
        direction: 'response',
        source: 'app-server-rpc',
        connectionId: this.url,
        method: notification.method,
        threadId: extractAgentConnectionDebugThreadId(notification.params),
        raw: message,
      })
      if (shouldDebugAppServerRpcNotification(notification.method)) {
        debugAppServerRpc('notification', { url: this.url, method: notification.method, params: notification.params }, { trace: false })
      }
      for (const listener of Array.from(this.listeners)) listener(notification)
    }
  }

  private async handleServerRequest(request: AppServerJsonRpcServerRequest): Promise<void> {
    if (this.serverRequestHandlers.size === 0) {
      this.deferServerRequest(request)
      return
    }
    await this.dispatchServerRequest(request)
  }

  private async dispatchServerRequest(request: AppServerJsonRpcServerRequest): Promise<void> {
    try {
      for (const handler of Array.from(this.serverRequestHandlers)) {
        const result = await handler(request)
        if (result !== undefined) {
          const rawPayload = { id: request.id, result }
          recordAgentConnectionDebugEvent({
            direction: 'request',
            source: 'app-server-rpc',
            connectionId: this.url,
            requestId: request.id,
            method: `${request.method}:response`,
            threadId: extractAgentConnectionDebugThreadId(request.params)
              || extractAgentConnectionDebugThreadId(result),
            raw: rawPayload,
          })
          void this.transport?.send(JSON.stringify(rawPayload))
          return
        }
      }
      this.resolveServerRequest(request.id, request.method)
    } catch (error) {
      const rawPayload = {
        id: request.id,
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : String(error),
        },
      }
      recordAgentConnectionDebugEvent({
        direction: 'request',
        source: 'app-server-rpc',
        connectionId: this.url,
        requestId: request.id,
        method: `${request.method}:error`,
        threadId: extractAgentConnectionDebugThreadId(request.params),
        raw: rawPayload,
      })
      void this.transport?.send(JSON.stringify(rawPayload))
    }
  }

  private deferServerRequest(request: AppServerJsonRpcServerRequest): void {
    this.deferredServerRequests.set(request.id, { request })
  }

  private flushDeferredServerRequests(): void {
    if (this.serverRequestHandlers.size === 0 || this.deferredServerRequests.size === 0) return
    const deferred = Array.from(this.deferredServerRequests.values())
    this.deferredServerRequests.clear()
    for (const item of deferred) void this.dispatchServerRequest(item.request)
  }

  private clearDeferredServerRequests(): void {
    this.deferredServerRequests.clear()
  }

  private resolveServerRequest(id: AppServerJsonRpcId, method: string): void {
    const result = fallbackServerRequestResult(method)
    const rawPayload = { id, result }
    recordAgentConnectionDebugEvent({
      direction: 'request',
      source: 'app-server-rpc',
      connectionId: this.url,
      requestId: id,
      method: `${method}:fallback-response`,
      raw: rawPayload,
    })
    void this.transport?.send(JSON.stringify(rawPayload))
  }

  private failPending(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
    this.pendingDebugRequests.clear()
  }
}
