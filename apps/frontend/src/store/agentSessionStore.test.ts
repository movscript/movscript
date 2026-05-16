import assert from 'node:assert/strict'
import test from 'node:test'

import { conversationIdForLocalThread } from './agentSessionStore'

test('conversationIdForLocalThread resolves persisted direct conversation mappings first', () => {
  assert.equal(conversationIdForLocalThread({
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

test('conversationIdForLocalThread falls back to the latest runtime mapping', () => {
  assert.equal(conversationIdForLocalThread({
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

test('conversationIdForLocalThread returns undefined for unmapped runtime threads', () => {
  assert.equal(conversationIdForLocalThread({
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
