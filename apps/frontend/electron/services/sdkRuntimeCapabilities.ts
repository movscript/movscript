import type {
  SdkRuntimeCapabilitiesResponse,
  SdkRuntimeRequestContext,
} from '../../src/shared/infrastructure/sdk-runtime/sdkRuntimeProtocol'
import {
  providerRuntimeApiContract,
} from '../../src/shared/infrastructure/providerRuntimeApiCatalog'

export function sdkRuntimeCapabilitiesResponse(
  context: SdkRuntimeRequestContext,
): SdkRuntimeCapabilitiesResponse {
  const contract = providerRuntimeApiContract(context.runtime.api)
  const declared = contract?.capabilities ?? {
    tools: false,
    permissions: false,
    mcp: false,
    config: false,
    account: false,
  }
  const unsupported: Record<string, string> = {}
  if (context.provider.kind === 'claude') {
    unsupported.config = 'Claude Agent SDK does not expose the full Codex config surface; MovScript provides neutral permission profiles and provider-native skill directories.'
    unsupported.account = 'Claude credentials are resolved by MovScript account settings or ANTHROPIC_* environment variables.'
  }
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
    warnings: Object.values(unsupported),
    unsupported,
  }
}
