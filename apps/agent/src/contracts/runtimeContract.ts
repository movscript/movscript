import type { AgentCommandRuntime } from '../runtime/commands/commandRouter.js'
import type { AgentManifest } from '../runtime/manifest/agentManifest.js'
import type { JSONValue } from '../types.js'

export interface AgentRuntimeContract {
  id: string
  matches(manifest: AgentManifest): boolean
  toolSchemas?: Record<string, JSONValue>
  commandOverride?: (input: { userMessage: string; manifest: AgentManifest }) => AgentCommandRuntime | undefined
  requiresConfiguredModel?: boolean
}

export interface AgentRuntimeContractResolver {
  find(manifest?: AgentManifest): AgentRuntimeContract | undefined
  requiresConfiguredModel(manifest?: AgentManifest): boolean
}

export interface AgentRuntimeContractMetadata {
  runtimeContractId?: string
  runtimeRequiresConfiguredModel?: boolean
}

export function buildRuntimeContractMetadata(contract?: AgentRuntimeContract): AgentRuntimeContractMetadata | undefined {
  if (!contract) return undefined
  return {
    runtimeContractId: contract.id,
    runtimeRequiresConfiguredModel: contract.requiresConfiguredModel === true,
  }
}

export class StaticAgentRuntimeContractResolver implements AgentRuntimeContractResolver {
  private readonly contracts: AgentRuntimeContract[]

  constructor(contracts: AgentRuntimeContract[] = []) {
    this.contracts = [...contracts]
  }

  find(manifest?: AgentManifest): AgentRuntimeContract | undefined {
    if (!manifest) return undefined
    return this.contracts.find((contract) => contract.matches(manifest))
  }

  requiresConfiguredModel(manifest?: AgentManifest): boolean {
    return this.find(manifest)?.requiresConfiguredModel === true
  }
}

export const EMPTY_AGENT_RUNTIME_CONTRACT_RESOLVER = new StaticAgentRuntimeContractResolver()
