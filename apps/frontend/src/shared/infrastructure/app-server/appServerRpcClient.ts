import {
  appServerTextInput,
  type AppServerJsonRpcId,
  type AppServerJsonRpcNotification,
  type AppServerJsonRpcResponse,
  type AppServerJsonRpcServerRequest,
  type AppServerNotificationHandler,
  type AppServerServerRequestHandler,
  type AppServerThreadListResponse,
  type AppServerThreadSourceKind,
  type AppServerThreadReadResponse,
  type AppServerThreadTurnsListParams,
  type AppServerThreadTurnsListResponse,
  type AppServerThreadResumeParams,
  type AppServerThreadResumeResponse,
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
  resolveAppServerProfile,
  resolveDefaultProvider,
  usesAppServerProtocol,
  useProviderConfigStore,
  type ProviderConfig,
} from '@/shared/infrastructure/providerConfigStore'
import type {
  ElectronAppServerEnsureInput as ElectronAppServerEnsureInputContract,
  ElectronAppServerProfile as ElectronAppServerProfileContract,
  ElectronAppServerStatus as ElectronAppServerStatusContract,
  ElectronAppServerStatusInput as ElectronAppServerStatusInputContract,
  ElectronAppServerStopInput as ElectronAppServerStopInputContract,
} from '@/shared/contracts/electronApi'
import {
  extractAgentConnectionDebugThreadId,
  recordAgentConnectionDebugEvent,
} from '@/shared/infrastructure/agentConnectionDebugStore'
import type { AgentChatThreadReadInput } from '@movscript/core/agent/chat'

export type ElectronAppServerProfile = ElectronAppServerProfileContract
export type ElectronAppServerEnsureInput = ElectronAppServerEnsureInputContract
export type ElectronAppServerStatus = ElectronAppServerStatusContract
export type ElectronAppServerStatusInput = ElectronAppServerStatusInputContract
export type ElectronAppServerStopInput = ElectronAppServerStopInputContract

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

type AppServerTransport = {
  send(payload: string): void | Promise<void>
  close(): void | Promise<void>
}

let configuredClient: AppServerRpcClient | undefined
const APP_SERVER_WS_URL_STORAGE_KEY = 'movscript.appServerWsUrl'
const APP_SERVER_WS_URL_STORAGE_KEY_PREFIX = 'movscript.appServerWsUrl'
const APP_SERVER_RPC_DEBUG_STORAGE_KEY = 'movscript.debugAppServerRpc'
const APP_SERVER_RPC_DEBUG_METHODS = new Set([
  'thread/list',
  'thread/read',
  'thread/resume',
  'thread/goal/clear',
  'thread/goal/get',
  'thread/goal/set',
])
const APP_SERVER_RPC_DEBUG_NOTIFICATIONS = new Set([
  'thread/goal/cleared',
  'thread/goal/updated',
  'thread/started',
  'thread/status/changed',
])
const APP_SERVER_THREAD_LIST_SOURCE_KINDS: AppServerThreadSourceKind[] = [
  'cli',
  'vscode',
  'exec',
  'appServer',
  'subAgent',
  'unknown',
]

export function appServerURL(provider?: ProviderConfig): string | undefined {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
  const value = providerScopedEnvURL(env, provider)
    || unscopedEnvURL(env)
    || configuredAppServerURL(provider)
  return value || undefined
}

export function appServerRpcClientForURL(url: string): AppServerRpcClient {
  if (!configuredClient || configuredClient.url !== url) configuredClient = new AppServerRpcClient(url)
  return configuredClient
}

export async function ensureAppServerURL(provider?: ProviderConfig): Promise<string | undefined> {
  const activeProvider = provider ?? resolveDefaultProvider(useProviderConfigStore.getState().settings)
  const explicitURL = appServerURL(activeProvider)
  const electronApi = typeof window === 'undefined' ? undefined : window.api
  const ensureAppServer = electronApi?.ensureAppServer
  if (ensureAppServer && activeProvider && usesAppServerProtocol(activeProvider)) {
    const profile = resolveAppServerProfile(activeProvider)
    const status = await ensureAppServer({
      profile,
    })
    if (!status.ok || !status.endpoint) throw new Error(status.error || `${activeProvider.label} app-server failed to start: ${profile.id}`)
    return status.endpoint
  }
  return explicitURL
}

export async function ensureAppServerRpcClient(provider?: ProviderConfig): Promise<AppServerRpcClient | undefined> {
  const url = await ensureAppServerURL(provider)
  if (!url) return undefined
  return appServerRpcClientForURL(url)
}

export function getAppServerStatus(input?: ElectronAppServerStatusInput): Promise<ElectronAppServerStatus | undefined> {
  return window.api?.getAppServerStatus?.(input) ?? Promise.resolve(undefined)
}

export function distributeAppServerConfig(input: ElectronAppServerEnsureInput): Promise<ElectronAppServerStatus | undefined> {
  return window.api?.distributeAppServerConfig?.(input) ?? Promise.resolve(undefined)
}

export function ensureAppServer(input: ElectronAppServerEnsureInput): Promise<ElectronAppServerStatus | undefined> {
  return window.api?.ensureAppServer?.(input) ?? Promise.resolve(undefined)
}

export function stopAppServer(input?: ElectronAppServerStopInput): Promise<ElectronAppServerStatus | undefined> {
  return window.api?.stopAppServer?.(input) ?? Promise.resolve(undefined)
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
      await this.request('initialize', this.initializeParams())
    } catch (error) {
      if (!isAlreadyInitializedError(error)) throw error
    }
    await this.notify('initialized')
    this.initialized = true
  }

  private initializeParams() {
    return {
      clientInfo: {
        name: 'movscript-frontend',
        title: 'MovScript Frontend',
        version: '0.1.0',
      },
      capabilities: {
        experimentalApi: true,
        requestAttestation: false,
      },
    }
  }

  async startThread(params: AppServerThreadStartParams = {}) {
    await this.initialize()
    return this.request<AppServerThreadStartResponse>('thread/start', compactRecord(params))
  }

  async listThreads(input: { limit?: number; cursor?: string | null } = {}) {
    await this.initialize()
    return this.request<AppServerThreadListResponse>('thread/list', compactRecord({
      limit: input.limit ?? 50,
      cursor: input.cursor ?? undefined,
      sortKey: 'updated_at',
      sortDirection: 'desc',
      archived: false,
      modelProviders: [],
      sourceKinds: APP_SERVER_THREAD_LIST_SOURCE_KINDS,
    }))
  }

  async readThread(threadId: string, input: AgentChatThreadReadInput = {}) {
    await this.initialize()
    return this.request<AppServerThreadReadResponse>('thread/read', compactRecord({
      threadId,
      includeTurns: input.includeTurns ?? true,
      afterTurnId: input.afterTurnId ?? undefined,
      beforeTurnId: input.beforeTurnId ?? undefined,
      afterItemId: input.afterItemId ?? undefined,
      beforeItemId: input.beforeItemId ?? undefined,
      limit: input.limit ?? undefined,
      direction: input.direction ?? undefined,
    }))
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
    const { text, ...params } = input
    return this.startTurn({
      ...params,
      threadId: input.threadId,
      clientUserMessageId: input.clientUserMessageId ?? undefined,
      input: [appServerTextInput(text)],
      ...(input.model?.trim() ? { model: input.model.trim() } : {}),
    })
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
    const electronApi = typeof window === 'undefined' ? undefined : window.api
    if (electronApi?.appServerConnect
      && electronApi.appServerSend
      && electronApi.onAppServerMessage) {
      return this.createElectronRelayTransport(electronApi)
    }
    return this.createBrowserWebSocketTransport()
  }

  private async createElectronRelayTransport(electronApi: NonNullable<typeof window.api>): Promise<AppServerTransport> {
    const connect = electronApi.appServerConnect
    const send = electronApi.appServerSend
    const close = electronApi.appServerClose
    const onMessage = electronApi.onAppServerMessage
    const { connectionId } = await connect?.({ url: this.url }) ?? {}
    if (!connectionId) throw new Error(`Failed to open app-server relay: ${this.url}`)
    debugAppServerRpc('relay:connected', { url: this.url, connectionId }, { trace: false })
    const unsubscribe = onMessage?.((message) => {
      if (message.connectionId !== connectionId) return
      if (message.kind === 'message') this.handleMessage(message.data)
      if (message.kind === 'error') {
        debugAppServerRpc('relay:error', { url: this.url, connectionId, error: message.error }, { trace: false })
        this.failPending(new Error(message.error || `app-server relay failed: ${this.url}`))
      }
      if (message.kind === 'close') {
        debugAppServerRpc('relay:closed', { url: this.url, connectionId }, { trace: false })
        this.initialized = false
        this.initializePromise = undefined
        this.transport = undefined
        this.failPending(new Error(`app-server relay closed: ${this.url}`))
      }
    })
    return {
      send: (payload) => send?.({ connectionId, payload }),
      close: async () => {
        unsubscribe?.()
        debugAppServerRpc('relay:close-request', { url: this.url, connectionId }, { trace: false })
        await close?.({ connectionId })
      },
    }
  }

  private async createBrowserWebSocketTransport(): Promise<AppServerTransport> {
    if (typeof WebSocket === 'undefined') throw new Error('WebSocket is not available in this frontend runtime')
    const socket = new WebSocket(this.url)
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => resolve(), { once: true })
      socket.addEventListener('error', () => reject(new Error(`Failed to connect app-server at ${this.url}`)), { once: true })
    })
    socket.addEventListener('message', (event) => this.handleMessage(event.data))
    socket.addEventListener('close', () => {
      this.initialized = false
      this.initializePromise = undefined
      this.transport = undefined
      this.failPending(new Error(`app-server disconnected: ${this.url}`))
    })
    return {
      send: (payload) => socket.send(payload),
      close: () => socket.close(),
    }
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

class AppServerRpcError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly data?: unknown,
  ) {
    super(message)
    this.name = 'AppServerRpcError'
  }
}

function isAlreadyInitializedError(error: unknown): boolean {
  return error instanceof AppServerRpcError
    && error.code === -32600
    && error.message === 'Already initialized'
}

function configuredAppServerURL(provider?: ProviderConfig): string | undefined {
  if (typeof window === 'undefined') return undefined
  const searchParams = new URLSearchParams(window.location.search)
  const queryValue = searchParams.get('appServerWsUrl')?.trim()
  if (queryValue) {
    window.localStorage.setItem(appServerURLStorageKey(provider), queryValue)
    return queryValue
  }
  const scopedValue = window.localStorage.getItem(appServerURLStorageKey(provider))?.trim()
  if (scopedValue) return scopedValue
  if (!provider) return window.localStorage.getItem(APP_SERVER_WS_URL_STORAGE_KEY)?.trim() || undefined
  return undefined
}

function appServerURLStorageKey(provider?: ProviderConfig): string {
  if (!provider) return APP_SERVER_WS_URL_STORAGE_KEY
  const profile = usesAppServerProtocol(provider) ? resolveAppServerProfile(provider) : undefined
  return `${APP_SERVER_WS_URL_STORAGE_KEY_PREFIX}.${provider.kind}.${profile?.id ?? provider.id}`
}

function providerScopedEnvURL(
  env: Record<string, string | undefined> | undefined,
  provider: ProviderConfig | undefined,
): string | undefined {
  if (!env || !provider) return undefined
  for (const key of appServerScopedEnvURLKeys(provider)) {
    const value = env[key]?.trim()
    if (value) return value
  }
  return undefined
}

export function appServerScopedEnvURLKeys(provider: ProviderConfig): string[] {
  const profile = usesAppServerProtocol(provider) ? resolveAppServerProfile(provider) : undefined
  const tokens = uniqueStrings([
    profile?.providerKey,
    profile?.id,
    provider.id,
    provider.kind,
  ].map(appServerEnvToken))
  return tokens.flatMap((token) => [
    `VITE_${token}_APP_SERVER_WS_URL`,
    `VITE_MOVSCRIPT_${token}_APP_SERVER_WS_URL`,
  ])
}

function appServerEnvToken(value: string | undefined): string | undefined {
  const token = value?.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return token || undefined
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    if (!value || seen.has(value)) continue
    seen.add(value)
    result.push(value)
  }
  return result
}

function unscopedEnvURL(
  env: Record<string, string | undefined> | undefined,
): string | undefined {
  return env?.VITE_APP_SERVER_WS_URL?.trim()
    || env?.VITE_MOVSCRIPT_APP_SERVER_WS_URL?.trim()
    || undefined
}

function compactRecord<T extends Record<string, unknown>>(input: T): T {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) output[key] = value
  }
  return output as T
}

function compactProtocolParams(params: unknown): unknown {
  if (params === undefined) return undefined
  if (!isRecord(params) || Array.isArray(params)) return params
  return compactRecord(params)
}

function fallbackServerRequestResult(method: string): unknown {
  if (method === 'item/permissions/requestApproval') return { permissions: {}, scope: 'turn', strictAutoReview: true }
  if (method === 'item/tool/requestUserInput') return { answers: {} }
  if (method === 'item/tool/call') return { contentItems: [], success: false }
  if (method === 'mcpServer/elicitation/request') return { action: 'decline', content: null, _meta: null }
  if (method === 'item/commandExecution/requestApproval' || method === 'item/fileChange/requestApproval') return { decision: 'decline' }
  if (method === 'applyPatchApproval' || method === 'execCommandApproval') return { decision: 'denied' }
  if (method === 'account/chatgptAuthTokens/refresh' || method === 'attestation/generate') {
    return { action: 'decline', reason: 'No Agent Chat request handler is available.' }
  }
  return null
}

function shouldDebugAppServerRpcMethod(method: string): boolean {
  return appServerRpcDebugEnabled() || APP_SERVER_RPC_DEBUG_METHODS.has(method)
}

function shouldDebugAppServerRpcNotification(method: string): boolean {
  return appServerRpcDebugEnabled() || APP_SERVER_RPC_DEBUG_NOTIFICATIONS.has(method)
}

function appServerRpcDebugEnabled(): boolean {
  try {
    return typeof window !== 'undefined'
      && window.localStorage?.getItem(APP_SERVER_RPC_DEBUG_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function debugAppServerRpc(label: string, payload: Record<string, unknown>, options: { trace?: boolean } = {}): void {
  const method = typeof payload.method === 'string' ? payload.method : undefined
  const shouldLog = appServerRpcDebugEnabled()
    || (label === 'request' && method ? APP_SERVER_RPC_DEBUG_METHODS.has(method) : false)
    || (label === 'notification' && method ? APP_SERVER_RPC_DEBUG_NOTIFICATIONS.has(method) : false)
    || label.startsWith('relay:')
  if (!shouldLog) return
  const logger = options.trace && typeof console.trace === 'function' ? console.trace : console.debug
  logger(`[app-server rpc ${label}]`, payload)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function isJsonRpcId(value: unknown): value is AppServerJsonRpcId {
  return typeof value === 'number' || typeof value === 'string'
}
