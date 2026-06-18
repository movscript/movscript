import type {
  AgentChatInput,
  AgentChatModelSelection,
  AgentChatNotification,
  AgentChatRunProfileOptions,
  AgentChatServerRequestHandler,
  AgentChatThread,
  AgentChatThreadControlOptions,
  AgentChatThreadReadInput,
  AgentChatTurn,
  AgentThreadExecutionSettings,
  AgentThreadGoalState,
} from '@movscript/core/agent/chat'
import type {
  MovScriptWorkspaceContext,
  ProviderConfig,
  ProviderRuntimeProfile,
} from '../providerConfigStore'
import type { ProviderRuntimeApiContract } from '../providerRuntimeApiCatalog'

export type SdkRuntimeRpcMethod =
  | 'runtime/probe'
  | 'runtime/describe'
  | 'thread/list'
  | 'thread/read'
  | 'thread/start'
  | 'thread/resume'
  | 'thread/rename'
  | 'thread/archive'
  | 'thread/unarchive'
  | 'thread/delete'
  | 'thread/settings/update'
  | 'thread/goal/set'
  | 'turn/start'
  | 'turn/text/start'
  | 'turn/steer'
  | 'turn/interrupt'
  | 'runtime/notify/threadSubscribe'
  | 'runtime/notify/serverRequestsSubscribe'

export const SDK_RUNTIME_REQUIRED_RPC_METHODS: SdkRuntimeRpcMethod[] = [
  'runtime/probe',
  'runtime/describe',
  'thread/list',
  'thread/read',
  'thread/start',
  'thread/resume',
  'thread/rename',
  'thread/archive',
  'thread/unarchive',
  'thread/delete',
  'thread/settings/update',
  'thread/goal/set',
  'turn/start',
  'turn/text/start',
  'turn/steer',
  'turn/interrupt',
  'runtime/notify/threadSubscribe',
  'runtime/notify/serverRequestsSubscribe',
]

export interface SdkRuntimeDescribeResponse {
  runtime: Pick<ProviderRuntimeProfile, 'id' | 'api' | 'label' | 'packageName' | 'sdkPackageName' | 'binaryPackageName' | 'packageVersion' | 'protocolVersion'>
  contract: Pick<ProviderRuntimeApiContract, 'api' | 'label' | 'transport' | 'providerKinds' | 'requiredPackageExports' | 'requiredRpcMethods' | 'thread' | 'capabilities'>
  sdk?: {
    packageName?: string
    sdkPackageName?: string
    binaryPackageName?: string
    version?: string
    resolvedFrom?: string
  }
}

export interface SdkRuntimeProbeResponse {
  ok: boolean
  runtime: Pick<ProviderRuntimeProfile, 'id' | 'api' | 'label' | 'packageName' | 'sdkPackageName' | 'binaryPackageName' | 'packageVersion' | 'protocolVersion'>
  sdk: {
    packageName: string
    version?: string
  }
  contract: Pick<ProviderRuntimeApiContract, 'api' | 'label' | 'providerKinds' | 'requiredPackageExports' | 'requiredRpcMethods'>
  checks: {
    packageLoad: {
      ok: boolean
      error?: string
    }
    requiredExports: {
      ok: boolean
      required: string[]
      missing: string[]
      error?: string
    }
    requiredRpcMethods: {
      ok: boolean
      required: SdkRuntimeRpcMethod[]
      missing: SdkRuntimeRpcMethod[]
    }
  }
  error?: string
}

export interface SdkRuntimeRequestContext {
  provider: ProviderConfig
  runtime: ProviderRuntimeProfile
}

export type SdkRuntimeListThreadsParams = SdkRuntimeRequestContext & {
  limit?: number
  cursor?: string | null
}

export type SdkRuntimeReadThreadParams = SdkRuntimeRequestContext & {
  threadId: string
  read?: AgentChatThreadReadInput
}

export type SdkRuntimeStartThreadParams = SdkRuntimeRequestContext & {
  title?: string
  projectId?: number
  cwd?: string | null
  workspaceContext?: MovScriptWorkspaceContext
} & AgentChatModelSelection & AgentChatRunProfileOptions & AgentChatThreadControlOptions

export type SdkRuntimeResumeThreadParams = SdkRuntimeRequestContext & {
  threadId: string
  cwd?: string | null
  workspaceContext?: MovScriptWorkspaceContext
} & AgentChatModelSelection & AgentChatRunProfileOptions & AgentChatThreadControlOptions

export type SdkRuntimeStartTurnParams = SdkRuntimeRequestContext & {
  threadId: string
  inputs: AgentChatInput[]
  clientUserMessageId?: string | null
  workspaceContext?: MovScriptWorkspaceContext
} & AgentChatModelSelection & AgentChatRunProfileOptions & AgentChatThreadControlOptions

export type SdkRuntimeStartTextTurnParams = SdkRuntimeRequestContext & {
  threadId: string
  text: string
  clientUserMessageId?: string | null
  workspaceContext?: MovScriptWorkspaceContext
} & AgentChatModelSelection & AgentChatRunProfileOptions & AgentChatThreadControlOptions

export type SdkRuntimeSteerTurnParams = SdkRuntimeRequestContext & {
  threadId: string
  turnId: string
  inputs: AgentChatInput[]
  clientUserMessageId?: string | null
}

export type SdkRuntimeInterruptTurnParams = SdkRuntimeRequestContext & {
  threadId: string
  turnId: string
  reason?: string | null
}

export type SdkRuntimeThreadMutationParams = SdkRuntimeRequestContext & {
  threadId: string
}

export type SdkRuntimeRenameThreadParams = SdkRuntimeThreadMutationParams & {
  name: string
}

export type SdkRuntimeSetThreadGoalParams = SdkRuntimeThreadMutationParams & {
  objective?: string | null
  status?: string | null
  tokenBudget?: number | null
}

export type SdkRuntimeUpdateThreadSettingsParams = SdkRuntimeResumeThreadParams

export interface SdkRuntimeRpcRequestMap {
  'runtime/probe': SdkRuntimeRequestContext
  'runtime/describe': SdkRuntimeRequestContext
  'thread/list': SdkRuntimeListThreadsParams
  'thread/read': SdkRuntimeReadThreadParams
  'thread/start': SdkRuntimeStartThreadParams
  'thread/resume': SdkRuntimeResumeThreadParams
  'thread/rename': SdkRuntimeRenameThreadParams
  'thread/archive': SdkRuntimeThreadMutationParams
  'thread/unarchive': SdkRuntimeThreadMutationParams
  'thread/delete': SdkRuntimeThreadMutationParams
  'thread/settings/update': SdkRuntimeUpdateThreadSettingsParams
  'thread/goal/set': SdkRuntimeSetThreadGoalParams
  'turn/start': SdkRuntimeStartTurnParams
  'turn/text/start': SdkRuntimeStartTextTurnParams
  'turn/steer': SdkRuntimeSteerTurnParams
  'turn/interrupt': SdkRuntimeInterruptTurnParams
  'runtime/notify/threadSubscribe': SdkRuntimeThreadMutationParams
  'runtime/notify/serverRequestsSubscribe': SdkRuntimeRequestContext
}

export interface SdkRuntimeRpcResponseMap {
  'runtime/probe': SdkRuntimeProbeResponse
  'runtime/describe': SdkRuntimeDescribeResponse
  'thread/list': { threads: AgentChatThread[]; nextCursor?: string | null }
  'thread/read': AgentChatThread
  'thread/start': AgentChatThread
  'thread/resume': AgentChatThread
  'thread/rename': AgentChatThread | unknown
  'thread/archive': AgentChatThread | unknown
  'thread/unarchive': AgentChatThread | unknown
  'thread/delete': unknown
  'thread/settings/update': AgentThreadExecutionSettings | unknown
  'thread/goal/set': AgentThreadGoalState | unknown
  'turn/start': AgentChatTurn
  'turn/text/start': AgentChatTurn
  'turn/steer': unknown
  'turn/interrupt': unknown
  'runtime/notify/threadSubscribe': void
  'runtime/notify/serverRequestsSubscribe': void
}

export interface SdkRuntimeSubscriptionInput {
  provider: ProviderConfig
  runtime: ProviderRuntimeProfile
  threadId?: string
  onNotification?: (notification: AgentChatNotification) => void
  onServerRequest?: AgentChatServerRequestHandler
  signal?: AbortSignal
}

export interface SdkRuntimeClient {
  readonly id?: string
  request<M extends SdkRuntimeRpcMethod>(
    method: M,
    params: SdkRuntimeRpcRequestMap[M],
  ): Promise<SdkRuntimeRpcResponseMap[M]>
  notify?<M extends SdkRuntimeRpcMethod>(
    method: M,
    params: SdkRuntimeRpcRequestMap[M],
  ): Promise<void>
  subscribe?(input: SdkRuntimeSubscriptionInput): Promise<void | (() => void)> | void | (() => void)
  close?(): Promise<void>
}
