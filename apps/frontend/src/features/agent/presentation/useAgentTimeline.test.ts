import assert from 'node:assert/strict'
import test from 'node:test'

import {
  timelineItemToChatMessage,
  isTranscriptTimelineItem,
  localTimelineItemMatchesScope,
  timelineEffectiveScope,
  timelineScopeKey,
  visibleTimelineStateForScope,
  type TimelineViewState,
} from '@/features/agent/presentation/useAgentTimeline'
import type { AgentTimelineItem } from '@/shared/infrastructure/localAgentClient'

test('visibleTimelineStateForScope hides stale items synchronously when item scope changes', () => {
  const previous = state({
    scopeKey: timelineScopeKey('session_1', 'thread_old'),
    items: [message({ id: 'old_run_message', content: 'old run' })],
    loaded: true,
    loading: false,
  })

  const visible = visibleTimelineStateForScope(previous, timelineScopeKey('session_1', 'thread_new'))

  assert.deepEqual(visible.items, [])
  assert.equal(visible.loaded, false)
  assert.equal(visible.loading, true)
  assert.equal(visible.scopeKey, timelineScopeKey('session_1', 'thread_new'))
})

test('visibleTimelineStateForScope keeps current scope items', () => {
  const current = state({
    scopeKey: timelineScopeKey('session_1', 'thread_1'),
    items: [message({ id: 'current_run_message', content: 'current run' })],
    loaded: true,
    loading: false,
  })

  assert.equal(visibleTimelineStateForScope(current, current.scopeKey), current)
})

test('timelineEffectiveScope can require a thread for chat timelines', () => {
  assert.deepEqual(timelineEffectiveScope({
    localSessionId: ' session_1 ',
    requireThread: true,
  }), {
    sessionId: '',
    threadId: '',
  })
  assert.deepEqual(timelineEffectiveScope({
    localSessionId: ' session_1 ',
    localThreadId: ' thread_1 ',
    requireThread: true,
  }), {
    sessionId: 'session_1',
    threadId: 'thread_1',
  })
})

test('timelineItemToChatMessage derives generation jobs from activity events', () => {
  const chatMessage = timelineItemToChatMessage(message({
    activity: {
      runId: 'run_1',
      threadId: 'thread_1',
      status: 'completed',
      createdAt: '2026-05-19T00:00:00.000Z',
      updatedAt: '2026-05-19T00:00:02.000Z',
      steps: [],
      events: [{
        id: 'trace_1',
        kind: 'tool_call',
        title: 'Generation completed',
        status: 'completed',
        createdAt: '2026-05-19T00:00:01.000Z',
        completedAt: '2026-05-19T00:00:02.000Z',
        data: {
          generation: {
            jobId: 88,
            status: 'succeeded',
            stage: 'completed',
            progress: 100,
            terminal: true,
            outputResourceId: 880,
          },
        },
      }],
    },
  }))

  assert.ok(chatMessage)
  assert.equal(chatMessage.meta?.generationJobs?.[0]?.jobId, 88)
  assert.equal(chatMessage.meta?.generationJobs?.[0]?.terminal, true)
  assert.equal(chatMessage.meta?.generationJobs?.[0]?.outputResourceId, 880)
})

test('timelineItemToChatMessage keeps timeline status metadata out of chat messages', () => {
  const chatMessage = timelineItemToChatMessage(message({
    id: 'assistant:run_1',
    content: 'Plan updated',
    runtimeRefs: { threadId: 'thread_1', messageId: 'msg_plan', runId: 'run_1' },
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
      runtimeStatus: {
        kind: 'async_work_handoff',
        title: '异步任务已提交',
        detail: '任务正在后台运行，完成后会自动接续。你可以继续发送消息。',
        workId: 'work_1',
      },
    },
  }))

  assert.ok(chatMessage)
  assert.equal(Object.prototype.hasOwnProperty.call(chatMessage.meta ?? {}, 'planRevision'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(chatMessage.meta ?? {}, 'runtimeStatus'), false)
  assert.equal(chatMessage.meta?.runtimeMessage?.messageId, 'msg_plan')
  assert.equal(chatMessage.meta?.runtimeMessage?.runId, 'run_1')
})

test('timelineItemToChatMessage only projects transcript text messages into chat', () => {
  assert.equal(isTranscriptTimelineItem(message({ origin: 'agent', purpose: 'transcript', surface: 'message_stream' })), true)
  assert.equal(isTranscriptTimelineItem(message({ origin: 'user', purpose: 'transcript', surface: 'message_stream' })), true)
  assert.equal(isTranscriptTimelineItem(message({ origin: 'system_runtime', purpose: 'status', surface: 'status_strip', content: 'status' })), false)
  assert.equal(timelineItemToChatMessage(message({
    origin: 'system_runtime',
    purpose: 'status',
    surface: 'status_strip',
    contentPromptEligibility: 'exclude',
    content: 'runtime status',
  })), undefined)
  assert.equal(timelineItemToChatMessage(message({
    origin: 'system_runtime',
    purpose: 'diagnostic',
    surface: 'debug_panel',
    contentPromptEligibility: 'exclude',
    content: 'diagnostic',
  })), undefined)
})

test('localTimelineItemMatchesScope keeps optimistic events in the active item scope', () => {
  assert.equal(localTimelineItemMatchesScope(
    message({ threadId: 'thread_1', sessionId: undefined }),
    { sessionId: 'session_1' },
  ), false)
  assert.equal(localTimelineItemMatchesScope(
    message({ threadId: 'thread_1', sessionId: 'session_1' }),
    { sessionId: 'session_1' },
  ), true)
  assert.equal(localTimelineItemMatchesScope(
    message({ threadId: 'thread_1', sessionId: 'session_old' }),
    { sessionId: 'session_new' },
  ), false)
  assert.equal(localTimelineItemMatchesScope(
    message({ threadId: 'thread_1', sessionId: undefined }),
    { sessionId: 'session_1', threadId: 'thread_1' },
  ), true)
  assert.equal(localTimelineItemMatchesScope(
    message({ threadId: 'thread_old', sessionId: 'session_1' }),
    { sessionId: 'session_1', threadId: 'thread_new' },
  ), false)
})

function state(patch: Partial<TimelineViewState> = {}): TimelineViewState {
  return {
    items: [],
    hasMoreBefore: false,
    snapshotRevision: 0,
    lastRevision: 0,
    needsReset: false,
    postResetItemIds: [],
    scopeKey: '',
    loaded: false,
    loading: false,
    ...patch,
  }
}

function message(patch: Partial<AgentTimelineItem> = {}): AgentTimelineItem {
  const id = patch.id ?? 'message_1'
  const createdAt = patch.createdAt ?? '2026-05-19T00:00:01.000Z'
  return {
    id,
    threadId: 'thread_1',
    origin: 'agent',
    purpose: 'transcript',
    surface: 'message_stream',
    contentPromptEligibility: 'include',
    sortRank: 50,
    content: '',
    createdAt,
    updatedAt: createdAt,
    revision: 1,
    cursor: `1:${encodeURIComponent(id)}`,
    runtimeRefs: { threadId: 'thread_1' },
    ...patch,
  }
}
