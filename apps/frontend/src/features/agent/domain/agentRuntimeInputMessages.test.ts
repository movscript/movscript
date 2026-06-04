import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildPendingRuntimeInputQueueItems,
  runtimeInputDisplayDeliveryStatus,
} from '@/features/agent/domain/agentRuntimeInputMessages'
import type { ChatMessage } from '@/features/agent/state/agentStore'

test('buildPendingRuntimeInputQueueItems keeps pending runtime inputs queued with run ids', () => {
  const messages = [
    message({
      id: 'pending',
      content: 'Add this once the run accepts it',
      meta: {
        runtimeInput: { threadId: 'thread_1', runId: 'run_1', deliveryStatus: 'pending' },
      },
    }),
  ]

  assert.deepEqual(buildPendingRuntimeInputQueueItems(messages).map((item) => ({
    id: item.id,
    runId: item.runId,
    content: item.content,
  })), [{
    id: 'pending',
    runId: 'run_1',
    content: 'Add this once the run accepts it',
  }])
})

test('runtimeInputDisplayDeliveryStatus treats pending runtime inputs with message ids as accepted', () => {
  const messages = [
    message({
      id: 'supplement',
      content: 'Use this extra constraint',
      meta: {
        runtimeMessage: { threadId: 'thread_1', messageId: 'runtime_msg_1', runId: 'run_1' },
        runtimeInput: { threadId: 'thread_1', messageId: 'runtime_msg_1', runId: 'run_1', deliveryStatus: 'pending' },
      },
    }),
  ]

  assert.equal(runtimeInputDisplayDeliveryStatus(messages[0]!), 'accepted')
  assert.deepEqual(buildPendingRuntimeInputQueueItems(messages), [])
})

test('buildPendingRuntimeInputQueueItems keeps new trigger messages pending until runtime accepts them', () => {
  const messages = [
    message({
      id: 'local_trigger',
      content: 'Start work',
      meta: {
        runtimeInput: { deliveryStatus: 'pending' },
      },
    }),
  ]

  assert.deepEqual(buildPendingRuntimeInputQueueItems(messages).map((item) => ({
    id: item.id,
    runId: item.runId,
    content: item.content,
  })), [{
    id: 'local_trigger',
    runId: undefined,
    content: 'Start work',
  }])
})

function message(patch: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message_1',
    role: 'user',
    content: '',
    timestamp: 1,
    ...patch,
  }
}
