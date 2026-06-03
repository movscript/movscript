import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildAgentConversationMessageItems,
  buildAgentConversationThreadItems,
  buildPendingRuntimeInputQueueItems,
  runIdsWithActivityMessages,
  runtimeInputDisplayStatus,
  splitRunGroupItemsForLiveBlocks,
} from '@/features/agent/domain/agentConversationThreadItems'
import type { AgentRun } from '@/shared/infrastructure/localAgentClient'
import type { ChatMessage } from '@/features/agent/state/agentStore'

test('buildAgentConversationMessageItems filters run interaction answer echoes', () => {
  const items = buildAgentConversationMessageItems({
    messages: [
      message({ id: 'echo', role: 'user', content: '回答：选择方向\n选择：A' }),
      message({ id: 'assistant', role: 'assistant', content: 'done' }),
    ],
    runInteractionAnswerEchoes: new Set(['回答：选择方向\n选择：A']),
    interactionRunsByResultMessageId: new Map(),
  })

  assert.deepEqual(items.map((item) => item.message.id), ['assistant'])
})

test('buildAgentConversationMessageItems prefers live run interaction runs before result messages', () => {
  const liveRun = run({ id: 'run_live' })
  const items = buildAgentConversationMessageItems({
    messages: [message({ id: 'assistant', role: 'assistant', content: 'done' })],
    runInteractionAnswerEchoes: new Set(),
    interactionRunsByResultMessageId: new Map([['assistant', [liveRun]]]),
  })

  assert.equal(items[0]?.liveInteractionRuns?.[0]?.id, 'run_live')
  assert.equal(items[0]?.beforeMessageInteractionRuns[0]?.id, 'run_live')
})

test('buildAgentConversationMessageItems suppresses mapped run interaction runs reserved for live activity', () => {
  const liveRun = run({ id: 'run_live' })
  const items = buildAgentConversationMessageItems({
    messages: [message({
      id: 'assistant',
      role: 'assistant',
      content: 'done',
      meta: { localRunActivity: runActivity('run_live') },
    })],
    runInteractionAnswerEchoes: new Set(),
    interactionRunsByResultMessageId: new Map([['assistant', [liveRun]]]),
    suppressedInteractionRunIds: new Set(['run_live']),
  })

  assert.deepEqual(items[0]?.liveInteractionRuns, [])
  assert.deepEqual(items[0]?.beforeMessageInteractionRuns, [])
  assert.equal(items[0]?.showMessage, true)
})

test('buildAgentConversationMessageItems suppresses historical run interaction fallback for runs reserved for live activity', () => {
  const items = buildAgentConversationMessageItems({
    messages: [message({
      id: 'assistant',
      role: 'assistant',
      content: 'done',
      meta: { localRunActivity: runActivity('run_live') },
    })],
    runInteractionAnswerEchoes: new Set(),
    interactionRunsByResultMessageId: new Map(),
    suppressedInteractionRunIds: new Set(['run_live']),
  })

  assert.equal(items[0]?.liveInteractionRuns, null)
  assert.deepEqual(items[0]?.beforeMessageInteractionRuns, [])
  assert.equal(items[0]?.showMessage, true)
})

test('buildAgentConversationMessageItems hides UI-only assistant anchors from the chat timeline', () => {
  const items = buildAgentConversationMessageItems({
    messages: [
      message({
        id: 'plan_revision_message',
        role: 'assistant',
        content: 'Plan updated',
        meta: {
          planRevision: {
            schema: 'movscript.agent.plan-revision.v1',
            id: 'plan_revision_1',
            planId: 'plan_1',
            threadId: 'thread_1',
            snapshot: {
              schema: 'movscript.agent.plan.v1',
              id: 'plan_1',
              threadId: 'thread_1',
              items: [{ step: 'Generate', status: 'completed' }],
              completedCount: 1,
              totalCount: 1,
              createdAt: '2026-05-19T00:00:00.000Z',
              updatedAt: '2026-05-19T00:00:00.000Z',
            },
            createdAt: '2026-05-19T00:00:00.000Z',
          },
        },
      }),
      message({
        id: 'runtime_status_message',
        role: 'assistant',
        content: '异步任务已提交。',
        meta: {
          runtimeStatus: {
            kind: 'async_work_handoff',
            title: '异步任务已提交',
            detail: '异步任务已提交。',
            workId: 'work_1',
          },
        },
      }),
      message({
        id: 'diagnostic_message',
        role: 'assistant',
        content: '',
        meta: {
          contextDiagnostic: {
            schema: 'movscript.local_context_diagnostic.v1',
            modelGatewayCalled: false,
            messages: [],
            debugParts: [],
            tools: {
              available: [],
              blocked: [],
              discoveredCount: 0,
              modelTools: [],
            },
            skills: [],
            warnings: [],
          },
        },
      }),
      message({ id: 'assistant', role: 'assistant', content: 'done' }),
    ],
    runInteractionAnswerEchoes: new Set(),
    interactionRunsByResultMessageId: new Map(),
  })

  assert.deepEqual(items.map((item) => item.message.id), ['assistant'])
})

test('buildAgentConversationMessageItems keeps historical requires-action messages so activity can render inline', () => {
  const items = buildAgentConversationMessageItems({
    messages: [message({
      id: 'assistant',
      role: 'assistant',
      content: '执行前需要确认：\n- movscript_test_tool: Needs confirmation',
      meta: {
        localRunActivity: {
          runId: 'run_history',
          threadId: 'thread_1',
          status: 'requires_action',
          createdAt: '2026-05-19T00:00:00.000Z',
          updatedAt: '2026-05-19T00:00:01.000Z',
          approvals: [{
            id: 'approval_1',
            runId: 'run_history',
            toolName: 'movscript_test_tool',
            reason: 'Needs confirmation',
            status: 'pending',
            createdAt: '2026-05-19T00:00:00.000Z',
            updatedAt: '2026-05-19T00:00:00.000Z',
          }],
          steps: [],
          events: [],
        },
      },
    })],
    runInteractionAnswerEchoes: new Set(),
    interactionRunsByResultMessageId: new Map(),
  })

  assert.equal(items[0]?.liveInteractionRuns, null)
  assert.deepEqual(items[0]?.beforeMessageInteractionRuns, [])
  assert.equal(items[0]?.showMessage, true)
})

test('buildAgentConversationMessageItems keeps synthetic requires-action placeholders for inline activity', () => {
  const items = buildAgentConversationMessageItems({
    messages: [message({
      id: 'assistant',
      role: 'assistant',
      content: '执行前需要确认：\n- movscript_test_tool: Needs confirmation',
      meta: {
        runtimeMessage: { threadId: 'thread_1', runId: 'run_requires_action' },
        localRunActivity: {
          runId: 'run_requires_action',
          threadId: 'thread_1',
          status: 'requires_action',
          createdAt: '2026-05-19T00:00:00.000Z',
          updatedAt: '2026-05-19T00:00:01.000Z',
          approvals: [{
            id: 'approval_1',
            runId: 'run_requires_action',
            toolName: 'movscript_test_tool',
            reason: 'Needs confirmation',
            status: 'pending',
            createdAt: '2026-05-19T00:00:00.000Z',
            updatedAt: '2026-05-19T00:00:00.000Z',
          }],
          steps: [],
          events: [],
        },
      },
    })],
    runInteractionAnswerEchoes: new Set(),
    interactionRunsByResultMessageId: new Map(),
  })

  assert.deepEqual(items[0]?.beforeMessageInteractionRuns, [])
  assert.equal(items[0]?.showMessage, true)
})

test('buildAgentConversationMessageItems puts source-message fallback run interaction cards after the user message', () => {
  const liveRun = run({ id: 'run_live' })
  const items = buildAgentConversationMessageItems({
    messages: [message({
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

test('buildAgentConversationMessageItems honors display anchor placement before a user message', () => {
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
  const items = buildAgentConversationMessageItems({
    messages: [message({
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

test('buildAgentConversationMessageItems honors display anchor placement after an assistant message', () => {
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
  const items = buildAgentConversationMessageItems({
    messages: [message({
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

test('buildAgentConversationMessageItems keeps substantive assistant content for requires-action runs', () => {
  const items = buildAgentConversationMessageItems({
    messages: [message({
      id: 'assistant',
      role: 'assistant',
      content: '我已经整理好生成参数，确认后会继续。',
      meta: {
        runtimeMessage: { threadId: 'thread_1', runId: 'run_requires_action', messageId: 'msg_assistant' },
        localRunActivity: {
          runId: 'run_requires_action',
          threadId: 'thread_1',
          status: 'requires_action',
          createdAt: '2026-05-19T00:00:00.000Z',
          updatedAt: '2026-05-19T00:00:01.000Z',
          approvals: [{
            id: 'approval_1',
            runId: 'run_requires_action',
            toolName: 'movscript_test_tool',
            reason: 'Needs confirmation',
            status: 'pending',
            createdAt: '2026-05-19T00:00:00.000Z',
            updatedAt: '2026-05-19T00:00:00.000Z',
          }],
          steps: [],
          events: [],
        },
      },
    })],
    runInteractionAnswerEchoes: new Set(),
    interactionRunsByResultMessageId: new Map(),
  })

  assert.equal(items[0]?.showMessage, true)
})

test('buildAgentConversationThreadItems keeps trigger messages outside run groups and nests runtime inputs', () => {
  const items = buildAgentConversationThreadItems({
    messages: [
      message({
        id: 'trigger',
        role: 'user',
        content: 'Start work',
        timestamp: 1,
        meta: {
          runtimeMessage: { threadId: 'thread_1', messageId: 'trigger', runId: 'run_1' },
          runtimeInput: { threadId: 'thread_1', messageId: 'trigger', runId: 'run_1', status: 'accepted' },
        },
      }),
      message({
        id: 'supplement',
        role: 'user',
        content: 'Add this constraint',
        timestamp: 2,
        meta: {
          runtimeMessage: { threadId: 'thread_1', messageId: 'msg_supplement', runId: 'run_1' },
          runtimeInput: { threadId: 'thread_1', messageId: 'msg_supplement', runId: 'run_1', status: 'accepted' },
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
    messages: [
      message({
        id: 'trigger',
        role: 'user',
        content: 'Start work',
        timestamp: 1,
        meta: {
          runtimeMessage: { threadId: 'thread_1', messageId: 'trigger', runId: 'run_1' },
          runtimeInput: { threadId: 'thread_1', messageId: 'trigger', runId: 'run_1', status: 'accepted' },
        },
      }),
      message({
        id: 'supplement',
        role: 'user',
        content: 'Add this constraint',
        timestamp: 2,
        meta: {
          runtimeMessage: { threadId: 'thread_1', messageId: 'msg_supplement', runId: 'run_1' },
          runtimeInput: { threadId: 'thread_1', messageId: 'msg_supplement', runId: 'run_1', status: 'accepted' },
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
        runtimeInput: { threadId: 'thread_1', runId: 'run_1', status: 'pending' },
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
    messages,
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
        runtimeInput: { threadId: 'thread_1', messageId: 'runtime_msg_1', runId: 'run_1', status: 'pending' },
      },
    }),
  ]
  const threadItems = buildAgentConversationThreadItems({
    messages,
    runInteractionAnswerEchoes: new Set(),
    interactionRunsByResultMessageId: new Map(),
  })
  const pendingQueue = buildPendingRuntimeInputQueueItems(messages)

  assert.equal(runtimeInputDisplayStatus(messages[0]!), 'accepted')
  assert.deepEqual(pendingQueue, [])
  assert.deepEqual(threadItems.flatMap((item) => item.type === 'message'
    ? [item.item.message.id]
    : item.items.map((messageItem) => messageItem.message.id)), ['supplement'])
})

test('buildAgentConversationThreadItems filters pending local run interaction input answer workspaces', () => {
  const items = buildAgentConversationThreadItems({
    messages: [
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
          runtimeInput: { threadId: 'thread_1', runId: 'run_1', status: 'pending' },
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
    messages: [
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
          runtimeInput: { threadId: 'thread_1', messageId: 'answer', runId: 'run_1', status: 'accepted' },
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
        runtimeInput: { status: 'pending' },
      },
    }),
  ]
  const threadItems = buildAgentConversationThreadItems({
    messages,
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

test('runIdsWithActivityMessages only treats assistant messages with activity snapshots as embedded activity', () => {
  const runIds = runIdsWithActivityMessages([
    message({
      id: 'assistant_final_without_activity',
      role: 'assistant',
      content: 'Final text',
      meta: { runtimeMessage: { threadId: 'thread_1', messageId: 'msg_final', runId: 'run_1' } },
    }),
    message({
      id: 'assistant_with_activity',
      role: 'assistant',
      content: 'Activity attached',
      meta: {
        runtimeMessage: { threadId: 'thread_1', messageId: 'msg_final_2', runId: 'run_2' },
        localRunActivity: {
          runId: 'run_2',
          threadId: 'thread_1',
          status: 'completed',
          createdAt: '2026-05-19T00:00:00.000Z',
          updatedAt: '2026-05-19T00:00:01.000Z',
          steps: [],
          events: [],
        },
      },
    }),
    message({
      id: 'assistant_ui_only_with_activity',
      role: 'assistant',
      content: 'UI-only activity anchor',
      meta: {
        runtimeStatus: {
          kind: 'async_work_handoff',
          title: '异步任务已提交',
          detail: '任务正在后台运行。',
        },
        localRunActivity: {
          runId: 'run_3',
          threadId: 'thread_1',
          status: 'completed',
          createdAt: '2026-05-19T00:00:00.000Z',
          updatedAt: '2026-05-19T00:00:01.000Z',
          steps: [],
          events: [],
        },
      },
    }),
  ])

  assert.deepEqual([...runIds], ['run_2'])
})

function runActivity(runId: string): NonNullable<ChatMessage['meta']>['localRunActivity'] {
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
