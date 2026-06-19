import type { AgentChatDataSource, AgentChatModelSelection } from '@movscript/core/agent/chat'
import type { ProviderModelAPIKind } from '@movscript/core/agent'
import { fetchAgentBackendModels } from '@/features/agent/application/agentModelCatalogApi'
import { agentSettingsModelIdForProvider, useAgentStore } from '@/features/agent/state/agentStore'
import {
  providerRuntimeApi,
  providerRuntimeProfile,
  type ProviderConfig,
  type ProviderRuntimeApi,
  type ProviderRuntimeProfile,
} from '@/shared/infrastructure/providerConfigStore'
import { publicModelId } from '@/shared/domain/modelDisplay'
import type { MovScriptWorkspaceContext } from '@/shared/infrastructure/providerConfigStore'
import { providerRuntimeApiContract, providerRuntimeModelAPIKinds, type ProviderRuntimeApiContract } from '@/shared/infrastructure/providerRuntimeApiCatalog'
import { agentRuntimeDataSourceFactoryForProvider } from '@/features/agent/application/agentRuntimeDataSourceRegistry'
import { createAgentRuntimeChatDataSource } from '@/shared/infrastructure/agent-runtime/agentRuntimeChatDataSource'
import {
  electronAgentRuntimeClient,
  electronAgentRuntimeClientAvailable,
} from '@/shared/infrastructure/agent-runtime/electronAgentRuntimeClient'
import type { AgentRuntimeClient } from '@/shared/infrastructure/agent-runtime/agentRuntimeProtocol'

export interface AgentChatDataSourceFactoryOptions {
  workspaceContext?: MovScriptWorkspaceContext
  runtimeDataSources?: AgentRuntimeDataSourceFactories
  runtimeClient?: (input: AgentRuntimeDataSourceFactoryInput) => AgentRuntimeClient | undefined | Promise<AgentRuntimeClient | undefined>
  loadTextModels?: (input: AgentTextModelCatalogLoadInput) => Promise<AgentTextModelCatalog>
}

export type AgentTextModelCatalog = Awaited<ReturnType<typeof fetchAgentBackendModels>>

export interface AgentTextModelCatalogLoadInput {
  runtime: ProviderRuntimeProfile
  apiKinds: ProviderModelAPIKind[]
}

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
  return createRuntimeDataSourceForProvider(provider, runtime, options)
}

async function createRuntimeDataSourceForProvider(
  provider: ProviderConfig,
  runtime: ProviderRuntimeProfile,
  options: AgentChatDataSourceFactoryOptions,
): Promise<AgentChatDataSource> {
  const contract = providerRuntimeApiContract(runtime.api)
  if (contract && !contract.providerKinds.includes(provider.kind)) throw new Error(`${provider.label} runtime ${runtime.api} does not support provider kind ${provider.kind}.`)
  const adapter = agentRuntimeDataSourceFactoryForProvider(runtime.api, provider.kind, options.runtimeDataSources)
  if (!contract || (contract.transport !== 'sdk-client' && contract.transport !== 'app-server')) throw new Error(unsupportedProviderRuntimeMessage(provider))
  if (!adapter && !options.runtimeClient && !electronAgentRuntimeClientAvailable()) throw new Error(unsupportedProviderRuntimeMessage(provider))
  const textModels = await loadTextModels(options, runtime)
  const input: AgentRuntimeDataSourceFactoryInput = {
    provider,
    runtime,
    contract,
    ...(options.workspaceContext ? { workspaceContext: options.workspaceContext } : {}),
    resolveModelForRequest: () => selectedAgentModel(textModels, provider),
  }
  if (adapter) return adapter(input)
  const client = await (options.runtimeClient ?? electronAgentRuntimeClient)(input)
  if (client) return createAgentRuntimeChatDataSource(client, input)
  throw new Error(unsupportedProviderRuntimeMessage(provider))
}

function unsupportedProviderRuntimeMessage(provider: ProviderConfig): string {
  const api = providerRuntimeApi(provider)
  const contract = providerRuntimeApiContract(api)
  if (contract?.adapterStatus === 'pending') return `${provider.label} is configured for ${api}, but the ${contract.label} data source adapter is not installed yet.`
  if (contract?.transport === 'sdk-client' || contract?.transport === 'app-server') return `${provider.label} is configured for ${api}, but no ${contract.label} runtime client is available in this environment.`
  return `${provider.label} does not expose a supported AgentChatDataSource runtime: ${api}`
}

function loadTextModels(options: AgentChatDataSourceFactoryOptions, runtime: ProviderRuntimeProfile): Promise<AgentTextModelCatalog> {
  const apiKinds = providerRuntimeModelAPIKinds(runtime.api)
  const loader = options.loadTextModels ?? ((input: AgentTextModelCatalogLoadInput) => fetchAgentBackendModels({ apiKinds: input.apiKinds }))
  return loader({ runtime, apiKinds }).catch(() => [])
}

function selectedAgentModel(textModels: Awaited<ReturnType<typeof fetchAgentBackendModels>>, provider: ProviderConfig): AgentChatModelSelection {
  const settings = useAgentStore.getState().settings
  const modelId = agentSettingsModelIdForProvider(settings, provider.id)
  if (!modelId) return {}
  const selectedModel = textModels.find((model) => publicModelId(model) === modelId)
  return selectedModel ? { model: publicModelId(selectedModel) } : {}
}
