import {
  ProviderSessionClient,
  providerSessionClient,
} from '@/shared/infrastructure/providerSessionClient'

export type AgentProviderSessionCompatibilityOwner =
  | 'control-center-diagnostics'
  | 'legacy-thread-cache'
  | 'session-output-diagnostics'
  | 'provider-session-health-compat'
  | 'run-trace-diagnostics'
  | 'provider-activation-settings-compat'
  | 'provider-session-command-compat'
  | 'plan-snapshot-compat'
  | 'status-light-compat'
  | 'workspace-artifact-compat'
  | 'settings-catalog-compat'
  | 'telemetry-collection'

export const AGENT_PROVIDER_SESSION_COMPATIBILITY_OWNERS: Record<AgentProviderSessionCompatibilityOwner, string> = {
  'control-center-diagnostics': 'Agent Control Center legacy provider-session diagnostics and cleanup.',
  'legacy-thread-cache': 'Legacy provider-session thread/run index cache used by diagnostics surfaces.',
  'session-output-diagnostics': 'Session output panel compatibility reads for historical provider-session runs.',
  'provider-session-health-compat': 'Compatibility health probe for legacy provider-session backed diagnostics.',
  'run-trace-diagnostics': 'Run trace/debug compatibility reads.',
  'provider-activation-settings-compat': 'Workspace config compatibility for provider activation migration.',
  'provider-session-command-compat': 'Legacy provider-session command actions for diagnostics/action panels.',
  'plan-snapshot-compat': 'Task graph plan snapshot compatibility stream.',
  'status-light-compat': 'Legacy provider-session status-light stream compatibility.',
  'workspace-artifact-compat': 'Workspace artifact compatibility reads.',
  'settings-catalog-compat': 'Provider catalog/settings commit compatibility.',
  'telemetry-collection': 'Provider-session telemetry collection.',
}

export function agentProviderSessionCompatibilityClient(
  owner: AgentProviderSessionCompatibilityOwner,
): ProviderSessionClient {
  assertAgentProviderSessionCompatibilityOwner(owner)
  return providerSessionClient
}

export function createAgentProviderSessionCompatibilityClient(
  owner: AgentProviderSessionCompatibilityOwner,
  options?: ConstructorParameters<typeof ProviderSessionClient>[1],
): ProviderSessionClient {
  assertAgentProviderSessionCompatibilityOwner(owner)
  return new ProviderSessionClient(undefined, options)
}

export function agentProviderSessionTreeIdForCompatibilityInput(input: {
  providerSessionTreeId?: string
  sessionId?: string // legacy providerSessionTreeId fallback
}): string | undefined {
  return input.providerSessionTreeId?.trim() || input.sessionId?.trim() || undefined
}

function assertAgentProviderSessionCompatibilityOwner(owner: AgentProviderSessionCompatibilityOwner): void {
  if (!AGENT_PROVIDER_SESSION_COMPATIBILITY_OWNERS[owner]) {
    throw new Error(`Unknown provider-session compatibility owner: ${owner}`)
  }
}

export type {
  AgentRunTraceResponse,
  MovScriptWorkspaceConfig,
  MovScriptWorkspaceConfigSaveInput,
  ProviderSessionHealth,
  ProviderSessionTelemetryLogEntry,
  ProviderSessionTelemetryMetricSample,
  ProviderSessionTelemetrySnapshot,
} from '@/shared/infrastructure/providerSessionClient'

export {
  providerSessionAssistantProgressFromEvent,
  providerSessionRunIdFromEvent,
  providerSessionTraceFromEvent,
} from '@/shared/infrastructure/provider-session-client/providerSessionEventFacts'
