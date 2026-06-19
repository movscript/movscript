import type {
  AgentRuntimeCapabilitiesResponse,
  AgentRuntimeRequestContext,
} from '../../src/shared/infrastructure/agent-runtime/agentRuntimeProtocol'
import {
  providerRuntimeApiContract,
  type RuntimeBackendCapabilityContract,
  type RuntimeBackendCapabilitySupport,
  type RuntimeBackendSupportContract,
} from '../../src/shared/infrastructure/providerRuntimeApiCatalog'

const EMPTY_RUNTIME_CAPABILITIES: RuntimeBackendCapabilityContract = {
  tools: false,
  permissions: false,
  mcp: false,
  config: false,
  account: false,
}

export function agentRuntimeCapabilitiesResponse(
  context: AgentRuntimeRequestContext,
): AgentRuntimeCapabilitiesResponse {
  const contract = providerRuntimeApiContract(context.runtime.api)
  const declared = contract?.capabilities ?? EMPTY_RUNTIME_CAPABILITIES
  const support = contract?.support ?? unsupportedRuntimeSupport()
  const unsupported = runtimeBackendUnsupportedReasons(support)
  return {
    ok: true,
    runtime: {
      id: context.runtime.id,
      api: context.runtime.api,
      label: context.runtime.label,
    },
    provider: {
      id: context.provider.id,
      kind: context.provider.kind,
      label: context.provider.label,
    },
    capabilities: {
      ...declared,
      serverRequests: true,
      skillsList: true,
      defaultSkillBootstrap: true,
      mcpBridge: true,
      permissionProfiles: true,
    },
    support,
    warnings: Object.values(unsupported),
    unsupported,
  }
}

function unsupportedRuntimeSupport(): RuntimeBackendSupportContract {
  return {
    thread: {
      list: unsupportedCapabilitySupport('Runtime backend contract is unavailable.'),
      read: unsupportedCapabilitySupport('Runtime backend contract is unavailable.'),
      start: unsupportedCapabilitySupport('Runtime backend contract is unavailable.'),
      resume: unsupportedCapabilitySupport('Runtime backend contract is unavailable.'),
      interrupt: unsupportedCapabilitySupport('Runtime backend contract is unavailable.'),
      stream: unsupportedCapabilitySupport('Runtime backend contract is unavailable.'),
    },
    capabilities: {
      tools: unsupportedCapabilitySupport('Runtime backend contract is unavailable.'),
      permissions: unsupportedCapabilitySupport('Runtime backend contract is unavailable.'),
      mcp: unsupportedCapabilitySupport('Runtime backend contract is unavailable.'),
      config: unsupportedCapabilitySupport('Runtime backend contract is unavailable.'),
      account: unsupportedCapabilitySupport('Runtime backend contract is unavailable.'),
    },
  }
}

function unsupportedCapabilitySupport(reason: string): RuntimeBackendCapabilitySupport {
  return { supported: false, level: 'unsupported', reason }
}

function runtimeBackendUnsupportedReasons(support: RuntimeBackendSupportContract): Record<string, string> {
  const unsupported: Record<string, string> = {}
  for (const [key, value] of Object.entries(support.capabilities) as Array<[keyof RuntimeBackendCapabilityContract, RuntimeBackendCapabilitySupport]>) {
    if (value.supported && value.level === 'supported') continue
    unsupported[key] = value.reason ?? `${key} is not supported by this runtime backend.`
  }
  return unsupported
}
