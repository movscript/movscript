import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildAgentConversationThreadItems,
} from '@/features/agent/domain/agentConversationThreadItems'
import type { AgentTranscriptMessageItem } from '@/features/agent/domain/agentTranscriptMessageItems'
import type { ChatMessage } from '@/features/agent/state/agentStore'

test('buildAgentConversationThreadItems keeps trigger messages outside run groups and nests runtime inputs', () => {
  const items = buildAgentConversationThreadItems({
    transcriptMessageItems: [
      messageItem({
        id: 'trigger',
        role: 'user',
        content: 'Start work',
        timestamp: 1,
        meta: {
          runtimeMessage: { threadId: 'thread_1', messageId: 'trigger', runId: 'run_1' },
          runtimeInput: { threadId: 'thread_1', messageId: 'trigger', runId: 'run_1', deliveryStatus: 'accepted' },
        },
      }),
      messageItem({
        id: 'supplement',
        role: 'user',
        content: 'Add this constraint',
        timestamp: 2,
        meta: {
          runtimeMessage: { threadId: 'thread_1', messageId: 'msg_supplement', runId: 'run_1' },
          runtimeInput: { threadId: 'thread_1', messageId: 'msg_supplement', runId: 'run_1', deliveryStatus: 'accepted' },
        },
      }),
      messageItem({
        id: 'assistant',
        role: 'assistant',
        content: 'Done',
        timestamp: 3,
        meta: { runtimeMessage: { threadId: 'thread_1', messageId: 'msg_assistant', runId: 'run_1' } },
      }),
    ],
  })

  assert.equal(items[0]?.type, 'message')
  assert.equal(items[0]?.type === 'message' ? items[0].item.message.id : undefined, 'trigger')
  assert.equal(items[1]?.type, 'run_group')
  assert.equal(items[1]?.type === 'run_group' ? items[1].runId : undefined, 'run_1')
  assert.deepEqual(items[1]?.type === 'run_group' ? items[1].items.map((item) => item.message.id) : [], [
    'supplement',
    'assistant',
  ])
})

test('buildAgentConversationThreadItems keeps pending runtime inputs out of the thread until accepted', () => {
  const messages = [
    messageItem({
      id: 'trigger',
      role: 'user',
      content: 'Start work',
      timestamp: 1,
      meta: { runtimeMessage: { threadId: 'thread_1', messageId: 'msg_trigger', runId: 'run_1' } },
    }),
    messageItem({
      id: 'pending',
      role: 'user',
      content: 'Add this once the run accepts it',
      timestamp: 2,
      meta: {
        runtimeInput: { threadId: 'thread_1', runId: 'run_1', deliveryStatus: 'pending' },
      },
    }),
    messageItem({
      id: 'assistant',
      role: 'assistant',
      content: 'Working',
      timestamp: 3,
      meta: { runtimeMessage: { threadId: 'thread_1', messageId: 'msg_assistant', runId: 'run_1' } },
    }),
  ]
  const threadItems = buildAgentConversationThreadItems({
    transcriptMessageItems: messages,
  })

  assert.deepEqual(threadItems.flatMap((item) => item.type === 'message'
    ? [item.item.message.id]
    : item.items.map((messageItem) => messageItem.message.id)), [
    'trigger',
    'assistant',
  ])
})

test('runtime input pending status is treated as accepted once runtime assigns a message id', () => {
  const messages = [
    messageItem({
      id: 'supplement',
      role: 'user',
      content: 'Use this extra constraint',
      timestamp: 2,
      meta: {
        runtimeMessage: { threadId: 'thread_1', messageId: 'runtime_msg_1', runId: 'run_1' },
        runtimeInput: { threadId: 'thread_1', messageId: 'runtime_msg_1', runId: 'run_1', deliveryStatus: 'pending' },
      },
    }),
  ]
  const threadItems = buildAgentConversationThreadItems({
    transcriptMessageItems: messages,
  })

  assert.deepEqual(threadItems.flatMap((item) => item.type === 'message'
    ? [item.item.message.id]
    : item.items.map((messageItem) => messageItem.message.id)), ['supplement'])
})

test('buildAgentConversationThreadItems filters pending local run interaction input answer workspaces', () => {
  const items = buildAgentConversationThreadItems({
    transcriptMessageItems: [
      messageItem({
        id: 'trigger',
        role: 'user',
        content: 'Start work',
        timestamp: 1,
        meta: { runtimeMessage: { threadId: 'thread_1', messageId: 'trigger', runId: 'run_1' } },
      }),
      messageItem({
        id: 'answer',
        role: 'user',
        content: '[用户补充信息]\n标题：需要补充信息\n问题：可以。请告诉我你希望我接下来处理什么任务？\n输入：你好',
        timestamp: 2,
        meta: {
          runtimeInput: { threadId: 'thread_1', runId: 'run_1', deliveryStatus: 'pending' },
        },
      }),
    ],
  })

  assert.deepEqual(items.flatMap((item) => item.type === 'message'
    ? [item.item.message.id]
    : item.items.map((messageItem) => messageItem.message.id)), ['trigger'])
})

test('buildAgentConversationThreadItems keeps new trigger messages pending until runtime accepts them', () => {
  const messages = [
    messageItem({
      id: 'local_trigger',
      role: 'user',
      content: 'Start work',
      timestamp: 1,
      meta: {
        runtimeInput: { deliveryStatus: 'pending' },
      },
    }),
  ]
  const threadItems = buildAgentConversationThreadItems({
    transcriptMessageItems: messages,
  })

  assert.deepEqual(threadItems, [])
})

function messageItem(overrides: Partial<ChatMessage> = {}): AgentTranscriptMessageItem {
  return {
    message: message(overrides),
    beforeMessageInteractionRuns: [],
    afterMessageInteractionRuns: [],
    liveInteractionRuns: null,
  }
}

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message_1',
    role: 'assistant',
    content: 'Message',
    timestamp: 1,
    ...overrides,
  }
}
