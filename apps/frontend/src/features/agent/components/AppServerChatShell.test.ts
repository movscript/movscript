import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  appServerThreadOpenEvent,
  appServerThreadScopeKey,
  appServerWorkspaceContextFromRoute,
} from '@/features/agent/components/AppServerChatShell'
import type { ProviderConfig } from '@/shared/infrastructure/providerConfigStore'

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

test('agent chat active thread state is owned by the session registry', () => {
  const appServerShellSource = readFileSync(resolve('src/features/agent/components/AppServerChatShell.tsx'), 'utf8')
  const unifiedShellSource = readFileSync(resolve('src/features/agent/components/AgentUnifiedChatShell.tsx'), 'utf8')
  const dataSourceShellSource = readFileSync(resolve('src/features/agent/components/AgentChatDataSourceShell.tsx'), 'utf8')

  assert.match(appServerShellSource, /selectActiveAgentConversationRegistryRecord/)
  assert.match(appServerShellSource, /const readActiveThreadId = useCallback\(\(\) => activeThreadId, \[activeThreadId\]\)/)
  assert.match(appServerShellSource, /readActiveThreadId=\{readActiveThreadId\}/)
  assert.match(appServerShellSource, /threadScopeKey=\{threadScopeKey\}/)
  assert.match(unifiedShellSource, /function resolveAgentChatShellProvider/)
  assert.match(unifiedShellSource, /selectActiveAgentConversationRegistryRecord/)
  assert.match(unifiedShellSource, /find\(\(provider\) => selectActiveProviderConversation\(registryState, userId, provider\)\)/)
  assert.match(dataSourceShellSource, /readActiveThreadId\?: \(\) => string \| null/)
  assert.match(dataSourceShellSource, /const readCurrentActiveThreadId = useCallback/)
  assert.match(dataSourceShellSource, /const readRestorableActiveThreadId = useCallback/)
  assert.match(dataSourceShellSource, /useAgentSessionStore\.getState\(\)\.setActiveConversation\(userId, threadId\)/)
  assert.match(dataSourceShellSource, /useAgentSessionStore\.getState\(\)\.setConversationOpen\(userId, threadId, true\)/)
  assert.match(dataSourceShellSource, /Object\.values\(conversationsById\)[\s\S]*record\.open === false/)
  assert.match(dataSourceShellSource, /createAgentChatRuntimeState\(readRestorableActiveThreadId\(\)\)/)
  assert.match(dataSourceShellSource, /const storedThreadId = readRestorableActiveThreadId\(\)/)
  assert.match(dataSourceShellSource, /const stored = readRestorableActiveThreadId\(\)/)
  assert.match(dataSourceShellSource, /const activeThreadClosed = readCurrentActiveThreadId\(\) === threadId/)
  assert.match(dataSourceShellSource, /if \(closedThreadIds\.has\(request\.threadId\)\) \{[\s\S]*type: 'clearThreadResumeRequest'/)
  assert.match(dataSourceShellSource, /notifyAgentChatDataSourceActiveThread\(\{[\s\S]*eventName: openThreadEventName,[\s\S]*sourceId: shellInstanceIdRef\.current,[\s\S]*threadId: activeThreadId,[\s\S]*\}\)/)
  assert.match(dataSourceShellSource, /if \(detail\?\.sourceId === shellInstanceIdRef\.current\) return/)
  assert.match(dataSourceShellSource, /const candidateIds = uniqueAgentChatThreadIds\(\[[\s\S]*stored,[\s\S]*\.\.\.nextThreads\.filter\(\(thread\) => !closedThreadIds\.has\(thread\.id\)\)\.map\(\(thread\) => thread\.id\),[\s\S]*\]\)/)
  assert.match(dataSourceShellSource, /provisionalAgentChatThread\(stored, dataSource\)/)
  assert.match(dataSourceShellSource, /const clearUnavailableStoredThread = useCallback/)
  assert.match(dataSourceShellSource, /const workspace = store\.getConversationWorkspace\(userId, conversationId\)/)
  assert.match(dataSourceShellSource, /const emptyWorkspace = agentChatConversationWorkspaceIsEmpty\(workspace\)/)
  assert.match(dataSourceShellSource, /store\.updateConversationWorkspace\(userId, draftConversationId, workspace\)/)
  assert.match(dataSourceShellSource, /const removedEmptyConversation = clearUnavailableStoredThread\(candidateId\)/)
  assert.match(dataSourceShellSource, /if \(!removedEmptyConversation\) return/)
  assert.match(dataSourceShellSource, /function agentChatConversationWorkspaceIsEmpty/)
  assert.doesNotMatch(dataSourceShellSource, /clearUnavailableActiveThread\(stored\)/)
  assert.doesNotMatch(appServerShellSource, /readAppServerActiveThreadId|ACTIVE_APP_SERVER_THREAD_STORAGE_KEY|appServerActiveThreadStorageKey/)
  assert.doesNotMatch(unifiedShellSource, /readAppServerActiveThreadId|window\.addEventListener\('storage'/)
  assert.doesNotMatch(dataSourceShellSource, /writeStoredActiveThreadId|readStoredActiveThreadId|agentConversationOpenOrder/)
  assert.doesNotMatch(appServerShellSource, /window\.localStorage\.(getItem|setItem|removeItem)/)
  assert.doesNotMatch(dataSourceShellSource, /window\.localStorage\.(getItem|setItem|removeItem)/)
})

test('project agent chat surface respects registry-open restored conversations', () => {
  const projectAgentSource = readFileSync(resolve('src/features/agent/components/ProjectAgentModePage.tsx'), 'utf8')
  const chatSurfaceSource = projectAgentSource.match(/function ProjectAgentChatSurface[\s\S]*?return \(/)?.[0] ?? ''

  assert.match(chatSurfaceSource, /selectAgentConversationRegistryRecords\(conversationsById, \{ userId \}\)/)
  assert.match(chatSurfaceSource, /const activeConversationOpen = !!activeConversationId[\s\S]*&& openConversations\.some\(\(record\) => record\.id === activeConversationId\)/)
  assert.match(chatSurfaceSource, /setActiveConversation\(userId, openConversations\[0\]\?\.id \?\? null\)/)
  assert.doesNotMatch(chatSurfaceSource, /readAgentConversationOpenState|writeLastAgentModeActiveThreadId/)
})

test('project agent chat surface labels empty conversations by project selection', () => {
  const projectAgentSource = readFileSync(resolve('src/features/agent/components/ProjectAgentModePage.tsx'), 'utf8')
  const dataSourceShellSource = readFileSync(resolve('src/features/agent/components/AgentChatDataSourceShell.tsx'), 'utf8')
  const unifiedShellSource = readFileSync(resolve('src/features/agent/components/AgentUnifiedChatShell.tsx'), 'utf8')
  const appServerShellSource = readFileSync(resolve('src/features/agent/components/AppServerChatShell.tsx'), 'utf8')
  const chatSurfaceSource = projectAgentSource.match(/function ProjectAgentChatSurface[\s\S]*?return \(/)?.[0] ?? ''

  assert.doesNotMatch(chatSurfaceSource, /const project = useProjectStore\(\(s\) => s\.current\)/)
  assert.match(chatSurfaceSource, /const emptyThreadLabel = '我们做些什么'/)
  assert.match(dataSourceShellSource, /const selectedWorkspaceProjectLabel = selectedWorkspaceProjectId !== undefined/)
  assert.match(dataSourceShellSource, /const resolvedEmptyThreadLabel = selectedWorkspaceProjectLabel\?\.trim\(\)[\s\S]*\? `我们在\$\{selectedWorkspaceProjectLabel\.trim\(\)\}中做些什么\？`[\s\S]*: emptyThreadLabel/)
  assert.match(projectAgentSource, /emptyThreadLabel=\{emptyThreadLabel\}/)
  assert.match(unifiedShellSource, /emptyThreadLabel\?: string/)
  assert.match(unifiedShellSource, /emptyThreadLabel=\{props\.emptyThreadLabel\}/)
  assert.match(appServerShellSource, /emptyThreadLabel\?: string/)
  assert.match(appServerShellSource, /emptyThreadLabel=\{emptyThreadLabel\}/)
  assert.doesNotMatch(appServerShellSource, /useProjectStore/)
})

test('project agent mode project groups only render groups with open conversations', () => {
  const projectAgentSource = readFileSync(resolve('src/features/agent/components/ProjectAgentModePage.tsx'), 'utf8')

  assert.match(projectAgentSource, /const visibleProjectGroups = projectGroups/)
  assert.doesNotMatch(projectAgentSource, /const visibleAppServerProjectGroups = appServerProjectGroups/)
  assert.doesNotMatch(projectAgentSource, /sourceGroups\.get\(item\.ID\) \?\? \{[\s\S]*conversations: \[\]/)
  assert.doesNotMatch(projectAgentSource, /sourceGroups\.get\(item\.ID\) \?\? \{[\s\S]*threads: \[\]/)
})

test('agent chat pending server requests survive shell remounts without stale replay', () => {
  const dataSourceShellSource = readFileSync(resolve('src/features/agent/components/AgentChatDataSourceShell.tsx'), 'utf8')

  assert.match(dataSourceShellSource, /const persistentPendingServerRequests = new Map<string, AgentChatRuntimePendingServerRequest\[\]>\(\)/)
  assert.match(dataSourceShellSource, /function storePersistentServerRequest/)
  assert.match(dataSourceShellSource, /upsertAgentChatPendingServerRequest\(current, request, persistentResolve\)/)
  assert.match(dataSourceShellSource, /const replayPersistentServerRequests = useCallback/)
  assert.match(dataSourceShellSource, /type: 'updatePendingServerRequests'[\s\S]*upsertAgentChatPendingServerRequest\(next, entry\.request, entry\.resolve\)/)
  assert.match(dataSourceShellSource, /useEffect\(\(\) => \{[\s\S]*replayPersistentServerRequests\(\)[\s\S]*\}, \[activeThreadId, dataSource, replayPersistentServerRequests\]\)/)
  assert.match(dataSourceShellSource, /function applyPersistentServerRequestNotification/)
  assert.match(dataSourceShellSource, /agentChatPendingServerRequestMatchesResolvedEvent\(entry\.request, event\)/)
  assert.match(dataSourceShellSource, /dropPersistentServerRequests\(scopeKey, \(entry\) => entry\.request\.threadId === event\.threadId\)/)
  assert.match(dataSourceShellSource, /notification\.method !== 'turn\/completed'/)
  assert.match(dataSourceShellSource, /applyPersistentServerRequestNotification\(persistentRequestScopeKey, notification\)/)
  assert.doesNotMatch(dataSourceShellSource, /setPendingServerRequests\(\(current\) => removeAgentChatPendingServerRequests\(current, \(\) => true\)\)/)
})

test('agent chat first draft turn uses the data source that created the thread', () => {
  const dataSourceShellSource = readFileSync(resolve('src/features/agent/components/AgentChatDataSourceShell.tsx'), 'utf8')
  const startThreadSource = dataSourceShellSource.match(/const startThreadResult = useCallback[\s\S]*?const startWorkspaceTask = useCallback/)?.[0] ?? ''
  const sendMessageSource = dataSourceShellSource.match(/const sendMessage = useCallback[\s\S]*?const submitQueuedInputsAsTurn = useCallback/)?.[0] ?? ''
  const workspaceTaskSource = dataSourceShellSource.match(/const startWorkspaceTask = useCallback[\s\S]*?const handleServerRequest = useCallback/)?.[0] ?? ''

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
  const profileChangeSource = dataSourceShellSource.match(/const handleProfilePresetChange = useCallback[\s\S]*?\}, \[activeThreadId/)?.[0] ?? ''

  assert.match(profileChangeSource, /setProfilePresetId\(nextProfilePresetId\)/)
  assert.match(profileChangeSource, /if \(!dataSource\?\.updateThreadSettings \|\| !activeThreadId \|\| activeTurn\) return/)
  assert.match(profileChangeSource, /const thread = runtimeRef\.current\.threads\.find\(\(item\) => item\.id === activeThreadId\)/)
  assert.match(profileChangeSource, /if \(!thread \|\| thread\.status === 'notLoaded'\) return/)
  assert.match(profileChangeSource, /dataSource\.updateThreadSettings/)
})

test('agent chat queued composer inputs stay editable until sent or steered', () => {
  const dataSourceShellSource = readFileSync(resolve('src/features/agent/components/AgentChatDataSourceShell.tsx'), 'utf8')
  const composerSource = readFileSync(resolve('src/features/agent/components/AgentComposerSection.tsx'), 'utf8')
  const coreIndexSource = readFileSync(resolve('../../packages/core/src/agent/chat/index.ts'), 'utf8')
  const queuedInputSource = readFileSync(resolve('../../packages/core/src/agent/chat/agentChatQueuedInputs.ts'), 'utf8')

  assert.match(coreIndexSource, /export \* from '\.\/agentChatQueuedInputs\.js'/)
  assert.match(queuedInputSource, /export interface AgentChatQueuedInputPreviewItem/)
  assert.match(queuedInputSource, /export function agentChatQueuedInputSummary/)
  assert.match(dataSourceShellSource, /interface AgentComposerQueuedInput extends AgentChatQueuedInputPreviewItem/)
  assert.match(dataSourceShellSource, /const \[queuedInputs, setQueuedInputs\] = useState<AgentComposerQueuedInput\[\]>\(\[\]\)/)
  assert.match(dataSourceShellSource, /if \(activeTurn\) \{[\s\S]*setQueuedInputs\(\(current\) => \[[\s\S]*status: 'draft'/)
  assert.match(dataSourceShellSource, /workspaceContext: composer\.selectedWorkspaceContext/)
  assert.match(dataSourceShellSource, /status: 'editing'/)
  assert.match(dataSourceShellSource, /const updateQueuedInputText = useCallback/)
  assert.match(dataSourceShellSource, /agentChatQueuedInputsWithText\(candidate\.inputs, text\)/)
  assert.match(dataSourceShellSource, /const cancelQueuedInputEdit = useCallback/)
  assert.match(dataSourceShellSource, /const steerQueuedInputNow = useCallback/)
  assert.match(dataSourceShellSource, /await dataSource\.steerTurn\(\{[\s\S]*clientUserMessageId: item\.clientUserMessageId,[\s\S]*inputs: item\.inputs/)
  assert.match(dataSourceShellSource, /const submitQueuedInputsAsTurn = useCallback/)
  assert.match(dataSourceShellSource, /const submitQueuedInputAsTurn = useCallback/)
  assert.match(dataSourceShellSource, /const items = queuedInputs[\s\S]*filter\(\(candidate\) => idSet\.has\(candidate\.id\) && candidate\.status === 'draft'\)[\s\S]*sort\(\(a, b\) => a\.createdAt - b\.createdAt\)/)
  assert.match(dataSourceShellSource, /const inputs = threadItems\.flatMap\(\(item\) => item\.inputs\)/)
  assert.match(dataSourceShellSource, /const text = threadItems\.map\(\(item\) => item\.text \|\| agentChatQueuedInputSummary\(item\)\)\.filter\(Boolean\)\.join\('\\n\\n'\)/)
  assert.match(dataSourceShellSource, /const nextQueuedInputs = queuedInputs\.filter\(\(item\) => item\.threadId === activeThread\.id && item\.status === 'draft'\)/)
  assert.match(dataSourceShellSource, /const stopActiveTurn = useCallback/)
  assert.match(dataSourceShellSource, /await dataSource\.interruptTurn/)
  assert.match(dataSourceShellSource, /if \(nextQueuedInputs\.length > 0\) void submitQueuedInputsAsTurn\(nextQueuedInputs\.map\(\(item\) => item\.id\)\)/)
  assert.match(dataSourceShellSource, /function handleAgentChatEscapeKey\(event: KeyboardEvent\)/)
  assert.match(dataSourceShellSource, /event\.key !== 'Escape' \|\| event\.defaultPrevented \|\| event\.isComposing/)
  assert.match(dataSourceShellSource, /window\.addEventListener\('keydown', handleAgentChatEscapeKey\)/)
  assert.match(dataSourceShellSource, /queuedInputSteerEnabled=\{Boolean\(activeTurn && dataSource\.steerTurn\)\}/)
  assert.match(dataSourceShellSource, /onQueuedInputEditCancel=\{cancelQueuedInputEdit\}/)
  assert.match(dataSourceShellSource, /onQueuedInputTextChange=\{updateQueuedInputText\}/)
  assert.match(composerSource, /function AgentQueuedInputPreview/)
  assert.match(composerSource, /const \[editingId, setEditingId\] = useState<string \| null>\(null\)/)
  assert.match(composerSource, /aria-label="编辑等待消息内容"/)
  assert.match(composerSource, /onBlur=\{\(\) => commitEditing\(item\)\}/)
  assert.match(composerSource, /event\.key === 'Escape'/)
  assert.match(composerSource, /event\.stopPropagation\(\)/)
  assert.match(composerSource, /aria-label=\{editingId === item\.id \? '保存等待消息' : '编辑等待消息'\}/)
  assert.match(composerSource, /aria-label="立即插队"/)
  assert.match(composerSource, /disabled=\{editingId === item\.id \|\| !steerEnabled\}/)
  assert.match(composerSource, /aria-label="删除等待消息"/)
  assert.match(composerSource, /w-\[calc\(100%-32px\)\] max-w-\[680px\]/)
})

test('agent chat goal state flows from protocol to composer UI', () => {
  const uiProtocolSource = readFileSync(resolve('../../packages/core/src/agent/chat/agentChatProtocol.ts'), 'utf8')
  const goalStateSource = readFileSync(resolve('../../packages/core/src/agent/chat/agentChatGoalState.ts'), 'utf8')
  const dispatcherSource = readFileSync(resolve('../../packages/core/src/agent/chat/agentChatNotificationDispatcher.ts'), 'utf8')
  const adapterSource = readFileSync(resolve('src/shared/infrastructure/app-server/appServerThreadTurnItemProtocolAdapter.ts'), 'utf8')
  const dataSourceShellSource = readFileSync(resolve('src/features/agent/components/AgentChatDataSourceShell.tsx'), 'utf8')
  const composerSource = readFileSync(resolve('src/features/agent/components/AgentComposerSection.tsx'), 'utf8')

  assert.match(uiProtocolSource, /goal\?: AgentThreadGoalState \| null/)
  assert.match(goalStateSource, /export function agentThreadGoalStateFromUnknown/)
  assert.match(goalStateSource, /export function agentThreadGoalStatusLabel/)
  assert.match(dispatcherSource, /notification\.method === 'thread\/goal\/updated'[\s\S]*agentThreadGoalStateFromUnknown\(params\.goal\)[\s\S]*goal/)
  assert.match(dispatcherSource, /notification\.method === 'thread\/goal\/cleared'[\s\S]*goal: null/)
  assert.match(adapterSource, /goal: agentThreadGoalStateFromUnknown\(\(thread as \{ goal\?: unknown \}\)\.goal\) \?\? null/)
  assert.match(dataSourceShellSource, /goalState=\{activeThread\?\.goal \?\? null\}/)
  assert.match(composerSource, /function AgentGoalStatusPill/)
  assert.match(composerSource, /agentThreadGoalStatusLabel\(goal\.status\)/)
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
      home: `.movscript/.${input.kind}`,
      lifecycle: 'movscript-owned',
    },
  }
}
