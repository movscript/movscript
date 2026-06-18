import type { AgentChatDataSource, AgentChatModelSelection } from '@movscript/core/agent/chat'
import { fetchAgentBackendModels } from '@/features/agent/application/agentModelCatalogApi'
import { useAgentStore } from '@/features/agent/state/agentStore'
import {
  resolveAppServerProfile,
  providerInstanceId,
  providerRuntimeApi,
  providerRuntimeProfile,
  providerSupportsAppServerRuntime,
  type ProviderConfig,
  type ProviderRuntimeApi,
  type ProviderRuntimeProfile,
} from '@/shared/infrastructure/providerConfigStore'
import { createAppServerChatDataSource } from '@/shared/infrastructure/app-server/appServerChatDataSource'
import {
  appServerClientForURL,
  ensureAppServer,
  ensureAppServerClient,
  getAppServerStatus,
} from '@/shared/infrastructure/app-server/appServerRpcClient'
import { publicModelId } from '@/shared/domain/modelDisplay'
import { ensureDefaultAgentProviderFromBackend } from '@/features/agent/application/defaultAgentProvider'
import { resolveAgentModelId } from '@/features/agent/application/agentDefaultModelSelection'
import type { MovScriptWorkspaceContext } from '@/shared/infrastructure/providerConfigStore'
import { providerRuntimeApiContract, type ProviderRuntimeApiContract } from '@/shared/infrastructure/providerRuntimeApiCatalog'
import { agentRuntimeDataSourceFactoryForProvider } from '@/features/agent/application/agentRuntimeDataSourceRegistry'
import { createSdkRuntimeChatDataSource } from '@/shared/infrastructure/sdk-runtime/sdkRuntimeChatDataSource'
import {
  electronSdkRuntimeClient,
  electronSdkRuntimeClientAvailable,
} from '@/shared/infrastructure/sdk-runtime/electronSdkRuntimeClient'
import type { SdkRuntimeClient } from '@/shared/infrastructure/sdk-runtime/sdkRuntimeProtocol'

export interface AgentChatDataSourceFactoryOptions {
  appServerPolicy?: 'ensure' | 'status-only'
  workspaceContext?: MovScriptWorkspaceContext
  runtimeDataSources?: AgentRuntimeDataSourceFactories
  runtimeClient?: (input: AgentRuntimeDataSourceFactoryInput) => SdkRuntimeClient | undefined | Promise<SdkRuntimeClient | undefined>
  loadTextModels?: () => Promise<AgentTextModelCatalog>
}

export type AgentTextModelCatalog = Awaited<ReturnType<typeof fetchAgentBackendModels>>

export type AgentRuntimeDataSourceFactories = Partial<Record<ProviderRuntimeApi, AgentRuntimeDataSourceFactory>>

export interface AgentRuntimeDataSourceFactoryInput {
  provider: ProviderConfig
  runtime: ProviderRuntimeProfile
  contract: ProviderRuntimeApiContract
  workspaceContext?: MovScriptWorkspaceContext
  resolveModelForRequest: () => AgentChatModelSelection
}

export type AgentRuntimeDataSourceFactory = (
  input: AgentRuntimeDataSourceFactoryInput,
) => AgentChatDataSource | Promise<AgentChatDataSource>

export async function createAgentChatDataSourceForProvider(
  provider: ProviderConfig,
  options: AgentChatDataSourceFactoryOptions = {},
): Promise<AgentChatDataSource> {
  const runtime = providerRuntimeProfile(provider)
  if (!providerSupportsAppServerRuntime(provider)) return createRuntimeDataSourceForProvider(provider, runtime, options)
  const textModels = await loadTextModels(options)
  if (options.appServerPolicy !== 'status-only') {
    await ensureDefaultAgentProviderFromBackend({ provider, ...(textModels.length > 0 ? { models: textModels } : {}) })
  }
  const ensured = options.workspaceContext && options.appServerPolicy !== 'status-only'
    ? await ensureScopedAppServer(provider, options.workspaceContext)
    : undefined
  const client = ensured?.client ?? (options.appServerPolicy === 'status-only'
    ? await currentAppServerClient(provider)
    : await ensureAppServerClient(provider))
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

async function createRuntimeDataSourceForProvider(
  provider: ProviderConfig,
  runtime: ProviderRuntimeProfile,
  options: AgentChatDataSourceFactoryOptions,
): Promise<AgentChatDataSource> {
  const contract = providerRuntimeApiContract(runtime.api)
  if (contract && !contract.providerKinds.includes(provider.kind)) throw new Error(`${provider.label} runtime ${runtime.api} does not support provider kind ${provider.kind}.`)
  const adapter = agentRuntimeDataSourceFactoryForProvider(runtime.api, provider.kind, options.runtimeDataSources)
  if (!contract || contract.transport !== 'sdk-client') throw new Error(unsupportedProviderRuntimeMessage(provider))
  if (!adapter && !options.runtimeClient && !electronSdkRuntimeClientAvailable()) throw new Error(unsupportedProviderRuntimeMessage(provider))
  const textModels = await loadTextModels(options)
  const input: AgentRuntimeDataSourceFactoryInput = {
    provider,
    runtime,
    contract,
    ...(options.workspaceContext ? { workspaceContext: options.workspaceContext } : {}),
    resolveModelForRequest: () => selectedAgentModel(textModels),
  }
  if (adapter) return adapter(input)
  const client = await (options.runtimeClient ?? electronSdkRuntimeClient)(input)
  if (client) return createSdkRuntimeChatDataSource(client, input)
  throw new Error(unsupportedProviderRuntimeMessage(provider))
}

function unsupportedProviderRuntimeMessage(provider: ProviderConfig): string {
  const api = providerRuntimeApi(provider)
  const contract = providerRuntimeApiContract(api)
  if (contract?.adapterStatus === 'pending') return `${provider.label} is configured for ${api}, but the ${contract.label} data source adapter is not installed yet.`
  if (contract?.transport === 'sdk-client') return `${provider.label} is configured for ${api}, but no ${contract.label} runtime client is available in this environment.`
  return `${provider.label} does not expose a supported AgentChatDataSource runtime: ${api}`
}

async function ensureScopedAppServer(provider: ProviderConfig, workspaceContext: MovScriptWorkspaceContext) {
  const profile = resolveAppServerProfile(provider)
  const status = await ensureAppServer({
    profile,
    workspaceContext,
  })
  if (!status?.ok || !status.endpoint) throw new Error(status?.error || `${provider.label} app-server failed to start: ${profile.id}`)
  return {
    client: appServerClientForURL(status.endpoint),
    providerSessionCwd: status.providerSessionCwd,
  }
}

async function currentAppServerClient(provider: ProviderConfig) {
  const profile = resolveAppServerProfile(provider)
  const status = await getAppServerStatus({ profileId: profile.id })
  if (!status?.ok || !status.endpoint) throw new Error(status?.error || `${provider.label} app-server is not running: ${profile.id}`)
  return appServerClientForURL(status.endpoint)
}

function loadTextModels(options: AgentChatDataSourceFactoryOptions): Promise<AgentTextModelCatalog> {
  return (options.loadTextModels ?? fetchAgentBackendModels)().catch(() => [])
}

function selectedAgentModel(textModels: Awaited<ReturnType<typeof fetchAgentBackendModels>>): AgentChatModelSelection {
  const settings = useAgentStore.getState().settings
  const modelId = resolveAgentModelId({ models: textModels, selectedModelId: settings.modelId })
  const selectedModel = textModels.find((model) => publicModelId(model) === modelId)
  return selectedModel ? { model: publicModelId(selectedModel) } : {}
}
