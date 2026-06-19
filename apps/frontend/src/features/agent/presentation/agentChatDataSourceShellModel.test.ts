import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyAgentChatThreadExecutionSettings,
  agentChatThreadFromRegistryRecord,
  agentConversationUsesProviderSession,
  buildAgentChatConversationPatchInput,
  buildAgentChatDraftThreadControlOptions,
  buildAgentChatModelSelectionForRequest,
  buildAgentChatConversationRegistryIndex,
  buildAgentChatOpenThreadCandidates,
  buildAgentChatProviderIdentity,
  buildAgentChatQueuedInputDraft,
  buildAgentChatQueuedTurnSubmission,
  buildAgentChatThreadTabs,
  cancelAgentChatQueuedInputEdit,
  failAgentChatQueuedInputs,
  markAgentChatQueuedInputEditing,
  markAgentChatQueuedInputsSending,
  removeAgentChatQueuedInput,
  removeAgentChatQueuedInputs,
  resolveAgentChatActiveModelValue,
  resolveAgentChatEmptyThreadLabel,
  resolveAgentChatGoalObjective,
  resolveAgentChatNextThreadAfterClose,
  provisionalAgentChatThread,
  selectAgentChatInitialSourceThread,
  selectDraftAgentChatQueuedInputsForThread,
  selectAgentChatClosedHistoryThreads,
  updateAgentChatThreadModelOverrides,
  updateAgentChatQueuedInputText,
  type AgentChatQueuedInputState,
} from '@/features/agent/presentation/agentChatDataSourceShellModel'
import type { AgentConversationRegistryRecord } from '@movscript/core/agent'
import type { AgentChatDataSource, AgentChatThread } from '@movscript/core/agent/chat'

const modelIdForOption = (model: { id: number; model: string }) => model.model

test('agent chat conversation registry index filters by user and provider identity', () => {
  assert.deepEqual(buildAgentChatProviderIdentity({
    provider: 'mova',
    providerId: ' mova ',
    providerInstanceId: ' runtime-a ',
    providerProtocol: 'provider-session',
  }), {
    provider: 'mova',
    providerId: 'mova',
    providerInstanceId: 'runtime-a',
    providerProtocol: 'provider-session',
  })

  assert.deepEqual(buildAgentChatConversationPatchInput({
    nowMs: 123,
    open: false,
    provider: 'mova',
    providerId: ' mova ',
    providerInstanceId: ' runtime-a ',
    providerProtocol: 'provider-session',
    threadId: 'thread-a',
    userId: 'user-1',
  }), {
    userId: 'user-1',
    provider: 'mova',
    providerId: 'mova',
    providerInstanceId: 'runtime-a',
    providerProtocol: 'provider-session',
    providerThreadId: 'thread-a',
    open: false,
    archived: false,
    updatedAt: 123,
  })

  const index = buildAgentChatConversationRegistryIndex({
    userId: 'user-1',
    providerIdentity: {
      provider: 'mova',
      providerId: 'mova',
      providerInstanceId: 'runtime-a',
      providerProtocol: 'provider-session',
    },
    records: [
      registryRecord({ id: 'newer', providerThreadId: 'thread-newer', updatedAt: 300 }),
      registryRecord({ id: 'older', providerThreadId: 'thread-older', updatedAt: 100 }),
      registryRecord({ id: 'closed', providerThreadId: 'thread-closed', open: false, updatedAt: 400 }),
      registryRecord({ id: 'other-user', userId: 'user-2', providerThreadId: 'thread-other-user', updatedAt: 500 }),
      registryRecord({ id: 'other-provider', providerId: 'codex', providerThreadId: 'thread-other-provider', updatedAt: 600 }),
    ],
  })

  assert.deepEqual([...index.closedThreadIds], ['thread-closed'])
  assert.deepEqual([...index.openThreadIds], ['thread-newer', 'thread-older'])
  assert.deepEqual([...index.threadOrderIndex.entries()], [
    ['thread-newer', 0],
    ['thread-older', 1],
  ])
})

test('SDK agent runtime ids are not projected as provider-session ids', () => {
  const sdkDataSource = {
    ...agentChatDataSource(),
    provider: 'codex' as const,
    providerId: 'codex',
    providerInstanceId: 'codex-codex-sdk',
    label: 'Codex',
  } satisfies AgentChatDataSource

  const provisional = provisionalAgentChatThread('codex_thread_1', sdkDataSource)
  assert.equal(provisional.providerThreadId, 'codex_thread_1')
  assert.equal(provisional.providerSessionTreeId, undefined)
  assert.equal(agentConversationUsesProviderSession({ providerProtocol: 'sdk' }), false)
  assert.equal(agentConversationUsesProviderSession({ providerProtocol: 'claude-code' }), false)
  assert.equal(agentConversationUsesProviderSession({}), false)
  assert.equal(agentConversationUsesProviderSession({ providerProtocol: 'provider-session' }), true)

  const sdkThread = agentChatThreadFromRegistryRecord(registryRecord({
    provider: 'codex',
    providerId: 'codex',
    providerInstanceId: 'codex-codex-sdk',
    providerProtocol: 'sdk',
    providerThreadId: 'codex_thread_1',
    providerSessionId: 'codex-codex-sdk',
  }), sdkDataSource)
  assert.equal(sdkThread.providerSessionTreeId, undefined)
  assert.equal(sdkThread.sessionId, undefined)

  const providerSessionThread = agentChatThreadFromRegistryRecord(registryRecord({
    providerProtocol: 'provider-session',
    providerSessionId: 'session_tree_1',
  }), agentChatDataSource())
  assert.equal(providerSessionThread.providerSessionTreeId, 'session_tree_1')
  assert.equal(providerSessionThread.sessionId, 'session_tree_1')
})

test('agent chat model selection prefers thread overrides then execution settings', () => {
  const modelOptions = [
    { id: 1, model: 'model-a' },
    { id: 2, model: 'model-b', is_default: true },
    { id: 3, model: 'model-c' },
  ]

  assert.deepEqual(buildAgentChatModelSelectionForRequest({
    baseSelection: { modelProvider: 'provider-a' },
    modelIdForOption,
    modelOptions,
    selectedModelId: 'model-b',
    threadModelOverrides: {},
  }), {
    modelProvider: 'provider-a',
    model: 'model-b',
  })

  assert.deepEqual(buildAgentChatModelSelectionForRequest({
    baseSelection: {},
    modelIdForOption,
    modelOptions,
    selectedModelId: 'model-a',
    thread: { id: 'thread-a', executionSettings: { model: 'model-b' } },
    threadModelOverrides: { 'thread-a': 'model-c' },
  }), {
    model: 'model-c',
  })

  assert.deepEqual(buildAgentChatModelSelectionForRequest({
    baseSelection: {},
    modelIdForOption,
    modelOptions,
    selectedModelId: 'model-a',
    thread: { id: 'thread-a', executionSettings: { model: 'model-b' } },
    threadModelOverrides: {},
  }), {
    model: 'model-b',
  })

  assert.deepEqual(buildAgentChatModelSelectionForRequest({
    baseSelection: {},
    modelIdForOption,
    modelOptions,
    selectedModelId: 'model-a',
    thread: { id: 'thread-a', executionSettings: { model: 'stale-thread-model' } },
    threadModelOverrides: { 'thread-a': 'stale-override-model' },
  }), {
    model: 'model-a',
  })

  assert.equal(resolveAgentChatActiveModelValue({
    modelIdForOption,
    modelOptions,
    selectedModelId: 'model-a',
    thread: { executionSettings: { model: 'model-b' } },
    threadId: 'thread-a',
    threadModelOverrides: {},
  }), 'model-b')

  assert.deepEqual(updateAgentChatThreadModelOverrides({
    current: { 'thread-a': 'model-a' },
    modelId: 'model-b',
    modelIdForOption,
    modelOptions,
    threadId: 'thread-a',
  }), { 'thread-a': 'model-b' })

  assert.deepEqual(updateAgentChatThreadModelOverrides({
    current: { 'thread-a': 'model-a' },
    modelId: null,
    modelIdForOption,
    modelOptions,
    threadId: 'thread-a',
  }), {})

  assert.deepEqual(buildAgentChatModelSelectionForRequest({
    baseSelection: {},
    modelIdForOption,
    modelOptions,
    selectedModelId: null,
    threadModelOverrides: {},
  }), {})

  assert.deepEqual(buildAgentChatModelSelectionForRequest({
    baseSelection: {},
    modelIdForOption,
    modelOptions: [],
    selectedModelId: 'model-a',
    threadModelOverrides: {},
  }), {
    model: 'model-a',
  })

  assert.deepEqual(buildAgentChatModelSelectionForRequest({
    baseSelection: {},
    modelIdForOption,
    modelOptions: [],
    selectedModelId: null,
    thread: { id: 'thread-a', executionSettings: { model: 'stale-thread-model' } },
    threadModelOverrides: {},
  }), {})

  assert.deepEqual(buildAgentChatModelSelectionForRequest({
    baseSelection: {},
    modelIdForOption,
    modelOptions: [],
    selectedModelId: null,
    thread: { id: 'thread-a', executionSettings: { model: 'stale-thread-model' } },
    threadModelOverrides: { 'thread-a': 'model-a' },
  }), {
    model: 'model-a',
  })
})

test('agent chat draft controls and empty thread labels stay presentation-model owned', () => {
  assert.deepEqual(buildAgentChatDraftThreadControlOptions({
    collaborationMode: 'plan',
    goalModeEnabled: true,
  }), {
    collaborationMode: 'plan',
    goalModeEnabled: true,
  })
  assert.deepEqual(buildAgentChatDraftThreadControlOptions({
    collaborationMode: 'default',
    goalModeEnabled: false,
  }), {})

  assert.equal(resolveAgentChatEmptyThreadLabel({
    emptyThreadLabel: 'Start a conversation',
    selectedProjectId: 42,
    workspaceProjectOptions: [{ value: '42', label: '  Demo Project  ' }],
  }), '我们在Demo Project中做些什么？')
  assert.equal(resolveAgentChatEmptyThreadLabel({
    emptyThreadLabel: 'Start a conversation',
    selectedProjectId: 7,
    workspaceProjectOptions: [],
  }), '我们在项目 #7中做些什么？')
  assert.equal(resolveAgentChatEmptyThreadLabel({
    emptyThreadLabel: 'Start a conversation',
    workspaceProjectOptions: [],
  }), 'Start a conversation')
})

test('agent chat thread execution settings merge into the matching thread', () => {
  const threads = [
    agentThread({ id: 'thread-a', updatedAt: 10, executionSettings: { model: 'old-model', permissions: 'read-only' } }),
    agentThread({ id: 'thread-b', updatedAt: 20 }),
  ]
  const updated = applyAgentChatThreadExecutionSettings({
    nowSeconds: 30,
    settings: { model: 'new-model', approvalPolicy: 'on-request' },
    threadId: 'thread-a',
    threads,
  })

  assert.equal(updated[0].updatedAt, 30)
  assert.deepEqual(updated[0].executionSettings, {
    model: 'new-model',
    permissions: 'read-only',
    approvalPolicy: 'on-request',
  })
  assert.equal(updated[1], threads[1])
  assert.equal(applyAgentChatThreadExecutionSettings({
    nowSeconds: 40,
    settings: null,
    threadId: 'thread-a',
    threads,
  }), threads)
})

test('agent chat open thread candidates and tab views stay presentation-model owned', () => {
  const dataSource = {
    provider: 'mova' as const,
    providerId: 'mova',
    providerInstanceId: 'runtime-a',
    label: 'Mova',
    listThreads: async () => ({ threads: [] }),
    readThread: async (threadId: string) => agentThread({ id: threadId }),
    startThread: async () => agentThread(),
    startTextTurn: async () => ({
      id: 'turn',
      items: [],
      itemsView: 'full',
      status: 'completed',
      error: null,
      startedAt: null,
      completedAt: null,
      durationMs: null,
    }),
  } satisfies AgentChatDataSource
  const openThreadCandidates = buildAgentChatOpenThreadCandidates({
    activeThreadId: 'runtime-active',
    closedThreadIds: new Set(['closed-source']),
    conversations: [
      registryRecord({ id: 'registry-open', providerThreadId: 'registry-open', updatedAt: 300 }),
      registryRecord({ id: 'registry-closed', providerThreadId: 'registry-closed', open: false }),
      registryRecord({ id: 'registry-archived', providerThreadId: 'registry-archived', archived: true }),
      registryRecord({ id: 'registry-other-user', userId: 'user-2', providerThreadId: 'registry-other-user' }),
      registryRecord({ id: 'registry-empty-thread', providerThreadId: '   ' }),
    ],
    dataSource,
    openThreadIds: new Set(['source-open']),
    providerIdentity: {
      provider: 'mova',
      providerId: 'mova',
      providerInstanceId: 'runtime-a',
      providerProtocol: 'provider-session',
    },
    sourceThreadList: [
      agentThread({ id: 'source-open', preview: 'Source open' }),
      agentThread({ id: 'closed-source', preview: 'Closed source' }),
      agentThread({ id: 'source-empty', preview: '', name: null, turns: [] }),
    ],
    threads: [
      agentThread({ id: 'runtime-active', preview: 'Runtime active' }),
      agentThread({ id: 'runtime-closed', preview: 'Runtime closed' }),
    ],
    userId: 'user-1',
  })

  assert.deepEqual(openThreadCandidates.map((thread) => thread.id), [
    'registry-open',
    'source-open',
    'runtime-active',
  ])
  assert.equal(selectAgentChatInitialSourceThread({
    closedThreadIds: new Set(['closed-source']),
    threads: [
      agentThread({ id: 'empty-source', preview: '', name: null, turns: [] }),
      agentThread({ id: 'closed-source', preview: 'Closed source' }),
      agentThread({ id: 'initial-source', preview: 'Initial source' }),
    ],
  })?.id, 'initial-source')
  assert.equal(resolveAgentChatNextThreadAfterClose({
    closingThreadId: 'source-open',
    openThreadCandidates,
  })?.id, 'registry-open')
  assert.deepEqual(selectAgentChatClosedHistoryThreads({
    closedThreadIds: new Set(['closed-source', 'missing']),
    sourceThreadList: [
      agentThread({ id: 'source-open', preview: 'Source open' }),
      agentThread({ id: 'closed-source', preview: 'Closed source' }),
      agentThread({ id: 'closed-empty', preview: '', name: null, turns: [] }),
    ],
  }).map((thread) => thread.id), ['closed-source'])

  assert.deepEqual(buildAgentChatThreadTabs({
    threadOrderIndex: new Map([
      ['source-open', 0],
      ['registry-open', 1],
    ]),
    threads: [
      agentThread({ id: 'registry-open', name: null, preview: 'Registry open', status: 'failed' }),
      agentThread({
        id: 'source-open',
        name: 'Source name',
        preview: 'Source preview',
        status: 'running',
        turns: [{
          id: 'turn-a',
          itemsView: 'full',
          status: 'completed',
          error: null,
          startedAt: null,
          completedAt: null,
          durationMs: null,
          items: [
            { type: 'userMessage', id: 'user-a', clientId: null, content: [] },
            { type: 'agentMessage', id: 'agent-a', text: 'Done', phase: null, memoryCitation: null },
            { type: 'plan', id: 'plan-a', text: 'Plan' },
          ],
        }],
      }),
    ],
  }), [
    {
      id: 'source-open',
      title: 'Source name',
      messageCount: 2,
      sessionState: 'active',
    },
    {
      id: 'registry-open',
      title: 'Registry open',
      messageCount: 0,
      sessionState: 'error',
    },
  ])
})

test('agent chat thread candidates can be scoped to the current project', () => {
  const dataSource = agentChatDataSource()
  const conversations = [
    registryRecord({ id: 'registry-project', providerThreadId: 'registry-project', projectId: 42 }),
    registryRecord({ id: 'registry-other-project', providerThreadId: 'registry-other-project', projectId: 7 }),
    registryRecord({ id: 'source-project-record', providerThreadId: 'source-project', projectId: 42 }),
    registryRecord({ id: 'runtime-other-record', providerThreadId: 'runtime-other', projectId: 7 }),
  ]
  const openThreadCandidates = buildAgentChatOpenThreadCandidates({
    activeThreadId: 'runtime-project',
    closedThreadIds: new Set(['closed-project', 'closed-other']),
    conversations,
    dataSource,
    openThreadIds: new Set(['source-project', 'source-cwd-project', 'source-other']),
    projectId: 42,
    providerIdentity: {
      provider: 'mova',
      providerId: 'mova',
      providerInstanceId: 'runtime-a',
      providerProtocol: 'provider-session',
    },
    sourceThreadList: [
      agentThread({ id: 'source-project', preview: 'Source project' }),
      agentThread({ id: 'source-cwd-project', preview: 'Source cwd project', cwd: '/workspace/local/projects/project_42' }),
      agentThread({ id: 'source-other', preview: 'Source other', cwd: '/workspace/local/projects/project_7' }),
      agentThread({ id: 'closed-project', preview: 'Closed project', cwd: '/workspace/local/projects/project_42' }),
    ],
    threads: [
      agentThread({ id: 'runtime-project', preview: 'Runtime project', cwd: '/workspace/local/projects/project_42' }),
      agentThread({ id: 'runtime-other', preview: 'Runtime other' }),
    ],
    userId: 'user-1',
  })

  assert.deepEqual(openThreadCandidates.map((thread) => thread.id), [
    'registry-project',
    'source-project',
    'source-cwd-project',
    'runtime-project',
  ])
  assert.deepEqual(selectAgentChatClosedHistoryThreads({
    closedThreadIds: new Set(['closed-project', 'closed-other']),
    conversations,
    projectId: 42,
    sourceThreadList: [
      agentThread({ id: 'closed-project', preview: 'Closed project', cwd: '/workspace/local/projects/project_42' }),
      agentThread({ id: 'closed-other', preview: 'Closed other', cwd: '/workspace/local/projects/project_7' }),
    ],
  }).map((thread) => thread.id), ['closed-project'])
})

test('agent chat queued input helpers keep send-state transitions pure', () => {
  assert.equal(resolveAgentChatGoalObjective({
    text: '',
    attachmentNames: [' storyboard.png ', null, ''],
    fallback: 'Start a conversation',
  }), 'storyboard.png')
  assert.equal(resolveAgentChatGoalObjective({
    text: '',
    attachmentNames: [],
    fallback: 'Start a conversation',
  }), 'Start a conversation')

  assert.deepEqual(buildAgentChatQueuedInputDraft({
    id: 'draft-id',
    threadId: 'thread-a',
    text: 'queued text',
    inputs: [{ type: 'text', text: 'queued text', textElements: [] }],
    attachments: [{ name: 'storyboard.png' }],
    workspaceContext: { scope: 'project', projectId: 42 },
    profilePresetId: 'default',
    clientUserMessageId: 'client-message',
    createdAt: 123,
  }), {
    id: 'draft-id',
    threadId: 'thread-a',
    text: 'queued text',
    inputs: [{ type: 'text', text: 'queued text', textElements: [] }],
    attachments: [{ name: 'storyboard.png' }],
    workspaceContext: { scope: 'project', projectId: 42 },
    profilePresetId: 'default',
    clientUserMessageId: 'client-message',
    status: 'draft',
    error: null,
    createdAt: 123,
  })

  const items = [
    queuedInput({ id: 'draft-a', threadId: 'thread-a', text: 'old' }),
    queuedInput({ id: 'sending-a', threadId: 'thread-a', status: 'sending', text: 'busy' }),
    queuedInput({ id: 'draft-b', threadId: 'thread-b', text: 'other' }),
  ]

  const editing = markAgentChatQueuedInputEditing(items, 'draft-a')
  assert.equal(editing[0].status, 'editing')
  assert.equal(editing[0].error, null)
  assert.equal(markAgentChatQueuedInputEditing(items, 'sending-a')[1].status, 'sending')

  const updated = updateAgentChatQueuedInputText(editing, 'draft-a', 'next text')
  assert.equal(updated[0].status, 'draft')
  assert.equal(updated[0].text, 'next text')
  assert.deepEqual(updated[0].inputs, [{ type: 'text', text: 'next text', textElements: [] }])
  assert.equal(cancelAgentChatQueuedInputEdit(editing, 'draft-a')[0].status, 'draft')

  const sending = markAgentChatQueuedInputsSending(updated, new Set(['draft-a', 'draft-b']))
  assert.equal(sending[0].status, 'sending')
  assert.equal(sending[2].status, 'sending')

  const failed = failAgentChatQueuedInputs(sending, new Set(['draft-a']), 'network failed')
  assert.equal(failed[0].status, 'failed')
  assert.equal(failed[0].error, 'network failed')
  assert.equal(failed[2].status, 'sending')

  assert.deepEqual(selectDraftAgentChatQueuedInputsForThread(updated, 'thread-a').map((item) => item.id), ['draft-a'])
  assert.deepEqual(removeAgentChatQueuedInput(updated, 'draft-a').map((item) => item.id), ['sending-a', 'draft-b'])
  assert.deepEqual(removeAgentChatQueuedInputs(updated, new Set(['draft-a', 'draft-b'])).map((item) => item.id), ['sending-a'])
})

test('agent chat queued turn submission selects one thread in created order', () => {
  const submission = buildAgentChatQueuedTurnSubmission({
    batchClientUserMessageId: 'batch-message',
    ids: ['late-a', 'early-a', 'other-thread', 'sending-a'],
    items: [
      queuedInput({ id: 'late-a', threadId: 'thread-a', text: '', inputs: [{ type: 'image', url: 'asset://image' }], createdAt: 30 }),
      queuedInput({ id: 'other-thread', threadId: 'thread-b', text: 'ignored', createdAt: 10 }),
      queuedInput({ id: 'early-a', threadId: 'thread-a', text: 'first', inputs: [{ type: 'text', text: 'first', textElements: [] }], createdAt: 20 }),
      queuedInput({ id: 'sending-a', threadId: 'thread-a', status: 'sending', text: 'busy', createdAt: 5 }),
    ],
  })

  assert.ok(submission)
  assert.equal(submission.threadId, 'thread-b')
  assert.equal(submission.clientUserMessageId, 'client-message')
  assert.deepEqual(submission.items.map((item) => item.id), ['other-thread'])
  assert.deepEqual([...submission.sendingIds], ['other-thread'])
  assert.equal(submission.text, 'ignored')

  const batched = buildAgentChatQueuedTurnSubmission({
    batchClientUserMessageId: 'batch-message',
    ids: ['late-a', 'early-a'],
    items: [
      queuedInput({ id: 'late-a', threadId: 'thread-a', text: '', inputs: [{ type: 'image', url: 'asset://image' }], createdAt: 30 }),
      queuedInput({ id: 'early-a', threadId: 'thread-a', text: 'first', inputs: [{ type: 'text', text: 'first', textElements: [] }], createdAt: 20 }),
    ],
  })
  assert.ok(batched)
  assert.equal(batched.clientUserMessageId, 'batch-message')
  assert.deepEqual(batched.items.map((item) => item.id), ['early-a', 'late-a'])
  assert.deepEqual([...batched.sendingIds], ['early-a', 'late-a'])
  assert.equal(batched.text, 'first\n\n1 attachment')
  assert.deepEqual(batched.inputs, [
    { type: 'text', text: 'first', textElements: [] },
    { type: 'image', url: 'asset://image' },
  ])
})

function registryRecord(patch: Partial<AgentConversationRegistryRecord>): AgentConversationRegistryRecord {
  return {
    id: 'conversation',
    userId: 'user-1',
    provider: 'mova',
    providerId: 'mova',
    providerInstanceId: 'runtime-a',
    providerProtocol: 'provider-session',
    providerThreadId: 'thread',
    open: true,
    archived: false,
    createdAt: 1,
    updatedAt: 1,
    ...patch,
  }
}

function agentChatDataSource(): AgentChatDataSource {
  return {
    provider: 'mova' as const,
    providerId: 'mova',
    providerInstanceId: 'runtime-a',
    label: 'Mova',
    listThreads: async () => ({ threads: [] }),
    readThread: async (threadId: string) => agentThread({ id: threadId }),
    startThread: async () => agentThread(),
    startTextTurn: async () => ({
      id: 'turn',
      items: [],
      itemsView: 'full',
      status: 'completed',
      error: null,
      startedAt: null,
      completedAt: null,
      durationMs: null,
    }),
  } satisfies AgentChatDataSource
}

function queuedInput(patch: Partial<AgentChatQueuedInputState>): AgentChatQueuedInputState {
  return {
    id: 'queued',
    threadId: 'thread-a',
    text: '',
    inputs: [],
    attachments: [],
    workspaceContext: {},
    profilePresetId: 'default',
    clientUserMessageId: 'client-message',
    status: 'draft',
    error: null,
    createdAt: 1,
    ...patch,
  }
}

function agentThread(patch: Partial<AgentChatThread> = {}): AgentChatThread {
  return {
    ...baseAgentThread(),
    ...patch,
  }
}

function baseAgentThread(): AgentChatThread {
  return {
    id: 'thread',
    provider: 'codex',
    name: null,
    preview: '',
    status: 'idle' as const,
    createdAt: 1,
    updatedAt: 1,
    turns: [],
  }
}
