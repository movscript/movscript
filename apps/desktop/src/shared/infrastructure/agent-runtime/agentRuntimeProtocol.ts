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
} from '@movscript/agent-chat'
import type {
  MovScriptWorkspaceContext,
  ProviderConfig,
  ProviderRuntimeProfile,
} from '../providerConfigStore'
import type { ProviderRuntimeApiContract } from '../providerRuntimeApiCatalog'

export type AgentRuntimeRpcMethod =
  | 'runtime/probe'
  | 'runtime/describe'
  | 'capabilities/get'
  | 'permissionProfile/list'
  | 'skills/list'
  | 'skills/extraRoots/set'
  | 'plugin/list'
  | 'plugin/installed'
  | 'plugin/install'
  | 'plugin/uninstall'
  | 'mcpServerStatus/list'
  | 'mcpServer/resource/read'
  | 'mcpServer/tool/call'
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

export const AGENT_RUNTIME_REQUIRED_RPC_METHODS: AgentRuntimeRpcMethod[] = [
  'runtime/probe',
  'runtime/describe',
  'capabilities/get',
  'permissionProfile/list',
  'skills/list',
  'skills/extraRoots/set',
  'plugin/list',
  'plugin/installed',
  'plugin/install',
  'plugin/uninstall',
  'mcpServerStatus/list',
  'mcpServer/resource/read',
  'mcpServer/tool/call',
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

export interface AgentRuntimeDescribeResponse {
  runtime: Pick<ProviderRuntimeProfile, 'id' | 'api' | 'label' | 'packageName' | 'sdkPackageName' | 'binaryPackageName' | 'packageVersion' | 'protocolVersion'>
  contract: Pick<ProviderRuntimeApiContract, 'api' | 'label' | 'transport' | 'providerKinds' | 'requiredPackageExports' | 'requiredRpcMethods' | 'thread' | 'capabilities' | 'support'>
  sdk?: {
    packageName?: string
    sdkPackageName?: string
    binaryPackageName?: string
    version?: string
    resolvedFrom?: string
  }
}

export interface AgentRuntimeProbeResponse {
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
      required: AgentRuntimeRpcMethod[]
      missing: AgentRuntimeRpcMethod[]
    }
    credentials?: AgentRuntimeCredentialProbe
  }
  credentials?: AgentRuntimeCredentialProbe
  error?: string
}

export interface AgentRuntimeCredentialProbe {
  ok: boolean
  configured: boolean
  env: string
  acceptedEnv: string[]
  source: string
  modelEndpointBaseURL?: string
  detail?: string
}

export interface AgentRuntimeCapabilitiesResponse {
  ok: boolean
  runtime: Pick<ProviderRuntimeProfile, 'id' | 'api' | 'label'>
  provider: Pick<ProviderConfig, 'id' | 'kind' | 'label'>
  capabilities: ProviderRuntimeApiContract['capabilities'] & {
    serverRequests: boolean
    skillsList: boolean
    defaultSkillBootstrap: boolean
    mcpBridge: boolean
    permissionProfiles: boolean
  }
  support: ProviderRuntimeApiContract['support']
  warnings: string[]
  unsupported: Record<string, string>
}

export interface AgentRuntimeRequestContext {
  provider: ProviderConfig
  runtime: ProviderRuntimeProfile
}

export type AgentRuntimeListThreadsParams = AgentRuntimeRequestContext & {
  limit?: number
  cursor?: string | null
}

export type AgentRuntimeReadThreadParams = AgentRuntimeRequestContext & {
  threadId: string
  read?: AgentChatThreadReadInput
}

export type AgentRuntimeStartThreadParams = AgentRuntimeRequestContext & {
  title?: string
  projectId?: number
  cwd?: string | null
  workspaceContext?: MovScriptWorkspaceContext
} & AgentChatModelSelection & AgentChatRunProfileOptions & AgentChatThreadControlOptions

export type AgentRuntimeResumeThreadParams = AgentRuntimeRequestContext & {
  threadId: string
  cwd?: string | null
  workspaceContext?: MovScriptWorkspaceContext
} & AgentChatModelSelection & AgentChatRunProfileOptions & AgentChatThreadControlOptions

export type AgentRuntimeStartTurnParams = AgentRuntimeRequestContext & {
  threadId: string
  inputs: AgentChatInput[]
  clientUserMessageId?: string | null
  workspaceContext?: MovScriptWorkspaceContext
} & AgentChatModelSelection & AgentChatRunProfileOptions & AgentChatThreadControlOptions

export type AgentRuntimeStartTextTurnParams = AgentRuntimeRequestContext & {
  threadId: string
  text: string
  clientUserMessageId?: string | null
  workspaceContext?: MovScriptWorkspaceContext
} & AgentChatModelSelection & AgentChatRunProfileOptions & AgentChatThreadControlOptions

export type AgentRuntimeSteerTurnParams = AgentRuntimeRequestContext & {
  threadId: string
  turnId: string
  inputs: AgentChatInput[]
  clientUserMessageId?: string | null
}

export type AgentRuntimeInterruptTurnParams = AgentRuntimeRequestContext & {
  threadId: string
  turnId: string
  reason?: string | null
}

export type AgentRuntimeSkillsListParams = AgentRuntimeRequestContext & {
  cwds?: string[]
  forceReload?: boolean
}

export type AgentRuntimeSkillsExtraRootsSetParams = AgentRuntimeRequestContext & {
  extraRoots?: string[]
}

export type AgentRuntimePluginListParams = AgentRuntimeRequestContext & {
  marketplaceKinds?: string[]
}

export type AgentRuntimePluginInstallParams = AgentRuntimeRequestContext & {
  pluginName?: string
  remoteMarketplaceName?: string
  marketplacePath?: string
}

export type AgentRuntimePluginUninstallParams = AgentRuntimeRequestContext & {
  pluginId?: string
}

export type AgentRuntimeMcpToolCallParams = AgentRuntimeRequestContext & {
  threadId?: string
  server: string
  tool: string
  arguments?: unknown
  _meta?: unknown
}

export type AgentRuntimeMcpResourceReadParams = AgentRuntimeRequestContext & {
  server: string
  uri: string
  threadId?: string
}

export type AgentRuntimeThreadMutationParams = AgentRuntimeRequestContext & {
  threadId: string
}

export type AgentRuntimeRenameThreadParams = AgentRuntimeThreadMutationParams & {
  name: string
}

export type AgentRuntimeSetThreadGoalParams = AgentRuntimeThreadMutationParams & {
  objective?: string | null
  status?: string | null
  tokenBudget?: number | null
}

export type AgentRuntimeUpdateThreadSettingsParams = AgentRuntimeResumeThreadParams

export interface AgentRuntimeRpcRequestMap {
  'runtime/probe': AgentRuntimeRequestContext
  'runtime/describe': AgentRuntimeRequestContext
  'capabilities/get': AgentRuntimeRequestContext
  'permissionProfile/list': AgentRuntimeRequestContext
  'skills/list': AgentRuntimeSkillsListParams
  'skills/extraRoots/set': AgentRuntimeSkillsExtraRootsSetParams
  'plugin/list': AgentRuntimePluginListParams
  'plugin/installed': AgentRuntimePluginListParams
  'plugin/install': AgentRuntimePluginInstallParams
  'plugin/uninstall': AgentRuntimePluginUninstallParams
  'mcpServerStatus/list': AgentRuntimeRequestContext
  'mcpServer/resource/read': AgentRuntimeMcpResourceReadParams
  'mcpServer/tool/call': AgentRuntimeMcpToolCallParams
  'thread/list': AgentRuntimeListThreadsParams
  'thread/read': AgentRuntimeReadThreadParams
  'thread/start': AgentRuntimeStartThreadParams
  'thread/resume': AgentRuntimeResumeThreadParams
  'thread/rename': AgentRuntimeRenameThreadParams
  'thread/archive': AgentRuntimeThreadMutationParams
  'thread/unarchive': AgentRuntimeThreadMutationParams
  'thread/delete': AgentRuntimeThreadMutationParams
  'thread/settings/update': AgentRuntimeUpdateThreadSettingsParams
  'thread/goal/set': AgentRuntimeSetThreadGoalParams
  'turn/start': AgentRuntimeStartTurnParams
  'turn/text/start': AgentRuntimeStartTextTurnParams
  'turn/steer': AgentRuntimeSteerTurnParams
  'turn/interrupt': AgentRuntimeInterruptTurnParams
  'runtime/notify/threadSubscribe': AgentRuntimeThreadMutationParams
  'runtime/notify/serverRequestsSubscribe': AgentRuntimeRequestContext
}

export interface AgentRuntimeRpcResponseMap {
  'runtime/probe': AgentRuntimeProbeResponse
  'runtime/describe': AgentRuntimeDescribeResponse
  'capabilities/get': AgentRuntimeCapabilitiesResponse
  'permissionProfile/list': unknown
  'skills/list': unknown
  'skills/extraRoots/set': unknown
  'plugin/list': unknown
  'plugin/installed': unknown
  'plugin/install': unknown
  'plugin/uninstall': unknown
  'mcpServerStatus/list': unknown
  'mcpServer/resource/read': unknown
  'mcpServer/tool/call': unknown
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

export interface AgentRuntimeSubscriptionInput {
  provider: ProviderConfig
  runtime: ProviderRuntimeProfile
  threadId?: string
  onNotification?: (notification: AgentChatNotification) => void
  onServerRequest?: AgentChatServerRequestHandler
  signal?: AbortSignal
}

export interface AgentRuntimeClient {
  readonly id?: string
  request<M extends AgentRuntimeRpcMethod>(
    method: M,
    params: AgentRuntimeRpcRequestMap[M],
  ): Promise<AgentRuntimeRpcResponseMap[M]>
  notify?<M extends AgentRuntimeRpcMethod>(
    method: M,
    params: AgentRuntimeRpcRequestMap[M],
  ): Promise<void>
  subscribe?(input: AgentRuntimeSubscriptionInput): Promise<void | (() => void)> | void | (() => void)
  close?(): Promise<void>
}
