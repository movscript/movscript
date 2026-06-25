import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAgentTranscriptMessageItems } from '@/features/agent/domain/agentTranscriptMessageItems'
import type { AgentRun, AgentTimelineItem } from '@movscript/agent-protocol'
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
})

test('buildAgentTranscriptMessageItems keeps synthetic requires-action placeholders for inline activity', () => {
  const items = buildAgentTranscriptMessageItems({
    transcriptMessages: [message({
      id: 'assistant',
      role: 'assistant',
      content: '执行前需要确认：\n- movscript_test_tool: Needs confirmation',
      meta: {
        providerSessionMessage: { threadId: 'thread_1', runId: 'run_requires_action' },
      },
    })],
    timelineItems: [timelineItem('assistant', requiresActionActivity('run_requires_action'))],
    runInteractionAnswerEchoes: new Set(),
    interactionRunsByResultMessageId: new Map(),
  })

  assert.deepEqual(items[0]?.beforeMessageInteractionRuns, [])
})

test('buildAgentTranscriptMessageItems puts source-message fallback run interaction cards after the user message', () => {
  const liveRun = run({ id: 'run_live' })
  const items = buildAgentTranscriptMessageItems({
    transcriptMessages: [message({
      id: 'trigger',
      role: 'user',
      content: 'Start work',
      meta: { providerSessionMessage: { threadId: 'thread_1', messageId: 'trigger', runId: 'run_live' } },
    })],
    runInteractionAnswerEchoes: new Set(),
    interactionRunsByResultMessageId: new Map([['trigger', [liveRun]]]),
  })

  assert.deepEqual(items[0]?.beforeMessageInteractionRuns, [])
  assert.equal(items[0]?.afterMessageInteractionRuns[0]?.id, 'run_live')
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
      meta: { providerSessionMessage: { threadId: 'thread_1', messageId: 'trigger', runId: 'run_live' } },
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
      meta: { providerSessionMessage: { threadId: 'thread_1', messageId: 'assistant_runtime', runId: 'run_live' } },
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
        providerSessionMessage: { threadId: 'thread_1', runId: 'run_requires_action', messageId: 'msg_assistant' },
      },
    })],
    timelineItems: [timelineItem('assistant', requiresActionActivity('run_requires_action'))],
    runInteractionAnswerEchoes: new Set(),
    interactionRunsByResultMessageId: new Map(),
  })

  assert.equal(items[0]?.message.content, '我已经整理好生成参数，确认后会继续。')
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
    providerSessionRefs: { threadId: 'thread_1' },
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
    providerSessionLimits: { approvalMode: 'interactive',
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
