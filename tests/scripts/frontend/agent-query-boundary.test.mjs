import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const agentQueryKeysSource = readSource('apps/frontend/src/features/agent/application/agentQueryKeys.ts')
const agentSettingsSource = [
  readSource('apps/frontend/src/features/agent/components/AIAgentSettingsPage.tsx'),
  readSource('apps/frontend/src/features/agent/application/useAIAgentSettingsPageController.ts'),
].join('\n')
const agentSettingsModelControllerSource = readSource('apps/frontend/src/features/agent/application/useAgentSettingsModelController.ts')
const agentsPageSource = [
  readSource('apps/frontend/src/features/agent/components/AgentsPage.tsx'),
  readSource('apps/frontend/src/features/agent/components/AgentsPageParts.tsx'),
  readSource('apps/frontend/src/features/agent/application/useAgentsPageController.ts'),
].join('\n')
const modelProvidersSource = [
  readSource('apps/frontend/src/features/agent/components/ModelProvidersPage.tsx'),
  readSource('apps/frontend/src/features/agent/components/ModelProvidersPageSections.tsx'),
  readSource('apps/frontend/src/features/agent/components/ModelProvidersPageModel.ts'),
].join('\n')
const agentConsoleSource = [
  readSource('apps/frontend/src/features/agent/components/AgentConsolePage.tsx'),
  readSource('apps/frontend/src/features/agent/components/AgentConsolePageSections.tsx'),
].join('\n')
const agentControlCenterSource = readSource('apps/frontend/src/features/agent/presentation/useAgentControlCenter.ts')
const agentConsoleCapabilityPanelsSource = readSource('apps/frontend/src/features/agent/components/AgentConsoleCapabilityPanels.tsx')
const agentArtifactsSource = readSource('apps/frontend/src/features/agent/components/AgentArtifactResultCards.tsx')
const agentBrowserSource = [
  readSource('apps/frontend/src/features/agent/components/AgentBrowserPanel.tsx'),
  readSource('apps/frontend/src/features/agent/components/AgentBrowserPanelHeader.tsx'),
  readSource('apps/frontend/src/features/agent/components/AgentBrowserTabContent.tsx'),
  readSource('apps/frontend/src/features/agent/components/AgentBrowserPanelModel.ts'),
].join('\n')
const agentBrowserProjectHomeSource = [
  readSource('apps/frontend/src/features/agent/components/AgentBrowserProjectHomePage.tsx'),
  readSource('apps/frontend/src/features/agent/components/AgentBrowserProjectHomePageParts.tsx'),
  readSource('apps/frontend/src/features/agent/components/useAgentBrowserProjectHomeController.tsx'),
].join('\n')
const providerThreadCacheSource = readSource('apps/frontend/src/features/agent/application/providerSessionThreadQueryCache.ts')
const agentChatConversationRegistrySource = readSource('apps/frontend/src/features/agent/application/useAgentChatConversationRegistry.ts')
const activePlanSnapshotSource = readSource('apps/frontend/src/features/agent/presentation/useAgentActivePlanSnapshot.ts')
const agentPlanSnapshotServiceSource = readSource('apps/frontend/src/features/agent/application/agentPlanSnapshotService.ts')
const agentPlanSnapshotCacheSource = readSource('apps/frontend/src/features/agent/application/agentPlanSnapshotQueryCache.ts')
const agentCommandServiceSource = readSource('apps/frontend/src/features/agent/application/agentProviderSessionCommandService.ts')
const agentStatusLightControllerSource = readSource('apps/frontend/src/features/agent/presentation/providerSessionStatusLightController.ts')
const agentStatusLightStreamServiceSource = readSource('apps/frontend/src/features/agent/application/agentProviderSessionStatusLightStreamService.ts')
const agentRunCommandHookSources = [
  readSource('apps/frontend/src/features/agent/presentation/useAgentRunStopAction.ts'),
  readSource('apps/frontend/src/features/agent/presentation/useAgentRunInteractionActionBindings.ts'),
  readSource('apps/frontend/src/features/agent/presentation/useAgentRunResultActions.ts'),
  readSource('apps/frontend/src/features/agent/presentation/useAgentPlanActionBindings.ts'),
].join('\n')
const agentSessionStoreSource = [
  readSource('apps/frontend/src/features/agent/state/agentSessionStore.ts'),
  readSource('apps/frontend/src/features/agent/state/agentSessionHomePersistence.ts'),
  readSource('apps/frontend/src/features/agent/state/agentSessionPersistenceModel.ts'),
  readSource('apps/frontend/src/features/agent/state/agentSessionTaskActions.ts'),
].join('\n')
const agentSessionTaskStateSource = readSource('apps/frontend/src/features/agent/state/agentSessionTaskState.ts')
const agentSessionStoreTypesSource = readSource('apps/frontend/src/features/agent/state/agentSessionStoreTypes.ts')

test('agent surfaces delegate query keys to agent query factories', () => {
  assert.match(agentQueryKeysSource, /export const agentSettingsKeys/)
  assert.match(agentQueryKeysSource, /export const agentProviderKeys/)
  assert.match(agentQueryKeysSource, /export const agentBrowserKeys/)
  assert.match(agentQueryKeysSource, /export const agentArtifactKeys/)
  assert.match(agentQueryKeysSource, /export const agentPlanKeys/)
  assert.match(agentQueryKeysSource, /export const agentConsoleKeys/)

  assert.doesNotMatch(agentSettingsModelControllerSource, /agentSettingsKeys\.providerModelConfig\(/)
  assert.doesNotMatch(agentQueryKeysSource, /providerModelConfig/)
  assert.match(agentSettingsSource, /agentSettingsKeys\.skillCatalog\(/)
  assert.match(agentSettingsSource, /agentSettingsKeys\.toolPermissions\(/)
  assert.match(agentsPageSource, /agentProviderKeys\.workspaceConfig\('default'\)/)
  assert.match(agentsPageSource, /loadAgentProviderWorkspaceConfig\(\)/)
  assert.match(agentsPageSource, /saveAgentProviderWorkspaceConfig\(input\)/)
  assert.doesNotMatch(agentsPageSource, /providerSessionClient/)
  assert.doesNotMatch(agentsPageSource, /agentProviderKeys\.backendModels/)
  assert.doesNotMatch(agentsPageSource, /activeAppServerKey|appServerStatus|AppServer/)
  assert.match(modelProvidersSource, /agentProviderKeys\.modelProvidersBackendModels/)
  assert.match(modelProvidersSource, /agentProviderKeys\.modelCatalogEntries/)
  assert.match(agentControlCenterSource, /agentConsoleKeys\.controlCapabilityHealth\(/)
  assert.doesNotMatch(agentConsoleCapabilityPanelsSource, /agentConsoleKeys\.providerCapabilityProbe\(/)
  assert.match(agentArtifactsSource, /agentArtifactKeys\.messageWorkspaceArtifacts\(workspaceIds\)/)
  assert.match(agentArtifactsSource, /listAgentMessageWorkspaceArtifacts\(workspaceIds\)/)
  assert.doesNotMatch(agentArtifactsSource, /providerSessionClient|getWorkspaceArtifact|providerSessionClient\.baseURL/)
  assert.match(agentBrowserProjectHomeSource, /agentBrowserKeys\.navigationScripts\(/)
  assert.match(agentBrowserProjectHomeSource, /agentBrowserKeys\.navigationEntity\(projectId, 'settings'\)/)
  assert.match(activePlanSnapshotSource, /agentPlanKeys\.taskGraphSnapshot\(/)
  assert.match(activePlanSnapshotSource, /fetchAgentPlanTaskGraphSnapshot\(/)
  assert.match(activePlanSnapshotSource, /streamAgentPlanTaskGraphSnapshot\(/)
  assert.match(activePlanSnapshotSource, /applyAgentPlanProviderSessionEventToCache\(queryClient, queryKey, event, taskGraphId\)/)
  assert.doesNotMatch(activePlanSnapshotSource, /providerSessionClient|ProviderSessionClient|baseURL/)
  assert.doesNotMatch(activePlanSnapshotSource, /setQueryData/)
  assert.doesNotMatch(activePlanSnapshotSource, /\['provider-session-taskGraph-snapshot'/)
  assert.match(agentPlanSnapshotServiceSource, /agentProviderSessionCompatibilityClient/)
  assert.match(agentPlanSnapshotCacheSource, /export function applyAgentPlanProviderSessionEventToCache/)
  assert.match(agentPlanSnapshotCacheSource, /queryClient\.setQueryData<AgentTaskGraphSnapshot \| undefined>/)
  assert.match(agentRunCommandHookSources, /createAgentProviderSessionCommandService/)
  assert.doesNotMatch(agentRunCommandHookSources, /providerSessionClient|ProviderSessionClient|shared\/infrastructure\/providerSessionClient/)
  assert.match(agentCommandServiceSource, /agentProviderSessionCompatibilityClient/)
  assert.match(agentStatusLightControllerSource, /createAgentProviderSessionStatusLightStreamClient\(\)/)
  assert.doesNotMatch(agentStatusLightControllerSource, /providerSessionClient|shared\/infrastructure\/providerSessionClient/)
  assert.match(agentStatusLightStreamServiceSource, /agentProviderSessionCompatibilityClient/)

  for (const source of [
    agentSettingsModelControllerSource,
    agentSettingsSource,
    agentsPageSource,
    modelProvidersSource,
    agentConsoleSource,
    agentConsoleCapabilityPanelsSource,
    agentArtifactsSource,
    agentBrowserSource,
    agentBrowserProjectHomeSource,
  ]) {
    assert.doesNotMatch(source, /queryKey: \['agent-settings/)
    assert.doesNotMatch(source, /queryKey: \['agents-/)
    assert.doesNotMatch(source, /queryKey: \['workspace-model-providers/)
    assert.doesNotMatch(source, /queryKey: \['embedded-browser-navigation/)
    assert.doesNotMatch(source, /queryKey: \['agent-message-workspace-artifacts/)
    assert.doesNotMatch(source, /queryKey: \['agent-console-provider-capability-probe/)
  }
})

test('provider thread mutations publish standard cache update results', () => {
  assert.match(providerThreadCacheSource, /export type ProviderSessionThreadMutationEvent/)
  assert.match(providerThreadCacheSource, /export interface ProviderSessionThreadMutationResult/)
  assert.match(providerThreadCacheSource, /type: 'ProviderThreadUpdated'/)
  assert.match(providerThreadCacheSource, /export function providerThreadUpdatedResult/)
  assert.match(providerThreadCacheSource, /export function applyProviderSessionThreadMutationResult/)
  assert.match(providerThreadCacheSource, /export function applyProviderSessionThreadMutationEvent/)
  assert.match(providerThreadCacheSource, /isProviderSessionThreadListQueryKey\(query\.queryKey\)/)
  assert.doesNotMatch(providerThreadCacheSource, /event\.baseURL|providerSessionClient\.baseURL/)
  assert.doesNotMatch(providerThreadCacheSource, /export function upsertCachedProviderSessionThread/)
  assert.doesNotMatch(providerThreadCacheSource, /startSharedProvisionalConversation|startProvisionalConversation|provisionalConversation/)

  assert.equal(existsSync(resolve('apps/frontend/src/features/agent/presentation/useAgentChatStoreBindings.ts')), false)
  assert.match(agentChatConversationRegistrySource, /agentConversationRegistryRecordFromChatThread/)
  assert.doesNotMatch(agentChatConversationRegistrySource, /applyProviderSessionThreadMutationResult/)
  assert.doesNotMatch(agentChatConversationRegistrySource, /upsertCachedProviderSessionThread/)
})

test('agent session store does not keep provider-session projection compatibility state', () => {
  for (const relativePath of [
    'apps/frontend/src/features/agent/presentation/useAgentChatStoreBindings.ts',
    'apps/frontend/src/features/agent/application/agentSendCommit.ts',
    'apps/frontend/src/features/agent/application/agentSendCompletion.ts',
  ]) {
    assert.equal(existsSync(resolve(relativePath)), false, `${relativePath} should stay deleted`)
  }
  for (const source of [
    agentSessionStoreSource,
    agentSessionStoreTypesSource,
    agentChatConversationRegistrySource,
  ]) {
    assert.doesNotMatch(source, /conversationProviderSessionStates/)
    assert.doesNotMatch(source, /setConversationProviderSessionState/)
    assert.doesNotMatch(source, /clearConversationProviderSessionState/)
    assert.doesNotMatch(source, /clearConversationProviderSessionProjection/)
    assert.doesNotMatch(source, /setConversationProviderSessionId/)
    assert.doesNotMatch(source, /setConversationProviderThreadId/)
    assert.doesNotMatch(source, /setConversationSessionId/)
    assert.doesNotMatch(source, /setProviderThreadId/)
    assert.doesNotMatch(source, /@deprecated/)
  }
  const persistedAgentSessionStoreLine = agentSessionStoreTypesSource
    .split('\n')
    .find((line) => line.startsWith('export type PersistedAgentSessionStore = ')) ?? ''
  assert.equal(
    persistedAgentSessionStoreLine,
    "export type PersistedAgentSessionStore = Pick<AgentSessionStore, 'activeConversationIdsByUser' | 'activeConversationIdsByScope' | 'conversationsById' | 'workspacesByUser'>",
  )
  assert.doesNotMatch(persistedAgentSessionStoreLine, /conversationRuntimeStates/)
  assert.doesNotMatch(persistedAgentSessionStoreLine, /conversationThreadBindings/)
  assert.match(agentSessionStoreSource, /const state = persistedAgentSessionState\(store\.getState\(\)\)/)
  assert.match(agentSessionStoreSource, /api\.setAgentSessionState\(\{ state \}\)/)
  assert.match(agentSessionStoreSource, /activeConversationIdsByUser: \{[\s\S]*\.\.\.persisted\.activeConversationIdsByUser,[\s\S]*\.\.\.current\.activeConversationIdsByUser,[\s\S]*\}/)
  assert.match(agentSessionStoreSource, /activeConversationIdsByScope: \{[\s\S]*\.\.\.\(persisted\.activeConversationIdsByScope \?\? \{\}\),[\s\S]*\.\.\.\(current\.activeConversationIdsByScope \?\? \{\}\),[\s\S]*\}/)
  assert.match(agentSessionStoreSource, /conversationsById: \{[\s\S]*\.\.\.persisted\.conversationsById,[\s\S]*\.\.\.current\.conversationsById,[\s\S]*\}/)
  assert.match(agentSessionStoreSource, /workspacesByUser: mergeNestedRecordMap\(persisted\.workspacesByUser, current\.workspacesByUser\)/)
  assert.doesNotMatch(agentSessionStoreSource, /conversationRuntimeStates: persisted\?\./)
  assert.doesNotMatch(agentSessionStoreSource, /conversationThreadBindings: persisted\?\./)
  assert.match(agentSessionStoreSource, /initialAgentSessionVolatileState\(\)/)
  assert.match(agentSessionStoreSource, /enqueueAgentPageTask/)
  assert.match(agentSessionTaskStateSource, /export function initialAgentSessionVolatileState/)
  assert.match(agentSessionTaskStateSource, /conversationThreadBindings: Record<string, AgentConversationThreadBinding>/)
  assert.match(agentSessionTaskStateSource, /conversationRuntimeStates: Record<string, AgentConversationRuntimeState>/)
  assert.match(agentSessionTaskStateSource, /export function enqueueAgentPageTask/)
  assert.match(agentSessionTaskStateSource, /export function updateAgentPageTaskFromProviderSession/)
})

function readSource(path) {
  return readFileSync(resolve(path), 'utf8')
}
