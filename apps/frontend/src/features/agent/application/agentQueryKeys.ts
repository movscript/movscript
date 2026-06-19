export const agentSettingsKeys = {
  skillCatalog: (profileId: string) => ['agent-settings-skill-catalog', profileId] as const,
  toolPermissions: (profileId: string) => ['agent-settings-tool-permissions', profileId] as const,
}

export const agentProviderKeys = {
  workspaceConfig: (profileKey: string) => ['agents-workspace-config', profileKey] as const,
  composerWorkspaceProjects: ['agent-composer-workspace-projects'] as const,
  backendModels: ['agents-backend-models'] as const,
  modelProvidersBackendModels: ['workspace-model-providers-backend-models'] as const,
  modelCatalogEntries: ['workspace-model-catalog-entries'] as const,
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
  messageWorkspaceArtifacts: (workspaceIds: readonly string[]) => ['agent-message-workspace-artifacts', workspaceIds] as const,
}

export const agentPlanKeys = {
  taskGraphSnapshot: (
    providerSessionTreeId: string | null,
    taskGraphId: string | null,
  ) => ['agent-plan-task-graph-snapshot', providerSessionTreeId, taskGraphId] as const,
}

export const agentConsoleKeys = {
  providerCapabilityProbe: (providerSignature: string) => ['agent-console-provider-capability-probe', providerSignature] as const,
  controlCapabilityHealth: (providerSignature: string) => ['agent-control-capability-health', providerSignature] as const,
}
