import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const shellSource = readSource('apps/frontend/src/features/agent/components/AgentChatDataSourceShell.tsx')
const shellViewSource = readSource('apps/frontend/src/features/agent/components/AgentChatShellView.tsx')
const debugSource = readSource('apps/frontend/src/features/agent/application/agentChatShellDebug.ts')
const threadBridgeSource = readSource('apps/frontend/src/features/agent/application/agentChatThreadBridge.ts')
const editorDomSource = readSource('apps/frontend/src/features/agent/application/agentComposerEditorDom.ts')
const draftConversationSource = readSource('apps/frontend/src/features/agent/application/useAgentChatDraftConversation.ts')
const escapeKeySource = readSource('apps/frontend/src/features/agent/application/useAgentChatEscapeKey.ts')
const appServerShellSource = readSource('apps/frontend/src/features/agent/components/AppServerChatShell.tsx')
const runtimeCacheSource = readSource('apps/frontend/src/features/agent/application/agentChatRuntimeCache.ts')
const runtimeControllerSource = readSource('apps/frontend/src/features/agent/application/useAgentChatRuntimeController.ts')
const panelCommandsSource = readSource('apps/frontend/src/features/agent/application/useAgentChatPanelCommands.ts')
const recentResourcesSource = readSource('apps/frontend/src/features/agent/application/useAgentChatRecentResources.ts')
const runProfileSettingsSource = readSource('apps/frontend/src/features/agent/application/useAgentChatRunProfileSettings.ts')
const serverRequestReplaySource = readSource('apps/frontend/src/features/agent/application/agentChatServerRequestReplay.ts')
const serverRequestsSource = readSource('apps/frontend/src/features/agent/application/useAgentChatServerRequests.ts')
const dataSourceLoadEffectSource = readSource('apps/frontend/src/features/agent/application/useAgentChatDataSourceLoadEffect.ts')
const shellCoreStateSource = readSource('apps/frontend/src/features/agent/application/useAgentChatShellCoreState.ts')
const threadBootstrapSource = readSource('apps/frontend/src/features/agent/application/useAgentChatThreadBootstrap.ts')
const threadCreationSource = readSource('apps/frontend/src/features/agent/application/useAgentChatThreadCreation.ts')
const threadLifecycleEffectsSource = readSource('apps/frontend/src/features/agent/application/useAgentChatThreadLifecycleEffects.ts')
const threadListSource = readSource('apps/frontend/src/features/agent/application/useAgentChatThreadList.ts')
const threadRuntimeEffectsSource = readSource('apps/frontend/src/features/agent/application/useAgentChatThreadRuntimeEffects.ts')
const threadTabsSource = readSource('apps/frontend/src/features/agent/application/useAgentChatThreadTabs.ts')
const turnControlsSource = readSource('apps/frontend/src/features/agent/application/useAgentChatTurnControls.ts')
const conversationRegistrySource = readSource('apps/frontend/src/features/agent/application/useAgentChatConversationRegistry.ts')
const shellModelSource = [
  readSource('apps/frontend/src/features/agent/presentation/agentChatDataSourceShellModel.ts'),
  readSource('apps/frontend/src/features/agent/presentation/agentChatThreadProjectionModel.ts'),
].join('\n')
const queuedInputModelSource = readSource('apps/frontend/src/features/agent/presentation/agentChatQueuedInputModel.ts')
const shellPresentationStateSource = readSource('apps/frontend/src/features/agent/presentation/useAgentChatShellPresentationState.ts')
const shellPartsSource = readSource('apps/frontend/src/features/agent/components/AgentChatDataSourceShellParts.tsx')

test('agent chat data source shell delegates debug storage access', () => {
  assert.match(shellSource, /from '@\/features\/agent\/application\/useAgentChatThreadLifecycleEffects'/)
  assert.match(threadLifecycleEffectsSource, /from '@\/features\/agent\/application\/agentChatShellDebug'/)
  assert.doesNotMatch(shellSource, /localStorage/)
  assert.doesNotMatch(shellSource, /movscript\.debugAgentChatShell/)
  assert.doesNotMatch(shellSource, /function debugAgentChatShellLoad\(/)

  assert.match(debugSource, /AGENT_CHAT_SHELL_DEBUG_STORAGE_KEY/)
  assert.match(debugSource, /readBrowserStorageItem\('local', AGENT_CHAT_SHELL_DEBUG_STORAGE_KEY\)/)
  assert.doesNotMatch(debugSource, /window\.localStorage/)
  assert.match(debugSource, /export function debugAgentChatShellLoad\(/)
})

test('agent chat thread channel events live in the application bridge', () => {
  assert.match(shellSource, /from '@\/features\/agent\/application\/useAgentChatPanelCommands'/)
  assert.match(panelCommandsSource, /from '@\/features\/agent\/application\/agentChatThreadBridge'/)
  assert.match(panelCommandsSource, /publishAgentChatThreadOpen\(\{[\s\S]*channel: openThreadEventName,[\s\S]*sourceId,[\s\S]*threadId: activeThreadId,[\s\S]*\}\)/)
  assert.match(panelCommandsSource, /subscribeAgentChatThreadOpen\(openThreadEventName/)
  assert.match(panelCommandsSource, /if \(payload\.sourceId === sourceId\) return/)
  assert.doesNotMatch(shellSource, /from '@\/features\/agent\/application\/agentChatThreadBridge'/)
  assert.doesNotMatch(shellSource, /window\.dispatchEvent/)
  assert.doesNotMatch(shellSource, /window\.addEventListener/)
  assert.doesNotMatch(shellSource, /window\.removeEventListener/)

  assert.match(appServerShellSource, /publishAgentChatThreadOpen\(\{[\s\S]*channel: appServerThreadOpenEvent\(input\.provider\),[\s\S]*threadId: input\.threadId,[\s\S]*\}\)/)
  assert.doesNotMatch(appServerShellSource, /window\.dispatchEvent/)

  assert.match(threadBridgeSource, /createEventBus/)
  assert.match(threadBridgeSource, /export function publishAgentChatThreadOpen/)
  assert.match(threadBridgeSource, /export function subscribeAgentChatThreadOpen/)
})

test('agent chat panel command subscriptions are owned by the application layer', () => {
  assert.match(shellSource, /from '@\/features\/agent\/application\/useAgentChatPanelCommands'/)
  assert.match(shellSource, /useAgentChatPanelCommands\(\{[\s\S]*createDraftConversation,[\s\S]*openThread,[\s\S]*startWorkspaceTask,[\s\S]*\}\)/)
  assert.doesNotMatch(shellSource, /consumeAgentPanelNewConversation/)
  assert.doesNotMatch(shellSource, /consumeAgentPanelThread/)
  assert.doesNotMatch(shellSource, /consumeAgentPanelWorkspace/)
  assert.doesNotMatch(shellSource, /subscribeAgentPanelNewConversation/)
  assert.doesNotMatch(shellSource, /subscribeAgentPanelThread/)
  assert.doesNotMatch(shellSource, /subscribeAgentPanelWorkspace/)
  assert.match(panelCommandsSource, /consumeAgentPanelNewConversation/)
  assert.match(panelCommandsSource, /consumeAgentPanelThread/)
  assert.match(panelCommandsSource, /consumeAgentPanelWorkspace/)
  assert.match(panelCommandsSource, /subscribeAgentPanelNewConversation/)
  assert.match(panelCommandsSource, /subscribeAgentPanelThread/)
  assert.match(panelCommandsSource, /subscribeAgentPanelWorkspace/)
  assert.match(panelCommandsSource, /workspaceContextFromNewConversationPayload\(payload\)/)
  assert.match(panelCommandsSource, /startWorkspaceTask\(payload\)\.catch/)
})

test('agent chat escape key listener is isolated behind an application hook', () => {
  assert.match(shellSource, /from '@\/features\/agent\/application\/useAgentChatEscapeKey'/)
  assert.match(shellSource, /useAgentChatEscapeKey\(\{[\s\S]*enabled: Boolean\(activeTurn && dataSource\?\.interruptTurn && !stoppingTurn\),[\s\S]*void stopActiveTurn\(\)[\s\S]*\}\)/)
  assert.match(escapeKeySource, /from '@\/shared\/infrastructure\/windowEvents'/)
  assert.match(escapeKeySource, /listenToWindowEvent\('keydown', handleAgentChatEscapeKey\)/)
  assert.doesNotMatch(escapeKeySource, /window\.addEventListener/)
  assert.doesNotMatch(escapeKeySource, /window\.removeEventListener/)
})

test('agent chat composer editor DOM mutation is isolated in the application layer', () => {
  assert.match(shellSource, /from '@\/features\/agent\/application\/useAgentChatDraftConversation'/)
  assert.match(shellSource, /from '@\/features\/agent\/application\/useAgentChatTurnControls'/)
  assert.match(shellSource, /useAgentChatDraftConversation\(\{[\s\S]*composerInputRef,[\s\S]*setDraftConversationId,[\s\S]*threadScopeKey,[\s\S]*userId,[\s\S]*\}\)/)
  assert.match(draftConversationSource, /from '@\/features\/agent\/application\/agentComposerEditorDom'/)
  assert.match(draftConversationSource, /clearAgentChatComposerEditor\(composerInputRef\.current\)/)
  assert.match(turnControlsSource, /from '@\/features\/agent\/application\/agentComposerEditorDom'/)
  assert.match(turnControlsSource, /clearAgentChatComposerEditor\(composerInputRef\.current\)/)
  assert.doesNotMatch(shellSource, /from '@\/features\/agent\/application\/agentComposerEditorDom'/)
  assert.doesNotMatch(shellSource, /function clearAgentChatComposerEditor/)
  assert.doesNotMatch(shellSource, /new InputEvent\('input'/)
  assert.match(editorDomSource, /export function clearAgentChatComposerEditor\(/)
  assert.match(editorDomSource, /editor\.textContent = ''/)
  assert.match(editorDomSource, /new InputEvent\('input', \{ bubbles: true, inputType: 'deleteContentBackward' \}\)/)
})

test('agent chat turn controls and queued sends are owned by the application layer', () => {
  assert.match(shellSource, /from '@\/features\/agent\/application\/useAgentChatTurnControls'/)
  assert.match(shellSource, /useAgentChatTurnControls\(\{[\s\S]*activeThread,[\s\S]*composerConversationId,[\s\S]*queuedInputs,[\s\S]*syncThreadRunProfileSettingsForTurn,[\s\S]*upsertThreadReadResult,[\s\S]*\}\)/)
  assert.doesNotMatch(shellSource, /const sendMessage = useCallback/)
  assert.doesNotMatch(shellSource, /const submitQueuedInputsAsTurn = useCallback/)
  assert.doesNotMatch(shellSource, /const stopActiveTurn = useCallback/)
  assert.doesNotMatch(shellSource, /ensureAgentChatThreadReadyForTurn\(/)
  assert.doesNotMatch(shellSource, /buildAgentChatQueuedInputDraft\(/)
  assert.doesNotMatch(shellSource, /buildAgentChatQueuedTurnSubmission\(/)
  assert.doesNotMatch(shellSource, /await dataSource\.interruptTurn/)
  assert.match(turnControlsSource, /const sendMessage = useCallback/)
  assert.match(turnControlsSource, /const submitQueuedInputsAsTurn = useCallback/)
  assert.match(turnControlsSource, /const stopActiveTurn = useCallback/)
  assert.match(turnControlsSource, /ensureAgentChatThreadReadyForTurn\(/)
  assert.match(turnControlsSource, /buildAgentChatQueuedInputDraft\(/)
  assert.match(turnControlsSource, /buildAgentChatQueuedTurnSubmission\(/)
  assert.match(turnControlsSource, /await dataSource\.interruptTurn/)
})

test('agent chat runtime caches are owned by the application layer', () => {
  assert.match(serverRequestsSource, /from '@\/features\/agent\/application\/agentChatRuntimeCache'/)
  assert.match(threadListSource, /from '@\/features\/agent\/application\/agentChatRuntimeCache'/)
  assert.match(shellSource, /from '@\/features\/agent\/application\/useAgentChatRuntimeController'/)
  assert.match(shellSource, /useAgentChatRuntimeController\(\{[\s\S]*activeThreadIdRef,[\s\S]*dispatchRuntime,[\s\S]*runtime,[\s\S]*setActiveThreadIdRefValue,[\s\S]*\}\)/)
  assert.match(runtimeCacheSource, /const persistentPendingServerRequests = new Map<string/)
  assert.match(runtimeCacheSource, /const sourceThreadListCache = new Map<string/)
  assert.match(runtimeControllerSource, /export function useAgentChatRuntimeController/)
  assert.match(runtimeControllerSource, /selectAgentChatRuntimeView\(runtime\)/)
  assert.match(runtimeControllerSource, /dispatchRuntime\(\{ type: 'setActiveThreadId', threadId \}\)/)
  assert.match(runtimeControllerSource, /dispatchRuntime\(\{ type: 'upsertThread', thread \}\)/)
  assert.match(runtimeCacheSource, /export function storeAgentChatPersistentServerRequest/)
  assert.match(runtimeCacheSource, /export function readAgentChatPersistentServerRequests/)
  assert.match(runtimeCacheSource, /export function applyAgentChatPersistentServerRequestNotification/)
  assert.match(runtimeCacheSource, /export function readAgentChatSourceThreadListCache/)
  assert.match(runtimeCacheSource, /export function writeAgentChatSourceThreadListCache/)
  assert.doesNotMatch(shellSource, /const persistentPendingServerRequests = new Map<string/)
  assert.doesNotMatch(shellSource, /const sourceThreadListCache = new Map<string/)
  assert.doesNotMatch(shellSource, /function storePersistentServerRequest/)
  assert.doesNotMatch(shellSource, /function readSourceThreadListCache/)
  assert.doesNotMatch(shellSource, /function applyPersistentServerRequestNotification/)
  assert.doesNotMatch(shellSource, /selectAgentChatRuntimeView\(runtime\)/)
  assert.doesNotMatch(shellSource, /from '@\/features\/agent\/application\/agentChatRuntimeCache'/)
})

test('agent chat server request replay and decision requests are owned by the application layer', () => {
  assert.match(shellSource, /from '@\/features\/agent\/application\/useAgentChatServerRequests'/)
  assert.match(shellSource, /useAgentChatServerRequests\(\{[\s\S]*activeThreadId,[\s\S]*dataSource,[\s\S]*dispatchRuntime,[\s\S]*threadScopeKey,[\s\S]*\}\)/)
  assert.doesNotMatch(shellSource, /consumeAgentPanelDecisionRequest/)
  assert.doesNotMatch(shellSource, /subscribeAgentPanelDecisionRequest/)
  assert.doesNotMatch(shellSource, /readAgentChatPersistentServerRequests/)
  assert.doesNotMatch(shellSource, /storeAgentChatPersistentServerRequest/)
  assert.doesNotMatch(shellSource, /applyAgentChatPersistentServerRequestNotification/)
  assert.doesNotMatch(shellSource, /const replayPersistentServerRequests = useCallback/)
  assert.match(serverRequestsSource, /readAgentChatPersistentServerRequests\(threadScopeKey\)/)
  assert.match(serverRequestsSource, /from '@\/features\/agent\/application\/agentChatServerRequestReplay'/)
  assert.match(serverRequestsSource, /replayAgentChatPersistentServerRequests\(\{ current, persistent: entries \}\)\.pendingServerRequests/)
  assert.match(serverRequestReplaySource, /export function replayAgentChatPersistentServerRequests/)
  assert.match(serverRequestReplaySource, /upsertAgentChatPendingServerRequest\(next, entry\.request, entry\.resolve\)/)
  assert.match(serverRequestReplaySource, /agentChatPendingServerRequestEntryKey\(entry\)/)
  assert.match(serverRequestsSource, /storeAgentChatPersistentServerRequest\(threadScopeKey, request, resolve\)/)
  assert.match(serverRequestsSource, /subscribeAgentPanelDecisionRequest\(\(payload\) => \{/)
  assert.match(serverRequestsSource, /consumeAgentPanelDecisionRequest\(\) \?\? payload/)
  assert.match(serverRequestsSource, /applyAgentChatPersistentServerRequestNotification\(threadScopeKey, notification\)/)
  assert.match(serverRequestsSource, /type: 'enqueueServerRequest'/)
  assert.match(serverRequestsSource, /type: 'resolveServerRequest'/)
})

test('agent chat recent resources query is owned by the application layer', () => {
  assert.match(shellSource, /from '@\/features\/agent\/application\/useAgentChatShellCoreState'/)
  assert.match(shellCoreStateSource, /from '@\/features\/agent\/application\/useAgentChatRecentResources'/)
  assert.match(shellCoreStateSource, /const recentResources = useAgentChatRecentResources\(\)/)
  assert.doesNotMatch(shellSource, /useQuery/)
  assert.doesNotMatch(shellSource, /api\.get\('\/resources'/)
  assert.doesNotMatch(shellSource, /resourceKeys\.agentPanel/)
  assert.match(recentResourcesSource, /export function useAgentChatRecentResources\(\)/)
  assert.match(recentResourcesSource, /useQuery<AgentChatRecentResourcesResponse>/)
  assert.match(recentResourcesSource, /queryKey: resourceKeys\.agentPanel/)
  assert.match(recentResourcesSource, /api\.get\('\/resources'/)
  assert.match(recentResourcesSource, /Array\.isArray\(data\) \? data : \(data\?\.items \?\? \[\]\)/)
})

test('agent chat thread list cache and pagination are owned by the application layer', () => {
  assert.match(shellSource, /from '@\/features\/agent\/application\/useAgentChatThreadList'/)
  assert.match(shellSource, /useAgentChatThreadList\(\{[\s\S]*dataSource,[\s\S]*threadScopeKey,[\s\S]*\}\)/)
  assert.doesNotMatch(shellSource, /readAgentChatSourceThreadListCache/)
  assert.doesNotMatch(shellSource, /writeAgentChatSourceThreadListCache/)
  assert.doesNotMatch(shellSource, /AGENT_CHAT_THREAD_LIST_PAGE_SIZE/)
  assert.match(threadListSource, /export function useAgentChatThreadList\(/)
  assert.match(threadListSource, /readAgentChatSourceThreadListCache\(threadScopeKey\)/)
  assert.match(threadListSource, /writeAgentChatSourceThreadListCache\(threadScopeKey/)
  assert.match(threadListSource, /const AGENT_CHAT_THREAD_LIST_PAGE_SIZE = 20/)
  assert.match(threadListSource, /dataSource\.listThreads\(\{ limit: AGENT_CHAT_THREAD_LIST_PAGE_SIZE \}\)/)
  assert.match(threadListSource, /cursor: threadListNextCursor/)
  assert.match(threadListSource, /mergeAgentChatThreadListPage\(current, response\.threads\)/)
})

test('agent chat thread read and resume effects are owned by the application layer', () => {
  assert.match(shellSource, /from '@\/features\/agent\/application\/useAgentChatThreadRuntimeEffects'/)
  assert.match(shellSource, /useAgentChatThreadRuntimeEffects\(\{[\s\S]*pendingThreadReadRequests,[\s\S]*pendingThreadResumeRequests,[\s\S]*threads,[\s\S]*\}\)/)
  assert.doesNotMatch(shellSource, /inFlightThreadResumeIdsRef/)
  assert.doesNotMatch(shellSource, /type: 'beginThreadReadRequest'/)
  assert.doesNotMatch(shellSource, /type: 'completeThreadReadRequest'/)
  assert.doesNotMatch(shellSource, /type: 'beginThreadResumeRequest'/)
  assert.doesNotMatch(shellSource, /type: 'completeThreadResumeRequest'/)
  assert.match(threadRuntimeEffectsSource, /const inFlightThreadResumeIdsRef = useRef\(new Set<string>\(\)\)/)
  assert.match(threadRuntimeEffectsSource, /type: 'beginThreadReadRequest'/)
  assert.match(threadRuntimeEffectsSource, /type: 'completeThreadReadRequest'/)
  assert.match(threadRuntimeEffectsSource, /type: 'clearThreadResumeRequest'/)
  assert.match(threadRuntimeEffectsSource, /type: 'beginThreadResumeRequest'/)
  assert.match(threadRuntimeEffectsSource, /type: 'completeThreadResumeRequest'/)
  assert.match(threadRuntimeEffectsSource, /dataSource\.readThread\(request\.threadId, request\.input\)/)
  assert.match(threadRuntimeEffectsSource, /dataSource\.resumeThread\(\{/)
})

test('agent chat conversation registry mutations are owned by the application layer', () => {
  assert.match(shellSource, /from '@\/features\/agent\/application\/useAgentChatConversationRegistry'/)
  assert.match(shellSource, /useAgentChatConversationRegistry\(\{[\s\S]*dispatchRuntime,[\s\S]*readCurrentActiveThreadId,[\s\S]*threadScopeKey,[\s\S]*userId,[\s\S]*\}\)/)
  assert.doesNotMatch(shellSource, /agentConversationRegistryRecordFromChatThread/)
  assert.doesNotMatch(shellSource, /buildAgentChatConversationPatchInput\(/)
  assert.doesNotMatch(shellSource, /buildAgentChatConversationRegistryIndex\(/)
  assert.doesNotMatch(shellSource, /buildAgentChatProviderIdentity\(/)
  assert.doesNotMatch(shellSource, /removeProviderSessionConversation\(userId, threadId\)/)
  assert.match(conversationRegistrySource, /agentConversationRegistryRecordFromChatThread/)
  assert.match(conversationRegistrySource, /buildAgentChatConversationPatchInput\(/)
  assert.match(conversationRegistrySource, /buildAgentChatConversationRegistryIndex\(/)
  assert.match(conversationRegistrySource, /buildAgentChatProviderIdentity\(/)
  assert.match(conversationRegistrySource, /removeProviderSessionConversation\(userId, threadId\)/)
})

test('agent chat thread bootstrap and restore flows are owned by the application layer', () => {
  assert.match(shellSource, /from '@\/features\/agent\/application\/useAgentChatThreadBootstrap'/)
  assert.match(shellSource, /useAgentChatThreadBootstrap\(\{[\s\S]*fetchFirstThreadListPage,[\s\S]*readRestorableActiveThreadId,[\s\S]*runtimeRef,[\s\S]*upsertThreadReadResult,[\s\S]*\}\)/)
  assert.doesNotMatch(shellSource, /const loadThreads = useCallback/)
  assert.doesNotMatch(shellSource, /const restoreStoredThread = useCallback/)
  assert.doesNotMatch(shellSource, /const openThread = useCallback/)
  assert.doesNotMatch(shellSource, /selectAgentChatInitialSourceThread\(\{[\s\S]*threads: nextThreads/)
  assert.doesNotMatch(shellSource, /provisionalAgentChatThread\(stored, dataSource\)/)
  assert.match(threadBootstrapSource, /const loadThreads = useCallback/)
  assert.match(threadBootstrapSource, /const restoreStoredThread = useCallback/)
  assert.match(threadBootstrapSource, /const openThread = useCallback/)
  assert.match(threadBootstrapSource, /selectAgentChatInitialSourceThread\(\{[\s\S]*threads: nextThreads/)
  assert.match(threadBootstrapSource, /provisionalAgentChatThread\(stored, dataSource\)/)
})

test('agent chat thread creation and workspace task flows are owned by the application layer', () => {
  assert.match(shellSource, /from '@\/features\/agent\/application\/useAgentChatThreadCreation'/)
  assert.match(shellSource, /useAgentChatThreadCreation\(\{[\s\S]*loadDataSourceForNewThread,[\s\S]*selectedModelSelectionForRequest,[\s\S]*upsertThread,[\s\S]*\}\)/)
  assert.doesNotMatch(shellSource, /const startThreadResult = useCallback/)
  assert.doesNotMatch(shellSource, /const startWorkspaceTask = useCallback/)
  assert.doesNotMatch(shellSource, /beginAgentPerformanceOperation\(/)
  assert.doesNotMatch(shellSource, /notifyAgentPanelRunSettled\(/)
  assert.match(threadCreationSource, /const startThreadResult = useCallback/)
  assert.match(threadCreationSource, /const startWorkspaceTask = useCallback/)
  assert.match(threadCreationSource, /beginAgentPerformanceOperation\(/)
  assert.match(threadCreationSource, /return \{ thread, dataSource: nextDataSource \}/)
  assert.match(threadCreationSource, /notifyAgentPanelRunSettled\(/)
})

test('agent chat run profile settings sync is owned by the application layer', () => {
  assert.match(shellSource, /from '@\/features\/agent\/application\/useAgentChatRunProfileSettings'/)
  assert.match(shellSource, /useAgentChatRunProfileSettings\(\{[\s\S]*activeThreadId,[\s\S]*runtimeRef,[\s\S]*selectedModelSelectionForRequest,[\s\S]*\}\)/)
  assert.doesNotMatch(shellSource, /const handleProfilePresetChange = useCallback/)
  assert.doesNotMatch(shellSource, /const syncThreadRunProfileSettingsForTurn = useCallback/)
  assert.doesNotMatch(shellSource, /applyAgentChatThreadExecutionSettings\(/)
  assert.doesNotMatch(shellSource, /agentThreadNeedsRunProfileSettingsSync\(/)
  assert.match(runProfileSettingsSource, /const handleProfilePresetChange = useCallback/)
  assert.match(runProfileSettingsSource, /const syncThreadRunProfileSettingsForTurn = useCallback/)
  assert.match(runProfileSettingsSource, /applyAgentChatThreadExecutionSettings\(/)
  assert.match(runProfileSettingsSource, /agentThreadNeedsRunProfileSettingsSync\(/)
})

test('agent chat thread tabs and history are owned by the application layer', () => {
  assert.match(shellSource, /from '@\/features\/agent\/application\/useAgentChatThreadTabs'/)
  assert.match(shellSource, /useAgentChatThreadTabs\(\{[\s\S]*closedThreadIds,[\s\S]*readHistoryThread,[\s\S]*threadOrderIndex,[\s\S]*upsertThreadReadResult,[\s\S]*\}\)/)
  assert.doesNotMatch(shellSource, /const openThreadCandidates = useMemo/)
  assert.doesNotMatch(shellSource, /const closeThreadTab = useCallback/)
  assert.doesNotMatch(shellSource, /const renameThread = useCallback/)
  assert.doesNotMatch(shellSource, /buildAgentChatOpenThreadCandidates\(/)
  assert.doesNotMatch(shellSource, /resolveAgentChatNextThreadAfterClose\(/)
  assert.match(threadTabsSource, /const openThreadCandidates = useMemo/)
  assert.match(threadTabsSource, /const closeThreadTab = useCallback/)
  assert.match(threadTabsSource, /const renameThread = useCallback/)
  assert.match(threadTabsSource, /buildAgentChatOpenThreadCandidates\(/)
  assert.match(threadTabsSource, /resolveAgentChatNextThreadAfterClose\(/)
  assert.match(threadTabsSource, /selectAgentChatClosedHistoryThreads\(/)
})

test('agent chat data source shell delegates pure model helpers', () => {
  const shellModelConsumerSource = [
    shellCoreStateSource,
    dataSourceLoadEffectSource,
    shellPresentationStateSource,
    threadListSource,
  ].join('\n')
  assert.match(shellSource, /from '@\/features\/agent\/application\/useAgentChatShellCoreState'/)
  assert.match(shellSource, /from '@\/features\/agent\/presentation\/useAgentChatShellPresentationState'/)
  assert.doesNotMatch(shellSource, /from '@\/features\/agent\/presentation\/agentChatDataSourceShellModel'/)
  assert.match(shellModelConsumerSource, /from '@\/features\/agent\/presentation\/agentChatDataSourceShellModel'/)
  const queuedInputHelperNames = new Set([
    'resolveAgentChatGoalObjective',
    'agentChatQueuedInputsWithText',
    'removeAgentChatQueuedInput',
    'markAgentChatQueuedInputEditing',
    'updateAgentChatQueuedInputText',
    'cancelAgentChatQueuedInputEdit',
    'markAgentChatQueuedInputsSending',
    'failAgentChatQueuedInputs',
    'removeAgentChatQueuedInputs',
    'selectDraftAgentChatQueuedInputsForThread',
    'buildAgentChatQueuedInputDraft',
    'buildAgentChatQueuedTurnSubmission',
  ])
  for (const helperName of [
    'agentChatComposerConversationId',
    'createAgentChatDraftConversationId',
    'agentChatSourceThreadHasContent',
    'selectAgentChatInitialSourceThread',
    'agentConversationRecordMatchesProviderIdentity',
    'buildAgentChatProviderIdentity',
    'buildAgentChatConversationPatchInput',
    'buildAgentChatDraftThreadControlOptions',
    'resolveAgentChatEmptyThreadLabel',
    'resolveAgentChatGoalObjective',
    'applyAgentChatThreadExecutionSettings',
    'buildAgentChatConversationRegistryIndex',
    'buildAgentChatOpenThreadCandidates',
    'buildAgentChatModelSelectionForRequest',
    'buildAgentChatThreadTabs',
    'resolveAgentChatActiveModelValue',
    'updateAgentChatThreadModelOverrides',
    'agentChatQueuedInputsWithText',
    'removeAgentChatQueuedInput',
    'markAgentChatQueuedInputEditing',
    'updateAgentChatQueuedInputText',
    'cancelAgentChatQueuedInputEdit',
    'markAgentChatQueuedInputsSending',
    'failAgentChatQueuedInputs',
    'removeAgentChatQueuedInputs',
    'selectDraftAgentChatQueuedInputsForThread',
    'buildAgentChatQueuedInputDraft',
    'buildAgentChatQueuedTurnSubmission',
    'workspaceContextFromNewConversationPayload',
    'agentRunProfilePresetIdFromExecutionSettings',
    'agentThreadNeedsRunProfileSettingsSync',
    'isUnavailableThreadReadError',
    'mergeAgentChatThreadListPage',
    'agentChatThreadFromRegistryRecord',
    'provisionalAgentChatThread',
    'agentChatThreadProviderSessionState',
    'resolveAgentChatNextThreadAfterClose',
    'selectAgentChatClosedHistoryThreads',
  ]) {
    if (queuedInputHelperNames.has(helperName)) {
      assert.match(shellModelSource, new RegExp(`\\b${helperName}\\b`))
      assert.match(queuedInputModelSource, new RegExp(`export function ${helperName}\\b`))
    } else {
      assert.match(shellModelSource, new RegExp(`export function ${helperName}\\b`))
    }
    assert.doesNotMatch(shellSource, new RegExp(`function ${helperName}\\b`))
  }
  assert.match(shellModelSource, /from '@\/features\/agent\/presentation\/agentChatQueuedInputModel'/)
  assert.match(queuedInputModelSource, /export interface AgentChatQueuedInputState/)
  assert.doesNotMatch(shellSource, /record\.userId === userId && record\.open === false/)
  assert.doesNotMatch(shellSource, /record\.userId === userId && record\.open !== false && agentConversationRecordMatchesProviderIdentity/)
  assert.doesNotMatch(shellSource, /\.sort\(\(a, b\) => b\.updatedAt - a\.updatedAt\)/)
  assert.doesNotMatch(shellSource, /modelOptions\.find\(\(model\) => model\.id === selectedModelId\)/)
  assert.doesNotMatch(shellSource, /modelOptions\.find\(\(option\) => publicModelId\(option\) === model\)/)
  assert.doesNotMatch(shellSource, /next\[activeThreadId\] = publicModelId\(model\)/)
  assert.doesNotMatch(shellSource, /workspaceProjectOptions\.find\(\(option\) => option\.value === String\(selectedWorkspaceProjectId\)\)/)
  assert.doesNotMatch(shellSource, /我们在\$\{selectedWorkspaceProjectLabel\.trim\(\)\}中做些什么/)
  assert.doesNotMatch(shellSource, /Math\.max\(item\.updatedAt, Math\.floor\(Date\.now\(\) \/ 1000\)\)/)
  assert.doesNotMatch(shellSource, /function draftThreadControlOptions/)
  assert.doesNotMatch(shellSource, /candidate\.id === id[\s\S]{0,120}status: 'editing'/)
  assert.doesNotMatch(shellSource, /candidate\.id === id[\s\S]{0,120}status: 'failed'/)
  assert.doesNotMatch(shellSource, /sendingIds\.has\(candidate\.id\)[\s\S]{0,120}status: 'sending'/)
  assert.doesNotMatch(shellSource, /item\.threadId === activeThread\.id && item\.status === 'draft'/)
  assert.doesNotMatch(shellSource, /idSet\.has\(candidate\.id\) && candidate\.status === 'draft'/)
  assert.doesNotMatch(shellSource, /threadItems\.flatMap\(\(item\) => item\.inputs\)/)
  assert.doesNotMatch(shellSource, /agentChatQueuedInputSummary\(item\)/)
  assert.doesNotMatch(shellSource, /composer\.composerAttachments\.map\(\(attachment\) => attachment\.name\)\.filter\(Boolean\)\.join\(', '\)/)
  assert.doesNotMatch(shellSource, /status: 'draft',[\s\S]{0,80}error: null,[\s\S]{0,80}createdAt: Date\.now\(\)/)
  assert.doesNotMatch(shellSource, /const sourceOpenThreads = useMemo/)
  assert.doesNotMatch(shellSource, /const registryOpenThreads = useMemo/)
  assert.doesNotMatch(shellSource, /record\.providerThreadId\.trim\(\)[\s\S]{0,160}record\.open !== false/)
  assert.doesNotMatch(shellSource, /const closingIndex = openThreads\.findIndex/)
  assert.doesNotMatch(shellSource, /remainingThreads\[Math\.max\(0, closingIndex - 1\)\]/)
  assert.doesNotMatch(shellSource, /threadOrderIndex\.get\(a\.thread\.id\)/)
  assert.doesNotMatch(shellSource, /messageCount: thread\.turns\.reduce/)
  assert.doesNotMatch(shellSource, /nextThreads\.find\(\(thread\) => agentChatSourceThreadHasContent\(thread\) && !closedThreadIds\.has\(thread\.id\)\)/)
  assert.doesNotMatch(shellSource, /providerId\?\.trim\(\) \? \{ providerId: providerId\.trim\(\) \}/)
  assert.doesNotMatch(shellSource, /providerInstanceId\?\.trim\(\) \? \{ providerInstanceId: providerInstanceId\.trim\(\) \}/)
  assert.doesNotMatch(shellSource, /providerThreadId: threadId,[\s\S]{0,120}archived: false,[\s\S]{0,120}updatedAt: Date\.now\(\)/)
})

test('agent chat data source shell delegates view sections', () => {
  assert.match(shellSource, /from '@\/features\/agent\/components\/AgentChatShellView'/)
  assert.match(shellSource, /<AgentChatShellView[\s\S]*activeThread=\{activeThread\}[\s\S]*visiblePendingServerRequests=\{visiblePendingServerRequests\}/)
  assert.match(shellViewSource, /from '@\/features\/agent\/components\/AgentChatDataSourceShellParts'/)
  for (const componentName of [
    'AgentChatDataSourcePanelCard',
    'AgentChatDataSourceComposerPanel',
    'AgentChatDataSourcePageThreadShell',
    'AgentChatDataSourceThreadBody',
    'AgentChatDataSourceHistoryPanel',
    'AgentComposerActionLayer',
  ]) {
    assert.match(shellPartsSource, new RegExp(`export function ${componentName}\\b`))
    assert.doesNotMatch(shellSource, new RegExp(`function ${componentName}\\b`))
  }
  assert.match(shellViewSource, /<AgentChatDataSourcePanelCard/)
  assert.match(shellViewSource, /<AgentChatDataSourceComposerPanel/)
  assert.match(shellViewSource, /<AgentChatDataSourcePageThreadShell/)
  assert.match(shellViewSource, /<AgentChatDataSourceHistoryPanel/)

  assert.match(shellPartsSource, /AgentChatThreadItemView/)
  assert.match(shellPartsSource, /AgentChatServerRequestCard/)
  assert.match(shellPartsSource, /AgentConversationItem/)
  assert.match(shellPartsSource, /AgentConversationTabsPanel/)
  assert.match(shellPartsSource, /ProviderControls/)
  assert.match(shellPartsSource, /AgentHeader/)
  assert.match(shellPartsSource, /AgentComposerSection/)
  assert.doesNotMatch(shellSource, /AgentChatThreadItemView/)
  assert.doesNotMatch(shellSource, /AgentChatServerRequestCard/)
  assert.doesNotMatch(shellSource, /AgentConversationItem/)
  assert.doesNotMatch(shellSource, /AgentConversationTabsPanel/)
  assert.doesNotMatch(shellSource, /ProviderControls/)
  assert.doesNotMatch(shellSource, /AgentHeader/)
  assert.doesNotMatch(shellSource, /AgentComposerSection/)
  assert.doesNotMatch(shellSource, /agent-page-chat-thread-shell/)
  assert.doesNotMatch(shellSource, /agent-page-chat-empty-title/)
})

function readSource(path) {
  return readFileSync(resolve(path), 'utf8')
}
