import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  ACTIVE_APP_SERVER_THREAD_STORAGE_KEY,
  appServerActiveThreadStorageKey,
  appServerThreadOpenEvent,
  appServerWorkspaceContextFromRoute,
  readAppServerActiveThreadId,
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

test('app-server dock panel stays independent from route location updates', () => {
  const source = readFileSync(resolve('src/features/agent/components/AppServerChatShell.tsx'), 'utf8')
  const shellEntry = source.match(/export function AppServerChatShell[\s\S]*?function RouteAwareAppServerChatShell/)?.[0] ?? ''

  assert.match(shellEntry, /surface === 'page'/)
  assert.match(shellEntry, /appServerProjectWorkspaceContext\(project\?\.ID\)/)
  assert.doesNotMatch(shellEntry, /useLocation\(\)/)
  assert.match(source, /function RouteAwareAppServerChatShell[\s\S]*useLocation\(\)/)
})

test('app-server chat shell scopes active thread keys by provider instance', () => {
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
    appServerActiveThreadStorageKey(provider),
    'movscript.studio-agent.studio-primary.studio-home.activeThreadId',
  )
  assert.equal(
    appServerThreadOpenEvent(provider),
    'movscript:studio-agent.studio-primary.studio-home-thread-open',
  )
  assert.notEqual(
    appServerActiveThreadStorageKey(provider),
    appServerActiveThreadStorageKey(otherProfile),
  )
  assert.notEqual(
    appServerThreadOpenEvent(provider),
    appServerThreadOpenEvent(otherProfile),
  )
})

test('app-server chat shell recovers active threads from provider compatibility keys', () => {
  const provider = appServerProvider({
    id: 'studio-primary',
    kind: 'studio-agent',
    profileId: 'studio-home',
  })
  const storage = new Map<string, string>()
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    },
  })

  try {
    storage.set('movscript.studio-agent.studio-primary.activeThreadId', 'thread_compat')
    assert.equal(readAppServerActiveThreadId(provider), 'thread_compat')

    storage.set(appServerActiveThreadStorageKey(provider), 'thread_current')
    assert.equal(readAppServerActiveThreadId(provider), 'thread_current')

    storage.delete(appServerActiveThreadStorageKey(provider))
    storage.delete('movscript.studio-agent.studio-primary.activeThreadId')
    storage.set(ACTIVE_APP_SERVER_THREAD_STORAGE_KEY, 'thread_global')
    assert.equal(readAppServerActiveThreadId(provider), 'thread_global')
  } finally {
    if (previousWindow) {
      Object.defineProperty(globalThis, 'window', previousWindow)
    } else {
      Reflect.deleteProperty(globalThis, 'window')
    }
  }
})

test('agent chat active thread storage is owned by the presentation helper', () => {
  const appServerShellSource = readFileSync(resolve('src/features/agent/components/AppServerChatShell.tsx'), 'utf8')
  const unifiedShellSource = readFileSync(resolve('src/features/agent/components/AgentUnifiedChatShell.tsx'), 'utf8')
  const dataSourceShellSource = readFileSync(resolve('src/features/agent/components/AgentChatDataSourceShell.tsx'), 'utf8')
  const storageSource = readFileSync(resolve('src/features/agent/presentation/agentActiveThreadStorage.ts'), 'utf8')

  assert.match(storageSource, /export function readStoredActiveThreadId/)
  assert.match(storageSource, /export function writeStoredActiveThreadId/)
  assert.match(storageSource, /window\.localStorage\.getItem\(storageKey\)/)
  assert.match(appServerShellSource, /const readActiveThreadId = useCallback\(\(\) => readAppServerActiveThreadId\(provider\), \[provider\]\)/)
  assert.match(appServerShellSource, /readActiveThreadId=\{readActiveThreadId\}/)
  assert.match(unifiedShellSource, /function resolveAgentChatShellProvider/)
  assert.match(unifiedShellSource, /readAppServerActiveThreadId\(selectedProvider\)/)
  assert.match(unifiedShellSource, /find\(\(provider\) => readAppServerActiveThreadId\(provider\)\)/)
  assert.match(unifiedShellSource, /window\.addEventListener\(appServerThreadOpenEvent\(provider\), handleActiveThreadChanged\)/)
  assert.match(dataSourceShellSource, /AGENT_CONVERSATION_OPEN_STATE_CHANGED_EVENT/)
  assert.match(dataSourceShellSource, /readActiveThreadId\?: \(\) => string \| null/)
  assert.match(dataSourceShellSource, /const readCurrentActiveThreadId = useCallback/)
  assert.match(dataSourceShellSource, /const readRestorableActiveThreadId = useCallback/)
  assert.match(dataSourceShellSource, /closedAgentConversationIds\(readAgentConversationOpenState\(userId\)\)\.includes\(threadId\)/)
  assert.match(dataSourceShellSource, /createAgentChatRuntimeState\(readRestorableActiveThreadId\(\)\)/)
  assert.match(dataSourceShellSource, /const storedThreadId = readRestorableActiveThreadId\(\)/)
  assert.match(dataSourceShellSource, /const stored = readRestorableActiveThreadId\(\)/)
  assert.match(dataSourceShellSource, /writeStoredActiveThreadId\(activeThreadStorageKey, activeThreadId\)/)
  assert.match(dataSourceShellSource, /const activeThreadClosed = readCurrentActiveThreadId\(\) === threadId/)
  assert.match(dataSourceShellSource, /if \(closedThreadIds\.has\(request\.threadId\)\) \{[\s\S]*type: 'clearThreadResumeRequest'/)
  assert.match(dataSourceShellSource, /notifyAgentChatDataSourceActiveThread\(\{[\s\S]*eventName: openThreadEventName,[\s\S]*sourceId: shellInstanceIdRef\.current,[\s\S]*threadId: activeThreadId,[\s\S]*\}\)/)
  assert.match(dataSourceShellSource, /if \(detail\?\.sourceId === shellInstanceIdRef\.current\) return/)
  assert.match(dataSourceShellSource, /const candidateIds = uniqueAgentChatThreadIds\(\[[\s\S]*stored,[\s\S]*\.\.\.nextThreads\.filter\(\(thread\) => !closedThreadIds\.has\(thread\.id\)\)\.map\(\(thread\) => thread\.id\),[\s\S]*\]\)/)
  assert.match(dataSourceShellSource, /provisionalAgentChatThread\(stored, dataSource\)/)
  assert.doesNotMatch(dataSourceShellSource, /clearUnavailableActiveThread\(stored\)/)
  assert.doesNotMatch(appServerShellSource, /window\.localStorage\.(getItem|setItem|removeItem)/)
  assert.doesNotMatch(dataSourceShellSource, /window\.localStorage\.(getItem|setItem|removeItem)/)
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
  assert.match(dataSourceShellSource, /const submitQueuedInputAsTurn = useCallback/)
  assert.match(dataSourceShellSource, /queuedInputs\.find\(\(item\) => item\.threadId === activeThread\.id && item\.status === 'draft'\)/)
  assert.match(dataSourceShellSource, /queuedInputSteerEnabled=\{Boolean\(activeTurn && dataSource\.steerTurn\)\}/)
  assert.match(dataSourceShellSource, /onQueuedInputEditCancel=\{cancelQueuedInputEdit\}/)
  assert.match(dataSourceShellSource, /onQueuedInputTextChange=\{updateQueuedInputText\}/)
  assert.match(composerSource, /function AgentQueuedInputPreview/)
  assert.match(composerSource, /const \[editingId, setEditingId\] = useState<string \| null>\(null\)/)
  assert.match(composerSource, /aria-label="编辑等待消息内容"/)
  assert.match(composerSource, /onBlur=\{\(\) => commitEditing\(item\)\}/)
  assert.match(composerSource, /event\.key === 'Escape'/)
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
