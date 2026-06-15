export const agentSettingsKeys = {
  providerModelConfig: (profileId: string, baseURL: string) => ['agent-settings-provider-model-config', profileId, baseURL] as const,
  skillCatalog: (profileId: string, baseURL: string) => ['agent-settings-skill-catalog', profileId, baseURL] as const,
  toolPermissions: (profileId: string, baseURL: string) => ['agent-settings-tool-permissions', profileId, baseURL] as const,
}

export const agentProviderKeys = {
  workspaceConfig: (profileKey: string) => ['agents-workspace-config', profileKey] as const,
  composerWorkspaceProjects: ['agent-composer-workspace-projects'] as const,
  backendModels: ['agents-backend-models'] as const,
  modelProvidersConfig: ['workspace-model-providers-config'] as const,
  modelProvidersBackendModels: ['workspace-model-providers-backend-models'] as const,
  appServerStatus: (providerKey: string, profileId: string) => ['agents-app-server-status', providerKey, profileId] as const,
}

export const agentBrowserKeys = {
  navigationScripts: (
    projectId: number | undefined,
    userId: string | number | undefined,
    orgId: string | number | undefined,
  ) => ['embedded-browser-navigation', projectId, 'scripts', userId ?? 'local', orgId ?? 'personal'] as const,
  navigationEntity: (projectId: number | undefined, entityKind: string) => ['embedded-browser-navigation', projectId, entityKind] as const,
}

export const agentArtifactKeys = {
  messageWorkspaceArtifacts: (baseURL: string, workspaceIds: readonly string[]) => ['agent-message-workspace-artifacts', baseURL, workspaceIds] as const,
}

export const agentPlanKeys = {
  taskGraphSnapshot: (
    baseURL: string,
    sessionId: string | null,
    taskGraphId: string | null,
  ) => ['provider-session-taskGraph-snapshot', baseURL, sessionId, taskGraphId] as const,
}

export const agentConsoleKeys = {
  providerCapabilityProbe: (providerSignature: string) => ['agent-console-provider-capability-probe', providerSignature] as const,
  providerModelConfig: ['agent-console-provider-model-config'] as const,
  controlAppServerStatus: (providerId: string, profileId: string) => ['agent-console-control-app-server-status', providerId, profileId] as const,
  controlCapabilityHealth: (providerSignature: string) => ['agent-control-capability-health', providerSignature] as const,
}
