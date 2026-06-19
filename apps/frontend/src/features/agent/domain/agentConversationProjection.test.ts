import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAgentConversationProjection } from '@/features/agent/domain/agentConversationProjection'
import type { AgentConversationProjectionContentItem, AgentConversationProjectionItem, } from '@/features/agent/domain/agentConversationProjectionTypes'
import type { AgentConversationLiveBlock } from '@/features/agent/domain/agentConversationLiveBlocks'
import type { AgentRun, AgentTimelineItem } from '@movscript/core/agent/protocol'
import type { ChatMessage, ChatRunActivityEvent } from '@/features/agent/state/agentStore'

test('buildAgentConversationProjection inserts live blocks inside the active run turn', () => {
  const projection = buildAgentConversationProjection({
    activeRun: run({ id: 'run_1', status: 'in_progress' }),
    liveBlocks: [liveRunActivityBlock('run_1')],
    runInteractions: projectionRunInteractions(),
    timelineItems: [],
    transcriptMessages: [
      message({
        id: 'trigger',
        role: 'user',
        timestamp: 1,
        meta: {
          providerSessionMessage: { threadId: 'thread_1', messageId: 'trigger', runId: 'run_1' },
          providerSessionInput: { threadId: 'thread_1', messageId: 'trigger', runId: 'run_1', deliveryStatus: 'accepted' },
        },
      }),
      message({
        id: 'supplement',
        role: 'user',
        timestamp: 2,
        meta: {
          providerSessionMessage: { threadId: 'thread_1', messageId: 'supplement', runId: 'run_1' },
          providerSessionInput: { threadId: 'thread_1', messageId: 'supplement', runId: 'run_1', deliveryStatus: 'accepted' },
        },
      }),
      message({
        id: 'assistant',
        role: 'assistant',
        timestamp: 3,
        meta: { providerSessionMessage: { threadId: 'thread_1', messageId: 'assistant', runId: 'run_1' } },
      }),
    ],
  })

  assert.equal(projection.items[0]?.type, 'message')
  assert.equal(projection.items[1]?.type, 'run_turn')
  const turn = projection.items[1]
  assert.equal(turn?.type === 'run_turn' ? turn.runId : undefined, 'run_1')
  assert.deepEqual(turn?.type === 'run_turn' ? projectionContentItemLabels(turn.items) : [], [
    'message:supplement',
    'run_activity',
    'message:assistant',
  ])
})

test('buildAgentConversationProjection creates a transient run turn before timeline transcript exists', () => {
  const projection = buildAgentConversationProjection({
    activeRun: run({ id: 'run_first', status: 'in_progress' }),
    liveBlocks: [liveRunActivityBlock('run_first'), assistantStreamBlock()],
    runInteractions: projectionRunInteractions(),
    timelineItems: [],
    transcriptMessages: [],
  })

  assert.equal(projection.items.length, 1)
  const turn = projection.items[0]
  assert.equal(turn?.type, 'run_turn')
  assert.equal(turn?.type === 'run_turn' ? turn.runId : undefined, 'run_first')
  assert.deepEqual(turn?.type === 'run_turn' ? projectionContentItemLabels(turn.items) : [], [
    'run_activity',
    'assistant_stream',
  ])
})

test('buildAgentConversationProjection exposes empty loading state semantics', () => {
  const emptyProjection = buildAgentConversationProjection({
    activeRun: null,
    liveBlocks: [],
    runInteractions: projectionRunInteractions(),
    timelineItems: [],
    transcriptMessages: [],
  })
  const activeRunProjection = buildAgentConversationProjection({
    activeRun: run({ id: 'run_empty', status: 'in_progress' }),
    liveBlocks: [],
    runInteractions: projectionRunInteractions(),
    timelineItems: [],
    transcriptMessages: [],
  })

  assert.deepEqual(emptyProjection.items, [])
  assert.deepEqual(activeRunProjection.items, [])
})

test('buildAgentConversationProjection projects thinking blocks with run and state', () => {
  const activeRun = run({ id: 'run_thinking', status: 'in_progress' })
  const projection = buildAgentConversationProjection({
    activeRun,
    liveBlocks: [thinkingBlock()],
    runInteractions: projectionRunInteractions(),
    thinkingState: { status: 'calling_tool', toolName: 'movscript_test_tool' },
    timelineItems: [],
    transcriptMessages: [],
  })

  const turn = projection.items[0]
  const thinking = turn?.type === 'run_turn'
    ? turn.items.find((item) => item.type === 'thinking')
    : undefined

  assert.equal(thinking?.type, 'thinking')
  assert.equal(thinking?.type === 'thinking' ? thinking.run?.id : undefined, 'run_thinking')
  assert.equal(thinking?.type === 'thinking' ? thinking.state.status : undefined, 'calling_tool')
  assert.equal(thinking?.type === 'thinking' ? thinking.state.toolName : undefined, 'movscript_test_tool')
})

test('buildAgentConversationProjection hides live activity once final timeline activity exists', () => {
  const projection = buildAgentConversationProjection({
    activeRun: run({ id: 'run_1', status: 'completed' }),
    liveBlocks: [liveRunActivityBlock('run_1')],
    runInteractions: projectionRunInteractions(),
    timelineItems: [timelineItemWithActivity('assistant:run_1', 'run_1')],
    transcriptMessages: [
      message({
        id: 'assistant:run_1',
        role: 'assistant',
        timestamp: 1,
        meta: { providerSessionMessage: { threadId: 'thread_1', messageId: 'assistant', runId: 'run_1' } },
      }),
    ],
  })

  const turn = projection.items[0]
  assert.equal(turn?.type, 'run_turn')
  assert.deepEqual(turn?.type === 'run_turn' ? projectionContentItemLabels(turn.items) : [], ['message:assistant:run_1'])
})

test('buildAgentConversationProjection embeds mapped interaction runs in assistant messages', () => {
  const liveRun = run({
    id: 'run_embed',
    status: 'requires_action',
    pendingApprovals: [approval('run_embed')],
  })
  const projection = buildAgentConversationProjection({
    activeRun: liveRun,
    liveBlocks: [liveRunActivityBlock('run_embed', liveRun)],
    runInteractions: projectionRunInteractions({
      runsByResultMessageId: new Map([['assistant', [liveRun]]]),
    }),
    timelineItems: [],
    transcriptMessages: [
      message({
        id: 'assistant',
        role: 'assistant',
        timestamp: 1,
        meta: { providerSessionMessage: { threadId: 'thread_1', messageId: 'assistant', runId: 'run_embed' } },
      }),
    ],
  })

  const turn = projection.items[0]
  const assistant = turn?.type === 'run_turn' ? firstProjectedMessageItem(turn.items) : undefined

  assert.equal(assistant?.activity.embeddedInteractionRun?.id, 'run_embed')
  assert.equal(assistant?.activity.embeddedInteractionEvents.length, 1)
  assert.deepEqual(turn?.type === 'run_turn' ? projectionContentItemLabels(turn.items) : [], ['message:assistant'])
  assert.deepEqual(topLevelRunActivityRunIds(projection), [])
})

test('buildAgentConversationProjection projects interaction action runs next to messages', () => {
  const liveRun = run({
    id: 'run_action',
    status: 'requires_action',
    pendingApprovals: [approval('run_action')],
  })
  const projection = buildAgentConversationProjection({
    activeRun: liveRun,
    liveBlocks: [],
    runInteractions: projectionRunInteractions({
      runsByResultMessageId: new Map([['trigger', [liveRun]]]),
    }),
    timelineItems: [],
    transcriptMessages: [
      message({
        id: 'trigger',
        role: 'user',
        timestamp: 1,
        meta: { providerSessionMessage: { threadId: 'thread_1', messageId: 'trigger', runId: 'run_action' } },
      }),
    ],
  })

  assert.deepEqual(projectionContentItemLabels(projection.items), ['message:trigger', 'run_interaction:run_action'])
})

test('buildAgentConversationProjection suppresses non-terminal active run interaction cards by default', () => {
  const activeRun = run({
    id: 'run_active',
    status: 'in_progress',
    pendingApprovals: [approval('run_active')],
  })
  const projection = buildAgentConversationProjection({
    activeRun,
    liveBlocks: [],
    runInteractions: projectionRunInteractions({
      runsByResultMessageId: new Map([['assistant', [activeRun]]]),
    }),
    timelineItems: [],
    transcriptMessages: [
      message({
        id: 'assistant',
        role: 'assistant',
        timestamp: 1,
        meta: { providerSessionMessage: { threadId: 'thread_1', messageId: 'assistant', runId: 'run_active' } },
      }),
    ],
  })

  const turn = projection.items[0]
  const assistant = turn?.type === 'run_turn' ? firstProjectedMessageItem(turn.items) : undefined

  assert.equal(assistant?.activity.embeddedInteractionRun, null)
  assert.deepEqual(turn?.type === 'run_turn' ? projectionContentItemLabels(turn.items) : [], ['message:assistant'])
})

test('buildAgentConversationProjection filters standalone interaction runs already rendered in the thread', () => {
  const embeddedRun = run({
    id: 'run_embed',
    status: 'requires_action',
    pendingApprovals: [approval('run_embed')],
  })
  const primaryLiveBlockRun = run({
    id: 'run_live_block',
    status: 'requires_action',
    pendingApprovals: [approval('run_live_block')],
  })
  const standaloneRun = run({
    id: 'run_standalone',
    status: 'requires_action',
    pendingApprovals: [approval('run_standalone')],
  })
  const projection = buildAgentConversationProjection({
    activeRun: null,
    liveBlocks: [liveRunActivityBlock('run_live_block', primaryLiveBlockRun)],
    runInteractions: projectionRunInteractions({
      runsByResultMessageId: new Map([['assistant', [embeddedRun]]]),
      standaloneRuns: [embeddedRun, primaryLiveBlockRun, standaloneRun],
    }),
    timelineItems: [],
    transcriptMessages: [
      message({
        id: 'assistant',
        role: 'assistant',
        timestamp: 1,
        meta: { providerSessionMessage: { threadId: 'thread_1', messageId: 'assistant', runId: 'run_embed' } },
      }),
    ],
  })

  assert.deepEqual(topLevelRunActivityRunIds(projection), ['run_standalone'])
})

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message_1',
    role: 'assistant',
    content: 'Message',
    timestamp: 1,
    ...overrides,
  }
}

function projectionRunInteractions(overrides: {
  answerEchoMessageIds?: Set<string>
  runsByResultMessageId?: Map<string, AgentRun[]>
  standaloneRuns?: AgentRun[]
} = {}) {
  return {
    answerEchoMessageIds: overrides.answerEchoMessageIds ?? new Set<string>(),
    runsByResultMessageId: overrides.runsByResultMessageId ?? new Map<string, AgentRun[]>(),
    standaloneRuns: overrides.standaloneRuns ?? [],
  }
}

function projectionContentItemLabels(items: Array<AgentConversationProjectionContentItem | AgentConversationProjectionItem>): string[] {
  return items.map((item) => {
    if (item.type === 'message') return `message:${item.item.message.id}`
    if (item.type === 'run_interaction') return `run_interaction:${item.run.id}`
    if (item.type === 'run_turn') return `run_turn:${item.runId}`
    return item.type
  })
}

function firstProjectedMessageItem(items: NonNullable<Extract<ReturnType<typeof buildAgentConversationProjection>['items'][number], { type: 'run_turn' }>['items']>) {
  return items.find((item) => item.type === 'message')?.item
}

function topLevelRunActivityRunIds(projection: ReturnType<typeof buildAgentConversationProjection>): string[] {
  return projection.items
    .filter((item) => item.type === 'run_activity')
    .filter((item) => item.id.startsWith('run-activity:standalone:'))
    .map((item) => item.run?.id)
    .filter((id): id is string => Boolean(id))
}

function approval(runId: string): NonNullable<AgentRun['pendingApprovals']>[number] {
  return {
    id: `approval_${runId}`,
    runId,
    toolName: 'generation_job_create',
    reason: 'Needs confirmation',
    status: 'pending',
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:00.000Z',
  }
}

function run(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'in_progress',
    providerSessionLimits: {
      approvalMode: 'interactive',
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

function liveRunActivityBlock(runId: string, blockRun = run({ id: runId })): AgentConversationLiveBlock {
  return {
    id: 'live-run-activity',
    type: 'live_run_activity',
    run: blockRun,
    events: [activityEvent(runId)],
  }
}

function assistantStreamBlock(content = 'Streaming response'): AgentConversationLiveBlock {
  return {
    id: 'assistant-stream',
    type: 'assistant_stream',
    content,
  }
}

function thinkingBlock(): AgentConversationLiveBlock {
  return {
    id: 'thinking',
    type: 'thinking',
  }
}

function activityEvent(runId: string): ChatRunActivityEvent {
  return {
    id: `event_${runId}`,
    runId,
    kind: 'model_call',
    title: 'Model call',
    status: 'started',
    createdAt: '2026-05-19T00:00:00.000Z',
  }
}

function timelineItemWithActivity(id: string, runId: string): AgentTimelineItem {
  return {
    id,
    threadId: 'thread_1',
    origin: 'agent',
    purpose: 'transcript',
    surface: 'message_stream',
    contentPromptEligibility: 'include',
    sortRank: 50,
    content: 'Final text',
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:01.000Z',
    revision: 1,
    cursor: id,
    providerSessionRefs: { threadId: 'thread_1', runId },
    activity: {
      runId,
      threadId: 'thread_1',
      status: 'completed',
      createdAt: '2026-05-19T00:00:00.000Z',
      updatedAt: '2026-05-19T00:00:01.000Z',
      steps: [],
      events: [],
    },
  }
}
