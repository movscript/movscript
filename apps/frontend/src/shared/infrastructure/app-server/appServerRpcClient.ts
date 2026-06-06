import {
  appServerTextInput,
  type AppServerJsonRpcId,
  type AppServerJsonRpcNotification,
  type AppServerJsonRpcResponse,
  type AppServerJsonRpcServerRequest,
  type AppServerNotificationHandler,
  type AppServerServerRequestHandler,
  type AppServerThreadListResponse,
  type AppServerThreadReadResponse,
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

export type ElectronAppServerProfile = ElectronAppServerProfileContract
export type ElectronAppServerEnsureInput = ElectronAppServerEnsureInputContract
export type ElectronAppServerStatus = ElectronAppServerStatusContract
export type ElectronAppServerStatusInput = ElectronAppServerStatusInputContract
export type ElectronAppServerStopInput = ElectronAppServerStopInputContract

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

type DeferredServerRequest = {
  request: AppServerJsonRpcServerRequest
  timer: ReturnType<typeof globalThis.setTimeout>
}

type AppServerTransport = {
  send(payload: string): void | Promise<void>
  close(): void | Promise<void>
}

let configuredClient: AppServerRpcClient | undefined
const APP_SERVER_WS_URL_STORAGE_KEY = 'movscript.appServerWsUrl'
const APP_SERVER_WS_URL_STORAGE_KEY_PREFIX = 'movscript.appServerWsUrl'
const SERVER_REQUEST_HANDLER_GRACE_MS = 30_000

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

export function ensureAppServer(input: ElectronAppServerEnsureInput): Promise<ElectronAppServerStatus | undefined> {
  return window.api?.ensureAppServer?.(input) ?? Promise.resolve(undefined)
}

export function stopAppServer(input?: ElectronAppServerStopInput): Promise<ElectronAppServerStatus | undefined> {
  return window.api?.stopAppServer?.(input) ?? Promise.resolve(undefined)
}

export class AppServerRpcClient {
  private transport?: AppServerTransport
  private connectPromise?: Promise<void>
  private initialized = false
  private nextRequestId = 1
  private readonly pending = new Map<AppServerJsonRpcId, PendingRequest>()
  private readonly listeners = new Set<AppServerNotificationHandler>()
  private readonly serverRequestHandlers = new Set<AppServerServerRequestHandler>()
  private readonly deferredServerRequests = new Map<AppServerJsonRpcId, DeferredServerRequest>()

  constructor(
    readonly url: string,
    private readonly serverRequestHandlerGraceMs = SERVER_REQUEST_HANDLER_GRACE_MS,
  ) {}

  async initialize(): Promise<void> {
    await this.connect()
    if (this.initialized) return
    await this.request('initialize', {
      clientInfo: {
        name: 'movscript-frontend',
        title: 'MovScript Frontend',
        version: '0.1.0',
      },
      capabilities: {
        experimentalApi: true,
        requestAttestation: false,
      },
    })
    await this.notify('initialized')
    this.initialized = true
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
      sourceKinds: [],
    }))
  }

  async readThread(threadId: string, input: { includeTurns?: boolean } = {}) {
    await this.initialize()
    return this.request<AppServerThreadReadResponse>('thread/read', {
      threadId,
      includeTurns: input.includeTurns ?? true,
    })
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
    const unsubscribe = onMessage?.((message) => {
      if (message.connectionId !== connectionId) return
      if (message.kind === 'message') this.handleMessage(message.data)
      if (message.kind === 'error') this.failPending(new Error(message.error || `app-server relay failed: ${this.url}`))
      if (message.kind === 'close') {
        this.initialized = false
        this.transport = undefined
        this.failPending(new Error(`app-server relay closed: ${this.url}`))
      }
    })
    return {
      send: (payload) => send?.({ connectionId, payload }),
      close: async () => {
        unsubscribe?.()
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
    const payload = JSON.stringify(compactRecord({ id, method, params }))
    const promise = new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject })
    })
    await this.transport?.send(payload)
    return promise
  }

  private async notify(method: string, params?: unknown): Promise<void> {
    await this.connect()
    await this.transport?.send(JSON.stringify(compactRecord({ method, params })))
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
      const pending = this.pending.get(response.id)
      if (!pending) return
      this.pending.delete(response.id)
      if (response.error) pending.reject(new Error(response.error.message || `app-server request ${response.id} failed`))
      else pending.resolve(response.result)
      return
    }
    if (typeof message.method === 'string') {
      const notification = message as AppServerJsonRpcNotification
      if (isJsonRpcId(message.id)) {
        this.handleServerRequest(message as AppServerJsonRpcServerRequest)
        return
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
          void this.transport?.send(JSON.stringify({ id: request.id, result }))
          return
        }
      }
      this.resolveServerRequest(request.id, request.method)
    } catch (error) {
      void this.transport?.send(JSON.stringify({
        id: request.id,
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : String(error),
        },
      }))
    }
  }

  private deferServerRequest(request: AppServerJsonRpcServerRequest): void {
    const existing = this.deferredServerRequests.get(request.id)
    if (existing) globalThis.clearTimeout(existing.timer)
    const timer = globalThis.setTimeout(() => {
      this.deferredServerRequests.delete(request.id)
      void this.dispatchServerRequest(request)
    }, this.serverRequestHandlerGraceMs)
    this.deferredServerRequests.set(request.id, { request, timer })
  }

  private flushDeferredServerRequests(): void {
    if (this.serverRequestHandlers.size === 0 || this.deferredServerRequests.size === 0) return
    const deferred = Array.from(this.deferredServerRequests.values())
    this.deferredServerRequests.clear()
    for (const item of deferred) {
      globalThis.clearTimeout(item.timer)
      void this.dispatchServerRequest(item.request)
    }
  }

  private clearDeferredServerRequests(): void {
    for (const item of this.deferredServerRequests.values()) globalThis.clearTimeout(item.timer)
    this.deferredServerRequests.clear()
  }

  private resolveServerRequest(id: AppServerJsonRpcId, method: string): void {
    const result = fallbackServerRequestResult(method)
    void this.transport?.send(JSON.stringify({ id, result }))
  }

  private failPending(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
  }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function isJsonRpcId(value: unknown): value is AppServerJsonRpcId {
  return typeof value === 'number' || typeof value === 'string'
}
