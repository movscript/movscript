import assert from 'node:assert/strict'
import test from 'node:test'

import { markRuntimeMessagesRestored, mergeRuntimeThreadProjectionMessages, runtimeThreadHydrationKey } from './agentRuntimeConversationSync'
import type { ChatMessage } from '@/store/agentStore'

test('runtimeThreadHydrationKey scopes hydration by conversation and runtime thread', () => {
  assert.equal(runtimeThreadHydrationKey('conv_1', 'thread_1'), 'conv_1:thread_1')
})

test('mergeRuntimeThreadProjectionMessages replaces only messages from the projected runtime thread', () => {
  const localMessage: ChatMessage = {
    id: 'local_message',
    role: 'assistant',
    content: 'local status',
    timestamp: 1,
  }
  const oldRuntimeMessage: ChatMessage = {
    id: 'old_runtime',
    role: 'assistant',
    content: 'old',
    meta: { runtimeMessage: { threadId: 'thread_1', runId: 'run_old' } },
    timestamp: 2,
  }
  const otherRuntimeMessage: ChatMessage = {
    id: 'other_runtime',
    role: 'assistant',
    content: 'other',
    meta: { runtimeMessage: { threadId: 'thread_other', runId: 'run_other' } },
    timestamp: 3,
  }
  const projectedMessage: ChatMessage = {
    id: 'projected_runtime',
    role: 'assistant',
    content: 'projected',
    meta: { runtimeMessage: { threadId: 'thread_1', runId: 'run_new' } },
    timestamp: 4,
  }

  const merged = mergeRuntimeThreadProjectionMessages([localMessage, oldRuntimeMessage, otherRuntimeMessage], {
    thread: { id: 'thread_1' },
    messages: [projectedMessage],
  })

  assert.deepEqual(merged.map((message) => message.id), ['local_message', 'other_runtime', 'projected_runtime'])
})

test('markRuntimeMessagesRestored prepends restore context without dropping existing metadata', () => {
  const messages: ChatMessage[] = [{
    id: 'runtime_user',
    role: 'user',
    content: 'Continue',
    timestamp: 1,
    meta: {
      runtimeMessage: { threadId: 'thread_1', messageId: 'msg_1' },
      contextLabels: ['Existing'],
    },
  }]

  const restored = markRuntimeMessagesRestored(messages, 'Restored')

  assert.deepEqual(restored[0].meta?.contextLabels, ['Restored', 'Existing'])
  assert.deepEqual(restored[0].meta?.runtimeMessage, { threadId: 'thread_1', messageId: 'msg_1' })
})
