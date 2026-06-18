import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const agentQueryKeysSource = readSource('apps/frontend/src/features/agent/application/agentQueryKeys.ts')
const agentSettingsSource = readSource('apps/frontend/src/features/agent/components/AIAgentSettingsPage.tsx')
const agentSettingsModelControllerSource = readSource('apps/frontend/src/features/agent/application/useAgentSettingsModelController.ts')
const agentsPageSource = [
  readSource('apps/frontend/src/features/agent/components/AgentsPage.tsx'),
  readSource('apps/frontend/src/features/agent/components/AgentsPageAppServerPanel.tsx'),
  readSource('apps/frontend/src/features/agent/components/AgentsPageAppServerPanelModel.tsx'),
].join('\n')
const modelProvidersSource = readSource('apps/frontend/src/features/agent/components/ModelProvidersPage.tsx')
const agentConsoleSource = [
  readSource('apps/frontend/src/features/agent/components/AgentConsolePage.tsx'),
  readSource('apps/frontend/src/features/agent/components/AgentConsolePageSections.tsx'),
].join('\n')
const agentConsoleCapabilityPanelsSource = readSource('apps/frontend/src/features/agent/components/AgentConsoleCapabilityPanels.tsx')
const agentArtifactsSource = readSource('apps/frontend/src/features/agent/components/AgentArtifactResultCards.tsx')
const agentBrowserSource = [
  readSource('apps/frontend/src/features/agent/components/AgentBrowserPanel.tsx'),
  readSource('apps/frontend/src/features/agent/components/AgentBrowserPanelHeader.tsx'),
  readSource('apps/frontend/src/features/agent/components/AgentBrowserTabContent.tsx'),
  readSource('apps/frontend/src/features/agent/components/AgentBrowserPanelModel.ts'),
].join('\n')
const agentBrowserProjectHomeSource = readSource('apps/frontend/src/features/agent/components/AgentBrowserProjectHomePage.tsx')
const providerThreadCacheSource = readSource('apps/frontend/src/features/agent/application/providerSessionThreadQueryCache.ts')
const agentChatStoreBindingsSource = readSource('apps/frontend/src/features/agent/presentation/useAgentChatStoreBindings.ts')
const activePlanSnapshotSource = readSource('apps/frontend/src/features/agent/presentation/useAgentActivePlanSnapshot.ts')
const agentPlanSnapshotCacheSource = readSource('apps/frontend/src/features/agent/application/agentPlanSnapshotQueryCache.ts')
const agentSessionStoreSource = readSource('apps/frontend/src/features/agent/state/agentSessionStore.ts')
const agentSessionTaskStateSource = readSource('apps/frontend/src/features/agent/state/agentSessionTaskState.ts')
const agentSessionStoreTypesSource = readSource('apps/frontend/src/features/agent/state/agentSessionStoreTypes.ts')
const agentSendCommitSource = readSource('apps/frontend/src/features/agent/application/agentSendCommit.ts')
const agentSendCompletionSource = readSource('apps/frontend/src/features/agent/application/agentSendCompletion.ts')

test('agent surfaces delegate query keys to agent query factories', () => {
  assert.match(agentQueryKeysSource, /export const agentSettingsKeys/)
  assert.match(agentQueryKeysSource, /export const agentProviderKeys/)
  assert.match(agentQueryKeysSource, /export const agentBrowserKeys/)
  assert.match(agentQueryKeysSource, /export const agentArtifactKeys/)
  assert.match(agentQueryKeysSource, /export const agentPlanKeys/)
  assert.match(agentQueryKeysSource, /export const agentConsoleKeys/)

  assert.match(agentSettingsModelControllerSource, /agentSettingsKeys\.providerModelConfig\(/)
  assert.match(agentSettingsSource, /agentSettingsKeys\.skillCatalog\(/)
  assert.match(agentSettingsSource, /agentSettingsKeys\.toolPermissions\(/)
  assert.match(agentsPageSource, /agentProviderKeys\.workspaceConfig\('default'\)/)
  assert.match(agentsPageSource, /agentProviderKeys\.workspaceConfig\(activeAppServerKey\)/)
  assert.match(agentsPageSource, /agentProviderKeys\.backendModels/)
  assert.match(agentsPageSource, /agentProviderKeys\.appServerStatus\(providerKey, profile\.id\)/)
  assert.match(modelProvidersSource, /agentProviderKeys\.modelProvidersBackendModels/)
  assert.match(modelProvidersSource, /agentProviderKeys\.modelCatalogEntries/)
  assert.match(agentConsoleCapabilityPanelsSource, /agentConsoleKeys\.providerCapabilityProbe\(/)
  assert.match(agentArtifactsSource, /agentArtifactKeys\.messageWorkspaceArtifacts\(/)
  assert.match(agentBrowserProjectHomeSource, /agentBrowserKeys\.navigationScripts\(/)
  assert.match(agentBrowserProjectHomeSource, /agentBrowserKeys\.navigationEntity\(projectId, 'settings'\)/)
  assert.match(activePlanSnapshotSource, /agentPlanKeys\.taskGraphSnapshot\(/)
  assert.match(activePlanSnapshotSource, /applyAgentPlanProviderSessionEventToCache\(queryClient, queryKey, event, taskGraphId\)/)
  assert.doesNotMatch(activePlanSnapshotSource, /setQueryData/)
  assert.doesNotMatch(activePlanSnapshotSource, /\['provider-session-taskGraph-snapshot'/)
  assert.match(agentPlanSnapshotCacheSource, /export function applyAgentPlanProviderSessionEventToCache/)
  assert.match(agentPlanSnapshotCacheSource, /queryClient\.setQueryData<AgentTaskGraphSnapshot \| undefined>/)

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
  assert.match(providerThreadCacheSource, /isProviderSessionThreadListQueryKey\(query\.queryKey, event\.baseURL\)/)
  assert.doesNotMatch(providerThreadCacheSource, /export function upsertCachedProviderSessionThread/)

  assert.match(agentChatStoreBindingsSource, /applyProviderSessionThreadMutationResult\(queryClient, providerThreadUpdatedResult\(\{ thread: providerSessionThreadSummaryFromThread\(thread\) \}\)\)/)
  assert.doesNotMatch(agentChatStoreBindingsSource, /upsertCachedProviderSessionThread/)
})

test('agent session store does not keep provider-session projection compatibility state', () => {
  for (const source of [
    agentSessionStoreSource,
    agentSessionStoreTypesSource,
    agentChatStoreBindingsSource,
    agentSendCommitSource,
    agentSendCompletionSource,
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
    "export type PersistedAgentSessionStore = Pick<AgentSessionStore, 'activeConversationIdsByUser' | 'conversationsById' | 'workspacesByUser'>",
  )
  assert.doesNotMatch(persistedAgentSessionStoreLine, /conversationRuntimeStates/)
  assert.doesNotMatch(persistedAgentSessionStoreLine, /conversationThreadBindings/)
  assert.match(agentSessionStoreSource, /partialize: persistedAgentSessionState/)
  assert.match(agentSessionStoreSource, /activeConversationIdsByUser: persisted\?\.activeConversationIdsByUser \?\? \{\}/)
  assert.match(agentSessionStoreSource, /conversationsById: persisted\?\.conversationsById \?\? \{\}/)
  assert.match(agentSessionStoreSource, /workspacesByUser: persisted\?\.workspacesByUser \?\? \{\}/)
  assert.doesNotMatch(agentSessionStoreSource, /conversationRuntimeStates: persisted\?\./)
  assert.doesNotMatch(agentSessionStoreSource, /conversationThreadBindings: persisted\?\./)
  assert.match(agentSessionStoreSource, /initialAgentSessionVolatileState\(\)/)
  assert.match(agentSessionStoreSource, /enqueueAgentPageTask/)
  assert.match(agentSessionTaskStateSource, /export function initialAgentSessionVolatileState/)
  assert.match(agentSessionTaskStateSource, /conversationThreadBindings: Record<string, AgentConversationThreadBinding>/)
  assert.match(agentSessionTaskStateSource, /conversationRuntimeStates: Record<string, AgentConversationRuntimeState>/)
  assert.match(agentSessionTaskStateSource, /export function enqueueAgentPageTask/)
  assert.match(agentSessionTaskStateSource, /export function updateAgentPageTaskFromProviderSession/)
  assert.match(agentSendCommitSource, /setConversationProviderSessionTreeId/)
  assert.match(agentSendCommitSource, /setConversationProviderThreadBindingId/)
})

function readSource(path) {
  return readFileSync(resolve(path), 'utf8')
}
