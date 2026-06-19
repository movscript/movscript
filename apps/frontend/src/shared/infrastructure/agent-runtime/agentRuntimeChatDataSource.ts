import type {
  AgentChatCapabilities,
  AgentChatDataSource,
  AgentChatModelSelection,
} from '@movscript/core/agent/chat'
import type { MovScriptWorkspaceContext, ProviderConfig, ProviderRuntimeProfile } from '@/shared/infrastructure/providerConfigStore'
import type { ProviderRuntimeApiContract } from '@/shared/infrastructure/providerRuntimeApiCatalog'
import type {
  AgentRuntimeClient,
  AgentRuntimeRequestContext,
} from '@/shared/infrastructure/agent-runtime/agentRuntimeProtocol'

export interface AgentRuntimeChatDataSourceOptions {
  provider: ProviderConfig
  runtime: ProviderRuntimeProfile
  contract: ProviderRuntimeApiContract
  workspaceContext?: MovScriptWorkspaceContext
  resolveModelForRequest?: () => AgentChatModelSelection
}

export function createAgentRuntimeChatDataSource(
  client: AgentRuntimeClient,
  options: AgentRuntimeChatDataSourceOptions,
): AgentChatDataSource {
  const { provider, runtime, contract } = options
  const context = (): AgentRuntimeRequestContext => ({ provider, runtime })
  const workspaceParams = () => options.workspaceContext ? { workspaceContext: options.workspaceContext } : {}
  const withModel = <T extends object>(input: T): T & AgentChatModelSelection => {
    const resolvedModel = options.resolveModelForRequest?.() ?? {}
    return {
      ...resolvedModel,
      ...input,
    } as T & AgentChatModelSelection
  }

  return {
    provider: provider.kind,
    providerId: provider.id,
    providerInstanceId: runtime.id,
    label: provider.label,
    serverRequestSubscriptionMode: 'globalWithThreadFallback',
    capabilities: agentRuntimeCapabilities(client, context),
    listThreads(input) {
      return client.request('thread/list', compactParams({
        ...context(),
        limit: input?.limit,
        cursor: input?.cursor,
      }))
    },
    readThread(threadId, input) {
      return client.request('thread/read', compactParams({
        ...context(),
        threadId,
        read: input,
      }))
    },
    resumeThread(input) {
      return client.request('thread/resume', compactParams({
        ...context(),
        ...workspaceParams(),
        ...withModel(input),
      }))
    },
    startThread(input) {
      return client.request('thread/start', compactParams({
        ...context(),
        ...workspaceParams(),
        ...withModel(input ?? {}),
      }))
    },
    renameThread(input) {
      return client.request('thread/rename', compactParams({
        ...context(),
        ...input,
      }))
    },
    archiveThread(input) {
      return client.request('thread/archive', compactParams({
        ...context(),
        ...input,
      }))
    },
    unarchiveThread(input) {
      return client.request('thread/unarchive', compactParams({
        ...context(),
        ...input,
      }))
    },
    deleteThread(input) {
      return client.request('thread/delete', compactParams({
        ...context(),
        ...input,
      }))
    },
    setThreadGoal(input) {
      return client.request('thread/goal/set', compactParams({
        ...context(),
        ...input,
      }))
    },
    updateThreadSettings(input) {
      return client.request('thread/settings/update', compactParams({
        ...context(),
        ...withModel(input),
      }))
    },
    startTurn(input) {
      return client.request('turn/start', compactParams({
        ...context(),
        ...workspaceParams(),
        ...withModel(input),
      }))
    },
    steerTurn(input) {
      return client.request('turn/steer', compactParams({
        ...context(),
        ...input,
      }))
    },
    interruptTurn(input) {
      return client.request('turn/interrupt', compactParams({
        ...context(),
        ...input,
      }))
    },
    startTextTurn(input) {
      return client.request('turn/text/start', compactParams({
        ...context(),
        ...workspaceParams(),
        ...withModel(input),
      }))
    },
    subscribeThread(input) {
      if (client.subscribe) {
        return client.subscribe({
          ...context(),
          threadId: input.threadId,
          onNotification: input.onNotification,
          onServerRequest: input.onServerRequest,
          signal: input.signal,
        })
      }
      return client.notify?.('runtime/notify/threadSubscribe', {
        ...context(),
        threadId: input.threadId,
      })
    },
    subscribeServerRequests(input) {
      if (client.subscribe) {
        return client.subscribe({
          ...context(),
          onNotification: input.onNotification,
          onServerRequest: input.onServerRequest,
          signal: input.signal,
        })
      }
      return client.notify?.('runtime/notify/serverRequestsSubscribe', context())
    },
  }
}

function agentRuntimeCapabilities(
  client: AgentRuntimeClient,
  context: () => AgentRuntimeRequestContext,
): AgentChatCapabilities {
  return {
    runtime: {
      probe: () => client.request('runtime/probe', context()),
    },
    mcp: {
      listServers: () => client.request('mcpServerStatus/list', context()),
      readResource: (input) => client.request('mcpServer/resource/read', compactParams({
        ...context(),
        ...input,
      })),
      callTool: (input) => client.request('mcpServer/tool/call', compactParams({
        ...context(),
        ...input,
      })),
    },
    plugins: {
      list: (input) => client.request('plugin/list', compactParams({
        ...context(),
        ...(input ?? {}),
      })),
      installed: (input) => client.request('plugin/installed', compactParams({
        ...context(),
        ...(input ?? {}),
      })),
      install: (input) => client.request('plugin/install', compactParams({
        ...context(),
        ...input,
      })),
      uninstall: (input) => client.request('plugin/uninstall', compactParams({
        ...context(),
        ...input,
      })),
    },
    skills: {
      list: (input) => client.request('skills/list', compactParams({
        ...context(),
        ...(input ?? {}),
      })),
      setExtraRoots: (input) => client.request('skills/extraRoots/set', compactParams({
        ...context(),
        ...input,
      })),
    },
    config: {
      read: () => client.request('capabilities/get', context()),
      listPermissionProfiles: (input) => client.request('permissionProfile/list', compactParams({
        ...context(),
        ...(input ?? {}),
      })),
    },
  }
}

function compactParams<T extends object>(input: T): T {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) output[key] = value
  }
  return output as T
}
