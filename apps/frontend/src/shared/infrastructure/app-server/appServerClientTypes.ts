import type {
  AppServerJsonRpcNotification,
  AppServerJsonRpcServerRequest,
  AppServerNotificationHandler,
  AppServerServerRequestHandler,
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
import type { AgentChatThreadReadInput } from '@movscript/core/agent/chat'

export interface AppServerClient {
  readonly url: string
  initialize(): Promise<void>
  startThread(params?: AppServerThreadStartParams): Promise<AppServerThreadStartResponse>
  listThreads(input?: { limit?: number; cursor?: string | null }): Promise<AppServerThreadListResponse>
  readThread(threadId: string, input?: AgentChatThreadReadInput): Promise<AppServerThreadReadResponse>
  listThreadTurns(input: AppServerThreadTurnsListParams): Promise<AppServerThreadTurnsListResponse>
  resumeThread(params: AppServerThreadResumeParams): Promise<AppServerThreadResumeResponse>
  updateThreadSettings(params: AppServerThreadSettingsUpdateParams): Promise<AppServerThreadSettingsUpdateResponse>
  startTurn(params: AppServerTurnStartParams): Promise<AppServerTurnStartResponse>
  steerTurn(params: AppServerTurnSteerParams): Promise<AppServerTurnSteerResponse>
  interruptTurn(params: AppServerTurnInterruptParams): Promise<AppServerTurnInterruptResponse>
  startTextTurn(input: Omit<AppServerTurnStartParams, 'input'> & { text: string }): Promise<AppServerTurnStartResponse>
  requestProtocol<T = unknown>(method: string, params?: unknown): Promise<T>
  notifyProtocol(method: string, params?: unknown): Promise<void>
  onNotification(listener: AppServerNotificationHandler): () => void
  onServerRequest(handler: AppServerServerRequestHandler): () => void
  close?(): Promise<void>
}

export type {
  AppServerJsonRpcNotification,
  AppServerJsonRpcServerRequest,
  AppServerNotificationHandler,
  AppServerServerRequestHandler,
}
