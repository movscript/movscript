import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAgentConversationProjectionRunInteractions } from '@/features/agent/domain/agentConversationProjectionRunInteractions'
import type { AgentRun, AgentTimelineItem } from '@/shared/infrastructure/providerSessionClient'
import type { ChatMessage, ChatRunActivity } from '@/features/agent/state/agentStore'

test('buildAgentConversationProjectionRunInteractions maps anchored runs and leaves unanchored runs standalone', () => {
  const anchoredRun = run({ id: 'run_anchored' })
  const standaloneRun = run({ id: 'run_standalone' })
  const result = buildAgentConversationProjectionRunInteractions({
    interactionRuns: [anchoredRun, standaloneRun],
    messages: [
      message({
        id: 'assistant_anchored',
        meta: {
          runtimeMessage: { threadId: 'thread_1', messageId: 'assistant_anchored', runId: 'run_anchored' },
        },
      }),
    ],
    timelineItems: [],
  })

  assert.deepEqual(result.runsByResultMessageId.get('assistant_anchored')?.map((item) => item.id), ['run_anchored'])
  assert.deepEqual(result.standaloneRuns.map((item) => item.id), ['run_standalone'])
})

test('buildAgentConversationProjectionRunInteractions reads answer echoes from timeline activity', () => {
  const result = buildAgentConversationProjectionRunInteractions({
    interactionRuns: [],
    messages: [],
    timelineItems: [timelineItem('activity_message', answeredInputActivity())],
  })

  assert.equal(result.answerEchoMessageIds.has('[用户补充信息]\n标题：选择方向\n问题：Pick\n选择：\n- A'), true)
})

function run(patch: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'requires_action',
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
    ...patch,
  }
}

function message(patch: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message_1',
    role: 'assistant',
    content: '',
    timestamp: 1,
    ...patch,
  }
}

function timelineItem(id: string, activity: ChatRunActivity): AgentTimelineItem {
  return {
    id,
    threadId: 'thread_1',
    origin: 'agent',
    purpose: 'transcript',
    surface: 'message_stream',
    contentPromptEligibility: 'include',
    sortRank: 30,
    content: '',
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:00.000Z',
    revision: 1,
    cursor: id,
    providerSessionRefs: { threadId: 'thread_1' },
    activity,
  }
}

function answeredInputActivity(): ChatRunActivity {
  return {
    runId: 'run_1',
    threadId: 'thread_1',
    status: 'completed',
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:01.000Z',
    inputs: [{
      id: 'input_1',
      runId: 'run_1',
      title: '选择方向',
      question: 'Pick',
      inputType: 'choice',
      choices: [{ id: 'a', label: 'A' }],
      allowCustomAnswer: false,
      status: 'answered',
      answer: { choiceIds: ['a'] },
      createdAt: '2026-05-19T00:00:00.000Z',
      updatedAt: '2026-05-19T00:00:01.000Z',
      answeredAt: '2026-05-19T00:00:01.000Z',
    }],
    steps: [],
    events: [],
  }
}
