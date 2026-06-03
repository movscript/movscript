import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildAgentTranscriptMessageItems,
  buildAgentConversationThreadItems,
  buildPendingRuntimeInputQueueItems,
  runIdsWithTimelineActivityItems,
  runtimeInputDisplayDeliveryStatus,
  splitRunGroupItemsForLiveBlocks,
} from '@/features/agent/domain/agentConversationThreadItems'
import type { AgentRun, AgentTimelineItem } from '@/shared/infrastructure/localAgentClient'
import type { ChatMessage, ChatRunActivity } from '@/features/agent/state/agentStore'

test('buildAgentTranscriptMessageItems filters run interaction answer echoes', () => {
  const items = buildAgentTranscriptMessageItems({
    transcriptMessages: [
      message({ id: 'echo', role: 'user', content: '回答：选择方向\n选择：A' }),
      message({ id: 'assistant', role: 'assistant', content: 'done' }),
    ],
    runInteractionAnswerEchoes: new Set(['回答：选择方向\n选择：A']),
    interactionRunsByResultMessageId: new Map(),
  })

  assert.deepEqual(items.map((item) => item.message.id), ['assistant'])
})

test('buildAgentTranscriptMessageItems prefers live run interaction runs before result messages', () => {
  const liveRun = run({ id: 'run_live' })
  const items = buildAgentTranscriptMessageItems({
    transcriptMessages: [message({ id: 'assistant', role: 'assistant', content: 'done' })],
    runInteractionAnswerEchoes: new Set(),
    interactionRunsByResultMessageId: new Map([['assistant', [liveRun]]]),
  })

  assert.equal(items[0]?.liveInteractionRuns?.[0]?.id, 'run_live')
  assert.equal(items[0]?.beforeMessageInteractionRuns[0]?.id, 'run_live')
})

test('buildAgentTranscriptMessageItems suppresses mapped run interaction runs reserved for live activity', () => {
  const liveRun = run({ id: 'run_live' })
  const items = buildAgentTranscriptMessageItems({
    transcriptMessages: [message({
      id: 'assistant',
      role: 'assistant',
      content: 'done',
    })],
    timelineItems: [timelineItem('assistant', runActivity('run_live'))],
    runInteractionAnswerEchoes: new Set(),
    interactionRunsByResultMessageId: new Map([['assistant', [liveRun]]]),
    suppressedInteractionRunIds: new Set(['run_live']),
  })

  assert.deepEqual(items[0]?.liveInteractionRuns, [])
  assert.deepEqual(items[0]?.beforeMessageInteractionRuns, [])
  assert.equal(items[0]?.showMessage, true)
})

test('buildAgentTranscriptMessageItems suppresses historical run interaction fallback for runs reserved for live activity', () => {
  const items = buildAgentTranscriptMessageItems({
    transcriptMessages: [message({
      id: 'assistant',
      role: 'assistant',
      content: 'done',
    })],
    timelineItems: [timelineItem('assistant', runActivity('run_live'))],
    runInteractionAnswerEchoes: new Set(),
    interactionRunsByResultMessageId: new Map(),
    suppressedInteractionRunIds: new Set(['run_live']),
  })

  assert.equal(items[0]?.liveInteractionRuns, null)
  assert.deepEqual(items[0]?.beforeMessageInteractionRuns, [])
  assert.equal(items[0]?.showMessage, true)
})

test('buildAgentTranscriptMessageItems keeps historical requires-action messages so activity can render inline', () => {
  const items = buildAgentTranscriptMessageItems({
    transcriptMessages: [message({
      id: 'assistant',
      role: 'assistant',
      content: '执行前需要确认：\n- movscript_test_tool: Needs confirmation',
    })],
    timelineItems: [timelineItem('assistant', requiresActionActivity('run_history'))],
    runInteractionAnswerEchoes: new Set(),
    interactionRunsByResultMessageId: new Map(),
  })

  assert.equal(items[0]?.liveInteractionRuns, null)
  assert.deepEqual(items[0]?.beforeMessageInteractionRuns, [])
  assert.equal(items[0]?.showMessage, true)
})

test('buildAgentTranscriptMessageItems keeps synthetic requires-action placeholders for inline activity', () => {
  const items = buildAgentTranscriptMessageItems({
    transcriptMessages: [message({
      id: 'assistant',
      role: 'assistant',
      content: '执行前需要确认：\n- movscript_test_tool: Needs confirmation',
      meta: {
        runtimeMessage: { threadId: 'thread_1', runId: 'run_requires_action' },
      },
    })],
    timelineItems: [timelineItem('assistant', requiresActionActivity('run_requires_action'))],
    runInteractionAnswerEchoes: new Set(),
    interactionRunsByResultMessageId: new Map(),
  })

  assert.deepEqual(items[0]?.beforeMessageInteractionRuns, [])
  assert.equal(items[0]?.showMessage, true)
})

test('buildAgentTranscriptMessageItems puts source-message fallback run interaction cards after the user message', () => {
  const liveRun = run({ id: 'run_live' })
  const items = buildAgentTranscriptMessageItems({
    transcriptMessages: [message({
      id: 'trigger',
      role: 'user',
      content: 'Start work',
      meta: { runtimeMessage: { threadId: 'thread_1', messageId: 'trigger', runId: 'run_live' } },
    })],
    runInteractionAnswerEchoes: new Set(),
    interactionRunsByResultMessageId: new Map([['trigger', [liveRun]]]),
  })

  assert.deepEqual(items[0]?.beforeMessageInteractionRuns, [])
  assert.equal(items[0]?.afterMessageInteractionRuns[0]?.id, 'run_live')
  assert.equal(items[0]?.showMessage, true)
})

test('buildAgentTranscriptMessageItems honors display anchor placement before a user message', () => {
  const liveRun = run({
    id: 'run_live',
    pendingApprovals: [{
      id: 'approval_1',
      runId: 'run_live',
      toolName: 'generation_job_create',
      reason: 'Needs confirmation',
      status: 'pending',
      createdAt: '2026-05-19T00:00:00.000Z',
      updatedAt: '2026-05-19T00:00:00.000Z',
      displayAnchor: {
        threadId: 'thread_1',
        messageId: 'trigger',
        runId: 'run_live',
        placement: 'before',
        reason: 'run_source_message',
      },
    }],
  })
  const items = buildAgentTranscriptMessageItems({
    transcriptMessages: [message({
      id: 'trigger',
      role: 'user',
      content: 'Start work',
      meta: { runtimeMessage: { threadId: 'thread_1', messageId: 'trigger', runId: 'run_live' } },
    })],
    runInteractionAnswerEchoes: new Set(),
    interactionRunsByResultMessageId: new Map([['trigger', [liveRun]]]),
  })

  assert.equal(items[0]?.beforeMessageInteractionRuns[0]?.id, 'run_live')
  assert.deepEqual(items[0]?.afterMessageInteractionRuns, [])
})

test('buildAgentTranscriptMessageItems honors display anchor placement after an assistant message', () => {
  const liveRun = run({
    id: 'run_live',
    pendingApprovals: [{
      id: 'approval_1',
      runId: 'run_live',
      toolName: 'generation_job_create',
      reason: 'Needs confirmation',
      status: 'pending',
      createdAt: '2026-05-19T00:00:00.000Z',
      updatedAt: '2026-05-19T00:00:00.000Z',
      displayAnchor: {
        threadId: 'thread_1',
        messageId: 'assistant_runtime',
        runId: 'run_live',
        placement: 'after',
        reason: 'run_source_message',
      },
    }],
  })
  const items = buildAgentTranscriptMessageItems({
    transcriptMessages: [message({
      id: 'assistant_local',
      role: 'assistant',
      content: 'Ready',
      meta: { runtimeMessage: { threadId: 'thread_1', messageId: 'assistant_runtime', runId: 'run_live' } },
    })],
    runInteractionAnswerEchoes: new Set(),
    interactionRunsByResultMessageId: new Map([['assistant_local', [liveRun]]]),
  })

  assert.deepEqual(items[0]?.beforeMessageInteractionRuns, [])
  assert.equal(items[0]?.afterMessageInteractionRuns[0]?.id, 'run_live')
})

test('buildAgentTranscriptMessageItems keeps substantive assistant content for requires-action runs', () => {
  const items = buildAgentTranscriptMessageItems({
    transcriptMessages: [message({
      id: 'assistant',
      role: 'assistant',
      content: '我已经整理好生成参数，确认后会继续。',
      meta: {
        runtimeMessage: { threadId: 'thread_1', runId: 'run_requires_action', messageId: 'msg_assistant' },
      },
    })],
    timelineItems: [timelineItem('assistant', requiresActionActivity('run_requires_action'))],
    runInteractionAnswerEchoes: new Set(),
    interactionRunsByResultMessageId: new Map(),
  })

  assert.equal(items[0]?.showMessage, true)
})

test('buildAgentConversationThreadItems keeps trigger messages outside run groups and nests runtime inputs', () => {
  const items = buildAgentConversationThreadItems({
    transcriptMessages: [
      message({
        id: 'trigger',
        role: 'user',
        content: 'Start work',
        timestamp: 1,
        meta: {
          runtimeMessage: { threadId: 'thread_1', messageId: 'trigger', runId: 'run_1' },
          runtimeInput: { threadId: 'thread_1', messageId: 'trigger', runId: 'run_1', deliveryStatus: 'accepted' },
        },
      }),
      message({
        id: 'supplement',
        role: 'user',
        content: 'Add this constraint',
        timestamp: 2,
        meta: {
          runtimeMessage: { threadId: 'thread_1', messageId: 'msg_supplement', runId: 'run_1' },
          runtimeInput: { threadId: 'thread_1', messageId: 'msg_supplement', runId: 'run_1', deliveryStatus: 'accepted' },
        },
      }),
      message({
        id: 'assistant',
        role: 'assistant',
        content: 'Done',
        timestamp: 3,
        meta: { runtimeMessage: { threadId: 'thread_1', messageId: 'msg_assistant', runId: 'run_1' } },
      }),
    ],
    runInteractionAnswerEchoes: new Set(),
    interactionRunsByResultMessageId: new Map(),
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

test('splitRunGroupItemsForLiveBlocks keeps assistant output after live activity', () => {
  const threadItems = buildAgentConversationThreadItems({
    transcriptMessages: [
      message({
        id: 'trigger',
        role: 'user',
        content: 'Start work',
        timestamp: 1,
        meta: {
          runtimeMessage: { threadId: 'thread_1', messageId: 'trigger', runId: 'run_1' },
          runtimeInput: { threadId: 'thread_1', messageId: 'trigger', runId: 'run_1', deliveryStatus: 'accepted' },
        },
      }),
      message({
        id: 'supplement',
        role: 'user',
        content: 'Add this constraint',
        timestamp: 2,
        meta: {
          runtimeMessage: { threadId: 'thread_1', messageId: 'msg_supplement', runId: 'run_1' },
          runtimeInput: { threadId: 'thread_1', messageId: 'msg_supplement', runId: 'run_1', deliveryStatus: 'accepted' },
        },
      }),
      message({
        id: 'assistant_stream',
        role: 'assistant',
        content: 'Working',
        timestamp: 3,
        meta: { runtimeMessage: { threadId: 'thread_1', messageId: 'msg_assistant', runId: 'run_1' } },
      }),
    ],
    runInteractionAnswerEchoes: new Set(),
    interactionRunsByResultMessageId: new Map(),
  })
  const group = threadItems.find((item) => item.type === 'run_group')
  assert.equal(group?.type, 'run_group')
  if (group?.type !== 'run_group') return

  const split = splitRunGroupItemsForLiveBlocks(group.items)

  assert.deepEqual(split.beforeLiveBlocks.map((item) => item.message.id), ['supplement'])
  assert.deepEqual(split.afterLiveBlocks.map((item) => item.message.id), ['assistant_stream'])
})

test('buildAgentConversationThreadItems keeps pending runtime inputs in the composer queue until accepted', () => {
  const messages = [
    message({
      id: 'trigger',
      role: 'user',
      content: 'Start work',
      timestamp: 1,
      meta: { runtimeMessage: { threadId: 'thread_1', messageId: 'msg_trigger', runId: 'run_1' } },
    }),
    message({
      id: 'pending',
      role: 'user',
      content: 'Add this once the run accepts it',
      timestamp: 2,
      meta: {
        runtimeInput: { threadId: 'thread_1', runId: 'run_1', deliveryStatus: 'pending' },
      },
    }),
    message({
      id: 'assistant',
      role: 'assistant',
      content: 'Working',
      timestamp: 3,
      meta: { runtimeMessage: { threadId: 'thread_1', messageId: 'msg_assistant', runId: 'run_1' } },
    }),
  ]
  const threadItems = buildAgentConversationThreadItems({
    transcriptMessages: messages,
    runInteractionAnswerEchoes: new Set(),
    interactionRunsByResultMessageId: new Map(),
  })
  const pendingQueue = buildPendingRuntimeInputQueueItems(messages)

  assert.deepEqual(threadItems.flatMap((item) => item.type === 'message'
    ? [item.item.message.id]
    : item.items.map((messageItem) => messageItem.message.id)), [
    'trigger',
    'assistant',
  ])
  assert.deepEqual(pendingQueue.map((item) => ({
    id: item.id,
    runId: item.runId,
    content: item.content,
  })), [{
    id: 'pending',
    runId: 'run_1',
    content: 'Add this once the run accepts it',
  }])
})

test('runtime input pending status is treated as accepted once runtime assigns a message id', () => {
  const messages = [
    message({
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
    transcriptMessages: messages,
    runInteractionAnswerEchoes: new Set(),
    interactionRunsByResultMessageId: new Map(),
  })
  const pendingQueue = buildPendingRuntimeInputQueueItems(messages)

  assert.equal(runtimeInputDisplayDeliveryStatus(messages[0]!), 'accepted')
  assert.deepEqual(pendingQueue, [])
  assert.deepEqual(threadItems.flatMap((item) => item.type === 'message'
    ? [item.item.message.id]
    : item.items.map((messageItem) => messageItem.message.id)), ['supplement'])
})

test('buildAgentConversationThreadItems filters pending local run interaction input answer workspaces', () => {
  const items = buildAgentConversationThreadItems({
    transcriptMessages: [
      message({
        id: 'trigger',
        role: 'user',
        content: 'Start work',
        timestamp: 1,
        meta: { runtimeMessage: { threadId: 'thread_1', messageId: 'trigger', runId: 'run_1' } },
      }),
      message({
        id: 'answer',
        role: 'user',
        content: '[用户补充信息]\n标题：需要补充信息\n问题：可以。请告诉我你希望我接下来处理什么任务？\n输入：你好',
        timestamp: 2,
        meta: {
          runtimeInput: { threadId: 'thread_1', runId: 'run_1', deliveryStatus: 'pending' },
        },
      }),
    ],
    runInteractionAnswerEchoes: new Set(),
    interactionRunsByResultMessageId: new Map(),
  })

  assert.deepEqual(items.flatMap((item) => item.type === 'message'
    ? [item.item.message.id]
    : item.items.map((messageItem) => messageItem.message.id)), ['trigger'])
})

test('buildAgentConversationThreadItems filters accepted run interaction input answer echoes', () => {
  const items = buildAgentConversationThreadItems({
    transcriptMessages: [
      message({
        id: 'trigger',
        role: 'user',
        content: 'Start work',
        timestamp: 1,
        meta: { runtimeMessage: { threadId: 'thread_1', messageId: 'trigger', runId: 'run_1' } },
      }),
      message({
        id: 'answer',
        role: 'user',
        content: '[用户补充信息]\n标题：需要补充信息\n问题：可以。请告诉我你希望我接下来处理什么任务？\n输入：你好',
        timestamp: 2,
        meta: {
          runtimeMessage: { threadId: 'thread_1', messageId: 'answer', runId: 'run_1' },
          runtimeInput: { threadId: 'thread_1', messageId: 'answer', runId: 'run_1', deliveryStatus: 'accepted' },
        },
      }),
    ],
    runInteractionAnswerEchoes: new Set(['[用户补充信息]\n标题：需要补充信息\n问题：可以。请告诉我你希望我接下来处理什么任务？\n输入：你好']),
    interactionRunsByResultMessageId: new Map(),
  })

  assert.deepEqual(items.flatMap((item) => item.type === 'message'
    ? [item.item.message.id]
    : item.items.map((messageItem) => messageItem.message.id)), ['trigger'])
})

test('buildAgentConversationThreadItems keeps new trigger messages pending until runtime accepts them', () => {
  const messages = [
    message({
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
    transcriptMessages: messages,
    runInteractionAnswerEchoes: new Set(),
    interactionRunsByResultMessageId: new Map(),
  })
  const pendingQueue = buildPendingRuntimeInputQueueItems(messages)

  assert.deepEqual(threadItems, [])
  assert.deepEqual(pendingQueue.map((item) => ({
    id: item.id,
    runId: item.runId,
    content: item.content,
  })), [{
    id: 'local_trigger',
    runId: undefined,
    content: 'Start work',
  }])
})

test('runIdsWithTimelineActivityItems reads embedded activity from timeline items', () => {
  const runIds = runIdsWithTimelineActivityItems([
    timelineItem('assistant_final_without_activity'),
    timelineItem('assistant_with_activity', {
      runId: 'run_2',
      threadId: 'thread_1',
      status: 'completed',
      createdAt: '2026-05-19T00:00:00.000Z',
      updatedAt: '2026-05-19T00:00:01.000Z',
      steps: [],
      events: [],
    }),
  ])

  assert.deepEqual([...runIds], ['run_2'])
})

function timelineItem(id: string, activity?: ChatRunActivity): AgentTimelineItem {
  return {
    id,
    threadId: 'thread_1',
    origin: 'agent',
    purpose: 'transcript',
    surface: 'message_stream',
    contentPromptEligibility: 'include',
    sortRank: 30,
    content: 'Final text',
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:00.000Z',
    revision: 1,
    cursor: id,
    runtimeRefs: { threadId: 'thread_1' },
    ...(activity ? { activity } : {}),
  }
}

function runActivity(runId: string): ChatRunActivity {
  return {
    runId,
    threadId: 'thread_1',
    status: 'requires_action',
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:01.000Z',
    inputs: [{
      id: 'input_1',
      runId,
      title: '需要补充信息',
      question: '请补充约束',
      inputType: 'text',
      choices: [],
      allowCustomAnswer: true,
      status: 'pending',
      createdAt: '2026-05-19T00:00:00.000Z',
      updatedAt: '2026-05-19T00:00:00.000Z',
    }],
    steps: [],
    events: [],
  }
}

function requiresActionActivity(runId: string): ChatRunActivity {
  return {
    runId,
    threadId: 'thread_1',
    status: 'requires_action',
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:01.000Z',
    approvals: [{
      id: 'approval_1',
      runId,
      toolName: 'movscript_test_tool',
      reason: 'Needs confirmation',
      status: 'pending',
      createdAt: '2026-05-19T00:00:00.000Z',
      updatedAt: '2026-05-19T00:00:00.000Z',
    }],
    steps: [],
    events: [],
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

function run(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'requires_action',
    runtimeLimits: { approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:00.000Z',
    steps: [],
    ...overrides,
  }
}
