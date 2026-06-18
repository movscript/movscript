import type {
  AppServerJsonRpcNotification,
  AppServerJsonRpcServerRequest,
  AppServerNotificationHandler,
  AppServerServerRequestHandler,
} from '@/shared/infrastructure/app-server/appServerClientTypes'
import type {
  AppServerThreadListResponse,
  AppServerThreadReadResponse,
  AppServerThreadResumeParams,
  AppServerThreadResumeResponse,
  AppServerThreadSettingsUpdateParams,
  AppServerThreadSettingsUpdateResponse,
  AppServerThreadStartParams,
  AppServerThreadStartResponse,
  AppServerThreadTurnsListParams,
  AppServerThreadTurnsListResponse,
  AppServerTurnInterruptParams,
  AppServerTurnInterruptResponse,
  AppServerTurnStartParams,
  AppServerTurnStartResponse,
  AppServerTurnSteerParams,
  AppServerTurnSteerResponse,
} from '@/shared/infrastructure/app-server/appServerProtocol'
import {
  appServerTextTurnParams,
  appServerThreadListParams,
  appServerThreadReadParams,
} from '@/shared/infrastructure/app-server/appServerRpcRequestParams'
import {
  compactProtocolParams,
  compactRecord,
  fallbackServerRequestResult,
  hasOwn,
  isJsonRpcId,
  isRecord,
} from '@/shared/infrastructure/app-server/appServerRpcProtocolUtils'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import type { AgentChatThreadReadInput } from '@movscript/core/agent/chat'
import type { AppServerClient } from '@/shared/infrastructure/app-server/appServerClientTypes'

let configuredHubClient: AppServerHubClient | undefined

export function appServerHubClientForURL(url: string): AppServerHubClient | undefined {
  const electronApi = readElectronApi()
  if (!electronApi?.appServerHubRequest || !electronApi.appServerHubConnect || !electronApi.onAppServerHubMessage) return undefined
  if (!configuredHubClient || configuredHubClient.url !== url) configuredHubClient = new AppServerHubClient(url)
  return configuredHubClient
}

export class AppServerHubClient implements AppServerClient {
  private connectionId?: string
  private connectPromise?: Promise<void>
  private unsubscribeMessages?: () => void
  private readonly listeners = new Set<AppServerNotificationHandler>()
  private readonly serverRequestHandlers = new Set<AppServerServerRequestHandler>()

  constructor(readonly url: string) {}

  async initialize(): Promise<void> {
    await this.ensureSubscription()
  }

  async startThread(params: AppServerThreadStartParams = {}) {
    return this.requestProtocol<AppServerThreadStartResponse>('thread/start', compactRecord(params))
  }

  async listThreads(input: { limit?: number; cursor?: string | null } = {}) {
    return this.requestProtocol<AppServerThreadListResponse>('thread/list', appServerThreadListParams(input))
  }

  async readThread(threadId: string, input: AgentChatThreadReadInput = {}) {
    return this.requestProtocol<AppServerThreadReadResponse>('thread/read', appServerThreadReadParams(threadId, input))
  }

  async listThreadTurns(input: AppServerThreadTurnsListParams) {
    return this.requestProtocol<AppServerThreadTurnsListResponse>('thread/turns/list', compactRecord({
      threadId: input.threadId,
      cursor: input.cursor ?? undefined,
      limit: input.limit ?? undefined,
      sortDirection: input.sortDirection ?? undefined,
      itemsView: input.itemsView ?? undefined,
    }))
  }

  async resumeThread(params: AppServerThreadResumeParams) {
    return this.requestProtocol<AppServerThreadResumeResponse>('thread/resume', compactRecord(params))
  }

  async updateThreadSettings(params: AppServerThreadSettingsUpdateParams) {
    return this.requestProtocol<AppServerThreadSettingsUpdateResponse>('thread/settings/update', compactRecord(params))
  }

  async startTurn(params: AppServerTurnStartParams) {
    return this.requestProtocol<AppServerTurnStartResponse>('turn/start', compactRecord(params))
  }

  async steerTurn(params: AppServerTurnSteerParams) {
    return this.requestProtocol<AppServerTurnSteerResponse>('turn/steer', compactRecord(params))
  }

  async interruptTurn(params: AppServerTurnInterruptParams) {
    return this.requestProtocol<AppServerTurnInterruptResponse>('turn/interrupt', params)
  }

  async startTextTurn(input: Omit<AppServerTurnStartParams, 'input'> & { text: string }) {
    return this.startTurn(appServerTextTurnParams(input))
  }

  async requestProtocol<T = unknown>(method: string, params?: unknown): Promise<T> {
    await this.ensureSubscription()
    const request = readElectronApi()?.appServerHubRequest
    if (!request) throw new Error('Electron app-server hub request API is not available')
    return request<T>({
      url: this.url,
      profileId: appServerProfileIdFromURL(this.url),
      method,
      params: compactProtocolParams(params),
    })
  }

  async notifyProtocol(method: string, params?: unknown): Promise<void> {
    await this.ensureSubscription()
    const notify = readElectronApi()?.appServerHubNotify
    if (!notify) throw new Error('Electron app-server hub notify API is not available')
    await notify({
      url: this.url,
      profileId: appServerProfileIdFromURL(this.url),
      method,
      params: compactProtocolParams(params),
    })
  }

  onNotification(listener: AppServerNotificationHandler): () => void {
    this.listeners.add(listener)
    void this.ensureSubscription()
    return () => this.listeners.delete(listener)
  }

  onServerRequest(handler: AppServerServerRequestHandler): () => void {
    this.serverRequestHandlers.add(handler)
    void this.ensureSubscription()
    return () => this.serverRequestHandlers.delete(handler)
  }

  async close(): Promise<void> {
    const connectionId = this.connectionId
    this.connectionId = undefined
    this.connectPromise = undefined
    this.unsubscribeMessages?.()
    this.unsubscribeMessages = undefined
    if (connectionId) await readElectronApi()?.appServerHubClose?.({ connectionId })
  }

  private async ensureSubscription(): Promise<void> {
    if (this.connectionId) return
    if (this.connectPromise) return this.connectPromise
    this.connectPromise = this.connectSubscription()
      .finally(() => {
        this.connectPromise = undefined
      })
    return this.connectPromise
  }

  private async connectSubscription(): Promise<void> {
    const electronApi = readElectronApi()
    if (!electronApi?.appServerHubConnect || !electronApi.onAppServerHubMessage) {
      throw new Error('Electron app-server hub subscription API is not available')
    }
    const { connectionId } = await electronApi.appServerHubConnect({
      url: this.url,
      profileId: appServerProfileIdFromURL(this.url),
    })
    this.connectionId = connectionId
    this.unsubscribeMessages = electronApi.onAppServerHubMessage((message) => {
      if (message.connectionId !== connectionId) return
      if (message.kind === 'close') {
        this.connectionId = undefined
        return
      }
      if (message.kind !== 'message' || typeof message.data !== 'string') return
      this.handleMessage(message.data)
    })
  }

  private handleMessage(data: string): void {
    let message: unknown
    try {
      message = JSON.parse(data)
    } catch {
      return
    }
    if (!isRecord(message) || typeof message.method !== 'string') return
    if (isJsonRpcId(message.id)) {
      void this.handleServerRequest(message as AppServerJsonRpcServerRequest)
      return
    }
    const notification = message as AppServerJsonRpcNotification
    for (const listener of Array.from(this.listeners)) listener(notification)
  }

  private async handleServerRequest(request: AppServerJsonRpcServerRequest): Promise<void> {
    if (!this.connectionId) return
    try {
      for (const handler of Array.from(this.serverRequestHandlers)) {
        const result = await handler(request)
        if (result !== undefined) {
          await this.sendServerRequestResponse(request.id, { result })
          return
        }
      }
      await this.sendServerRequestResponse(request.id, { result: fallbackServerRequestResult(request.method) })
    } catch (error) {
      await this.sendServerRequestResponse(request.id, {
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : String(error),
        },
      })
    }
  }

  private async sendServerRequestResponse(id: string | number, response: { result?: unknown; error?: { code?: number; message?: string; data?: unknown } }): Promise<void> {
    if (!this.connectionId) return
    await readElectronApi()?.appServerHubSend?.({
      connectionId: this.connectionId,
      payload: JSON.stringify(compactRecord({
        id,
        ...(hasOwn(response, 'result') ? { result: response.result } : {}),
        ...(response.error ? { error: response.error } : {}),
      })),
    })
  }
}

function appServerProfileIdFromURL(url: string): string | undefined {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'managed:') return undefined
    return parsed.pathname.replace(/^\/+/, '') || undefined
  } catch {
    return undefined
  }
}
