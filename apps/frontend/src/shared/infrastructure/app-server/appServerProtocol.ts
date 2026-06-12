import type { Turn as AppServerTurn } from '@/shared/infrastructure/app-server/app-server-protocol/v2/Turn'
import type { TurnItemsView as AppServerTurnItemsView } from '@/shared/infrastructure/app-server/app-server-protocol/v2/TurnItemsView'

export type * from '@/shared/infrastructure/app-server/app-server-protocol'

export type { RequestId as AppServerJsonRpcId } from '@/shared/infrastructure/app-server/app-server-protocol/RequestId'
export type { ServerNotification as AppServerServerNotification } from '@/shared/infrastructure/app-server/app-server-protocol/ServerNotification'
export type { ServerRequest as AppServerServerRequest } from '@/shared/infrastructure/app-server/app-server-protocol/ServerRequest'
export type { AskForApproval } from '@/shared/infrastructure/app-server/app-server-protocol/v2/AskForApproval'
export type { ApprovalsReviewer } from '@/shared/infrastructure/app-server/app-server-protocol/v2/ApprovalsReviewer'
export type { SandboxMode } from '@/shared/infrastructure/app-server/app-server-protocol/v2/SandboxMode'
export type { SandboxPolicy } from '@/shared/infrastructure/app-server/app-server-protocol/v2/SandboxPolicy'
export type { Thread as AppServerThread } from '@/shared/infrastructure/app-server/app-server-protocol/v2/Thread'
export type { ThreadItem as AppServerThreadItem } from '@/shared/infrastructure/app-server/app-server-protocol/v2/ThreadItem'
export type { ThreadSourceKind as AppServerThreadSourceKind } from '@/shared/infrastructure/app-server/app-server-protocol/v2/ThreadSourceKind'
export type { ThreadListResponse as AppServerThreadListResponse } from '@/shared/infrastructure/app-server/app-server-protocol/v2/ThreadListResponse'
export type { ThreadReadResponse as AppServerThreadReadResponse } from '@/shared/infrastructure/app-server/app-server-protocol/v2/ThreadReadResponse'
export type { ThreadResumeParams as AppServerThreadResumeParams } from '@/shared/infrastructure/app-server/app-server-protocol/v2/ThreadResumeParams'
export type { ThreadResumeResponse as AppServerThreadResumeResponse } from '@/shared/infrastructure/app-server/app-server-protocol/v2/ThreadResumeResponse'
export type { ThreadStartParams as AppServerThreadStartParams } from '@/shared/infrastructure/app-server/app-server-protocol/v2/ThreadStartParams'
export type { ThreadStartResponse as AppServerThreadStartResponse } from '@/shared/infrastructure/app-server/app-server-protocol/v2/ThreadStartResponse'
export type { AppServerTurn, AppServerTurnItemsView }
export type { TurnInterruptParams as AppServerTurnInterruptParams } from '@/shared/infrastructure/app-server/app-server-protocol/v2/TurnInterruptParams'
export type { TurnInterruptResponse as AppServerTurnInterruptResponse } from '@/shared/infrastructure/app-server/app-server-protocol/v2/TurnInterruptResponse'
export type { TurnStartParams as AppServerTurnStartParams } from '@/shared/infrastructure/app-server/app-server-protocol/v2/TurnStartParams'
export type { TurnStartResponse as AppServerTurnStartResponse } from '@/shared/infrastructure/app-server/app-server-protocol/v2/TurnStartResponse'
export type { TurnSteerParams as AppServerTurnSteerParams } from '@/shared/infrastructure/app-server/app-server-protocol/v2/TurnSteerParams'
export type { TurnSteerResponse as AppServerTurnSteerResponse } from '@/shared/infrastructure/app-server/app-server-protocol/v2/TurnSteerResponse'
export type { UserInput as AppServerUserInput } from '@/shared/infrastructure/app-server/app-server-protocol/v2/UserInput'

export type AppServerJsonValue =
  | null
  | boolean
  | number
  | string
  | AppServerJsonValue[]
  | { [key: string]: AppServerJsonValue | undefined }

export type AppServerJsonRpcResponse<T = unknown> = {
  id: string | number
  result?: T
  error?: {
    code?: number
    message?: string
    data?: unknown
  }
}

export type AppServerJsonRpcNotification = {
  method: string
  params?: unknown
}

export type AppServerJsonRpcRequest = {
  id: string | number
  method: string
  params?: unknown
}

export type AppServerJsonRpcServerRequest = AppServerJsonRpcRequest
export type AppServerServerRequestHandler = (request: AppServerJsonRpcServerRequest) => Promise<unknown> | unknown
export type AppServerNotificationHandler = (notification: AppServerJsonRpcNotification) => void

export interface AppServerThreadTurnsListParams {
  threadId: string
  cursor?: string | null
  limit?: number | null
  sortDirection?: 'asc' | 'desc' | null
  itemsView?: AppServerTurnItemsView | null
}

export interface AppServerThreadTurnsListResponse {
  data: AppServerTurn[]
  nextCursor: string | null
  backwardsCursor: string | null
}

export interface AppServerThreadSettingsUpdateParams extends Record<string, unknown> {
  threadId: string
  cwd?: string | null
  approvalPolicy?: unknown
  approvalsReviewer?: unknown
  sandboxPolicy?: unknown
  permissions?: string | null
  model?: string | null
  modelProvider?: string | null
  serviceTier?: string | null
  effort?: unknown
  summary?: unknown
  collaborationMode?: AppServerJsonValue
  personality?: unknown
}

export interface AppServerThreadSettingsUpdateResponse {
  threadSettings?: unknown
}

export function appServerTextInput(text: string): import('@/shared/infrastructure/app-server/app-server-protocol/v2/UserInput').UserInput {
  return { type: 'text', text, text_elements: [] }
}
