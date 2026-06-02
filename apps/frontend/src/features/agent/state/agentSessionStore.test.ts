import assert from 'node:assert/strict'
import test from 'node:test'

import { conversationIdForRuntimeThread } from '@movscript/conversation'
import { pageTaskStatusFromRuntime, useAgentSessionStore } from './agentSessionStore'

test('conversationIdForRuntimeThread resolves persisted direct conversation mappings first', () => {
  assert.equal(conversationIdForRuntimeThread({
    threadId: 'thread_1',
    localThreadIdsByConversation: {
      conv_direct: 'thread_1',
    },
    conversationRuntimes: {
      conv_runtime: {
        threadId: 'thread_1',
        updatedAt: 2000,
      },
    },
  }), 'conv_direct')
})

test('conversationIdForRuntimeThread falls back to the latest runtime mapping', () => {
  assert.equal(conversationIdForRuntimeThread({
    threadId: 'thread_1',
    localThreadIdsByConversation: {},
    conversationRuntimes: {
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

test('conversationIdForRuntimeThread returns undefined for unmapped runtime threads', () => {
  assert.equal(conversationIdForRuntimeThread({
    threadId: 'thread_missing',
    localThreadIdsByConversation: {
      conv_direct: 'thread_1',
    },
    conversationRuntimes: {
      conv_runtime: {
        threadId: 'thread_2',
        updatedAt: 1000,
      },
    },
  }), undefined)
})

test('agent session persistence excludes runtime thread mappings and projections', () => {
  useAgentSessionStore.setState({
    activeConversationIdsByUser: { user_1: 'conv_1' },
    workspacesByUser: { user_1: { conv_1: { input: 'workspace check', attachments: [] } } },
    localThreadIdsByConversation: { conv_1: 'thread_1' },
    sessionIdsByConversation: { conv_1: 'session_1' },
    conversationRuntimes: {
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

test('createRuntimeConversation stores explicit conversation titles', () => {
  useAgentSessionStore.setState({
    activeConversationIdsByUser: {},
    workspacesByUser: {},
    localThreadIdsByConversation: {},
    sessionIdsByConversation: {},
    conversationRuntimes: {},
    pageTasks: {},
    standaloneTasks: {},
  })

  const conversationId = useAgentSessionStore.getState().createRuntimeConversation('user_1', {
    threadId: 'thread_titled',
    title: '上下文',
  })

  assert.equal(conversationId, 'thread_titled')
  assert.equal(useAgentSessionStore.getState().conversationRuntimes.thread_titled?.title, '上下文')
})

test('pageTaskStatusFromRuntime settles explicit panel payload statuses', () => {
  assert.equal(pageTaskStatusFromRuntime({ status: 'completed' }, 'running'), 'completed')
  assert.equal(pageTaskStatusFromRuntime({ status: 'error' }, 'running'), 'error')
  assert.equal(pageTaskStatusFromRuntime({ status: 'cancelled' }, 'running'), 'cancelled')
})

test('pageTaskStatusFromRuntime maps terminal run statuses to settled task statuses', () => {
  assert.equal(pageTaskStatusFromRuntime({ run: { status: 'completed' } as any }, 'running'), 'completed')
  assert.equal(pageTaskStatusFromRuntime({ run: { status: 'completed_with_warnings' } as any }, 'running'), 'completed')
  assert.equal(pageTaskStatusFromRuntime({ run: { status: 'failed' } as any }, 'running'), 'error')
  assert.equal(pageTaskStatusFromRuntime({ run: { status: 'cancelled' } as any }, 'running'), 'cancelled')
})

test('pageTaskStatusFromRuntime preserves active statuses while claiming queued tasks', () => {
  assert.equal(pageTaskStatusFromRuntime({ run: { status: 'in_progress' } as any }, 'queued'), 'claimed')
  assert.equal(pageTaskStatusFromRuntime({ run: { status: 'in_progress' } as any }, 'running'), 'running')
})
