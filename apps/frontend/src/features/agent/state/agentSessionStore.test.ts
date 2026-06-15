import assert from 'node:assert/strict'
import test from 'node:test'

import { conversationIdForProviderThread } from '@/features/agent/domain/agentConversation'
import { pageTaskStatusFromProviderSession, useAgentSessionStore } from './agentSessionStore'

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

  const partialized = useAgentSessionStore.persist.getOptions().partialize?.(useAgentSessionStore.getState())

  assert.deepEqual(partialized, {
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
    sessionId: 'session_tree_1',
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
    providerProtocol: 'app-server',
    title: 'Codex thread',
  })
  const movaConversationId = useAgentSessionStore.getState().createProviderSessionConversation('user_1', {
    threadId: 'thread_shared',
    provider: 'mova',
    providerId: 'mova',
    providerInstanceId: 'mova-home',
    providerProtocol: 'app-server',
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
