import {
  electronSdkRuntimeClient,
  electronSdkRuntimeClientAvailable,
} from '../sdk-runtime/electronSdkRuntimeClient'
import type { AgentRuntimeClient } from './agentRuntimeProtocol'
import type {
  ProviderConfig,
  ProviderRuntimeProfile,
} from '../providerConfigStore'
import type { RuntimeBackendContract } from '../providerRuntimeApiCatalog'

export interface ElectronAgentRuntimeClientInput {
  provider: ProviderConfig
  runtime: ProviderRuntimeProfile
  contract: RuntimeBackendContract
}

export function electronAgentRuntimeClient(input: ElectronAgentRuntimeClientInput): AgentRuntimeClient | undefined {
  return electronSdkRuntimeClient(input)
}

export function electronAgentRuntimeClientAvailable(): boolean {
  return electronSdkRuntimeClientAvailable()
}
