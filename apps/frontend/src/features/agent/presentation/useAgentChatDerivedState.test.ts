import assert from 'node:assert/strict'
import test from 'node:test'

import { agentTimelineItemsContainRunActivity, assistantMessageCompletesStreamingRun, filterActivityEventsForRun } from '@/features/agent/presentation/useAgentChatDerivedState'
import type { AgentTimelineItem } from '@/shared/infrastructure/localAgentClient'
import type { ChatMessage, ChatRunActivityEvent } from '@/features/agent/state/agentStore'

test('agentTimelineItemsContainRunActivity ignores transcript items without activity', () => {
  const timelineItems: AgentTimelineItem[] = [timelineItem('stream_message')]

  assert.equal(agentTimelineItemsContainRunActivity(timelineItems, 'run_1'), false)
})

test('agentTimelineItemsContainRunActivity detects timeline activity', () => {
  const timelineItems: AgentTimelineItem[] = [timelineItem('final_message', 'run_1')]

  assert.equal(agentTimelineItemsContainRunActivity(timelineItems, 'run_1'), true)
})

test('filterActivityEventsForRun drops prior run activity but keeps unscoped pending local events', () => {
  const events: ChatRunActivityEvent[] = [
    activityEvent({ id: 'http-request-1', kind: 'runtime', title: 'HTTP', status: 'started' }),
    activityEvent({ id: 'trace_old', runId: 'run_1', kind: 'tool_call', title: '旧工具结果', status: 'completed' }),
    activityEvent({ id: 'trace_current', runId: 'run_2', kind: 'model_call', title: '当前模型', status: 'started' }),
  ]

  assert.deepEqual(filterActivityEventsForRun(events, 'run_2').map((event) => event.id), ['http-request-1', 'trace_current'])
  assert.deepEqual(filterActivityEventsForRun(events, undefined).map((event) => event.id), ['http-request-1'])
})

test('assistantMessageCompletesStreamingRun only accepts final assistant messages for the matching run', () => {
  const finalAssistantMessage = message({
    id: 'assistant_run_1',
    content: '最终回复',
    meta: {
      runtimeMessage: {
        threadId: 'thread_1',
        messageId: 'assistant_run_1',
        runId: ' run_1 ',
      },
    },
  })

  assert.equal(assistantMessageCompletesStreamingRun(finalAssistantMessage, 'run_1'), true)
  assert.equal(assistantMessageCompletesStreamingRun(finalAssistantMessage, 'run_2'), false)
  assert.equal(assistantMessageCompletesStreamingRun({ ...finalAssistantMessage, role: 'user' }, 'run_1'), false)
})

test('assistantMessageCompletesStreamingRun ignores timeline activity and reads runtime message ids', () => {
  const finalAssistantMessage = message({
    id: 'assistant_run_1',
    content: '最终回复',
    meta: {
      runtimeMessage: {
        threadId: 'thread_1',
        messageId: 'assistant_run_1',
        runId: 'run_1',
      },
    },
  })

  assert.equal(assistantMessageCompletesStreamingRun(finalAssistantMessage, 'run_1'), true)
})

function message(patch: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'message_1',
    role: 'assistant',
    content: '',
    timestamp: 1,
    ...patch,
  }
}

function timelineItem(id: string, runId?: string): AgentTimelineItem {
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
    runtimeRefs: { threadId: 'thread_1' },
    ...(runId
      ? {
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
      : {}),
  }
}

function activityEvent(patch: Partial<ChatRunActivityEvent>): ChatRunActivityEvent {
  return {
    id: 'trace_1',
    kind: 'tool_call',
    title: 'Tool',
    status: 'started',
    createdAt: '2026-05-19T00:00:00.000Z',
    ...patch,
  }
}
