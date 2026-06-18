import type {
  AgentRuntimeDataSourceFactories,
  AgentRuntimeDataSourceFactory,
} from '@/features/agent/application/agentChatDataSourceFactory'
import type { ProviderRuntimeApi } from '@/shared/infrastructure/providerConfigStore'
import {
  providerRuntimeApiContract,
  providerRuntimeApiSupportsKind,
} from '@/shared/infrastructure/providerRuntimeApiCatalog'

const registeredRuntimeDataSources: AgentRuntimeDataSourceFactories = {}

export function registerAgentRuntimeDataSourceFactory(
  api: ProviderRuntimeApi,
  factory: AgentRuntimeDataSourceFactory,
): () => void {
  const contract = providerRuntimeApiContract(api)
  if (!contract) throw new Error(`Unknown provider runtime API: ${api}`)
  if (contract.transport !== 'sdk-client') throw new Error(`Runtime API ${api} is not SDK-backed.`)
  registeredRuntimeDataSources[api] = factory
  return () => {
    if (registeredRuntimeDataSources[api] === factory) delete registeredRuntimeDataSources[api]
  }
}

export function agentRuntimeDataSourceFactories(
  overrides?: AgentRuntimeDataSourceFactories,
): AgentRuntimeDataSourceFactories {
  return {
    ...registeredRuntimeDataSources,
    ...overrides,
  }
}

export function agentRuntimeDataSourceFactoryForProvider(
  api: ProviderRuntimeApi,
  providerKind: string,
  overrides?: AgentRuntimeDataSourceFactories,
): AgentRuntimeDataSourceFactory | undefined {
  if (!providerRuntimeApiSupportsKind(api, providerKind)) return undefined
  return agentRuntimeDataSourceFactories(overrides)[api]
}
