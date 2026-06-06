import assert from 'node:assert/strict'
import test from 'node:test'

import { conversationIdForProviderThread } from '@/features/agent/domain/agentConversation'
import { pageTaskStatusFromProviderSession, useAgentSessionStore } from './agentSessionStore'

test('conversationIdForProviderThread resolves persisted direct conversation mappings first', () => {
  assert.equal(conversationIdForProviderThread({
    threadId: 'thread_1',
    providerThreadIdsByConversation: {
      conv_direct: 'thread_1',
    },
    conversationProviderSessionStates: {
      conv_runtime: {
        threadId: 'thread_1',
        updatedAt: 2000,
      },
    },
  }), 'conv_direct')
})

test('conversationIdForProviderThread falls back to the latest provider-session mapping', () => {
  assert.equal(conversationIdForProviderThread({
    threadId: 'thread_1',
    providerThreadIdsByConversation: {},
    conversationProviderSessionStates: {
      conv_old: {
        threadId: 'thread_1',
        updatedAt: 1000,
      },
      conv_new: {
        threadId: 'thread_1',
        updatedAt: 2000,
      },
      conv_other: {
        threadId: 'thread_2',
        updatedAt: 3000,
      },
    },
  }), 'conv_new')
})

test('conversationIdForProviderThread returns undefined for unmapped provider-session threads', () => {
  assert.equal(conversationIdForProviderThread({
    threadId: 'thread_missing',
    providerThreadIdsByConversation: {
      conv_direct: 'thread_1',
    },
    conversationProviderSessionStates: {
      conv_runtime: {
        threadId: 'thread_2',
        updatedAt: 1000,
      },
    },
  }), undefined)
})

test('agent session persistence excludes provider-session thread mappings and projections', () => {
  useAgentSessionStore.setState({
    activeConversationIdsByUser: { user_1: 'conv_1' },
    workspacesByUser: { user_1: { conv_1: { input: 'workspace check', attachments: [] } } },
    providerThreadIdsByConversation: { conv_1: 'thread_1' },
    sessionIdsByConversation: { conv_1: 'session_1' },
    conversationProviderSessionStates: {
      conv_1: {
        conversationId: 'conv_1',
        threadId: 'thread_1',
        sessionId: 'session_1',
        loading: false,
        building: false,
        approving: false,
        stopping: false,
        stopRequested: false,
        updatedAt: Date.now(),
      },
    },
  })

  const partialized = useAgentSessionStore.persist.getOptions().partialize?.(useAgentSessionStore.getState())

  assert.deepEqual(partialized, {})
})

test('createProviderSessionConversation stores explicit conversation titles', () => {
  useAgentSessionStore.setState({
    activeConversationIdsByUser: {},
    workspacesByUser: {},
    providerThreadIdsByConversation: {},
    sessionIdsByConversation: {},
    conversationProviderSessionStates: {},
    pageTasks: {},
    standaloneTasks: {},
  })

  const conversationId = useAgentSessionStore.getState().createProviderSessionConversation('user_1', {
    threadId: 'thread_titled',
    title: '上下文',
  })

  assert.equal(conversationId, 'thread_titled')
  assert.equal(useAgentSessionStore.getState().conversationProviderSessionStates.thread_titled?.title, '上下文')
})

test('setActiveConversation ignores duplicate active conversation ids', () => {
  useAgentSessionStore.setState({
    activeConversationIdsByUser: { user_1: 'conv_1' },
    workspacesByUser: {},
    providerThreadIdsByConversation: {},
    sessionIdsByConversation: {},
    conversationProviderSessionStates: {},
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
