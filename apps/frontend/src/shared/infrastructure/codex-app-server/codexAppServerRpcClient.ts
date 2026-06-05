import {
  codexTextInput,
  type CodexJsonRpcId,
  type CodexJsonRpcNotification,
  type CodexJsonRpcResponse,
  type CodexJsonRpcServerRequest,
  type CodexNotificationHandler,
  type CodexServerRequestHandler,
  type CodexThreadListResponse,
  type CodexThreadReadResponse,
  type CodexThreadStartParams,
  type CodexThreadStartResponse,
  type CodexTurnInterruptParams,
  type CodexTurnInterruptResponse,
  type CodexTurnStartParams,
  type CodexTurnStartResponse,
  type CodexTurnSteerParams,
  type CodexTurnSteerResponse,
} from '@/shared/infrastructure/codex-app-server/codexAppServerProtocol'
import {
  resolveCodexAgentProvider,
  resolveCodexAppServerProfile,
  useAgentProviderConfigStore,
  type AgentProviderConfig,
} from '@/features/agent/state/agentProviderConfigStore'

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

type DeferredServerRequest = {
  request: CodexJsonRpcServerRequest
  timer: ReturnType<typeof globalThis.setTimeout>
}

type CodexAppServerTransport = {
  send(payload: string): void | Promise<void>
  close(): void | Promise<void>
}

let configuredClient: CodexAppServerRpcClient | undefined
const CODEX_APP_SERVER_WS_URL_STORAGE_KEY = 'movscript.codexAppServerWsUrl'
const SERVER_REQUEST_HANDLER_GRACE_MS = 30_000

export function codexAppServerURL(): string | undefined {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
  const value = env?.VITE_CODEX_APP_SERVER_WS_URL?.trim()
    || env?.VITE_MOVSCRIPT_CODEX_APP_SERVER_WS_URL?.trim()
    || runtimeConfiguredCodexURL()
  return value || undefined
}

export function isCodexAppServerEnabled(): boolean {
  return Boolean(codexAppServerURL())
}

export function codexAppServerRpcClient(): CodexAppServerRpcClient | undefined {
  const url = codexAppServerURL()
  if (!url) return undefined
  return codexAppServerRpcClientForURL(url)
}

export function codexAppServerRpcClientForURL(url: string): CodexAppServerRpcClient {
  if (!configuredClient || configuredClient.url !== url) configuredClient = new CodexAppServerRpcClient(url)
  return configuredClient
}

export async function ensureCodexAppServerURL(provider?: AgentProviderConfig): Promise<string | undefined> {
  const explicitURL = codexAppServerURL()
  const resolvedProvider = provider ?? resolveCodexAgentProvider(useAgentProviderConfigStore.getState().settings)
  const electronApi = typeof window === 'undefined' ? undefined : window.api
  if (electronApi?.ensureCodexAppServer && resolvedProvider?.kind === 'codex') {
    const profile = resolveCodexAppServerProfile(resolvedProvider)
    const status = await electronApi.ensureCodexAppServer({
      profile,
    })
    if (!status.ok || !status.endpoint) throw new Error(status.error || `Codex app-server failed to start: ${profile.id}`)
    return status.endpoint
  }
  return explicitURL
}

export async function ensureCodexAppServerRpcClient(provider?: AgentProviderConfig): Promise<CodexAppServerRpcClient | undefined> {
  const url = await ensureCodexAppServerURL(provider)
  if (!url) return undefined
  return codexAppServerRpcClientForURL(url)
}

export class CodexAppServerRpcClient {
  private transport?: CodexAppServerTransport
  private connectPromise?: Promise<void>
  private initialized = false
  private nextRequestId = 1
  private readonly pending = new Map<CodexJsonRpcId, PendingRequest>()
  private readonly listeners = new Set<CodexNotificationHandler>()
  private readonly serverRequestHandlers = new Set<CodexServerRequestHandler>()
  private readonly deferredServerRequests = new Map<CodexJsonRpcId, DeferredServerRequest>()

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
        requestAttestation: true,
      },
    })
    await this.notify('initialized')
    this.initialized = true
  }

  async startThread(params: CodexThreadStartParams = {}) {
    await this.initialize()
    return this.request<CodexThreadStartResponse>('thread/start', compactRecord(params))
  }

  async listThreads(input: { limit?: number; cursor?: string | null } = {}) {
    await this.initialize()
    return this.request<CodexThreadListResponse>('thread/list', compactRecord({
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
    return this.request<CodexThreadReadResponse>('thread/read', {
      threadId,
      includeTurns: input.includeTurns ?? true,
    })
  }

  async startTurn(params: CodexTurnStartParams) {
    await this.initialize()
    return this.request<CodexTurnStartResponse>('turn/start', compactRecord(params))
  }

  async steerTurn(params: CodexTurnSteerParams) {
    await this.initialize()
    return this.request<CodexTurnSteerResponse>('turn/steer', compactRecord(params))
  }

  async interruptTurn(params: CodexTurnInterruptParams) {
    await this.initialize()
    return this.request<CodexTurnInterruptResponse>('turn/interrupt', params)
  }

  async startTextTurn(input: { threadId: string; text: string; clientUserMessageId?: string | null; model?: string | null }) {
    return this.startTurn({
      threadId: input.threadId,
      clientUserMessageId: input.clientUserMessageId ?? undefined,
      input: [codexTextInput(input.text)],
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

  onNotification(listener: CodexNotificationHandler): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  onServerRequest(handler: CodexServerRequestHandler): () => void {
    this.serverRequestHandlers.add(handler)
    this.flushDeferredServerRequests()
    return () => this.serverRequestHandlers.delete(handler)
  }

  async close(): Promise<void> {
    this.initialized = false
    this.connectPromise = undefined
    for (const pending of this.pending.values()) pending.reject(new Error(`Codex app-server disconnected: ${this.url}`))
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

  private async createTransport(): Promise<CodexAppServerTransport> {
    const electronApi = typeof window === 'undefined' ? undefined : window.api
    if (electronApi?.codexAppServerConnect && electronApi.codexAppServerSend && electronApi.onCodexAppServerMessage) {
      return this.createElectronRelayTransport(electronApi)
    }
    return this.createBrowserWebSocketTransport()
  }

  private async createElectronRelayTransport(electronApi: NonNullable<typeof window.api>): Promise<CodexAppServerTransport> {
    const { connectionId } = await electronApi.codexAppServerConnect?.({ url: this.url }) ?? {}
    if (!connectionId) throw new Error(`Failed to open Codex app-server relay: ${this.url}`)
    const unsubscribe = electronApi.onCodexAppServerMessage?.((message) => {
      if (message.connectionId !== connectionId) return
      if (message.kind === 'message') this.handleMessage(message.data)
      if (message.kind === 'error') this.failPending(new Error(message.error || `Codex app-server relay failed: ${this.url}`))
      if (message.kind === 'close') {
        this.initialized = false
        this.transport = undefined
        this.failPending(new Error(`Codex app-server relay closed: ${this.url}`))
      }
    })
    return {
      send: (payload) => electronApi.codexAppServerSend?.({ connectionId, payload }),
      close: async () => {
        unsubscribe?.()
        await electronApi.codexAppServerClose?.({ connectionId })
      },
    }
  }

  private async createBrowserWebSocketTransport(): Promise<CodexAppServerTransport> {
    if (typeof WebSocket === 'undefined') throw new Error('WebSocket is not available in this frontend runtime')
    const socket = new WebSocket(this.url)
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => resolve(), { once: true })
      socket.addEventListener('error', () => reject(new Error(`Failed to connect Codex app-server at ${this.url}`)), { once: true })
    })
    socket.addEventListener('message', (event) => this.handleMessage(event.data))
    socket.addEventListener('close', () => {
      this.initialized = false
      this.transport = undefined
      this.failPending(new Error(`Codex app-server disconnected: ${this.url}`))
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
      const response = message as CodexJsonRpcResponse
      const pending = this.pending.get(response.id)
      if (!pending) return
      this.pending.delete(response.id)
      if (response.error) pending.reject(new Error(response.error.message || `Codex request ${response.id} failed`))
      else pending.resolve(response.result)
      return
    }
    if (typeof message.method === 'string') {
      const notification = message as CodexJsonRpcNotification
      if (isJsonRpcId(message.id)) {
        this.handleServerRequest(message as CodexJsonRpcServerRequest)
        return
      }
      for (const listener of Array.from(this.listeners)) listener(notification)
    }
  }

  private async handleServerRequest(request: CodexJsonRpcServerRequest): Promise<void> {
    if (this.serverRequestHandlers.size === 0) {
      this.deferServerRequest(request)
      return
    }
    await this.dispatchServerRequest(request)
  }

  private async dispatchServerRequest(request: CodexJsonRpcServerRequest): Promise<void> {
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

  private deferServerRequest(request: CodexJsonRpcServerRequest): void {
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

  private resolveServerRequest(id: CodexJsonRpcId, method: string): void {
    const result = fallbackServerRequestResult(method)
    void this.transport?.send(JSON.stringify({ id, result }))
  }

  private failPending(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
  }
}

function runtimeConfiguredCodexURL(): string | undefined {
  if (typeof window === 'undefined') return undefined
  const queryValue = new URLSearchParams(window.location.search).get('codexAppServerWsUrl')?.trim()
  if (queryValue) {
    window.localStorage.setItem(CODEX_APP_SERVER_WS_URL_STORAGE_KEY, queryValue)
    return queryValue
  }
  return window.localStorage.getItem(CODEX_APP_SERVER_WS_URL_STORAGE_KEY)?.trim() || undefined
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

function isJsonRpcId(value: unknown): value is CodexJsonRpcId {
  return typeof value === 'number' || typeof value === 'string'
}
