import type {
  AgentChatNotification,
  AgentChatServerRequest,
  AgentChatServerRequestResponse,
} from '@movscript/core/agent/chat'
import type {
  SdkRuntimeRpcMethod,
  SdkRuntimeRpcRequestMap,
  SdkRuntimeRpcResponseMap,
} from '../infrastructure/sdk-runtime/sdkRuntimeProtocol'

export type ElectronSdkRuntimeRequestInput<M extends SdkRuntimeRpcMethod = SdkRuntimeRpcMethod> = {
  method: M
  params: SdkRuntimeRpcRequestMap[M]
}

export type ElectronSdkRuntimeNotifyInput<M extends SdkRuntimeRpcMethod = SdkRuntimeRpcMethod> = {
  method: M
  params: SdkRuntimeRpcRequestMap[M]
}

export type ElectronSdkRuntimeRequestResult<M extends SdkRuntimeRpcMethod = SdkRuntimeRpcMethod> = SdkRuntimeRpcResponseMap[M]

export interface ElectronSdkRuntimeNotificationEvent {
  runtimeId: string
  providerId?: string
  providerKind?: string
  threadId?: string
  notification: AgentChatNotification
}

export interface ElectronSdkRuntimeServerRequestEvent {
  runtimeId: string
  providerId?: string
  providerKind?: string
  threadId?: string
  request: AgentChatServerRequest
}

export interface ElectronSdkRuntimeServerRequestResponseInput {
  runtimeId: string
  requestId: string
  response?: AgentChatServerRequestResponse
}
