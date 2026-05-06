import type { AgentCommandRuntime } from '../runtime/commands/commandRouter.js'
import type { AgentManifest } from '../runtime/manifest/agentManifest.js'
import type { JSONValue } from '../types.js'

export interface AgentRuntimeContract {
  id: string
  matches(manifest: AgentManifest): boolean
  structuredContract?: string
  toolSchemas?: Record<string, JSONValue>
  commandOverride?: (input: { userMessage: string; manifest: AgentManifest }) => AgentCommandRuntime | undefined
  requiresConfiguredModel?: boolean
  requiresStructuredJSON?: boolean
}

export interface AgentRuntimeContractResolver {
  find(manifest?: AgentManifest): AgentRuntimeContract | undefined
  requiresConfiguredModel(manifest?: AgentManifest): boolean
  requiresStructuredJSON(manifest?: AgentManifest): boolean
}

export interface AgentRuntimeContractMetadata {
  runtimeContractId?: string
  runtimeRequiresConfiguredModel?: boolean
  runtimeRequiresStructuredJSON?: boolean
}

export function buildRuntimeContractMetadata(contract?: AgentRuntimeContract): AgentRuntimeContractMetadata | undefined {
  if (!contract) return undefined
  return {
    runtimeContractId: contract.id,
    runtimeRequiresConfiguredModel: contract.requiresConfiguredModel === true,
    runtimeRequiresStructuredJSON: contract.requiresStructuredJSON === true,
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

  requiresStructuredJSON(manifest?: AgentManifest): boolean {
    if (this.find(manifest)?.requiresStructuredJSON === true) return true
    return /输出JSON|JSON对象|valid JSON|machine-readable JSON/i.test(manifest?.soul ?? '')
  }
}

export const EMPTY_AGENT_RUNTIME_CONTRACT_RESOLVER = new StaticAgentRuntimeContractResolver()
