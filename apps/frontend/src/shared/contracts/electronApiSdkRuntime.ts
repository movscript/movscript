import type {
  AgentChatNotification,
  AgentChatServerRequest,
  AgentChatServerRequestResponse,
} from '@movscript/core/agent/chat'
import type {
  AgentRuntimeRpcMethod,
  AgentRuntimeRpcRequestMap,
  AgentRuntimeRpcResponseMap,
} from '../infrastructure/agent-runtime/agentRuntimeProtocol'

export type ElectronAgentRuntimeRequestInput<M extends AgentRuntimeRpcMethod = AgentRuntimeRpcMethod> = {
  method: M
  params: AgentRuntimeRpcRequestMap[M]
}

export type ElectronAgentRuntimeNotifyInput<M extends AgentRuntimeRpcMethod = AgentRuntimeRpcMethod> = {
  method: M
  params: AgentRuntimeRpcRequestMap[M]
}

export type ElectronAgentRuntimeRequestResult<M extends AgentRuntimeRpcMethod = AgentRuntimeRpcMethod> = AgentRuntimeRpcResponseMap[M]

export interface ElectronAgentRuntimeNotificationEvent {
  runtimeId: string
  providerId?: string
  providerKind?: string
  threadId?: string
  notification: AgentChatNotification
}

export interface ElectronAgentRuntimeServerRequestEvent {
  runtimeId: string
  providerId?: string
  providerKind?: string
  threadId?: string
  request: AgentChatServerRequest
}

export interface ElectronAgentRuntimeServerRequestResponseInput {
  runtimeId: string
  requestId: string
  response?: AgentChatServerRequestResponse
}

export interface ElectronSdkRuntimePackageStatusInput {
  packageName: string
  packageVersion?: string
}

export interface ElectronSdkRuntimePackageStatus {
  packageName: string
  resolvedPackageName?: string
  packageVersion?: string
  installed: boolean
  installedVersion?: string
  root: string
}

export interface ElectronSdkRuntimePackageCancelInput {
  packageName: string
  packageVersion?: string
}

export interface ElectronSdkRuntimePackageCancelResult {
  packageName: string
  resolvedPackageName?: string
  packageVersion?: string
  cancelled: boolean
}

export interface ElectronAppServerRuntimeInstallResult {
  packageName: string
  packageVersion?: string
  installed: boolean
  root: string
  command?: string
  args?: string[]
}

export type ElectronSdkRuntimeRequestInput<M extends AgentRuntimeRpcMethod = AgentRuntimeRpcMethod> = ElectronAgentRuntimeRequestInput<M>
export type ElectronSdkRuntimeNotifyInput<M extends AgentRuntimeRpcMethod = AgentRuntimeRpcMethod> = ElectronAgentRuntimeNotifyInput<M>
export type ElectronSdkRuntimeRequestResult<M extends AgentRuntimeRpcMethod = AgentRuntimeRpcMethod> = ElectronAgentRuntimeRequestResult<M>
export type ElectronSdkRuntimeNotificationEvent = ElectronAgentRuntimeNotificationEvent
export type ElectronSdkRuntimeServerRequestEvent = ElectronAgentRuntimeServerRequestEvent
export type ElectronSdkRuntimeServerRequestResponseInput = ElectronAgentRuntimeServerRequestResponseInput
