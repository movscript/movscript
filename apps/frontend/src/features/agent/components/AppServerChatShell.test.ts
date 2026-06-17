import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  appServerThreadOpenEvent,
  appServerThreadScopeKey,
  appServerWorkspaceContextFromRoute,
} from '@/features/agent/components/AppServerChatShell'
import { resolveAgentChatShellProvider } from '@/features/agent/components/AgentUnifiedChatShell'
import type { ProviderConfig, ProviderSettings } from '@/shared/infrastructure/providerConfigStore'

function sourceFunctionBlock(source: string, functionName: string): string {
  const start = source.indexOf(`function ${functionName}(`)
  assert.ok(start >= 0, `missing function ${functionName}`)
  const bodyStart = source.indexOf('{', start)
  assert.ok(bodyStart >= 0, `missing function body for ${functionName}`)
  let depth = 0
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index]
    if (character === '{') depth += 1
    if (character === '}') {
      depth -= 1
      if (depth === 0) return source.slice(bodyStart, index + 1)
    }
  }
  assert.fail(`unterminated function ${functionName}`)
}

function sourceBetween(source: string, startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle)
  assert.ok(start >= 0, `missing source marker ${startNeedle}`)
  const end = source.indexOf(endNeedle, start)
  assert.ok(end >= 0, `missing source marker ${endNeedle}`)
  return source.slice(start, end)
}

test('app-server chat shell maps routes to MovScript workspace contexts', () => {
  assert.deepEqual(appServerWorkspaceContextFromRoute({
    pathname: '/project/agent',
    search: '',
  }), { scope: 'global' })

  assert.deepEqual(appServerWorkspaceContextFromRoute({
    projectId: 42,
    pathname: '/project/agent',
    search: '',
  }), {
    scope: 'project',
    projectId: 42,
  })

  assert.deepEqual(appServerWorkspaceContextFromRoute({
    projectId: 42,
    pathname: '/project/scripts/workbench',
    search: '?productionId=99',
  }), {
    scope: 'production',
    projectId: 42,
    productionId: 99,
  })
})

test('app-server chat shell starts unscoped until a new thread selects workspace context', () => {
  const source = readFileSync(resolve('src/features/agent/components/AppServerChatShell.tsx'), 'utf8')
  const loadDataSourceBlock = source.match(/const loadDataSource = useCallback[\s\S]*?const loadDataSourceForNewThread/)?.[0] ?? ''
  const loadDataSourceForNewThreadBlock = source.match(/const loadDataSourceForNewThread = useCallback[\s\S]*?const threadScopeKey/)?.[0] ?? ''

  assert.doesNotMatch(source, /useProjectStore/)
  assert.doesNotMatch(source, /useLocation\(\)/)
  assert.doesNotMatch(source, /function RouteAwareAppServerChatShell/)
  assert.doesNotMatch(loadDataSourceBlock, /loadScopedAppServerDataSource/)
  assert.match(loadDataSourceForNewThreadBlock, /if \(!provider \|\| !input\.workspaceContext\) return loadDataSource\(\)/)
  assert.match(loadDataSourceForNewThreadBlock, /loadScopedAppServerDataSource/)
})

test('app-server chat shell scopes thread workspace keys and events by provider instance', () => {
  const provider = appServerProvider({
    id: 'studio-primary',
    kind: 'studio-agent',
    profileId: 'studio-home',
  })
  const otherProfile = appServerProvider({
    id: 'studio-primary',
    kind: 'studio-agent',
    profileId: 'studio-sandbox',
  })

  assert.equal(
    appServerThreadScopeKey(provider),
    'movscript.studio-agent.studio-primary.studio-home.threadScope',
  )
  assert.equal(
    appServerThreadOpenEvent(provider),
    'movscript:studio-agent.studio-primary.studio-home-thread-open',
  )
  assert.notEqual(
    appServerThreadScopeKey(provider),
    appServerThreadScopeKey(otherProfile),
  )
  assert.notEqual(
    appServerThreadOpenEvent(provider),
    appServerThreadOpenEvent(otherProfile),
  )
})

test('agent chat provider resolution preserves active app-server conversations across mode switches', () => {
  const codex = appServerProvider({
    id: 'codex',
    kind: 'codex',
    profileId: 'codex-home',
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

  const resolved = resolveAgentChatShellProvider(settings, 'user_1', {
    activeConversationIdsByUser: { user_1: 'thread_1' },
    conversationsById: {
      thread_1: {
        id: 'thread_1',
        userId: 'user_1',
        provider: codex.kind,
        providerId: codex.id,
        providerInstanceId: 'codex-home',
        providerProtocol: 'app-server',
        providerThreadId: 'thread_1',
        open: true,
        archived: false,
        createdAt: 1000,
        updatedAt: 2000,
      },
    },
  })

  assert.equal(resolved.id, codex.id)
  assert.equal(resolved.kind, codex.kind)
  assert.equal(resolved.protocol, 'app-server')
  assert.equal(resolved.appServerProfile?.id, 'codex-home')
})

test('agent chat active thread state is owned by the session registry', () => {
  const appServerShellSource = readFileSync(resolve('src/features/agent/components/AppServerChatShell.tsx'), 'utf8')
  const unifiedShellSource = readFileSync(resolve('src/features/agent/components/AgentUnifiedChatShell.tsx'), 'utf8')
  const dataSourceShellSource = readFileSync(resolve('src/features/agent/components/AgentChatDataSourceShell.tsx'), 'utf8')
  const dataSourceShellTypesSource = readFileSync(resolve('src/features/agent/application/agentChatDataSourceShellTypes.ts'), 'utf8')
  const shellCoreStateSource = readFileSync(resolve('src/features/agent/application/useAgentChatShellCoreState.ts'), 'utf8')
  const dataSourceLoadEffectSource = readFileSync(resolve('src/features/agent/application/useAgentChatDataSourceLoadEffect.ts'), 'utf8')
  const threadLifecycleEffectsSource = readFileSync(resolve('src/features/agent/application/useAgentChatThreadLifecycleEffects.ts'), 'utf8')
  const runtimeCacheSource = readFileSync(resolve('src/features/agent/application/agentChatRuntimeCache.ts'), 'utf8')
  const panelCommandsSource = readFileSync(resolve('src/features/agent/application/useAgentChatPanelCommands.ts'), 'utf8')
  const threadListSource = readFileSync(resolve('src/features/agent/application/useAgentChatThreadList.ts'), 'utf8')
  const threadRuntimeEffectsSource = readFileSync(resolve('src/features/agent/application/useAgentChatThreadRuntimeEffects.ts'), 'utf8')
  const threadBootstrapSource = readFileSync(resolve('src/features/agent/application/useAgentChatThreadBootstrap.ts'), 'utf8')
  const conversationRegistrySource = readFileSync(resolve('src/features/agent/application/useAgentChatConversationRegistry.ts'), 'utf8')
  const shellModelSource = readAgentChatShellModelSource()

  assert.match(appServerShellSource, /selectActiveAgentConversationRegistryRecord/)
  assert.match(appServerShellSource, /const readActiveThreadId = useCallback\(\(\) => activeThreadId, \[activeThreadId\]\)/)
  assert.match(appServerShellSource, /readActiveThreadId=\{readActiveThreadId\}/)
  assert.match(appServerShellSource, /threadScopeKey=\{threadScopeKey\}/)
  assert.match(unifiedShellSource, /function resolveAgentChatShellProvider/)
  assert.match(unifiedShellSource, /selectActiveAgentConversationRegistryRecord/)
  assert.match(unifiedShellSource, /find\(\(provider\) => selectActiveProviderConversation\(registryState, userId, provider\)\)/)
  assert.match(dataSourceShellTypesSource, /readActiveThreadId\?: \(\) => string \| null/)
  assert.match(dataSourceShellSource, /from '@\/features\/agent\/application\/useAgentChatShellCoreState'/)
  assert.match(shellCoreStateSource, /const readCurrentActiveThreadId = useCallback/)
  assert.match(shellCoreStateSource, /const readRestorableActiveThreadId = useCallback/)
  assert.match(dataSourceShellSource, /from '@\/features\/agent\/application\/useAgentChatConversationRegistry'/)
  assert.match(dataSourceShellSource, /useAgentChatConversationRegistry\(\{[\s\S]*dispatchRuntime,[\s\S]*readCurrentActiveThreadId,[\s\S]*threadScopeKey,[\s\S]*userId,[\s\S]*\}\)/)
  assert.match(conversationRegistrySource, /const conversationPatchInputForThread = useCallback\(\(threadId: string, open: boolean\) => buildAgentChatConversationPatchInput\(\{/)
  assert.match(conversationRegistrySource, /const conversationId = store\.upsertConversation\(conversationPatchInputForThread\(threadId, true\)\)/)
  assert.match(conversationRegistrySource, /store\.setConversationOpen\(userId, conversationId, true\)/)
  assert.match(conversationRegistrySource, /store\.setActiveConversation\(userId, conversationId\)/)
  assert.match(conversationRegistrySource, /const conversationId = store\.upsertConversation\(conversationPatchInputForThread\(threadId, false\)\)/)
  assert.match(conversationRegistrySource, /store\.setConversationOpen\(userId, conversationId, false\)/)
  assert.match(conversationRegistrySource, /const providerIdentity = useMemo\(\(\) => buildAgentChatProviderIdentity\(\{/)
  assert.match(conversationRegistrySource, /buildAgentChatConversationRegistryIndex\(\{[\s\S]*records: conversations,[\s\S]*providerIdentity,[\s\S]*\}\)/)
  assert.doesNotMatch(dataSourceShellSource, /const conversationPatchInputForThread = useCallback/)
  assert.doesNotMatch(dataSourceShellSource, /buildAgentChatConversationRegistryIndex\(\{/)
  assert.match(shellModelSource, /export function buildAgentChatConversationPatchInput/)
  assert.match(shellModelSource, /export function buildAgentChatProviderIdentity/)
  assert.match(shellModelSource, /export function buildAgentChatConversationRegistryIndex/)
  assert.match(shellModelSource, /record\.open === false/)
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
  assert.match(dataSourceShellSource, /onLoadThreads=\{refreshThreadList\}/)
  assert.doesNotMatch(dataSourceShellSource, /onLoadThreads=\{loadThreads\}/)
  assert.doesNotMatch(dataSourceShellSource, /dispatchRuntime\(\{\s*type: 'setThreads'/)
  assert.match(shellCoreStateSource, /createAgentChatRuntimeState\(readRestorableActiveThreadId\(\)\)/)
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
  assert.match(conversationRegistrySource, /const workspace = store\.getConversationWorkspace\(userId, conversationId\)/)
  assert.match(conversationRegistrySource, /const emptyWorkspace = agentChatConversationWorkspaceIsEmpty\(workspace\)/)
  assert.match(conversationRegistrySource, /store\.updateConversationWorkspace\(userId, draftConversationId, workspace\)/)
  assert.match(threadBootstrapSource, /const removedEmptyConversation = clearUnavailableStoredThread\(stored\)/)
  assert.match(threadBootstrapSource, /if \(removedEmptyConversation\) setError\(errorMessage\(readError\)\)/)
  assert.match(shellModelSource, /export function agentChatConversationWorkspaceIsEmpty/)
  assert.doesNotMatch(dataSourceShellSource, /function agentChatConversationWorkspaceIsEmpty/)
  assert.doesNotMatch(dataSourceShellSource, /clearUnavailableActiveThread\(stored\)/)
  assert.doesNotMatch(appServerShellSource, /readAppServerActiveThreadId|ACTIVE_APP_SERVER_THREAD_STORAGE_KEY|appServerActiveThreadStorageKey/)
  assert.doesNotMatch(unifiedShellSource, /readAppServerActiveThreadId|window\.addEventListener\('storage'/)
  assert.doesNotMatch(dataSourceShellSource, /writeStoredActiveThreadId|readStoredActiveThreadId|agentConversationOpenOrder/)
  assert.doesNotMatch(appServerShellSource, /window\.localStorage\.(getItem|setItem|removeItem)/)
  assert.doesNotMatch(dataSourceShellSource, /window\.localStorage\.(getItem|setItem|removeItem)/)
})

test('project agent chat surface respects registry-open restored conversations', () => {
  const projectAgentWorkspaceSource = readFileSync(resolve('src/features/agent/components/ProjectAgentModeWorkspace.tsx'), 'utf8')
  const chatSurfaceSource = projectAgentWorkspaceSource.match(/function ProjectAgentChatSurface[\s\S]*?return \(/)?.[0] ?? ''

  assert.match(chatSurfaceSource, /resolveAgentChatShellProvider\(providerSettings, userId, activeRegistryState\)/)
  assert.match(chatSurfaceSource, /selectAgentConversationRegistryRecords\(conversationsById, \{ userId, \.\.\.activeProviderIdentity \}\)/)
  assert.match(chatSurfaceSource, /const activeConversationOpen = !!activeConversationId[\s\S]*&& openConversations\.some\(\(record\) => record\.id === activeConversationId\)/)
  assert.match(chatSurfaceSource, /setActiveConversation\(userId, openConversations\[0\]\?\.id \?\? null\)/)
  assert.doesNotMatch(chatSurfaceSource, /readAgentConversationOpenState|writeLastAgentModeActiveThreadId/)
})

test('project agent chat surface labels empty conversations by project selection', () => {
  const projectAgentWorkspaceSource = readFileSync(resolve('src/features/agent/components/ProjectAgentModeWorkspace.tsx'), 'utf8')
  const dataSourceShellSource = readFileSync(resolve('src/features/agent/components/AgentChatDataSourceShell.tsx'), 'utf8')
  const shellCoreStateSource = readFileSync(resolve('src/features/agent/application/useAgentChatShellCoreState.ts'), 'utf8')
  const shellModelSource = readAgentChatShellModelSource()
  const unifiedShellSource = readFileSync(resolve('src/features/agent/components/AgentUnifiedChatShell.tsx'), 'utf8')
  const appServerShellSource = readFileSync(resolve('src/features/agent/components/AppServerChatShell.tsx'), 'utf8')
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
  assert.match(appServerShellSource, /emptyThreadLabel\?: string/)
  assert.match(appServerShellSource, /emptyThreadLabel=\{emptyThreadLabel\}/)
  assert.doesNotMatch(appServerShellSource, /useProjectStore/)
})

test('project agent mode project groups only render groups with open conversations', () => {
  const projectAgentSource = [
    readFileSync(resolve('src/features/agent/components/ProjectAgentModePage.tsx'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/ProjectAgentModeSidebar.tsx'), 'utf8'),
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

test('project agent mode app-server conversations use thread titles and project ids', () => {
  const projectAgentSource = [
    readFileSync(resolve('src/features/agent/components/ProjectAgentModePage.tsx'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/ProjectAgentModeSidebar.tsx'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/ProjectAgentModeSidebarView.tsx'), 'utf8'),
  ].join('\n')
  const projectAgentConversationModelSource = readFileSync(resolve('src/features/agent/components/ProjectAgentModeConversationModel.ts'), 'utf8')
  const projectAgentContentPanelSource = readFileSync(resolve('src/features/agent/components/ProjectAgentContentPanel.tsx'), 'utf8')
  const projectAgentSidebarPartsSource = readFileSync(resolve('src/features/agent/components/ProjectAgentModeSidebarParts.tsx'), 'utf8')
  const hydrationSource = readFileSync(resolve('src/features/agent/application/useAgentThreadRegistryHydration.ts'), 'utf8')
  const sidebarConversationSource = projectAgentSidebarPartsSource
  const selectConversationSource = projectAgentSource.match(/function selectConversation\(id: string\)[\s\S]*?function archiveConversationFromSidebar/)?.[0] ?? ''
  const projectIdSource = sourceBetween(projectAgentConversationModelSource, 'function conversationProjectId(', 'function appServerConversationIdForThread')
  const cwdProjectIdSource = sourceFunctionBlock(projectAgentContentPanelSource, 'projectIdFromProviderSessionCwd')

  assert.match(hydrationSource, /const projectId = projectIdFromProviderSessionCwd\(thread\.cwd\)/)
  assert.match(hydrationSource, /\.\.\.\(projectId !== undefined \? \{ projectId \} : \{\}\)/)
  assert.match(hydrationSource, /function projectIdFromProviderSessionCwd/)
  assert.ok(cwdProjectIdSource.includes('\\.movscript\\/'))
  assert.ok(cwdProjectIdSource.includes('local|user\\/[^/]+|org\\/[^/]+'))
  assert.ok(cwdProjectIdSource.includes('?? /(?:^|\\/)'))
  assert.match(projectIdSource, /conversationsById: Record<string, AgentConversationRegistryRecord>/)
  assert.match(projectIdSource, /const recordProjectId = conversation\.id \? context\.conversationsById\[conversation\.id\]\?\.projectId : undefined/)
  assert.match(projectAgentSource, /getConversationTitle=\{\(conversation\) => conversationDisplayTitle\(conversation, t\)\}/)
  assert.match(projectAgentSource, /getThreadTitle=\{\(thread\) => providerThreadTitle\(thread, t\)\}/)
  assert.match(sidebarConversationSource, /title=\{title\}/)
  assert.doesNotMatch(sidebarConversationSource, /description=\{threadId\}/)
  assert.match(selectConversationSource, /const conversation = conversations\.find\(\(item\) => item\.id === id\)/)
  assert.match(selectConversationSource, /conversation\?\.providerThreadId[\s\S]*conversationsById\[id\]\?\.providerThreadId/)
  assert.match(selectConversationSource, /if \(appServerMode && providerThreadId\) openAppServerThread\(\{ threadId: providerThreadId, provider: activeAgentProvider \}\)/)
})

test('agent chat detailed tabs and agent mode groups share registry-open conversations', () => {
  const dataSourceShellSource = readFileSync(resolve('src/features/agent/components/AgentChatDataSourceShell.tsx'), 'utf8')
  const threadTabsSource = readFileSync(resolve('src/features/agent/application/useAgentChatThreadTabs.ts'), 'utf8')
  const shellModelSource = readAgentChatShellModelSource()
  const projectAgentSidebarModelSource = readFileSync(resolve('src/features/agent/components/ProjectAgentModeSidebarModel.ts'), 'utf8')
  const projectAgentSource = [
    readFileSync(resolve('src/features/agent/components/ProjectAgentModePage.tsx'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/ProjectAgentModeSidebar.tsx'), 'utf8'),
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
  assert.match(threadTabsSource, /const normalizedProjectId = useMemo\(\(\) => positiveInteger\(projectId\), \[projectId\]\)/)
  assert.match(agentModeOpenConversationsSource, /conversation\.archived !== true && conversationsById\[conversation\.id\]\?\.open !== false/)
  assert.match(conversationsByScopeSource, /buildProjectAgentModeConversationScopes\(\{/)
  assert.match(projectAgentSidebarModelSource, /for \(const conversation of input\.openConversations\)/)
  assert.match(projectAgentSidebarModelSource, /const projectId = conversationProjectId\(conversation, \{[\s\S]*conversationsById/)
  assert.match(conversationsByScopeSource, /\}\), \[conversationThreadBindings, conversationsById,/)
})

test('agent chat pending server requests survive shell remounts without stale replay', () => {
  const dataSourceShellSource = readFileSync(resolve('src/features/agent/components/AgentChatDataSourceShell.tsx'), 'utf8')
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
  const dataSourceShellSource = readFileSync(resolve('src/features/agent/components/AgentChatDataSourceShell.tsx'), 'utf8')
  const serverRequestsSource = readFileSync(resolve('src/features/agent/application/useAgentChatServerRequests.ts'), 'utf8')

  assert.match(bridgeSource, /AGENT_PANEL_DECISION_REQUEST_EVENT = 'movscript:agent-panel-decision-request'/)
  assert.match(bridgeSource, /const agentPanelEventBus = createEventBus<AgentPanelEventMap>\(\)/)
  assert.doesNotMatch(bridgeSource, /pendingDecisionRequestPayloads/)
  assert.match(bridgeSource, /function openAgentPanelDecisionRequest/)
  assert.match(bridgeSource, /function consumeAgentPanelDecisionRequest/)
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
  const dataSourceShellSource = readFileSync(resolve('src/features/agent/components/AgentChatDataSourceShell.tsx'), 'utf8')
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

test('agent chat permission profile updates wait until a thread is loaded', () => {
  const dataSourceShellSource = readFileSync(resolve('src/features/agent/components/AgentChatDataSourceShell.tsx'), 'utf8')
  const runProfileSettingsSource = readFileSync(resolve('src/features/agent/application/useAgentChatRunProfileSettings.ts'), 'utf8')
  const profileChangeSource = runProfileSettingsSource.match(/const handleProfilePresetChange = useCallback[\s\S]*?\}, \[activeThreadId/)?.[0] ?? ''

  assert.match(dataSourceShellSource, /from '@\/features\/agent\/application\/useAgentChatRunProfileSettings'/)
  assert.match(dataSourceShellSource, /useAgentChatRunProfileSettings\(\{[\s\S]*activeThreadId,[\s\S]*runtimeRef,[\s\S]*setProfilePresetId,[\s\S]*\}\)/)
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
  const dataSourceShellSource = readFileSync(resolve('src/features/agent/components/AgentChatDataSourceShell.tsx'), 'utf8')
  const shellViewSource = readFileSync(resolve('src/features/agent/components/AgentChatShellView.tsx'), 'utf8')
  const shellCoreStateSource = readFileSync(resolve('src/features/agent/application/useAgentChatShellCoreState.ts'), 'utf8')
  const turnControlsSource = readFileSync(resolve('src/features/agent/application/useAgentChatTurnControls.ts'), 'utf8')
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
  assert.match(turnControlsSource, /export type AgentComposerQueuedInput = AgentChatQueuedInputState/)
  assert.match(dataSourceShellSource, /from '@\/features\/agent\/application\/useAgentChatShellCoreState'/)
  assert.match(shellCoreStateSource, /const \[queuedInputs, setQueuedInputs\] = useState<AgentComposerQueuedInput\[\]>\(\[\]\)/)
  assert.match(dataSourceShellSource, /useAgentChatTurnControls\(\{[\s\S]*queuedInputs,[\s\S]*setQueuedInputs,[\s\S]*syncThreadRunProfileSettingsForTurn,[\s\S]*\}\)/)
  assert.match(turnControlsSource, /if \(activeTurn\) \{[\s\S]*setQueuedInputs\(\(current\) => \[[\s\S]*buildAgentChatQueuedInputDraft\(\{/)
  assert.match(turnControlsSource, /workspaceContext: composer\.selectedWorkspaceContext/)
  assert.match(dataSourceShellModelSource, /function buildAgentChatQueuedInputDraft/)
  assert.match(dataSourceShellModelSource, /status: 'draft'[\s\S]*error: null[\s\S]*createdAt: input\.createdAt/)
  assert.match(turnControlsSource, /markAgentChatQueuedInputEditing\(current, id\)/)
  assert.match(turnControlsSource, /const updateQueuedInputText = useCallback/)
  assert.match(turnControlsSource, /updateAgentChatQueuedInputText\(current, id, text\)/)
  assert.match(dataSourceShellModelSource, /agentChatQueuedInputsWithText\(item\.inputs, text\)/)
  assert.match(turnControlsSource, /const cancelQueuedInputEdit = useCallback/)
  assert.match(turnControlsSource, /const steerQueuedInputNow = useCallback/)
  assert.match(turnControlsSource, /await dataSource\.steerTurn\(\{[\s\S]*clientUserMessageId: item\.clientUserMessageId,[\s\S]*inputs: item\.inputs/)
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
  assert.match(dataSourceShellSource, /useAgentChatEscapeKey\(\{[\s\S]*enabled: Boolean\(activeTurn && dataSource\?\.interruptTurn && !stoppingTurn\),[\s\S]*void stopActiveTurn\(\)[\s\S]*\}\)/)
  assert.doesNotMatch(dataSourceShellSource, /window\.addEventListener\('keydown'/)
  assert.match(dataSourceShellSource, /queuedInputSteerEnabled=\{Boolean\(activeTurn && dataSource\?\.steerTurn\)\}/)
  assert.match(shellViewSource, /queuedInputSteerEnabled=\{queuedInputSteerEnabled\}/)
  assert.match(shellViewSource, /onQueuedInputEditCancel=\{queuedInputHandlers\.onEditCancel\}/)
  assert.match(shellViewSource, /onQueuedInputTextChange=\{queuedInputHandlers\.onTextChange\}/)
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
  const adapterSource = readFileSync(resolve('src/shared/infrastructure/app-server/appServerThreadTurnItemProtocolAdapter.ts'), 'utf8')
  const shellViewSource = readFileSync(resolve('src/features/agent/components/AgentChatShellView.tsx'), 'utf8')
  const composerSource = readFileSync(resolve('src/features/agent/components/AgentComposerSection.tsx'), 'utf8')
  const queuedInputPreviewSource = readFileSync(resolve('src/features/agent/components/AgentQueuedInputPreview.tsx'), 'utf8')

  assert.match(uiProtocolSource, /goal\?: AgentThreadGoalState \| null/)
  assert.match(goalStateSource, /export function agentThreadGoalStateFromUnknown/)
  assert.match(goalStateSource, /export function agentThreadGoalStatusLabel/)
  assert.match(dispatcherSource, /notification\.method === 'thread\/goal\/updated'[\s\S]*agentThreadGoalStateFromUnknown\(params\.goal\)[\s\S]*goal/)
  assert.match(dispatcherSource, /notification\.method === 'thread\/goal\/cleared'[\s\S]*goal: null/)
  assert.match(adapterSource, /goal: agentThreadGoalStateFromUnknown\(\(thread as \{ goal\?: unknown \}\)\.goal\) \?\? null/)
  assert.match(shellViewSource, /const goalState: AgentThreadGoalState \| null = activeThread\?\.goal \?\? null/)
  assert.match(shellViewSource, /goalState=\{goalState\}/)
  assert.match(composerSource, /<AgentQueuedInputPreview[\s\S]*goal=\{goalState\}/)
  assert.match(queuedInputPreviewSource, /function AgentGoalStatusPill/)
  assert.match(queuedInputPreviewSource, /agentThreadGoalStatusLabel\(goal\.status\)/)
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

function appServerProvider(input: {
  id: string
  kind: string
  profileId: string
}): ProviderConfig {
  return {
    id: input.id,
    kind: input.kind,
    protocol: 'app-server',
    messageAdapter: 'thread-turn-item',
    label: input.kind,
    enabled: true,
    appServerProfile: {
      id: input.profileId,
      label: input.profileId,
      providerKey: input.kind,
      home: `.${input.kind}`,
      lifecycle: 'movscript-owned',
    },
  }
}

function readAgentChatShellModelSource(): string {
  return [
    readFileSync(resolve('src/features/agent/presentation/agentChatDataSourceShellModel.ts'), 'utf8'),
    readFileSync(resolve('src/features/agent/presentation/agentChatThreadProjectionModel.ts'), 'utf8'),
  ].join('\n')
}
