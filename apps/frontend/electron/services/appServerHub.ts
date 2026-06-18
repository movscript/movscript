import type { WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { appServerManager } from './appServerManager'
import type {
  ElectronAppServerHubConnectInput,
  ElectronAppServerHubConnection,
  ElectronAppServerHubMessage,
  ElectronAppServerHubNotifyInput,
  ElectronAppServerHubRequestInput,
  ElectronAppServerHubSnapshot,
} from '../../src/shared/contracts/electronApi'

type AppServerHubSocket = {
  send: (payload: string) => void
  close: () => void
  onMessage: (handler: (data: string) => void) => void
  onError: (handler: (error: Error) => void) => void
  onClose: (handler: () => void) => void
}

type AppServerHubRendererConnection = {
  id: string
  sender: WebContents
  messageChannel: string
  upstreamKey: string
}

type PendingClientRequest = {
  connectionId?: string
  clientId?: JsonRpcId
  method: string
  cacheKey?: string
  initializeWaiters?: Array<{ connectionId: string; clientId: JsonRpcId }>
  resolve?: (value: unknown) => void
  reject?: (error: Error) => void
}

type PendingServerRequest = {
  id: JsonRpcId
  method: string
  params?: unknown
  receivedAt: number
  resolved: boolean
}

type CachedResponse = {
  response: JsonRpcResponse
  updatedAt: number
}

type AppServerHubUpstream = {
  key: string
  url: string
  socket: AppServerHubSocket
  subscribers: Set<string>
  nextUpstreamRequestId: number
  pendingClientRequests: Map<JsonRpcId, PendingClientRequest>
  pendingServerRequests: Map<JsonRpcId, PendingServerRequest>
  caches: Map<string, CachedResponse>
  initializedResult?: unknown
  initializePendingId?: JsonRpcId
  initializedNotificationSent: boolean
  closed: boolean
}

type JsonRpcId = string | number

type JsonRpcRequest = {
  id?: JsonRpcId
  method?: string
  params?: unknown
  result?: unknown
  error?: {
    code?: number
    message?: string
    data?: unknown
  }
}

type JsonRpcResponse = {
  id: JsonRpcId
  result?: unknown
  error?: {
    code?: number
    message?: string
    data?: unknown
  }
}

type AppServerHubDependencies = {
  openSocket: (url: string) => Promise<AppServerHubSocket>
  now: () => number
}

const READ_CACHE_METHODS = new Set([
  'thread/list',
  'thread/read',
  'thread/turns/list',
  'thread/loaded/list',
  'model/list',
  'plugin/list',
  'skills/list',
  'mcpServerStatus/list',
])

const CACHE_TTL_MS = 30_000

export class AppServerHub {
  private readonly upstreams = new Map<string, AppServerHubUpstream>()
  private readonly rendererConnections = new Map<string, AppServerHubRendererConnection>()

  constructor(private readonly dependencies: AppServerHubDependencies = {
    openSocket: openAppServerHubSocket,
    now: () => Date.now(),
  }) {}

  async connect(input: ElectronAppServerHubConnectInput, sender: WebContents, messageChannel: string): Promise<ElectronAppServerHubConnection> {
    const url = validateAppServerHubURL(input.url)
    const upstreamKey = appServerHubUpstreamKey(input.profileId, url)
    const upstream = await this.getOrCreateUpstream(upstreamKey, url)
    const connectionId = randomUUID()
    const connection: AppServerHubRendererConnection = {
      id: connectionId,
      sender,
      messageChannel,
      upstreamKey,
    }
    this.rendererConnections.set(connectionId, connection)
    upstream.subscribers.add(connectionId)
    sender.once('destroyed', () => this.close(connectionId))
    console.info('[app-server hub] renderer connected', {
      connectionId,
      upstreamKey,
      url,
      subscribers: upstream.subscribers.size,
    })
    return { connectionId, upstreamKey, url }
  }

  send(connectionId: string | undefined, payload: string | undefined): void {
    const connection = this.requireConnection(connectionId)
    if (typeof payload !== 'string') throw new Error('app-server hub send requires a string payload')
    const upstream = this.requireUpstream(connection.upstreamKey)
    const message = parseJsonRpcPayload(payload)
    if (!message) return
    if (isJsonRpcId(message.id) && typeof message.method === 'string') {
      this.sendClientRequest(upstream, connection, message)
      return
    }
    if (isJsonRpcId(message.id) && (hasOwn(message, 'result') || hasOwn(message, 'error'))) {
      this.sendServerRequestResponse(upstream, message as JsonRpcResponse)
      return
    }
    if (typeof message.method === 'string') {
      if (message.method === 'initialized') {
        if (upstream.initializedNotificationSent) return
        upstream.initializedNotificationSent = true
      }
      upstream.socket.send(JSON.stringify(compactJsonRpcRecord(message)))
    }
  }

  async request<T = unknown>(input: ElectronAppServerHubRequestInput): Promise<T> {
    const upstream = await this.upstreamForInput(input)
    if (input.method !== 'initialize') await this.ensureInitialized(upstream)
    return this.requestUpstream<T>(upstream, input.method, input.params)
  }

  async notify(input: ElectronAppServerHubNotifyInput): Promise<void> {
    const upstream = await this.upstreamForInput(input)
    if (input.method !== 'initialized') await this.ensureInitialized(upstream)
    if (input.method === 'initialized') {
      if (upstream.initializedNotificationSent) return
      upstream.initializedNotificationSent = true
    }
    upstream.socket.send(JSON.stringify(compactJsonRpcRecord({
      method: input.method,
      params: input.params,
    })))
  }

  close(connectionId: string | undefined): void {
    const normalized = connectionId?.trim()
    if (!normalized) return
    const connection = this.rendererConnections.get(normalized)
    if (!connection) return
    this.rendererConnections.delete(normalized)
    const upstream = this.upstreams.get(connection.upstreamKey)
    if (upstream) {
      upstream.subscribers.delete(normalized)
      console.info('[app-server hub] renderer closed', {
        connectionId: normalized,
        upstreamKey: upstream.key,
        subscribers: upstream.subscribers.size,
      })
    }
  }

  snapshot(connectionId: string | undefined): ElectronAppServerHubSnapshot {
    const connection = this.requireConnection(connectionId)
    const upstream = this.requireUpstream(connection.upstreamKey)
    return {
      connectionId: connection.id,
      upstreamKey: upstream.key,
      url: upstream.url,
      subscriberCount: upstream.subscribers.size,
      cacheKeys: Array.from(upstream.caches.keys()),
      cacheEntries: Array.from(upstream.caches.entries()).map(([key, entry]) => ({
        key,
        method: cacheMethodFromKey(key),
        updatedAt: entry.updatedAt,
      })),
      pendingServerRequests: Array.from(upstream.pendingServerRequests.values()).map((request) => ({
        id: request.id,
        method: request.method,
        ...(request.params !== undefined ? { params: request.params } : {}),
        receivedAt: request.receivedAt,
      })),
      pendingClientRequestCount: upstream.pendingClientRequests.size,
      pendingServerRequestCount: upstream.pendingServerRequests.size,
      initialized: upstream.initializedResult !== undefined,
      initializedNotificationSent: upstream.initializedNotificationSent,
    }
  }

  private async getOrCreateUpstream(key: string, url: string): Promise<AppServerHubUpstream> {
    const existing = this.upstreams.get(key)
    if (existing && !existing.closed) return existing
    const socket = await this.dependencies.openSocket(url)
    const upstream: AppServerHubUpstream = {
      key,
      url,
      socket,
      subscribers: new Set(),
      nextUpstreamRequestId: 1,
      pendingClientRequests: new Map(),
      pendingServerRequests: new Map(),
      caches: new Map(),
      initializedNotificationSent: false,
      closed: false,
    }
    this.upstreams.set(key, upstream)
    socket.onMessage((data) => this.handleUpstreamMessage(upstream, data))
    socket.onError((error) => this.handleUpstreamError(upstream, error))
    socket.onClose(() => this.handleUpstreamClose(upstream))
    console.info('[app-server hub] upstream connected', { upstreamKey: key, url })
    return upstream
  }

  private async upstreamForInput(input: { url: string; profileId?: string }): Promise<AppServerHubUpstream> {
    const url = validateAppServerHubURL(input.url)
    return this.getOrCreateUpstream(appServerHubUpstreamKey(input.profileId, url), url)
  }

  private async ensureInitialized(upstream: AppServerHubUpstream): Promise<void> {
    if (upstream.initializedResult !== undefined) return
    await this.requestUpstream(upstream, 'initialize', {
      clientInfo: {
        name: 'MovScript Desktop',
        version: '0.1.0',
      },
      capabilities: {
        experimentalApi: true,
        requestAttestation: false,
      },
    }).catch((error) => {
      if (!isAlreadyInitializedErrorShape(error)) throw error
      upstream.initializedResult = {}
    })
    if (!upstream.initializedNotificationSent) {
      upstream.initializedNotificationSent = true
      upstream.socket.send(JSON.stringify({ method: 'initialized' }))
    }
  }

  private requestUpstream<T = unknown>(upstream: AppServerHubUpstream, method: string, params?: unknown): Promise<T> {
    const cacheKey = readCacheKey(method, params)
    if (cacheKey) {
      const cached = upstream.caches.get(cacheKey)
      if (cached && this.dependencies.now() - cached.updatedAt <= CACHE_TTL_MS) {
        if (cached.response.error) throw appServerHubRpcError(cached.response.error)
        return Promise.resolve(cached.response.result as T)
      }
    }
    const upstreamId = upstream.nextUpstreamRequestId++
    const rawPayload = compactJsonRpcRecord({
      id: upstreamId,
      method,
      params,
    })
    const promise = new Promise<T>((resolve, reject) => {
      upstream.pendingClientRequests.set(upstreamId, {
        method,
        ...(cacheKey ? { cacheKey } : {}),
        resolve: (value) => resolve(value as T),
        reject,
      })
    })
    upstream.socket.send(JSON.stringify(rawPayload))
    return promise
  }

  private sendClientRequest(upstream: AppServerHubUpstream, connection: AppServerHubRendererConnection, message: JsonRpcRequest): void {
    const clientId = message.id
    if (!isJsonRpcId(clientId) || typeof message.method !== 'string') return
    if (message.method === 'initialize') {
      this.sendInitializeRequest(upstream, connection, message, clientId)
      return
    }
    const cacheKey = readCacheKey(message.method, message.params)
    if (cacheKey) {
      const cached = upstream.caches.get(cacheKey)
      if (cached && this.dependencies.now() - cached.updatedAt <= CACHE_TTL_MS) {
        this.sendToRenderer(connection, {
          connectionId: connection.id,
          kind: 'message',
          data: JSON.stringify({ ...cached.response, id: clientId }),
        })
        return
      }
    }
    const upstreamId = upstream.nextUpstreamRequestId++
    upstream.pendingClientRequests.set(upstreamId, {
      connectionId: connection.id,
      clientId,
      method: message.method,
      ...(cacheKey ? { cacheKey } : {}),
    })
    upstream.socket.send(JSON.stringify(compactJsonRpcRecord({
      ...message,
      id: upstreamId,
    })))
  }

  private sendInitializeRequest(
    upstream: AppServerHubUpstream,
    connection: AppServerHubRendererConnection,
    message: JsonRpcRequest,
    clientId: JsonRpcId,
  ): void {
    if (upstream.initializedResult !== undefined) {
      this.sendToRenderer(connection, {
        connectionId: connection.id,
        kind: 'message',
        data: JSON.stringify({ id: clientId, result: upstream.initializedResult }),
      })
      return
    }
    if (upstream.initializePendingId !== undefined) {
      const pending = upstream.pendingClientRequests.get(upstream.initializePendingId)
      pending?.initializeWaiters?.push({ connectionId: connection.id, clientId })
      return
    }
    const upstreamId = upstream.nextUpstreamRequestId++
    upstream.initializePendingId = upstreamId
    upstream.pendingClientRequests.set(upstreamId, {
      connectionId: connection.id,
      clientId,
      method: 'initialize',
      initializeWaiters: [],
    })
    upstream.socket.send(JSON.stringify(compactJsonRpcRecord({
      ...message,
      id: upstreamId,
    })))
  }

  private sendServerRequestResponse(upstream: AppServerHubUpstream, response: JsonRpcResponse): void {
    const pendingServerRequest = upstream.pendingServerRequests.get(response.id)
    if (!pendingServerRequest || pendingServerRequest.resolved) return
    pendingServerRequest.resolved = true
    upstream.pendingServerRequests.delete(response.id)
    upstream.socket.send(JSON.stringify(response))
  }

  private handleUpstreamMessage(upstream: AppServerHubUpstream, data: string): void {
    const message = parseJsonRpcPayload(data)
    if (!message) return
    if (isJsonRpcId(message.id) && (hasOwn(message, 'result') || hasOwn(message, 'error')) && !message.method) {
      this.handleUpstreamResponse(upstream, message as JsonRpcResponse)
      return
    }
    if (isJsonRpcId(message.id) && typeof message.method === 'string') {
      upstream.pendingServerRequests.set(message.id, {
        id: message.id,
        method: message.method,
        params: message.params,
        receivedAt: this.dependencies.now(),
        resolved: false,
      })
      this.broadcastToSubscribers(upstream, {
        kind: 'message',
        data: JSON.stringify(message),
      })
      return
    }
    if (typeof message.method === 'string') {
      this.invalidateCachesForNotification(upstream, message.method)
      this.broadcastToSubscribers(upstream, {
        kind: 'message',
        data: JSON.stringify(message),
      })
    }
  }

  private handleUpstreamResponse(upstream: AppServerHubUpstream, response: JsonRpcResponse): void {
    const pending = upstream.pendingClientRequests.get(response.id)
    if (!pending) return
    upstream.pendingClientRequests.delete(response.id)
    if (upstream.initializePendingId === response.id) upstream.initializePendingId = undefined
    const rendererResponse = pending.clientId !== undefined ? { ...response, id: pending.clientId } : response
    if (!response.error && pending.method === 'initialize') upstream.initializedResult = response.result ?? {}
    if (!response.error && pending.cacheKey) {
      upstream.caches.set(pending.cacheKey, {
        response,
        updatedAt: this.dependencies.now(),
      })
    } else if (!response.error && shouldInvalidateCachesForRequest(pending.method)) {
      this.invalidateCaches(upstream, {
        reason: 'request',
        method: pending.method,
      })
    }
    if (pending.resolve || pending.reject) {
      if (response.error) pending.reject?.(appServerHubRpcError(response.error))
      else pending.resolve?.(response.result)
    }
    if (pending.connectionId) {
      this.sendPayloadToConnection(pending.connectionId, rendererResponse)
      for (const waiter of pending.initializeWaiters ?? []) {
        this.sendPayloadToConnection(waiter.connectionId, { ...rendererResponse, id: waiter.clientId })
      }
    }
  }

  private handleUpstreamError(upstream: AppServerHubUpstream, error: Error): void {
    this.rejectPending(upstream, error)
    this.broadcastToSubscribers(upstream, {
      kind: 'error',
      error: error.message || `app-server hub upstream failed: ${upstream.url}`,
    })
  }

  private handleUpstreamClose(upstream: AppServerHubUpstream): void {
    if (upstream.closed) return
    upstream.closed = true
    this.rejectPending(upstream, new Error(`app-server hub upstream closed: ${upstream.url}`))
    this.upstreams.delete(upstream.key)
    this.broadcastToSubscribers(upstream, {
      kind: 'close',
    })
  }

  private rejectPending(upstream: AppServerHubUpstream, error: Error): void {
    for (const pending of upstream.pendingClientRequests.values()) {
      pending.reject?.(error)
      if (pending.connectionId && pending.clientId !== undefined) {
        this.sendPayloadToConnection(pending.connectionId, {
          id: pending.clientId,
          error: { code: -32000, message: error.message },
        })
      }
      for (const waiter of pending.initializeWaiters ?? []) {
        this.sendPayloadToConnection(waiter.connectionId, {
          id: waiter.clientId,
          error: { code: -32000, message: error.message },
        })
      }
    }
    upstream.pendingClientRequests.clear()
    upstream.pendingServerRequests.clear()
  }

  private invalidateCachesForNotification(upstream: AppServerHubUpstream, method: string): void {
    if (method.startsWith('thread/')
      || method.startsWith('turn/')
      || method === 'fs/changed'
      || method === 'mcpServerStatus/updated'
      || method === 'plugin/updated'
      || method === 'skills/updated') {
      this.invalidateCaches(upstream, {
        reason: 'notification',
        method,
      })
    }
  }

  private invalidateCaches(upstream: AppServerHubUpstream, params: { reason: 'request' | 'notification'; method: string }): void {
    if (upstream.caches.size === 0) return
    upstream.caches.clear()
    this.broadcastToSubscribers(upstream, {
      kind: 'message',
      data: JSON.stringify({
        method: 'appServerHub/cacheInvalidated',
        params,
      }),
    })
  }

  private broadcastToSubscribers(upstream: AppServerHubUpstream, message: Omit<ElectronAppServerHubMessage, 'connectionId'>): void {
    for (const connectionId of Array.from(upstream.subscribers)) {
      const connection = this.rendererConnections.get(connectionId)
      if (!connection) {
        upstream.subscribers.delete(connectionId)
        continue
      }
      this.sendToRenderer(connection, {
        connectionId,
        ...message,
      })
    }
  }

  private sendPayloadToConnection(connectionId: string, payload: JsonRpcResponse): void {
    const connection = this.rendererConnections.get(connectionId)
    if (!connection) return
    this.sendToRenderer(connection, {
      connectionId,
      kind: 'message',
      data: JSON.stringify(payload),
    })
  }

  private sendToRenderer(connection: AppServerHubRendererConnection, message: ElectronAppServerHubMessage): void {
    if (connection.sender.isDestroyed()) return
    connection.sender.send(connection.messageChannel, message)
  }

  private requireConnection(connectionId: string | undefined): AppServerHubRendererConnection {
    const normalized = connectionId?.trim()
    if (!normalized) throw new Error('app-server hub connectionId is required')
    const connection = this.rendererConnections.get(normalized)
    if (!connection) throw new Error(`app-server hub connection not found: ${normalized}`)
    return connection
  }

  private requireUpstream(upstreamKey: string): AppServerHubUpstream {
    const upstream = this.upstreams.get(upstreamKey)
    if (!upstream || upstream.closed) throw new Error(`app-server hub upstream is not connected: ${upstreamKey}`)
    return upstream
  }
}

export const appServerHub = new AppServerHub()

function validateAppServerHubURL(value: string | undefined): string {
  const trimmed = value?.trim()
  if (!trimmed) throw new Error('app-server hub URL is required')
  const parsed = new URL(trimmed)
  if (parsed.protocol !== 'managed:' && parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    throw new Error(`app-server hub URL must use managed://, ws://, or wss://: ${trimmed}`)
  }
  return parsed.toString()
}

function appServerHubUpstreamKey(profileId: string | undefined, url: string): string {
  const normalizedProfileId = profileId?.trim()
  if (normalizedProfileId) return `profile:${normalizedProfileId}`
  const parsed = new URL(url)
  if (parsed.protocol === 'managed:') return `profile:${parsed.pathname.replace(/^\/+/, '')}`
  return `url:${url}`
}

async function openAppServerHubSocket(url: string): Promise<AppServerHubSocket> {
  const parsed = new URL(url)
  if (parsed.protocol === 'managed:') return appServerManager.openManagedRelaySocket(url)
  const WebSocketCtor = globalThis.WebSocket
  if (!WebSocketCtor) throw new Error('Electron main process does not provide WebSocket for app-server hub')
  return openNativeWebSocket(WebSocketCtor, url)
}

function openNativeWebSocket(WebSocketCtor: typeof WebSocket, url: string): Promise<AppServerHubSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocketCtor(url)
    const messageHandlers = new Set<(data: string) => void>()
    const errorHandlers = new Set<(error: Error) => void>()
    const closeHandlers = new Set<() => void>()
    socket.addEventListener('open', () => {
      resolve({
        send: (payload) => socket.send(payload),
        close: () => socket.close(),
        onMessage: (handler) => { messageHandlers.add(handler) },
        onError: (handler) => { errorHandlers.add(handler) },
        onClose: (handler) => { closeHandlers.add(handler) },
      })
    }, { once: true })
    socket.addEventListener('message', (message) => {
      for (const handler of messageHandlers) handler(stringifyWebSocketData(message.data))
    })
    socket.addEventListener('error', () => {
      const error = new Error(`Failed to connect app-server hub upstream: ${url}`)
      for (const handler of errorHandlers) handler(error)
      reject(error)
    }, { once: true })
    socket.addEventListener('close', () => {
      for (const handler of closeHandlers) handler()
    })
  })
}

function stringifyWebSocketData(data: unknown): string {
  if (typeof data === 'string') return data
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data)
  if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data)
  return String(data)
}

function parseJsonRpcPayload(payload: string): JsonRpcRequest | undefined {
  try {
    const parsed = JSON.parse(payload) as unknown
    return isRecord(parsed) ? parsed as JsonRpcRequest : undefined
  } catch {
    return undefined
  }
}

function compactJsonRpcRecord(input: JsonRpcRequest): JsonRpcRequest {
  const output: JsonRpcRequest = {}
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) (output as Record<string, unknown>)[key] = value
  }
  return output
}

function readCacheKey(method: string, params: unknown): string | undefined {
  if (!READ_CACHE_METHODS.has(method)) return undefined
  return `${method}:${stableJson(params ?? null)}`
}

function cacheMethodFromKey(key: string): string {
  const separator = key.indexOf(':')
  return separator < 0 ? key : key.slice(0, separator)
}

function shouldInvalidateCachesForRequest(method: string): boolean {
  return method.startsWith('thread/')
    || method.startsWith('turn/')
    || method.startsWith('fs/')
    || method.startsWith('plugin/')
    || method.startsWith('skills/')
    || method.startsWith('mcpServer/')
}

function stableJson(value: unknown): string {
  if (!isRecord(value) || Array.isArray(value)) return JSON.stringify(value)
  const output: Record<string, unknown> = {}
  for (const key of Object.keys(value).sort()) output[key] = value[key]
  return JSON.stringify(output)
}

function isJsonRpcId(value: unknown): value is JsonRpcId {
  return typeof value === 'number' || typeof value === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function appServerHubRpcError(error: NonNullable<JsonRpcResponse['error']>): Error {
  const nextError = new Error(error.message || 'app-server hub request failed') as Error & { code?: number; data?: unknown }
  nextError.code = error.code
  nextError.data = error.data
  return nextError
}

function isAlreadyInitializedErrorShape(error: unknown): boolean {
  return isRecord(error)
    && error.code === -32600
    && error.message === 'Already initialized'
}
