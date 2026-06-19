import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { conversationIdForProviderThread } from '@/features/agent/domain/agentConversation'
import { recentAppEventSnapshots, resetAppEventDedupeForTests } from '@/shared/application/appEvents'
import { persistedAgentSessionState } from './agentSessionStoreTypes'
import { pageTaskStatusFromProviderSession, useAgentSessionStore } from './agentSessionStore'
import { AGENT_MODE_CONVERSATION_FOCUS_SCOPE, projectConversationFocusScope } from './agentConversationFocusScope'

test('agent session store delegates conversation and task state transitions', () => {
  const storeSource = readFileSync(resolve('src/features/agent/state/agentSessionStore.ts'), 'utf8')
  const conversationStateSource = readFileSync(resolve('src/features/agent/state/agentSessionConversationState.ts'), 'utf8')
  const taskStateSource = readFileSync(resolve('src/features/agent/state/agentSessionTaskState.ts'), 'utf8')

  for (const helperName of [
    'createProviderSessionConversationState',
    'removeProviderSessionConversationState',
    'updateConversationWorkspaceState',
    'bindConversationToProviderThreadState',
    'setConversationRunState',
  ]) {
    assert.match(storeSource, new RegExp(`\\b${helperName}\\b`))
    assert.match(conversationStateSource, new RegExp(`export function ${helperName}\\b`))
  }

  for (const helperName of [
    'enqueueAgentPageTask',
    'claimNextQueuedAgentPageTask',
    'updateAgentPageTaskFromProviderSession',
    'settleAgentStandaloneTask',
  ]) {
    assert.match(storeSource, new RegExp(`\\b${helperName}\\b`))
    assert.match(taskStateSource, new RegExp(`export function ${helperName}\\b`))
  }

  assert.doesNotMatch(storeSource, /Object\.entries\(state\.pageTasks\)\.filter/)
  assert.doesNotMatch(storeSource, /run: compactRun\(run\)/)
  assert.doesNotMatch(storeSource, /defaultConversationRuntimeState\(conversationId\)/)
})

test('conversationIdForProviderThread resolves conversation thread bindings first', () => {
  assert.equal(conversationIdForProviderThread({
    threadId: 'thread_1',
    conversationThreadBindings: {
      conv_binding: {
        providerThreadId: 'thread_1',
        updatedAt: 1000,
      },
    },
  }), 'conv_binding')
})

test('conversationIdForProviderThread uses the latest thread binding', () => {
  assert.equal(conversationIdForProviderThread({
    threadId: 'thread_1',
    conversationThreadBindings: {
      conv_old: {
        providerThreadId: 'thread_1',
        updatedAt: 1000,
      },
      conv_new: {
        providerThreadId: 'thread_1',
        updatedAt: 2000,
      },
      conv_other: {
        providerThreadId: 'thread_2',
        updatedAt: 3000,
      },
    },
  }), 'conv_new')
})

test('conversationIdForProviderThread returns undefined for unmapped thread bindings', () => {
  assert.equal(conversationIdForProviderThread({
    threadId: 'thread_missing',
    conversationThreadBindings: {
      conv_runtime: {
        providerThreadId: 'thread_2',
        updatedAt: 1000,
      },
    },
  }), undefined)
})

test('agent session persistence stores registry state and excludes provider-session projections', () => {
  useAgentSessionStore.setState({
    activeConversationIdsByUser: { user_1: 'conv_1' },
    conversationsById: {
      conv_1: {
        id: 'conv_1',
        userId: 'user_1',
        providerThreadId: 'thread_1',
        providerSessionId: 'session_1',
        open: true,
        archived: false,
        createdAt: 1000,
        updatedAt: 2000,
      },
    },
    workspacesByUser: { user_1: { conv_1: { input: 'workspace check', attachments: [] } } },
    conversationThreadBindings: {
      conv_1: {
        conversationId: 'conv_1',
        providerThreadId: 'thread_1',
        providerSessionTreeId: 'session_1',
        updatedAt: Date.now(),
      },
    },
    conversationRuntimeStates: {},
  })

  const partialized = persistedAgentSessionState(useAgentSessionStore.getState())

  assert.deepEqual(partialized, {
    activeConversationIdsByUser: { user_1: 'conv_1' },
    activeConversationIdsByScope: {},
    conversationsById: {
      conv_1: {
        id: 'conv_1',
        userId: 'user_1',
        providerThreadId: 'thread_1',
        providerSessionId: 'session_1',
        open: true,
        archived: false,
        createdAt: 1000,
        updatedAt: 2000,
      },
    },
    workspacesByUser: { user_1: { conv_1: { input: 'workspace check', attachments: [] } } },
  })
})

test('createProviderSessionConversation stores explicit conversation titles', () => {
  useAgentSessionStore.setState({
    activeConversationIdsByUser: {},
    conversationsById: {},
    workspacesByUser: {},
    conversationThreadBindings: {},
    conversationRuntimeStates: {},
    pageTasks: {},
    standaloneTasks: {},
  })

  const conversationId = useAgentSessionStore.getState().createProviderSessionConversation('user_1', {
    threadId: 'thread_titled',
    title: '上下文',
  })

  assert.equal(conversationId, 'thread_titled')
  assert.equal(useAgentSessionStore.getState().conversationsById.thread_titled?.title, '上下文')
})

test('createProviderSessionConversation writes conversation thread bindings', () => {
  useAgentSessionStore.setState({
    activeConversationIdsByUser: {},
    conversationsById: {},
    workspacesByUser: {},
    conversationThreadBindings: {},
    conversationRuntimeStates: {},
    pageTasks: {},
    standaloneTasks: {},
  })

  const conversationId = useAgentSessionStore.getState().createProviderSessionConversation('user_1', {
    threadId: 'thread_1',
    providerSessionTreeId: 'session_tree_1',
  })

  assert.equal(conversationId, 'thread_1')
  assert.equal(useAgentSessionStore.getState().conversationsById[conversationId]?.providerSessionId, 'session_tree_1')
  assert.deepEqual(useAgentSessionStore.getState().conversationThreadBindings[conversationId], {
    conversationId,
    providerThreadId: 'thread_1',
    providerSessionTreeId: 'session_tree_1',
    updatedAt: useAgentSessionStore.getState().conversationThreadBindings[conversationId]?.updatedAt,
  })
})

test('createProviderSessionConversation accepts legacy sessionId as provider session tree id', () => {
  useAgentSessionStore.setState({
    activeConversationIdsByUser: {},
    conversationsById: {},
    workspacesByUser: {},
    conversationThreadBindings: {},
    conversationRuntimeStates: {},
    pageTasks: {},
    standaloneTasks: {},
  })

  const conversationId = useAgentSessionStore.getState().createProviderSessionConversation('user_1', {
    threadId: 'thread_legacy_session',
    sessionId: 'legacy_session_tree_1',
  })

  assert.equal(useAgentSessionStore.getState().conversationsById[conversationId]?.providerSessionId, 'legacy_session_tree_1')
  assert.equal(useAgentSessionStore.getState().conversationThreadBindings[conversationId]?.providerSessionTreeId, 'legacy_session_tree_1')
})

test('createProviderSessionConversation scopes identical thread ids by provider identity', () => {
  useAgentSessionStore.setState({
    activeConversationIdsByUser: {},
    conversationsById: {},
    workspacesByUser: {},
    conversationThreadBindings: {},
    conversationRuntimeStates: {},
    pageTasks: {},
    standaloneTasks: {},
  })

  const codexConversationId = useAgentSessionStore.getState().createProviderSessionConversation('user_1', {
    threadId: 'thread_shared',
    provider: 'codex',
    providerId: 'codex',
    providerInstanceId: 'codex-home',
    providerProtocol: 'provider-session',
    title: 'Codex thread',
  })
  const movaConversationId = useAgentSessionStore.getState().createProviderSessionConversation('user_1', {
    threadId: 'thread_shared',
    provider: 'mova',
    providerId: 'mova',
    providerInstanceId: 'mova-home',
    providerProtocol: 'provider-session',
    title: 'Mova thread',
  })

  assert.notEqual(codexConversationId, movaConversationId)
  assert.equal(useAgentSessionStore.getState().conversationsById[codexConversationId]?.title, 'Codex thread')
  assert.equal(useAgentSessionStore.getState().conversationsById[movaConversationId]?.title, 'Mova thread')
  assert.equal(useAgentSessionStore.getState().conversationsById[codexConversationId]?.providerThreadId, 'thread_shared')
  assert.equal(useAgentSessionStore.getState().conversationsById[movaConversationId]?.providerThreadId, 'thread_shared')
})

test('provider-session binding setters update conversation thread bindings', () => {
  useAgentSessionStore.setState({
    activeConversationIdsByUser: {},
    conversationsById: {
      conv_1: {
        id: 'conv_1',
        userId: 'user_1',
        open: true,
        archived: false,
        createdAt: 1000,
        updatedAt: 1000,
      },
    },
    workspacesByUser: {},
    conversationThreadBindings: {},
    conversationRuntimeStates: {},
    pageTasks: {},
    standaloneTasks: {},
  })

  useAgentSessionStore.getState().setConversationProviderSessionTreeId('conv_1', 'session_tree_1')
  useAgentSessionStore.getState().setConversationProviderThreadBindingId('conv_1', 'thread_1')

  assert.equal(useAgentSessionStore.getState().conversationThreadBindings.conv_1?.providerThreadId, 'thread_1')
  assert.equal(useAgentSessionStore.getState().conversationThreadBindings.conv_1?.providerSessionTreeId, 'session_tree_1')
})

test('conversation runtime patches update conversation runtime states', () => {
  useAgentSessionStore.setState({
    activeConversationIdsByUser: {},
    conversationsById: {},
    workspacesByUser: {},
    conversationThreadBindings: {},
    conversationRuntimeStates: {},
    pageTasks: {},
    standaloneTasks: {},
  })

  useAgentSessionStore.getState().bindConversationToProviderThread({
    conversationId: 'conv_1',
    providerThreadId: 'thread_1',
    providerSessionTreeId: 'session_tree_1',
  })
  useAgentSessionStore.getState().updateConversationRuntimeState('conv_1', {
    loading: true,
    building: true,
    status: 'running',
  })

  assert.equal(useAgentSessionStore.getState().conversationThreadBindings.conv_1?.providerThreadId, 'thread_1')
  assert.equal(useAgentSessionStore.getState().conversationRuntimeStates.conv_1?.loading, true)
  assert.equal(useAgentSessionStore.getState().conversationRuntimeStates.conv_1?.building, true)
  assert.equal(useAgentSessionStore.getState().conversationRuntimeStates.conv_1?.status, 'running')
})

test('setActiveConversation ignores duplicate active conversation ids', () => {
  useAgentSessionStore.setState({
    activeConversationIdsByUser: { user_1: 'conv_1' },
    activeConversationIdsByScope: {},
    conversationsById: {},
    workspacesByUser: {},
    conversationThreadBindings: {},
    conversationRuntimeStates: {},
    pageTasks: {},
    standaloneTasks: {},
  })

  const before = useAgentSessionStore.getState().activeConversationIdsByUser
  useAgentSessionStore.getState().setActiveConversation('user_1', 'conv_1')

  assert.equal(useAgentSessionStore.getState().activeConversationIdsByUser, before)
})

test('opening and selecting a conversation preserves its activity timestamp', () => {
  useAgentSessionStore.setState({
    activeConversationIdsByUser: {},
    activeConversationIdsByScope: {},
    conversationsById: {
      conv_1: {
        id: 'conv_1',
        userId: 'user_1',
        providerThreadId: 'thread_1',
        open: false,
        archived: false,
        createdAt: 1000,
        updatedAt: 2000,
      },
    },
    workspacesByUser: {},
    conversationThreadBindings: {},
    conversationRuntimeStates: {},
    pageTasks: {},
    standaloneTasks: {},
  })

  useAgentSessionStore.getState().setConversationOpen('user_1', 'conv_1', true, AGENT_MODE_CONVERSATION_FOCUS_SCOPE)
  useAgentSessionStore.getState().setActiveConversation('user_1', 'conv_1', AGENT_MODE_CONVERSATION_FOCUS_SCOPE)
  useAgentSessionStore.getState().updateConversationTitle('user_1', 'conv_1', 'Renamed')

  const conversation = useAgentSessionStore.getState().conversationsById.conv_1
  assert.equal(conversation?.open, true)
  assert.equal(conversation?.title, 'Renamed')
  assert.equal(conversation?.updatedAt, 2000)
})

test('setActiveConversation keeps project and agent focus scopes independent', () => {
  useAgentSessionStore.setState({
    activeConversationIdsByUser: {},
    activeConversationIdsByScope: {},
    conversationsById: {},
    workspacesByUser: {},
    conversationThreadBindings: {},
    conversationRuntimeStates: {},
    pageTasks: {},
    standaloneTasks: {},
  })

  useAgentSessionStore.getState().setActiveConversation('user_1', 'agent_conv', AGENT_MODE_CONVERSATION_FOCUS_SCOPE)
  useAgentSessionStore.getState().setActiveConversation('user_1', 'project_conv', projectConversationFocusScope(42))

  assert.equal(useAgentSessionStore.getState().getActiveConversationId('user_1', AGENT_MODE_CONVERSATION_FOCUS_SCOPE), 'agent_conv')
  assert.equal(useAgentSessionStore.getState().getActiveConversationId('user_1', projectConversationFocusScope(42)), 'project_conv')
  assert.equal(useAgentSessionStore.getState().getActiveConversationId('user_1'), null)
})

test('agent session task actions preserve page task and standalone task lifecycles', () => {
  useAgentSessionStore.setState({
    activeConversationIdsByUser: {},
    conversationsById: {},
    workspacesByUser: {},
    conversationThreadBindings: {},
    conversationRuntimeStates: {},
    pageTasks: {},
    standaloneTasks: {},
  })

  const normalized = useAgentSessionStore.getState().enqueuePageTask({
    requestId: 'task_1',
    taskType: 'script',
    message: 'Generate script',
  })
  assert.equal(normalized.requestId, 'task_1')
  assert.equal(useAgentSessionStore.getState().pageTasks.task_1?.status, 'queued')

  const claimed = useAgentSessionStore.getState().claimNextQueuedPageTask()
  assert.equal(claimed?.requestId, 'task_1')
  assert.equal(useAgentSessionStore.getState().pageTasks.task_1?.status, 'claimed')

  useAgentSessionStore.getState().attachPageTaskConversation('task_1', 'conv_1')
  useAgentSessionStore.getState().setPageTaskRunning('task_1', {
    run: { id: 'run_1', threadId: 'thread_1', providerSessionTreeId: 'session_tree_1', status: 'in_progress' } as any,
  })
  assert.equal(useAgentSessionStore.getState().pageTasks.task_1?.conversationId, 'conv_1')
  assert.equal(useAgentSessionStore.getState().pageTasks.task_1?.status, 'running')
  assert.equal(useAgentSessionStore.getState().pageTasks.task_1?.providerSessionTreeId, 'session_tree_1')
  assert.equal(useAgentSessionStore.getState().pageTasks.task_1?.threadId, 'thread_1')

  useAgentSessionStore.getState().updatePageTaskFromProviderSession({
    requestId: 'task_1',
    run: { id: 'run_1', threadId: 'thread_1', providerSessionTreeId: 'session_tree_1', status: 'completed' } as any,
  })
  assert.equal(useAgentSessionStore.getState().pageTasks.task_1?.status, 'completed')
  assert.equal(useAgentSessionStore.getState().pageTasks.task_1?.providerSessionTreeId, 'session_tree_1')
  assert.equal(typeof useAgentSessionStore.getState().pageTasks.task_1?.settledAt, 'number')

  useAgentSessionStore.getState().startStandaloneTask({
    taskId: 'standalone_1',
    taskType: 'review',
    title: 'Review',
    prompt: 'Review this',
  })
  useAgentSessionStore.getState().updateStandaloneTask('standalone_1', { result: 'partial' })
  useAgentSessionStore.getState().settleStandaloneTask({
    taskId: 'standalone_1',
    status: 'completed',
    result: 'done',
  })

  assert.equal(useAgentSessionStore.getState().standaloneTasks.standalone_1?.status, 'completed')
  assert.equal(useAgentSessionStore.getState().standaloneTasks.standalone_1?.result, 'done')
})

test('agent session actions publish activity events for content surfaces', () => {
  resetAppEventDedupeForTests()
  useAgentSessionStore.setState({
    activeConversationIdsByUser: {},
    conversationsById: {},
    workspacesByUser: {},
    conversationThreadBindings: {},
    conversationRuntimeStates: {},
    pageTasks: {},
    standaloneTasks: {},
  })

  useAgentSessionStore.getState().enqueuePageTask({
    requestId: 'task_activity_1',
    taskType: 'script',
    message: 'Generate script',
    projectId: 7,
  })
  useAgentSessionStore.getState().attachPageTaskConversation('task_activity_1', 'conv_activity_1')
  useAgentSessionStore.getState().setPageTaskRunning('task_activity_1', {
    run: {
      id: 'run_activity_1',
      threadId: 'thread_activity_1',
      sessionId: 'session_activity_1',
      status: 'in_progress',
      pendingInputRequests: [{ id: 'input_1', status: 'pending', title: 'Need detail', prompt: 'Which version?' }],
      pendingApprovals: [{ id: 'approval_1', status: 'pending', title: 'Approve edit', reason: 'Writes content' }],
      steps: [{
        id: 'step_tool_1',
        type: 'tool_call',
        status: 'running',
        toolName: 'workspace_create',
      }],
    } as any,
  })
  useAgentSessionStore.getState().updatePageTaskFromProviderSession({
    requestId: 'task_activity_1',
    run: {
      id: 'run_activity_1',
      threadId: 'thread_activity_1',
      sessionId: 'session_activity_1',
      status: 'completed',
      steps: [{
        id: 'step_tool_1',
        type: 'tool_call',
        status: 'completed',
        toolName: 'workspace_create',
      }],
    } as any,
    artifacts: [{ type: 'workspace', workspaceId: 'workspace_1', projectId: 7 }],
  })
  assert.equal(useAgentSessionStore.getState().pageTasks.task_activity_1?.providerSessionTreeId, 'session_activity_1')

  useAgentSessionStore.getState().startStandaloneTask({
    taskId: 'standalone_activity_1',
    taskType: 'review',
    prompt: 'Review this',
  })
  useAgentSessionStore.getState().settleStandaloneTask({
    taskId: 'standalone_activity_1',
    status: 'completed',
    result: 'done',
  })

  assert.deepEqual(recentAppEventSnapshots().map((event) => event.topic), [
    'agent.activity.started',
    'agent.activity.updated',
    'agent.activity.updated',
    'agent.tool.started',
    'agent.user-input.requested',
    'agent.approval.requested',
    'agent.activity.completed',
    'agent.tool.completed',
    'agent.output.created',
    'agent.activity.started',
    'agent.activity.completed',
  ])
})

test('pageTaskStatusFromProviderSession settles explicit panel payload statuses', () => {
  assert.equal(pageTaskStatusFromProviderSession({ status: 'completed' }, 'running'), 'completed')
  assert.equal(pageTaskStatusFromProviderSession({ status: 'error' }, 'running'), 'error')
  assert.equal(pageTaskStatusFromProviderSession({ status: 'cancelled' }, 'running'), 'cancelled')
})

test('pageTaskStatusFromProviderSession maps terminal run statuses to settled task statuses', () => {
  assert.equal(pageTaskStatusFromProviderSession({ run: { status: 'completed' } as any }, 'running'), 'completed')
  assert.equal(pageTaskStatusFromProviderSession({ run: { status: 'completed_with_warnings' } as any }, 'running'), 'completed')
  assert.equal(pageTaskStatusFromProviderSession({ run: { status: 'failed' } as any }, 'running'), 'error')
  assert.equal(pageTaskStatusFromProviderSession({ run: { status: 'cancelled' } as any }, 'running'), 'cancelled')
})

test('pageTaskStatusFromProviderSession preserves active statuses while claiming queued tasks', () => {
  assert.equal(pageTaskStatusFromProviderSession({ run: { status: 'in_progress' } as any }, 'queued'), 'claimed')
  assert.equal(pageTaskStatusFromProviderSession({ run: { status: 'in_progress' } as any }, 'running'), 'running')
})
