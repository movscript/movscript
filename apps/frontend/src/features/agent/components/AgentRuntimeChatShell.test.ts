import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  agentRuntimeThreadOpenEvent,
  agentRuntimeThreadScopeKey,
  agentRuntimeWorkspaceContextFromRoute,
} from '@/features/agent/components/AgentRuntimeChatShell'
import {
  resolveAgentChatShellProfile,
  resolveAgentChatShellProvider,
} from '@/features/agent/components/AgentUnifiedChatShell'
import type { ProviderConfig, ProviderSettings } from '@/shared/infrastructure/providerConfigStore'

function sourceBetween(source: string, startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle)
  assert.ok(start >= 0, `missing source marker ${startNeedle}`)
  const end = source.indexOf(endNeedle, start)
  assert.ok(end >= 0, `missing source marker ${endNeedle}`)
  return source.slice(start, end)
}

test('agent runtime chat shell maps routes to MovScript workspace contexts', () => {
  assert.deepEqual(agentRuntimeWorkspaceContextFromRoute({
    pathname: '/project/agent',
    search: '',
  }), { scope: 'global' })

  assert.deepEqual(agentRuntimeWorkspaceContextFromRoute({
    projectId: 42,
    pathname: '/project/agent',
    search: '',
  }), {
    scope: 'project',
    projectId: 42,
  })

  assert.deepEqual(agentRuntimeWorkspaceContextFromRoute({
    projectId: 42,
    pathname: '/project/scripts/workbench',
    search: '?productionId=99',
  }), {
    scope: 'production',
    projectId: 42,
    productionId: 99,
  })
})

test('agent runtime chat shell starts unscoped until a new thread selects workspace context', () => {
  const source = readFileSync(resolve('src/features/agent/components/AgentRuntimeChatShell.tsx'), 'utf8')
  const loadDataSourceBlock = source.match(/const loadDataSource = useCallback[\s\S]*?const loadDataSourceForNewThread/)?.[0] ?? ''
  const loadDataSourceForNewThreadBlock = source.match(/const loadDataSourceForNewThread = useCallback[\s\S]*?const threadScopeKey/)?.[0] ?? ''

  assert.doesNotMatch(source, /useProjectStore/)
  assert.doesNotMatch(source, /useLocation\(\)/)
  assert.doesNotMatch(source, /function RouteAwareAppServerChatShell/)
  assert.doesNotMatch(loadDataSourceBlock, /workspaceContext/)
  assert.match(loadDataSourceForNewThreadBlock, /if \(!provider\) return loadDataSource\(\)/)
  assert.match(loadDataSourceForNewThreadBlock, /\.\.\.\(input\.workspaceContext \? \{ workspaceContext: input\.workspaceContext \} : \{\}\)/)
})

test('agent runtime chat shell scopes thread workspace keys and events by provider instance', () => {
  const provider = sdkProvider({
    id: 'studio-primary',
    kind: 'studio-agent',
    runtimeId: 'studio-home',
  })
  const otherProfile = sdkProvider({
    id: 'studio-primary',
    kind: 'studio-agent',
    runtimeId: 'studio-sandbox',
  })

  assert.equal(
    agentRuntimeThreadScopeKey(provider),
    'movscript.studio-agent.studio-primary.studio-home.threadScope',
  )
  assert.equal(
    agentRuntimeThreadOpenEvent(provider),
    'movscript:studio-agent.studio-primary.studio-home-thread-open',
  )
  assert.notEqual(
    agentRuntimeThreadScopeKey(provider),
    agentRuntimeThreadScopeKey(otherProfile),
  )
  assert.notEqual(
    agentRuntimeThreadOpenEvent(provider),
    agentRuntimeThreadOpenEvent(otherProfile),
  )
})

test('agent chat provider resolution follows the selected agent over stale active conversations', () => {
  const codex = sdkProvider({
    id: 'codex',
    kind: 'codex',
    runtimeId: 'codex-sdk',
    runtimeApi: 'codex-sdk',
  })
  const claude: ProviderConfig = {
    id: 'claude',
    kind: 'claude',
    protocol: 'claude-code',
    label: 'Claude',
    enabled: true,
  }
  const settings: ProviderSettings = {
    providers: [claude, codex],
    defaultProviderId: 'claude',
    newConversationProviderId: 'claude',
  }

  const resolvedProfile = resolveAgentChatShellProfile(settings, 'user_1', {
    activeConversationIdsByUser: { user_1: 'thread_1' },
    activeConversationIdsByScope: {},
    conversationsById: {
      thread_1: {
        id: 'thread_1',
        userId: 'user_1',
        provider: codex.kind,
        providerId: codex.id,
        providerInstanceId: 'codex-sdk',
        providerProtocol: 'sdk',
        providerThreadId: 'thread_1',
        open: true,
        archived: false,
        createdAt: 1000,
        updatedAt: 2000,
      },
    },
  })
  const resolved = resolveAgentChatShellProvider(settings, 'user_1')

  assert.equal(resolvedProfile?.id, claude.id)
  assert.equal(resolvedProfile?.providerProfile.id, claude.id)
  assert.equal(resolvedProfile?.providerProfile.kind, claude.kind)
  assert.equal(resolvedProfile?.providerProfile.protocol, 'claude-code')
  assert.equal(resolved.id, claude.id)
})

test('agent chat active thread state is owned by the session registry', () => {
  const agentRuntimeShellSource = readFileSync(resolve('src/features/agent/components/AgentRuntimeChatShell.tsx'), 'utf8')
  const unifiedShellSource = readFileSync(resolve('src/features/agent/components/AgentUnifiedChatShell.tsx'), 'utf8')
  const dataSourceShellSource = readAgentChatDataSourceShellContractSource()
  const shellViewSource = readFileSync(resolve('src/features/agent/components/AgentChatShellView.tsx'), 'utf8')
  const dataSourceShellTypesSource = readFileSync(resolve('src/features/agent/application/agentChatDataSourceShellTypes.ts'), 'utf8')
  const shellCoreStateSource = readFileSync(resolve('src/features/agent/application/useAgentChatShellCoreState.ts'), 'utf8')
  const dataSourceLoadEffectSource = readFileSync(resolve('src/features/agent/application/useAgentChatDataSourceLoadEffect.ts'), 'utf8')
  const threadLifecycleEffectsSource = readFileSync(resolve('src/features/agent/application/useAgentChatThreadLifecycleEffects.ts'), 'utf8')
  const serverRequestsSource = readFileSync(resolve('src/features/agent/application/useAgentChatServerRequests.ts'), 'utf8')
  const serverRequestSubscriptionCoordinatorSource = readFileSync(resolve('src/features/agent/application/agentChatServerRequestSubscriptionCoordinator.ts'), 'utf8')
  const threadCreationSource = readFileSync(resolve('src/features/agent/application/useAgentChatThreadCreation.ts'), 'utf8')
  const turnControlsSource = readFileSync(resolve('src/features/agent/application/useAgentChatTurnControls.ts'), 'utf8')
  const runtimeCacheSource = readFileSync(resolve('src/features/agent/application/agentChatRuntimeCache.ts'), 'utf8')
  const neutralRuntimeSource = readFileSync(resolve('../../packages/core/src/agent/chat/agentChatRuntime.ts'), 'utf8')
  const architectureSource = readFileSync(resolve('src/features/agent/ARCHITECTURE.md'), 'utf8')
  const panelCommandsSource = readFileSync(resolve('src/features/agent/application/useAgentChatPanelCommands.ts'), 'utf8')
  const threadListSource = readFileSync(resolve('src/features/agent/application/useAgentChatThreadList.ts'), 'utf8')
  const threadRuntimeEffectsSource = readFileSync(resolve('src/features/agent/application/useAgentChatThreadRuntimeEffects.ts'), 'utf8')
  const threadBootstrapSource = readFileSync(resolve('src/features/agent/application/useAgentChatThreadBootstrap.ts'), 'utf8')
  const conversationRegistrySource = readFileSync(resolve('src/features/agent/application/useAgentChatConversationRegistry.ts'), 'utf8')
  const shellModelSource = readAgentChatShellModelSource()

  assert.match(agentRuntimeShellSource, /selectActiveAgentConversationRegistryRecord/)
  assert.doesNotMatch(agentRuntimeShellSource, /selectAgentConversationRegistryRecords/)
  assert.match(agentRuntimeShellSource, /isAgentChatDraftConversationId\(activeConversationId\)/)
  assert.match(agentRuntimeShellSource, /const readActiveThreadId = useCallback\(\(\) => activeThreadId, \[activeThreadId\]\)/)
  assert.match(agentRuntimeShellSource, /registryActiveThreadId=\{activeThreadId\}/)
  assert.match(agentRuntimeShellSource, /readActiveThreadId=\{readActiveThreadId\}/)
  assert.match(dataSourceShellTypesSource, /conversationFocusScope\?: AgentConversationFocusScope/)
  assert.match(dataSourceShellTypesSource, /registryActiveThreadId\?: string \| null/)
  assert.match(agentRuntimeShellSource, /threadScopeKey=\{threadScopeKey\}/)
  assert.match(agentRuntimeShellSource, /dataSourceKey=\{threadScopeKey\}/)
  assert.match(dataSourceShellSource, /registryActiveThreadId === activeThreadIdRef\.current/)
  assert.match(dataSourceShellSource, /if \(registryActiveThreadId\) \{[\s\S]*void openThread\(registryActiveThreadId\)/)
  assert.match(unifiedShellSource, /function resolveAgentChatShellProfile/)
  assert.match(unifiedShellSource, /function resolveAgentChatShellProvider/)
  assert.match(unifiedShellSource, /key=\{agentRuntimeThreadScopeKey\(activeProfile\.provider\)\}/)
  assert.match(unifiedShellSource, /provider=\{activeProfile\.provider\}/)
  assert.doesNotMatch(unifiedShellSource, /selectActiveAgentConversationRegistryRecord/)
  assert.doesNotMatch(unifiedShellSource, /selectActiveProviderConversation/)
  assert.doesNotMatch(unifiedShellSource, /find\(\(provider\) => selectActiveProviderConversation\(registryState, userId, provider\)\)/)
  assert.match(dataSourceShellTypesSource, /dataSourceKey\?: string/)
  assert.match(dataSourceShellTypesSource, /readActiveThreadId\?: \(\) => string \| null/)
  assert.match(dataSourceShellSource, /from '@\/features\/agent\/application\/useAgentChatShellCoreState'/)
  assert.match(shellCoreStateSource, /const readCurrentActiveThreadId = useCallback/)
  assert.match(shellCoreStateSource, /const readRestorableActiveThreadId = useCallback/)
  assert.match(shellCoreStateSource, /agentChatConversationRecordForThread\(\{[\s\S]*records: readAgentConversationRecordsById\(\),[\s\S]*providerIdentity,[\s\S]*userId,[\s\S]*\}\)/)
  assert.match(shellCoreStateSource, /useAgentConversationWorkspace\(userId, composerConversationId\)/)
  assert.doesNotMatch(shellCoreStateSource, /useAgentSessionStore/)
  assert.match(shellCoreStateSource, /buildAgentChatProviderIdentity\(\{[\s\S]*provider,[\s\S]*providerId,[\s\S]*providerInstanceId,[\s\S]*providerProtocol,[\s\S]*\}\)/)
  assert.match(dataSourceShellSource, /from '@\/features\/agent\/application\/useAgentChatConversationRegistry'/)
  assert.match(dataSourceShellSource, /useAgentChatConversationRegistry\(\{[\s\S]*dispatchRuntime,[\s\S]*readCurrentActiveThreadId,[\s\S]*threadScopeKey,[\s\S]*userId,[\s\S]*\}\)/)
  assert.match(conversationRegistrySource, /const conversationPatchInputForThread = useCallback\(\(threadId: string, open: boolean\) => buildAgentChatConversationPatchInput\(\{/)
  assert.match(conversationRegistrySource, /const conversationId = store\.upsertConversation\(conversationPatchInputForThread\(threadId, true\)\)/)
  assert.match(conversationRegistrySource, /store\.setConversationOpen\(userId, conversationId, true, focusScope\)/)
  assert.match(conversationRegistrySource, /store\.setActiveConversation\(userId, conversationId, focusScope\)/)
  assert.match(conversationRegistrySource, /const conversationId = store\.upsertConversation\(conversationPatchInputForThread\(threadId, false\)\)/)
  assert.match(conversationRegistrySource, /store\.setConversationOpen\(userId, conversationId, false, focusScope\)/)
  assert.match(conversationRegistrySource, /const providerIdentity = useMemo\(\(\) => buildAgentChatProviderIdentity\(\{/)
  assert.match(conversationRegistrySource, /const reorderOpenThreads = useCallback/)
  assert.match(conversationRegistrySource, /buildAgentChatThreadDeckOrderUpdates\(\{[\s\S]*draggedThreadId,[\s\S]*targetThreadId,[\s\S]*providerIdentity,[\s\S]*records: Object\.values\(snapshot\.conversationsById\),[\s\S]*\}\)/)
  assert.match(conversationRegistrySource, /store\.setConversationDeckOrders\(updates\)/)
  assert.match(conversationRegistrySource, /buildAgentChatConversationRegistryIndex\(\{[\s\S]*records: conversations,[\s\S]*providerIdentity,[\s\S]*\}\)/)
  assert.doesNotMatch(dataSourceShellSource, /const conversationPatchInputForThread = useCallback/)
  assert.doesNotMatch(dataSourceShellSource, /buildAgentChatConversationRegistryIndex\(\{/)
  assert.match(shellModelSource, /export function buildAgentChatConversationPatchInput/)
  assert.match(shellModelSource, /export function buildAgentChatProviderIdentity/)
  assert.match(shellModelSource, /export function buildAgentChatConversationRegistryIndex/)
  assert.match(shellModelSource, /export function buildAgentChatThreadDeckOrderUpdates/)
  assert.match(shellModelSource, /export function agentChatConversationRecordForThread/)
  assert.match(shellModelSource, /buildSessionDeckIndex\(\{[\s\S]*idForEntry: \(record\) => record\.providerThreadId,[\s\S]*\}\)/)
  assert.match(shellModelSource, /closedThreadIds: deck\.closedIds/)
  assert.match(shellModelSource, /openThreadIds: deck\.openIds/)
  assert.match(runtimeCacheSource, /const sourceThreadListCache = new Map<string/)
  assert.match(runtimeCacheSource, /export function readAgentChatSourceThreadListCache\(threadScopeKey: string\)/)
  assert.match(runtimeCacheSource, /export function writeAgentChatSourceThreadListCache/)
  assert.match(dataSourceShellSource, /from '@\/features\/agent\/application\/useAgentChatThreadList'/)
  assert.match(threadListSource, /from '@\/features\/agent\/application\/agentChatRuntimeCache'/)
  assert.doesNotMatch(dataSourceShellSource, /const sourceThreadListCache = new Map<string/)
  assert.doesNotMatch(dataSourceShellSource, /function readSourceThreadListCache\(threadScopeKey: string\)/)
  assert.doesNotMatch(dataSourceShellSource, /readAgentChatSourceThreadListCache/)
  assert.doesNotMatch(dataSourceShellSource, /writeAgentChatSourceThreadListCache/)
  assert.match(threadListSource, /writeSourceThreadList\(response\.threads, response\.nextCursor \?\? null\)/)
  assert.match(threadListSource, /setSourceThreadList\(\(current\) => \{[\s\S]*mergeAgentChatThreadListPage\(current, response\.threads\)[\s\S]*writeAgentChatSourceThreadListCache\(threadScopeKey/)
  assert.match(dataSourceShellSource, /from '@\/features\/agent\/application\/useAgentChatThreadLifecycleEffects'/)
  assert.match(threadLifecycleEffectsSource, /if \(!dataSource \|\| surface !== 'panel' \|\| !historyOpen \|\| sourceThreadListLoaded \|\| loading\) return[\s\S]*void refreshThreadList\(\)/)
  assert.match(threadLifecycleEffectsSource, /const threadSubscriptionOwnsNotifications = !dataSource\.subscribeServerRequests/)
  assert.match(threadLifecycleEffectsSource, /onNotification: threadSubscriptionOwnsNotifications \? handleNotification : undefined/)
  assert.match(threadLifecycleEffectsSource, /onServerRequest: threadSubscriptionOwnsNotifications \? handleServerRequest : undefined/)
  assert.match(architectureSource, /Thread lifecycle is runtime state/)
  assert.match(neutralRuntimeSource, /export type AgentChatRuntimeThreadLifecycleStatus = 'draft' \| 'materializing' \| 'ready' \| 'failed'/)
  assert.match(neutralRuntimeSource, /export function agentChatRuntimeThreadCanReadTurns/)
  assert.match(dataSourceShellSource, /agentChatRuntimeThreadCanReadTurns\(setup\.runtime, setup\.activeThreadId\)/)
  assert.match(threadLifecycleEffectsSource, /if \(!activeThreadCanReadTurns\) return[\s\S]*dispatchRuntime\(\{ type: 'requestThreadRead'/)
  assert.match(threadCreationSource, /upsertThread\(thread, \{ lifecycleStatus: 'materializing' \}\)/)
  assert.match(threadCreationSource, /if \(turn\) \{[\s\S]*markThreadReady\(thread\.id\)[\s\S]*requestThreadRead\(thread\.id\)[\s\S]*\}/)
  assert.match(turnControlsSource, /markThreadReady\(thread\.id\)[\s\S]*dispatchRuntime\(\{ type: 'requestThreadRead', threadId: thread\.id \}\)/)
  assert.equal((turnControlsSource.match(/markThreadReady\(thread\.id\)[\s\S]*?dispatchRuntime\(\{ type: 'requestThreadRead', threadId: thread\.id \}\)/g) ?? []).length, 2)
  assert.match(architectureSource, /Server-request subscriptions are shared by data-source identity/)
  assert.match(serverRequestsSource, /subscribeSharedAgentChatServerRequests\(dataSource/)
  assert.match(serverRequestSubscriptionCoordinatorSource, /const serverRequestSubscriptions = new Map/)
  assert.match(serverRequestSubscriptionCoordinatorSource, /current\.controller\.abort\(\)[\s\S]*current\.dispose\?\.\(\)/)
  assert.match(dataSourceShellSource, /historyPanel: buildAgentChatShellHistoryPanel\(\{[\s\S]*hasMoreThreadPages: Boolean\(input\.threadListNextCursor\),[\s\S]*onLoadThreads: input\.refreshThreadList/)
  assert.match(shellViewSource, /historyPanel: AgentChatShellHistoryPanelProps/)
  assert.match(shellViewSource, /hasMoreThreadPages=\{historyPanel\.hasMoreThreadPages\}/)
  assert.doesNotMatch(shellViewSource, /hasMoreThreadPages=\{Boolean\(threadListNextCursor\)\}/)
  assert.match(dataSourceShellSource, /threadSurface: buildAgentChatShellThreadSurface\(\{[\s\S]*activeThreadId: input\.activeThreadId,[\s\S]*hiddenItemCount: input\.visibleItemWindow\.hiddenCount,[\s\S]*onOpenConversation: \(threadId: string\) => \{[\s\S]*void input\.openThread\(threadId\)/)
  assert.match(dataSourceShellSource, /function buildAgentChatShellThreadSurface[\s\S]*activeConversationId: activeThreadId \?\? '__draft__'/)
  assert.match(shellViewSource, /threadSurface: AgentChatShellThreadSurfaceProps/)
  assert.match(shellViewSource, /activeConversationId=\{threadSurface\.activeConversationId\}/)
  assert.match(shellViewSource, /visibleItems=\{threadSurface\.visibleItems\}/)
  assert.doesNotMatch(shellViewSource, /activeConversationId=\{activeThreadId \?\? '__draft__'\}/)
  assert.doesNotMatch(shellViewSource, /visibleItems=\{visibleItems\}/)
  assert.doesNotMatch(dataSourceShellSource, /onLoadThreads: loadThreads/)
  assert.doesNotMatch(dataSourceShellSource, /dispatchRuntime\(\{\s*type: 'setThreads'/)
  assert.match(shellCoreStateSource, /createAgentChatRuntimeState\(readRestorableActiveThreadId\(\)\)/)
  assert.match(dataSourceLoadEffectSource, /dataSourceKey\?: string/)
  assert.match(dataSourceLoadEffectSource, /dataSourceKey,[\s\S]*dispatchRuntime,/)
  assert.match(dataSourceLoadEffectSource, /const storedThreadId = readRestorableActiveThreadId\(\)/)
  assert.match(threadBootstrapSource, /const stored = readRestorableActiveThreadId\(\)/)
  assert.match(dataSourceShellSource, /from '@\/features\/agent\/application\/useAgentChatThreadBootstrap'/)
  assert.match(dataSourceShellSource, /useAgentChatThreadBootstrap\(\{[\s\S]*closedThreadIds,[\s\S]*fetchFirstThreadListPage,[\s\S]*readRestorableActiveThreadId,[\s\S]*\}\)/)
  assert.match(threadBootstrapSource, /const firstOpenThread = selectAgentChatInitialSourceThread\(\{[\s\S]*closedThreadIds,[\s\S]*threads: nextThreads,[\s\S]*\}\)/)
  assert.match(shellModelSource, /export function selectAgentChatInitialSourceThread/)
  assert.match(conversationRegistrySource, /const activeThreadClosed = readCurrentActiveThreadId\(\) === threadId/)
  assert.match(dataSourceShellSource, /from '@\/features\/agent\/application\/useAgentChatThreadRuntimeEffects'/)
  assert.match(threadRuntimeEffectsSource, /if \(closedThreadIds\.has\(request\.threadId\)\) \{[\s\S]*type: 'clearThreadResumeRequest'/)
  assert.match(threadRuntimeEffectsSource, /inFlightThreadResumeIdsRef\.current\.has\(request\.threadId\)/)
  assert.match(threadRuntimeEffectsSource, /agentChatRuntimeThreadCanReadTurns\(runtimeRef\.current, request\.threadId\)[\s\S]*type: 'clearThreadReadRequest'/)
  assert.match(threadBootstrapSource, /agentChatRuntimeThreadCanReadTurns\(runtimeRef\.current, threadId\)[\s\S]*return null[\s\S]*dataSource\.readThread\(threadId, input\)/)
  assert.doesNotMatch(dataSourceShellSource, /inFlightThreadResumeIdsRef/)
  assert.doesNotMatch(dataSourceShellSource, /inFlightThreadResumeRequestIdsRef|has\(request\.id\)/)
  assert.match(dataSourceShellSource, /from '@\/features\/agent\/application\/useAgentChatPanelCommands'/)
  assert.match(panelCommandsSource, /publishAgentChatThreadOpen\(\{[\s\S]*channel: openThreadEventName,[\s\S]*sourceId,[\s\S]*threadId: activeThreadId,[\s\S]*\}\)/)
  assert.match(panelCommandsSource, /subscribeAgentChatThreadOpen\(openThreadEventName/)
  assert.match(panelCommandsSource, /if \(payload\.sourceId === sourceId\) return/)
  assert.doesNotMatch(dataSourceShellSource, /const candidateIds = uniqueAgentChatThreadIds/)
  assert.doesNotMatch(dataSourceShellSource, /\.\.\.nextThreads\.filter\(\(thread\) => !closedThreadIds\.has\(thread\.id\)\)\.map\(\(thread\) => thread\.id\)/)
  assert.match(threadBootstrapSource, /if \(!stored\) \{[\s\S]*setActiveThreadIdValue\(null\)[\s\S]*return[\s\S]*\}/)
  assert.match(threadBootstrapSource, /setActiveThreadIdValue\(stored\)[\s\S]*markThreadOpen\(stored\)[\s\S]*readHistoryThread\(stored\)/)
  assert.match(threadBootstrapSource, /provisionalAgentChatThread\(stored, dataSource\)/)
  assert.match(conversationRegistrySource, /const clearUnavailableStoredThread = useCallback/)
  assert.match(conversationRegistrySource, /const workspace = readAgentConversationWorkspace\(userId, conversationId\)/)
  assert.match(conversationRegistrySource, /const emptyWorkspace = agentChatConversationWorkspaceIsEmpty\(workspace\)/)
  assert.match(conversationRegistrySource, /updateAgentConversationWorkspace\(userId, draftConversationId, workspace\)/)
  assert.match(threadBootstrapSource, /const removedEmptyConversation = clearUnavailableStoredThread\(stored\)/)
  assert.match(threadBootstrapSource, /if \(removedEmptyConversation\) setError\(errorMessage\(readError\)\)/)
  assert.match(shellModelSource, /export function agentChatConversationWorkspaceIsEmpty/)
  assert.doesNotMatch(dataSourceShellSource, /function agentChatConversationWorkspaceIsEmpty/)
  assert.doesNotMatch(dataSourceShellSource, /clearUnavailableActiveThread\(stored\)/)
  assert.doesNotMatch(agentRuntimeShellSource, /readAppServerActiveThreadId|ACTIVE_APP_SERVER_THREAD_STORAGE_KEY|appServerActiveThreadStorageKey/)
  assert.doesNotMatch(unifiedShellSource, /readAppServerActiveThreadId|window\.addEventListener\('storage'/)
  assert.doesNotMatch(dataSourceShellSource, /writeStoredActiveThreadId|readStoredActiveThreadId|agentConversationOpenOrder/)
  assert.doesNotMatch(agentRuntimeShellSource, /window\.localStorage\.(getItem|setItem|removeItem)/)
  assert.doesNotMatch(dataSourceShellSource, /window\.localStorage\.(getItem|setItem|removeItem)/)
})

test('project agent chat surface respects registry-open restored conversations', () => {
  const projectAgentWorkspaceSource = readFileSync(resolve('src/features/agent/components/ProjectAgentModeWorkspace.tsx'), 'utf8')
  const chatSurfaceSource = projectAgentWorkspaceSource.match(/function ProjectAgentChatSurface[\s\S]*?return \(/)?.[0] ?? ''

  assert.match(chatSurfaceSource, /resolveAgentChatShellProfile\(providerSettings, userId, activeRegistryState\)/)
  assert.match(chatSurfaceSource, /const activeProviderProfile = activeProfile\?\.providerProfile/)
  assert.match(chatSurfaceSource, /providerInstanceId: activeProviderProfile\?\.instanceId/)
  assert.match(chatSurfaceSource, /providerProtocol: activeProviderProfile\?\.protocol/)
  assert.match(chatSurfaceSource, /selectAgentConversationRegistryRecords\(conversationsById, \{ userId, \.\.\.activeProviderIdentity \}\)/)
  assert.doesNotMatch(chatSurfaceSource, /providerInstanceId\(activeProfile\?\.provider|providerProtocol\(activeProfile\?\.provider/)
  assert.match(chatSurfaceSource, /const activeConversationOpen = !!activeConversationId[\s\S]*&& openConversations\.some\(\(record\) => record\.id === activeConversationId\)/)
  assert.match(chatSurfaceSource, /setActiveConversation\(userId, openConversations\[0\]\?\.id \?\? null, AGENT_MODE_CONVERSATION_FOCUS_SCOPE\)/)
  assert.doesNotMatch(chatSurfaceSource, /readAgentConversationOpenState|writeLastAgentModeActiveThreadId/)
})

test('project agent chat surface labels empty conversations by project selection', () => {
  const projectAgentWorkspaceSource = readFileSync(resolve('src/features/agent/components/ProjectAgentModeWorkspace.tsx'), 'utf8')
  const dataSourceShellSource = readAgentChatDataSourceShellContractSource()
  const shellCoreStateSource = readFileSync(resolve('src/features/agent/application/useAgentChatShellCoreState.ts'), 'utf8')
  const shellModelSource = readAgentChatShellModelSource()
  const unifiedShellSource = readFileSync(resolve('src/features/agent/components/AgentUnifiedChatShell.tsx'), 'utf8')
  const agentRuntimeShellSource = readFileSync(resolve('src/features/agent/components/AgentRuntimeChatShell.tsx'), 'utf8')
  const chatSurfaceSource = projectAgentWorkspaceSource.match(/function ProjectAgentChatSurface[\s\S]*?return \(/)?.[0] ?? ''

  assert.doesNotMatch(chatSurfaceSource, /const project = useProjectStore\(\(s\) => s\.current\)/)
  assert.match(chatSurfaceSource, /const emptyThreadLabel = '我们做些什么'/)
  assert.match(dataSourceShellSource, /from '@\/features\/agent\/application\/useAgentChatShellCoreState'/)
  assert.match(shellCoreStateSource, /const resolvedEmptyThreadLabel = resolveAgentChatEmptyThreadLabel\(\{[\s\S]*emptyThreadLabel,[\s\S]*selectedProjectId: selectedWorkspaceProjectId,[\s\S]*workspaceProjectOptions: composer\.workspaceProjectOptions,[\s\S]*\}\)/)
  assert.match(shellModelSource, /function resolveAgentChatEmptyThreadLabel/)
  assert.match(shellModelSource, /`我们在\$\{selectedProjectLabel\.trim\(\)\}中做些什么\？`/)
  assert.match(projectAgentWorkspaceSource, /emptyThreadLabel=\{emptyThreadLabel\}/)
  assert.match(unifiedShellSource, /emptyThreadLabel\?: string/)
  assert.match(unifiedShellSource, /emptyThreadLabel=\{props\.emptyThreadLabel\}/)
  assert.match(agentRuntimeShellSource, /emptyThreadLabel\?: string/)
  assert.match(agentRuntimeShellSource, /emptyThreadLabel=\{emptyThreadLabel\}/)
  assert.doesNotMatch(agentRuntimeShellSource, /useProjectStore/)
})

test('project agent mode project groups only render groups with open conversations', () => {
  const projectAgentSource = [
    readFileSync(resolve('src/features/agent/components/ProjectAgentModePage.tsx'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/ProjectAgentModeSidebar.tsx'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/useProjectAgentModeSidebarController.ts'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/useProjectAgentModeSidebarActions.ts'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/ProjectAgentModeSidebarView.tsx'), 'utf8'),
  ].join('\n')
  const projectAgentSidebarPartsSource = readFileSync(resolve('src/features/agent/components/ProjectAgentModeSidebarParts.tsx'), 'utf8')

  assert.match(projectAgentSource, /const visibleProjectGroups = projectGroups/)
  assert.match(projectAgentSidebarPartsSource, /if \(groups\.length === 0\) \{[\s\S]*labels\.noProjectConversations/)
  assert.doesNotMatch(projectAgentSource, /const visibleAppServerProjectGroups = appServerProjectGroups/)
  assert.doesNotMatch(projectAgentSource, /projectConversationGroupsEmpty = appServerMode \? true/)
  assert.doesNotMatch(projectAgentSource, /sourceGroups\.get\(item\.ID\) \?\? \{[\s\S]*conversations: \[\]/)
  assert.doesNotMatch(projectAgentSource, /sourceGroups\.get\(item\.ID\) \?\? \{[\s\S]*threads: \[\]/)
})

test('project agent mode agent runtime conversations use thread titles and path-first project context', () => {
  const projectAgentSource = [
    readFileSync(resolve('src/features/agent/components/ProjectAgentModePage.tsx'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/ProjectAgentModeSidebar.tsx'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/useProjectAgentModeSidebarController.ts'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/useProjectAgentModeSidebarActions.ts'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/ProjectAgentModeSidebarView.tsx'), 'utf8'),
  ].join('\n')
  const projectAgentConversationModelSource = readFileSync(resolve('src/features/agent/components/ProjectAgentModeConversationModel.ts'), 'utf8')
  const projectAgentContentPanelSource = readFileSync(resolve('src/features/agent/components/ProjectAgentContentPanel.tsx'), 'utf8')
  const projectAgentSidebarPartsSource = readFileSync(resolve('src/features/agent/components/ProjectAgentModeSidebarParts.tsx'), 'utf8')
  const projectAgentSidebarItemsSource = readFileSync(resolve('src/features/agent/components/ProjectAgentModeSidebarItems.tsx'), 'utf8')
  const hydrationSource = readFileSync(resolve('src/features/agent/application/useAgentThreadRegistryHydration.ts'), 'utf8')
  const sidebarConversationSource = `${projectAgentSidebarPartsSource}\n${projectAgentSidebarItemsSource}`
  const selectConversationSource = projectAgentSource.match(/function selectConversation\(id: string\)[\s\S]*?function archiveConversationFromSidebar/)?.[0] ?? ''
  const projectIdSource = sourceBetween(projectAgentConversationModelSource, 'function conversationProjectId(', 'export function agentRuntimeConversationIdForThread')

  assert.match(projectAgentContentPanelSource, /resolveAgentChatShellProfile\(providerSettings, userId, activeRegistryState\)/)
  assert.match(projectAgentContentPanelSource, /const activeProviderProfile = activeProfile\?\.providerProfile/)
  assert.match(projectAgentContentPanelSource, /providerInstanceId: activeProviderProfile\?\.instanceId/)
  assert.match(projectAgentContentPanelSource, /providerProtocol: activeProviderProfile\?\.protocol/)
  assert.match(projectAgentContentPanelSource, /provider: activeProfile\?\.provider/)
  assert.doesNotMatch(projectAgentContentPanelSource, /providerInstanceId\(activeProfile\?\.provider|providerProtocol\(activeProfile\?\.provider/)
  assert.match(hydrationSource, /const providerThreadCwd = thread\.cwd\?\.trim\(\)/)
  assert.match(hydrationSource, /\.\.\.\(providerThreadCwd \? \{ providerThreadCwd \} : \{\}\)/)
  assert.doesNotMatch(hydrationSource, /projectIdFromProviderSessionCwd/)
  assert.match(projectAgentContentPanelSource, /projectForAgentContentSession/)
  assert.match(projectAgentContentPanelSource, /workspace_path: input\.projectDir/)
  assert.doesNotMatch(projectAgentContentPanelSource, new RegExp('projects/project_\\\\(\\\\d\\\\+\\\\)'))
  assert.match(projectIdSource, /conversationsById: Record<string, AgentConversationRegistryRecord>/)
  assert.match(projectIdSource, /const recordProjectId = conversation\.id \? context\.conversationsById\[conversation\.id\]\?\.projectId : undefined/)
  assert.match(projectAgentSource, /getConversationTitle: \(conversation: Conversation\) => conversationDisplayTitle\(conversation, t\)/)
  assert.match(projectAgentSource, /getThreadTitle: \(thread: AgentThreadSummary\) => providerThreadTitle\(thread, t\)/)
  assert.match(sidebarConversationSource, /title=\{title\}/)
  assert.doesNotMatch(sidebarConversationSource, /description=\{threadId\}/)
  assert.match(selectConversationSource, /const conversation = conversations\.find\(\(item\) => item\.id === id\)/)
  assert.match(selectConversationSource, /conversation\?\.providerThreadId[\s\S]*conversationRecordsById\[id\]\?\.providerThreadId[\s\S]*conversationsById\[id\]\?\.providerThreadId/)
  assert.match(selectConversationSource, /const targetProvider = providerForConversation\(id\)/)
  assert.match(selectConversationSource, /const restored = await setRuntimeThreadArchived\(providerThreadId, false, targetProvider\)/)
  assert.match(selectConversationSource, /if \(!restored\) \{[\s\S]*removeProviderSessionConversation\(userId, conversationId\)[\s\S]*return[\s\S]*\}/)
  assert.match(selectConversationSource, /setNewConversationProviderId\(targetProvider\.id\)/)
  assert.match(selectConversationSource, /openAgentRuntimeThread\(\{ threadId: providerThreadId, provider: targetProvider \}\)/)
})

test('project agent mode sidebar hydrates all agent providers into one registry view', () => {
  const projectAgentSidebarSource = [
    readFileSync(resolve('src/features/agent/components/ProjectAgentModeSidebar.tsx'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/useProjectAgentModeSidebarController.ts'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/useProjectAgentModeSidebarActions.ts'), 'utf8'),
  ].join('\n')

  assert.match(projectAgentSidebarSource, /enabledProviders\(providerSettings\)\.filter\(providerSupportsAgentProfile\)/)
  assert.match(projectAgentSidebarSource, /useAgentThreadRegistryHydrations\(\{[\s\S]*providers: agentProviders/)
  assert.match(projectAgentSidebarSource, /agentRuntimeConversationRecordsFromProviderSources\(\{/)
  assert.match(projectAgentSidebarSource, /const conversationRecordsById = useMemo/)
  assert.match(projectAgentSidebarSource, /providerByIdentityKey/)
  assert.match(projectAgentSidebarSource, /providerForConversation\(id\)/)
  assert.match(projectAgentSidebarSource, /setNewConversationProviderId\(targetProvider\.id\)/)
  assert.doesNotMatch(projectAgentSidebarSource, /useAgentThreadRegistryHydration\(\{[\s\S]*provider: activeAgentProvider/)
})

test('agent chat detailed tabs and agent mode groups share registry-open conversations', () => {
  const dataSourceShellSource = readAgentChatDataSourceShellContractSource()
  const threadTabsSource = readFileSync(resolve('src/features/agent/application/useAgentChatThreadTabs.ts'), 'utf8')
  const shellModelSource = readAgentChatShellModelSource()
  const projectAgentSidebarModelSource = readFileSync(resolve('src/features/agent/components/ProjectAgentModeSidebarModel.ts'), 'utf8')
  const projectAgentSource = [
    readFileSync(resolve('src/features/agent/components/ProjectAgentModePage.tsx'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/ProjectAgentModeSidebar.tsx'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/useProjectAgentModeSidebarController.ts'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/useProjectAgentModeSidebarActions.ts'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/ProjectAgentModeSidebarView.tsx'), 'utf8'),
  ].join('\n')
  const openThreadCandidatesSource = sourceBetween(threadTabsSource, 'const openThreadCandidates = useMemo', 'const closeThreadTab = useCallback')
  const agentModeOpenConversationsSource = sourceBetween(projectAgentSource, 'const rawOpenConversations = useMemo', 'const providerSessionStatusLights')
  const conversationsByScopeSource = sourceBetween(projectAgentSource, 'const conversationsByScope = useMemo', 'const { projectGroups, chatConversations } = conversationsByScope')

  assert.match(openThreadCandidatesSource, /buildAgentChatOpenThreadCandidates\(\{[\s\S]*conversations,[\s\S]*projectId: normalizedProjectId,[\s\S]*providerIdentity,[\s\S]*sourceThreadList,[\s\S]*threads,[\s\S]*userId/)
  assert.match(shellModelSource, /export function buildAgentChatOpenThreadCandidates/)
  assert.match(shellModelSource, /record\.open !== false/)
  assert.match(shellModelSource, /!record\.archived/)
  assert.match(shellModelSource, /agentConversationRecordMatchesProviderIdentity\(record, input\.providerIdentity\)/)
  assert.match(shellModelSource, /agentChatThreadFromRegistryRecord\(record, input\.dataSource/)
  assert.match(shellModelSource, /for \(const thread of registryOpenThreads\) next\.set\(thread\.id, thread\)/)
  assert.match(shellModelSource, /for \(const thread of sourceOpenThreads\) \{[\s\S]*if \(thread\.id === input\.activeThreadId \|\| input\.openThreadIds\.has\(thread\.id\)\) next\.set\(thread\.id, thread\)/)
  assert.doesNotMatch(openThreadCandidatesSource, /record\.open !== false/)
  assert.doesNotMatch(openThreadCandidatesSource, /for \(const thread of sourceOpenThreads\)/)
  assert.match(shellModelSource, /export function agentChatThreadFromRegistryRecord/)
  assert.doesNotMatch(dataSourceShellSource, /function agentChatThreadFromRegistryRecord/)
  assert.match(dataSourceShellSource, /from '@\/features\/agent\/application\/useAgentChatThreadTabs'/)
  assert.match(dataSourceShellSource, /useAgentChatThreadTabs\(\{[\s\S]*conversations,[\s\S]*projectId: currentProject\?\.ID,[\s\S]*providerIdentity,[\s\S]*sourceThreadList,[\s\S]*threads,[\s\S]*userId,[\s\S]*\}\)/)
  assert.match(dataSourceShellSource, /useAgentChatThreadTabs\(\{[\s\S]*reorderOpenThreads,[\s\S]*\}\)/)
  assert.match(threadTabsSource, /const normalizedProjectId = useMemo\(\(\) => positiveInteger\(projectId\), \[projectId\]\)/)
  assert.match(threadTabsSource, /const reorderThreadTab = useCallback\(\(draggedId: string, targetId: string, position: 'before' \| 'after'\) => \{[\s\S]*reorderOpenThreads\(draggedId, targetId, position\)/)
  assert.match(agentModeOpenConversationsSource, /conversation\.archived !== true && conversationRecordsById\[conversation\.id\]\?\.open !== false/)
  assert.match(conversationsByScopeSource, /buildProjectAgentModeConversationScopes\(\{/)
  assert.match(projectAgentSidebarModelSource, /for \(const conversation of input\.openConversations\)/)
  assert.match(projectAgentSidebarModelSource, /const projectId = conversationProjectId\(conversation, \{[\s\S]*conversationsById/)
  assert.match(conversationsByScopeSource, /\}\), \[conversationThreadBindings, conversationRecordsById,/)
})

test('agent mode sidebar archive actions do not steal row selection clicks', () => {
  const sidebarPartsSource = readFileSync(resolve('src/features/agent/components/ProjectAgentModeSidebarParts.tsx'), 'utf8')
  const sidebarItemsSource = readFileSync(resolve('src/features/agent/components/ProjectAgentModeSidebarItems.tsx'), 'utf8')
  const sidebarCssSource = [
    readFileSync(resolve('src/features/agent/components/AgentModeUi.sidebar.css'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/AgentModeUi.sidebar-conversations.css'), 'utf8'),
  ].join('\n')

  assert.match(sidebarPartsSource, /from '@\/features\/agent\/components\/ProjectAgentModeSidebarItems'/)
  assert.match(sidebarItemsSource, /onPointerDown=\{stopRowActionPropagation\}/)
  assert.match(sidebarItemsSource, /onClick=\{\(event\) => \{[\s\S]*event\.stopPropagation\(\)[\s\S]*onArchive\?\.\(\)/)
  assert.match(sidebarItemsSource, /onClick=\{\(event\) => \{[\s\S]*event\.stopPropagation\(\)[\s\S]*onDelete\?\.\(\)/)
  assert.match(sidebarCssSource, /\.agent-mode-conversation-row \{[\s\S]*--agent-conversation-action-width: 20px;/)
  assert.match(sidebarCssSource, /\.agent-mode-conversation--with-action \{[\s\S]*padding-right: calc\(var\(--agent-conversation-action-width\) \+ 8px\);/)
})

test('agent chat pending server requests survive shell remounts without stale replay', () => {
  const dataSourceShellSource = readAgentChatDataSourceShellContractSource()
  const runtimeCacheSource = readFileSync(resolve('src/features/agent/application/agentChatRuntimeCache.ts'), 'utf8')
  const serverRequestReplaySource = readFileSync(resolve('src/features/agent/application/agentChatServerRequestReplay.ts'), 'utf8')
  const serverRequestsSource = readFileSync(resolve('src/features/agent/application/useAgentChatServerRequests.ts'), 'utf8')

  assert.match(runtimeCacheSource, /const persistentPendingServerRequests = new Map<string, AgentChatRuntimePendingServerRequest\[\]>\(\)/)
  assert.match(runtimeCacheSource, /export function storeAgentChatPersistentServerRequest/)
  assert.match(runtimeCacheSource, /export function readAgentChatPersistentServerRequests/)
  assert.match(runtimeCacheSource, /upsertAgentChatPendingServerRequest\(current, request, persistentResolve\)/)
  assert.match(dataSourceShellSource, /from '@\/features\/agent\/application\/useAgentChatServerRequests'/)
  assert.doesNotMatch(dataSourceShellSource, /const persistentPendingServerRequests = new Map<string, AgentChatRuntimePendingServerRequest\[\]>\(\)/)
  assert.doesNotMatch(dataSourceShellSource, /function storePersistentServerRequest/)
  assert.doesNotMatch(dataSourceShellSource, /const replayPersistentServerRequests = useCallback/)
  assert.match(serverRequestsSource, /const replayPersistentServerRequests = useCallback/)
  assert.match(serverRequestsSource, /type: 'updatePendingServerRequests'[\s\S]*replayAgentChatPersistentServerRequests\(\{ current, persistent: entries \}\)\.pendingServerRequests/)
  assert.match(serverRequestReplaySource, /export function replayAgentChatPersistentServerRequests/)
  assert.match(serverRequestReplaySource, /upsertAgentChatPendingServerRequest\(next, entry\.request, entry\.resolve\)/)
  assert.match(serverRequestsSource, /useEffect\(\(\) => \{[\s\S]*replayPersistentServerRequests\(\)[\s\S]*\}, \[activeThreadId, dataSource, replayPersistentServerRequests\]\)/)
  assert.match(runtimeCacheSource, /export function applyAgentChatPersistentServerRequestNotification/)
  assert.match(runtimeCacheSource, /agentChatPendingServerRequestMatchesResolvedEvent\(entry\.request, event\)/)
  assert.match(runtimeCacheSource, /dropAgentChatPersistentServerRequests\(scopeKey, \(entry\) => entry\.request\.threadId === event\.threadId\)/)
  assert.match(runtimeCacheSource, /notification\.method !== 'turn\/completed'/)
  assert.match(serverRequestsSource, /applyAgentChatPersistentServerRequestNotification\(threadScopeKey, notification\)/)
  assert.doesNotMatch(dataSourceShellSource, /setPendingServerRequests\(\(current\) => removeAgentChatPendingServerRequests\(current, \(\) => true\)\)/)
})

test('agent chat shell accepts local MovScript decision requests from generated artifacts', () => {
  const bridgeSource = readFileSync(resolve('src/features/agent/application/agentPanelBridge.ts'), 'utf8')
  const dataSourceShellSource = readAgentChatDataSourceShellContractSource()
  const serverRequestsSource = readFileSync(resolve('src/features/agent/application/useAgentChatServerRequests.ts'), 'utf8')

  assert.match(bridgeSource, /AGENT_PANEL_DECISION_REQUEST_EVENT = 'movscript:agent-panel-decision-request'/)
  assert.match(bridgeSource, /const agentPanelEventBus = createEventBus<AgentPanelEventMap>\(\)/)
  assert.doesNotMatch(bridgeSource, /pendingDecisionRequestPayloads/)
  assert.match(bridgeSource, /function openAgentPanelDecisionRequest/)
  assert.match(bridgeSource, /function consumeAgentPanelDecisionRequest/)
  assert.match(bridgeSource, /providerSessionTreeId\?: string/)
  assert.match(bridgeSource, /function normalizeAgentPanelRunSettledPayload/)
  assert.match(bridgeSource, /function agentPanelProviderSessionTreeId/)
  assert.match(bridgeSource, /agentPanelEventBus\.publishReplay\(AGENT_PANEL_DECISION_REQUEST_EVENT, payload\)/)
  assert.match(bridgeSource, /agentPanelEventBus\.consume\(AGENT_PANEL_DECISION_REQUEST_EVENT\)/)
  assert.match(bridgeSource, /function subscribeAgentPanelDecisionRequest/)
  assert.match(bridgeSource, /agentPanelEventBus\.subscribe\(AGENT_PANEL_DECISION_REQUEST_EVENT, handler\)/)
  assert.doesNotMatch(bridgeSource, /window\.dispatchEvent\(new CustomEvent<AgentPanel/)
  assert.match(dataSourceShellSource, /from '@\/features\/agent\/application\/useAgentChatServerRequests'/)
  assert.doesNotMatch(dataSourceShellSource, /subscribeAgentPanelDecisionRequest/)
  assert.doesNotMatch(dataSourceShellSource, /consumeAgentPanelDecisionRequest/)
  assert.match(serverRequestsSource, /subscribeAgentPanelDecisionRequest/)
  assert.match(serverRequestsSource, /consumeAgentPanelDecisionRequest/)
  assert.match(serverRequestsSource, /const handleLocalDecisionRequest = useCallback/)
  assert.match(serverRequestsSource, /storeAgentChatPersistentServerRequest\(threadScopeKey, request, resolve\)/)
  assert.match(serverRequestsSource, /dispatchRuntime\(\{ type: 'enqueueServerRequest', request, resolve: persistentResolve \}\)/)
  assert.match(serverRequestsSource, /return subscribeAgentPanelDecisionRequest\(\(payload\) => \{/)
  assert.doesNotMatch(dataSourceShellSource, /window\.addEventListener\(AGENT_PANEL_[A-Z_]+_EVENT/)
  assert.doesNotMatch(dataSourceShellSource, /window\.addEventListener\(AGENT_PANEL_[A-Z_]+_EVENT/)
})

test('agent chat first draft turn uses the data source that created the thread', () => {
  const dataSourceShellSource = readAgentChatDataSourceShellContractSource()
  const turnControlsSource = readFileSync(resolve('src/features/agent/application/useAgentChatTurnControls.ts'), 'utf8')
  const threadCreationSource = readFileSync(resolve('src/features/agent/application/useAgentChatThreadCreation.ts'), 'utf8')
  const startThreadSource = threadCreationSource.match(/const startThreadResult = useCallback[\s\S]*?const startWorkspaceTask = useCallback/)?.[0] ?? ''
  const sendMessageSource = turnControlsSource.match(/const sendMessage = useCallback[\s\S]*?const submitQueuedInputsAsTurn = useCallback/)?.[0] ?? ''
  const workspaceTaskSource = threadCreationSource.match(/const startWorkspaceTask = useCallback[\s\S]*?return \{/)?.[0] ?? ''

  assert.match(dataSourceShellSource, /from '@\/features\/agent\/application\/useAgentChatThreadCreation'/)
  assert.match(dataSourceShellSource, /from '@\/features\/agent\/application\/useAgentChatTurnControls'/)
  assert.match(startThreadSource, /return \{ thread, dataSource: nextDataSource \}/)
  assert.match(sendMessageSource, /let turnDataSource = dataSource/)
  assert.match(sendMessageSource, /const started = await startThreadResult\(/)
  assert.match(sendMessageSource, /turnDataSource = started\.dataSource/)
  assert.match(sendMessageSource, /await turnDataSource\.startTurn\(/)
  assert.match(sendMessageSource, /await turnDataSource\.startTextTurn\(/)
  assert.match(workspaceTaskSource, /const \{ thread, dataSource: taskDataSource \} = started/)
  assert.match(workspaceTaskSource, /await taskDataSource\.startTextTurn\(/)
})

test('agent chat shows the first user message while the thread is still being created', () => {
  const shellCoreStateSource = readFileSync(resolve('src/features/agent/application/useAgentChatShellCoreState.ts'), 'utf8')
  const dataSourceShellSource = readAgentChatDataSourceShellContractSource()
  const viewportSource = readFileSync(resolve('src/features/agent/application/useAgentChatThreadViewport.ts'), 'utf8')
  const turnControlsSource = readFileSync(resolve('src/features/agent/application/useAgentChatTurnControls.ts'), 'utf8')
  const sendMessageSource = turnControlsSource.match(/const sendMessage = useCallback[\s\S]*?const submitQueuedInputsAsTurn = useCallback/)?.[0] ?? ''
  const optimisticUpdateIndex = sendMessageSource.indexOf('setOptimisticUserItems((current) => upsertAgentChatOptimisticUserItem(current, optimisticUserItem))')
  const threadCreateIndex = sendMessageSource.indexOf('const started = await startThreadResult(')

  assert.match(shellCoreStateSource, /const \[optimisticUserItems, setOptimisticUserItems\] = useState<AgentChatRuntimeView\['visibleItems'\]>\(\[\]\)/)
  assert.match(dataSourceShellSource, /optimisticVisibleItems: setup\.optimisticUserItems/)
  assert.match(dataSourceShellSource, /useAgentChatTurnControls\(\{[\s\S]*setOptimisticUserItems,[\s\S]*\}\)/)
  assert.match(viewportSource, /optimisticVisibleItems: AgentChatRuntimeView\['visibleItems'\]/)
  assert.match(viewportSource, /mergeAgentChatViewportVisibleItems\(runtimeVisibleItems, optimisticVisibleItems\)/)
  assert.match(viewportSource, /if \(viewIds\.has\(item\.viewId\)\) continue/)
  assert.match(turnControlsSource, /agentChatVisibleThreadItemViewId\('pending', optimisticUserMessage\)/)
  assert.ok(optimisticUpdateIndex >= 0, 'missing optimistic user item update')
  assert.ok(threadCreateIndex >= 0, 'missing thread creation await')
  assert.ok(optimisticUpdateIndex < threadCreateIndex, 'optimistic user item should be visible before thread creation awaits')
  assert.match(sendMessageSource, /if \(!started\) \{[\s\S]*clearOptimisticUserItem\(\)[\s\S]*return/)
  assert.match(sendMessageSource, /dispatchRuntime\(\{[\s\S]*type: 'appendPendingUserItem'[\s\S]*clientId: clientUserMessageId/)
  assert.match(sendMessageSource, /clearOptimisticUserItem\(\)[\s\S]*if \(!firstTurnDraftControls\)/)
})

test('agent chat permission profile updates wait until a thread is loaded', () => {
  const dataSourceShellSource = readAgentChatDataSourceShellContractSource()
  const runProfileSettingsSource = readFileSync(resolve('src/features/agent/application/useAgentChatRunProfileSettings.ts'), 'utf8')
  const profileChangeSource = runProfileSettingsSource.match(/const handleProfilePresetChange = useCallback[\s\S]*?\}, \[activeThreadId/)?.[0] ?? ''

  assert.match(dataSourceShellSource, /from '@\/features\/agent\/application\/useAgentChatRunProfileSettings'/)
  assert.match(dataSourceShellSource, /useAgentChatRunProfileSettings\(\{[\s\S]*activeThreadId: setup\.activeThreadId,[\s\S]*runtimeRef: setup\.runtimeRef,[\s\S]*setProfilePresetId: setup\.setProfilePresetId,[\s\S]*\}\)/)
  assert.match(profileChangeSource, /setProfilePresetId\(nextProfilePresetId\)/)
  assert.match(profileChangeSource, /if \(!dataSource\?\.updateThreadSettings \|\| !activeThreadId \|\| activeTurn\) return/)
  assert.match(profileChangeSource, /const thread = runtimeRef\.current\.threads\.find\(\(item\) => item\.id === activeThreadId\)/)
  assert.match(profileChangeSource, /if \(!thread \|\| thread\.status === 'notLoaded'\) return/)
  assert.match(profileChangeSource, /dataSource\.updateThreadSettings/)
})

test('agent chat sends active run profile settings before starting an existing thread turn', () => {
  const turnControlsSource = readFileSync(resolve('src/features/agent/application/useAgentChatTurnControls.ts'), 'utf8')
  const sendMessageSource = turnControlsSource.match(/const sendMessage = useCallback[\s\S]*?const submitQueuedInputsAsTurn = useCallback/)?.[0] ?? ''
  const queuedTurnSource = turnControlsSource.match(/const submitQueuedInputsAsTurn = useCallback[\s\S]*?const submitQueuedInputAsTurn = useCallback/)?.[0] ?? ''

  assert.match(sendMessageSource, /await syncThreadRunProfileSettingsForTurn\(turnDataSource, thread, runProfile\)/)
  assert.match(sendMessageSource, /await turnDataSource\.startTurn\(/)
  assert.match(queuedTurnSource, /await syncThreadRunProfileSettingsForTurn\(dataSource, thread, runProfile\)/)
  assert.match(queuedTurnSource, /await dataSource\.startTurn\(/)
})

test('agent chat run profile selector remains visible during an active turn', () => {
  const shellViewSource = readFileSync(resolve('src/features/agent/components/AgentChatShellView.tsx'), 'utf8')
  const composerPropsSource = shellViewSource.match(/<AgentChatDataSourceComposerPanel[\s\S]*?showMentionTools/)?.[0] ?? ''

  assert.match(composerPropsSource, /\bshowApprovalPresetSelector\b/)
  assert.doesNotMatch(composerPropsSource, /showApprovalPresetSelector=\{!activeTurn\}/)
})

test('agent chat queued composer inputs stay editable until sent or steered', () => {
  const dataSourceShellSource = readAgentChatDataSourceShellContractSource()
  const shellViewSource = readFileSync(resolve('src/features/agent/components/AgentChatShellView.tsx'), 'utf8')
  const shellCoreStateSource = readFileSync(resolve('src/features/agent/application/useAgentChatShellCoreState.ts'), 'utf8')
  const turnControlsSource = readFileSync(resolve('src/features/agent/application/useAgentChatTurnControls.ts'), 'utf8')
  const queuedInputControlsSource = readFileSync(resolve('src/features/agent/application/useAgentChatQueuedInputControls.ts'), 'utf8')
  const dataSourceShellModelSource = [
    readAgentChatShellModelSource(),
    readFileSync(resolve('src/features/agent/presentation/agentChatQueuedInputModel.ts'), 'utf8'),
  ].join('\n')
  const composerSource = readFileSync(resolve('src/features/agent/components/AgentComposerSection.tsx'), 'utf8')
  const queuedInputPreviewSource = readFileSync(resolve('src/features/agent/components/AgentQueuedInputPreview.tsx'), 'utf8')
  const coreIndexSource = readFileSync(resolve('../../packages/core/src/agent/chat/index.ts'), 'utf8')
  const queuedInputSource = readFileSync(resolve('../../packages/core/src/agent/chat/agentChatQueuedInputs.ts'), 'utf8')

  assert.match(coreIndexSource, /export \* from '\.\/agentChatQueuedInputs\.js'/)
  assert.match(queuedInputSource, /export interface AgentChatQueuedInputPreviewItem/)
  assert.match(queuedInputSource, /export function agentChatQueuedInputSummary/)
  assert.match(dataSourceShellModelSource, /interface AgentChatQueuedInputState[\s\S]*extends AgentChatQueuedInputPreviewItem/)
  assert.match(queuedInputControlsSource, /export type AgentComposerQueuedInput = AgentChatQueuedInputState/)
  assert.match(turnControlsSource, /export type \{ AgentComposerQueuedInput \}/)
  assert.match(dataSourceShellSource, /from '@\/features\/agent\/application\/useAgentChatShellCoreState'/)
  assert.match(shellCoreStateSource, /const \[queuedInputs, setQueuedInputs\] = useState<AgentComposerQueuedInput\[\]>\(\[\]\)/)
  assert.match(dataSourceShellSource, /useAgentChatTurnControls\(\{[\s\S]*queuedInputs: setup\.queuedInputs,[\s\S]*setQueuedInputs: setup\.setQueuedInputs,[\s\S]*syncThreadRunProfileSettingsForTurn: runProfiles\.syncThreadRunProfileSettingsForTurn,[\s\S]*\}\)/)
  assert.match(turnControlsSource, /if \(activeTurn\) \{[\s\S]*setQueuedInputs\(\(current\) => \[[\s\S]*buildAgentChatQueuedInputDraft\(\{/)
  assert.match(turnControlsSource, /workspaceContext: composer\.selectedWorkspaceContext/)
  assert.match(dataSourceShellModelSource, /function buildAgentChatQueuedInputDraft/)
  assert.match(dataSourceShellModelSource, /status: 'draft'[\s\S]*error: null[\s\S]*createdAt: input\.createdAt/)
  assert.match(turnControlsSource, /useAgentChatQueuedInputControls\(\{[\s\S]*activeThread,[\s\S]*activeTurn,[\s\S]*composer,[\s\S]*queuedInputs,[\s\S]*setQueuedInputs,[\s\S]*\}\)/)
  assert.match(queuedInputControlsSource, /markAgentChatQueuedInputEditing\(current, id\)/)
  assert.match(queuedInputControlsSource, /const updateQueuedInputText = useCallback/)
  assert.match(queuedInputControlsSource, /updateAgentChatQueuedInputText\(current, id, text\)/)
  assert.match(dataSourceShellModelSource, /agentChatQueuedInputsWithText\(item\.inputs, text\)/)
  assert.match(queuedInputControlsSource, /const cancelQueuedInputEdit = useCallback/)
  assert.match(queuedInputControlsSource, /const steerQueuedInputNow = useCallback/)
  assert.match(queuedInputControlsSource, /await dataSource\.steerTurn\(\{[\s\S]*clientUserMessageId: item\.clientUserMessageId,[\s\S]*inputs: item\.inputs/)
  assert.match(turnControlsSource, /const submitQueuedInputsAsTurn = useCallback/)
  assert.match(turnControlsSource, /const submitQueuedInputAsTurn = useCallback/)
  assert.match(turnControlsSource, /resolveAgentChatGoalObjective\(\{[\s\S]*attachmentNames: composer\.composerAttachments\.map\(\(attachment\) => attachment\.name\),[\s\S]*fallback: composerPlaceholder,[\s\S]*text/)
  assert.match(dataSourceShellModelSource, /function resolveAgentChatGoalObjective/)
  assert.match(turnControlsSource, /buildAgentChatQueuedTurnSubmission\(\{[\s\S]*batchClientUserMessageId: `queued_batch_\$\{Date\.now\(\)\}`,[\s\S]*ids,[\s\S]*items: queuedInputs/)
  assert.match(dataSourceShellModelSource, /const selectedItems = input\.items[\s\S]*filter\(\(item\) => idSet\.has\(item\.id\) && item\.status === 'draft'\)[\s\S]*sort\(\(a, b\) => a\.createdAt - b\.createdAt\)/)
  assert.match(dataSourceShellModelSource, /inputs: threadItems\.flatMap\(\(item\) => item\.inputs\)/)
  assert.match(dataSourceShellModelSource, /text: threadItems\.map\(\(item\) => item\.text \|\| agentChatQueuedInputSummary\(item\)\)\.filter\(Boolean\)\.join\('\\n\\n'\)/)
  assert.match(turnControlsSource, /selectDraftAgentChatQueuedInputsForThread\(queuedInputs, activeThread\.id\)/)
  assert.match(turnControlsSource, /const stopActiveTurn = useCallback/)
  assert.match(turnControlsSource, /await dataSource\.interruptTurn/)
  assert.match(turnControlsSource, /if \(nextQueuedInputs\.length > 0\) void submitQueuedInputsAsTurn\(nextQueuedInputs\.map\(\(item\) => item\.id\)\)/)
  assert.match(dataSourceShellSource, /from '@\/features\/agent\/application\/useAgentChatEscapeKey'/)
  assert.match(dataSourceShellSource, /useAgentChatEscapeKey\(\{[\s\S]*enabled: Boolean\(setup\.activeTurn && setup\.dataSource\?\.interruptTurn && !setup\.stoppingTurn\),[\s\S]*void turnControls\.stopActiveTurn\(\)[\s\S]*\}\)/)
  assert.doesNotMatch(dataSourceShellSource, /window\.addEventListener\('keydown'/)
  assert.match(dataSourceShellSource, /buildAgentChatDataSourceShellView\(\{[\s\S]*activeTurn: setup\.activeTurn,[\s\S]*visiblePendingServerRequests: setup\.visiblePendingServerRequests,[\s\S]*\}\)/)
  assert.match(dataSourceShellSource, /composerPanel: buildAgentChatShellComposerPanel\(\{[\s\S]*queuedInputSteerEnabled: Boolean\(input\.activeTurn && input\.dataSource\?\.steerTurn\)/)
  assert.match(dataSourceShellSource, /composerPanel: buildAgentChatShellComposerPanel\(\{[\s\S]*pendingServerRequests: input\.visiblePendingServerRequests,[\s\S]*modelValue: input\.activeThreadModelValue,[\s\S]*onSend: \(nextProfilePresetId\?: AgentRunProfilePresetId\) => void input\.sendMessage\(nextProfilePresetId\)/)
  assert.match(shellViewSource, /composerPanel: AgentChatShellComposerPanelProps/)
  assert.match(shellViewSource, /pendingServerRequests=\{composerPanel\.pendingServerRequests\}/)
  assert.match(shellViewSource, /modelValue=\{composerPanel\.modelValue\}/)
  assert.match(shellViewSource, /onSend=\{composerPanel\.onSend\}/)
  assert.match(shellViewSource, /queuedInputSteerEnabled=\{composerPanel\.queuedInputSteerEnabled\}/)
  assert.match(shellViewSource, /onQueuedInputEditCancel=\{composerPanel\.queuedInputHandlers\.onEditCancel\}/)
  assert.match(shellViewSource, /onQueuedInputTextChange=\{composerPanel\.queuedInputHandlers\.onTextChange\}/)
  assert.doesNotMatch(shellViewSource, /modelValue=\{activeThreadModelValue\}/)
  assert.doesNotMatch(shellViewSource, /pendingServerRequests=\{visiblePendingServerRequests\}/)
  assert.doesNotMatch(shellViewSource, /onQueuedInputEditCancel=\{queuedInputHandlers\.onEditCancel\}/)
  assert.match(composerSource, /<AgentQueuedInputPreview/)
  assert.match(queuedInputPreviewSource, /export function AgentQueuedInputPreview/)
  assert.match(queuedInputPreviewSource, /const \[editingId, setEditingId\] = useState<string \| null>\(null\)/)
  assert.match(queuedInputPreviewSource, /aria-label="编辑等待消息内容"/)
  assert.match(queuedInputPreviewSource, /onBlur=\{\(\) => commitEditing\(item\)\}/)
  assert.match(queuedInputPreviewSource, /event\.key === 'Escape'/)
  assert.match(queuedInputPreviewSource, /event\.stopPropagation\(\)/)
  assert.match(queuedInputPreviewSource, /aria-label=\{editingId === item\.id \? '保存等待消息' : '编辑等待消息'\}/)
  assert.match(queuedInputPreviewSource, /aria-label="立即插队"/)
  assert.match(queuedInputPreviewSource, /disabled=\{editingId === item\.id \|\| !steerEnabled\}/)
  assert.match(queuedInputPreviewSource, /aria-label="删除等待消息"/)
  assert.match(queuedInputPreviewSource, /w-\[calc\(100%-32px\)\] max-w-\[680px\]/)
})

test('agent chat goal state flows from protocol to composer UI', () => {
  const uiProtocolSource = readFileSync(resolve('../../packages/core/src/agent/chat/agentChatProtocol.ts'), 'utf8')
  const goalStateSource = readFileSync(resolve('../../packages/core/src/agent/chat/agentChatGoalState.ts'), 'utf8')
  const dispatcherSource = readFileSync(resolve('../../packages/core/src/agent/chat/agentChatNotificationDispatcher.ts'), 'utf8')
  const dataSourceShellSource = readAgentChatDataSourceShellContractSource()
  const shellViewSource = readFileSync(resolve('src/features/agent/components/AgentChatShellView.tsx'), 'utf8')
  const composerSource = readFileSync(resolve('src/features/agent/components/AgentComposerSection.tsx'), 'utf8')
  const queuedInputPreviewSource = readFileSync(resolve('src/features/agent/components/AgentQueuedInputPreview.tsx'), 'utf8')

  assert.match(uiProtocolSource, /goal\?: AgentThreadGoalState \| null/)
  assert.match(goalStateSource, /export function agentThreadGoalStateFromUnknown/)
  assert.match(goalStateSource, /export function agentThreadGoalStatusLabel/)
  assert.match(dispatcherSource, /notification\.method === 'thread\/goal\/updated'[\s\S]*agentThreadGoalStateFromUnknown\(params\.goal\)[\s\S]*goal/)
  assert.match(dispatcherSource, /notification\.method === 'thread\/goal\/cleared'[\s\S]*goal: null/)
  assert.match(dataSourceShellSource, /composerPanel: buildAgentChatShellComposerPanel\(\{[\s\S]*goalState: input\.activeThread\?\.goal \?\? null/)
  assert.match(shellViewSource, /goalState=\{composerPanel\.goalState\}/)
  assert.doesNotMatch(shellViewSource, /const goalState: AgentThreadGoalState \| null = activeThread\?\.goal \?\? null/)
  assert.match(composerSource, /<AgentQueuedInputPreview[\s\S]*goal=\{goalState\}/)
  assert.match(queuedInputPreviewSource, /function AgentGoalStatusPill/)
  assert.match(queuedInputPreviewSource, /agentThreadGoalStatusLabel\(goal\.status\)/)
})

test('agent chat blocks sending and surfaces a thread notice when no runtime model is available', () => {
  const runtimeShellSource = readFileSync(resolve('src/features/agent/components/AgentRuntimeChatShell.tsx'), 'utf8')
  const dataSourceShellTypesSource = readFileSync(resolve('src/features/agent/application/agentChatDataSourceShellTypes.ts'), 'utf8')
  const dataSourceShellSource = readAgentChatDataSourceShellContractSource()
  const turnControlsSource = readFileSync(resolve('src/features/agent/application/useAgentChatTurnControls.ts'), 'utf8')
  const shellViewSource = readFileSync(resolve('src/features/agent/components/AgentChatShellView.tsx'), 'utf8')
  const composerSource = readFileSync(resolve('src/features/agent/components/AgentComposerSection.tsx'), 'utf8')

  assert.match(runtimeShellSource, /const agentModelsQuery = useQuery/)
  assert.match(runtimeShellSource, /const textModels = agentModelsQuery\.data \?\? \[\]/)
  assert.match(runtimeShellSource, /const modelUnavailableMessage = provider && !modelCatalogLoading && textModels\.length === 0/)
  assert.match(runtimeShellSource, /modelUnavailableMessage=\{modelUnavailableMessage\}/)
  assert.match(dataSourceShellTypesSource, /modelUnavailableMessage\?: string/)
  assert.match(dataSourceShellSource, /const threadError = modelUnavailableMessage \?\? setup\.error/)
  assert.match(dataSourceShellSource, /useAgentChatShellPresentationState\(\{[\s\S]*error: threadError/)
  assert.match(dataSourceShellSource, /sendDisabledReason: modelUnavailableMessage/)
  assert.match(dataSourceShellSource, /error: setup\.error/)
  assert.match(turnControlsSource, /&& !sendDisabledReason[\s\S]*&& !sending/)
  assert.match(turnControlsSource, /if \(sendDisabledReason\) \{[\s\S]*setError\(sendDisabledReason\)[\s\S]*return/)
  assert.match(shellViewSource, /sendDisabledReason=\{composerPanel\.sendDisabledReason\}/)
  assert.match(composerSource, /const canSubmit = !sendDisabledReason &&/)
  assert.match(composerSource, /if \(sendDisabledReason\) return/)
})

test('agent chat queued input summaries prefer text then attachments', async () => {
  const { agentChatQueuedInputSummary } = await import('@movscript/core/agent/chat')

  assert.equal(agentChatQueuedInputSummary({
    text: '  hello\n  world  ',
    inputs: [],
  }), 'hello world')
  assert.equal(agentChatQueuedInputSummary({
    text: '',
    inputs: [{ type: 'image', url: 'https://example.test/image.png' }],
  }), '1 attachment')
  assert.equal(agentChatQueuedInputSummary({
    text: '',
    inputs: [
      { type: 'image', url: 'https://example.test/image.png' },
      { type: 'mention', name: 'clip', path: 'resources/1' },
    ],
  }), '2 attachments')
})

function sdkProvider(input: {
  id: string
  kind: string
  runtimeId: string
  runtimeApi?: string
}): ProviderConfig {
  return {
    id: input.id,
    kind: input.kind,
    protocol: 'sdk',
    messageAdapter: 'thread-turn-item',
    label: input.kind,
    enabled: true,
    runtime: {
      id: input.runtimeId,
      api: input.runtimeApi ?? `${input.kind}-sdk`,
      label: input.runtimeId,
    },
  }
}

function readAgentChatShellModelSource(): string {
  return [
    readFileSync(resolve('src/features/agent/presentation/agentChatDataSourceShellModel.ts'), 'utf8'),
    readFileSync(resolve('src/features/agent/presentation/agentChatThreadProjectionModel.ts'), 'utf8'),
  ].join('\n')
}

function readAgentChatDataSourceShellContractSource(): string {
  return [
    readFileSync(resolve('src/features/agent/components/AgentChatDataSourceShell.tsx'), 'utf8'),
    readFileSync(resolve('src/features/agent/application/useAgentChatDataSourceShellController.ts'), 'utf8'),
    readFileSync(resolve('src/features/agent/application/useAgentChatDataSourceShellRuntimeSetup.ts'), 'utf8'),
    readFileSync(resolve('src/features/agent/application/useAgentChatRegistryActiveThreadEffect.ts'), 'utf8'),
    readFileSync(resolve('src/features/agent/application/agentChatDataSourceShellControllerView.ts'), 'utf8'),
    readFileSync(resolve('src/features/agent/application/agentChatDataSourceShellView.ts'), 'utf8'),
    readFileSync(resolve('src/features/agent/application/agentChatShellViewModels.ts'), 'utf8'),
  ].join('\n')
}
