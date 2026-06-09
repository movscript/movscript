import type { AgentChatDataSource, AgentChatModelSelection } from '@/features/agent/domain/agentChatProtocol'
import { fetchAgentBackendModels } from '@/features/agent/domain/agentModelCatalog'
import { useAgentStore } from '@/features/agent/state/agentStore'
import {
  resolveAppServerProfile,
  providerInstanceId,
  usesAppServerProtocol,
  type ProviderConfig,
} from '@/shared/infrastructure/providerConfigStore'
import { createAppServerChatDataSource } from '@/shared/infrastructure/app-server/appServerChatDataSource'
import {
  appServerRpcClientForURL,
  ensureAppServer,
  ensureAppServerRpcClient,
  getAppServerStatus,
} from '@/shared/infrastructure/app-server/appServerRpcClient'
import { publicModelId } from '@/shared/domain/modelDisplay'
import { ensureDefaultAgentProviderFromBackend } from '@/features/agent/application/defaultAgentProvider'
import type { MovScriptWorkspaceContext } from '@/shared/infrastructure/providerConfigStore'

export interface AgentChatDataSourceFactoryOptions {
  appServerPolicy?: 'ensure' | 'status-only'
  workspaceContext?: MovScriptWorkspaceContext
}

export async function createAgentChatDataSourceForProvider(
  provider: ProviderConfig,
  options: AgentChatDataSourceFactoryOptions = {},
): Promise<AgentChatDataSource> {
  if (!usesAppServerProtocol(provider)) throw new Error(`${provider.label} does not expose a supported app-server protocol`)
  const textModels = await fetchAgentBackendModels().catch(() => [])
  if (options.appServerPolicy !== 'status-only') {
    await ensureDefaultAgentProviderFromBackend({ provider, ...(textModels.length > 0 ? { models: textModels } : {}) })
  }
  const ensured = options.workspaceContext && options.appServerPolicy !== 'status-only'
    ? await ensureScopedAppServer(provider, options.workspaceContext)
    : undefined
  const client = ensured?.client ?? (options.appServerPolicy === 'status-only'
    ? await currentAppServerRpcClient(provider)
    : await ensureAppServerRpcClient(provider))
  if (!client) throw new Error(`${provider.label} app-server is not available`)
  return createAppServerChatDataSource(client, {
    provider: provider.kind,
    providerId: provider.id,
    providerInstanceId: providerInstanceId(provider),
    label: provider.label,
    messageAdapter: provider.messageAdapter,
    ...(ensured?.providerSessionCwd ? { defaultThreadCwd: ensured.providerSessionCwd } : {}),
    ...(options.workspaceContext ? { workspaceContext: options.workspaceContext } : {}),
    resolveModelForRequest: () => selectedAgentModel(textModels),
  })
}

async function ensureScopedAppServer(provider: ProviderConfig, workspaceContext: MovScriptWorkspaceContext) {
  const profile = resolveAppServerProfile(provider)
  const status = await ensureAppServer({
    profile,
    workspaceContext,
  })
  if (!status?.ok || !status.endpoint) throw new Error(status?.error || `${provider.label} app-server failed to start: ${profile.id}`)
  return {
    client: appServerRpcClientForURL(status.endpoint),
    providerSessionCwd: status.providerSessionCwd,
  }
}

async function currentAppServerRpcClient(provider: ProviderConfig) {
  const profile = resolveAppServerProfile(provider)
  const status = await getAppServerStatus({ profileId: profile.id })
  if (!status?.ok || !status.endpoint) throw new Error(status?.error || `${provider.label} app-server is not running: ${profile.id}`)
  return appServerRpcClientForURL(status.endpoint)
}

function selectedAgentModel(textModels: Awaited<ReturnType<typeof fetchAgentBackendModels>>): AgentChatModelSelection {
  const settings = useAgentStore.getState().settings
  const modelId = settings.modelId ?? textModels[0]?.id ?? null
  const selectedModel = textModels.find((model) => model.id === modelId)
  return selectedModel ? { model: publicModelId(selectedModel) } : {}
}
