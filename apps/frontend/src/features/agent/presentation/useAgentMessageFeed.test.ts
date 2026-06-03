import assert from 'node:assert/strict'
import test from 'node:test'

import {
  feedMessageToChatMessage,
  isTranscriptFeedMessage,
  localFeedMessageMatchesScope,
  messageFeedEffectiveScope,
  messageFeedScopeKey,
  visibleMessageFeedStateForScope,
  type FeedViewState,
} from '@/features/agent/presentation/useAgentMessageFeed'
import type { AgentFeedMessage } from '@/shared/infrastructure/localAgentClient'

test('visibleMessageFeedStateForScope hides stale messages synchronously when feed scope changes', () => {
  const previous = state({
    scopeKey: messageFeedScopeKey('session_1', 'thread_old'),
    messages: [message({ id: 'old_run_message', content: 'old run' })],
    loaded: true,
    loading: false,
  })

  const visible = visibleMessageFeedStateForScope(previous, messageFeedScopeKey('session_1', 'thread_new'))

  assert.deepEqual(visible.messages, [])
  assert.equal(visible.loaded, false)
  assert.equal(visible.loading, true)
  assert.equal(visible.scopeKey, messageFeedScopeKey('session_1', 'thread_new'))
})

test('visibleMessageFeedStateForScope keeps current scope messages', () => {
  const current = state({
    scopeKey: messageFeedScopeKey('session_1', 'thread_1'),
    messages: [message({ id: 'current_run_message', content: 'current run' })],
    loaded: true,
    loading: false,
  })

  assert.equal(visibleMessageFeedStateForScope(current, current.scopeKey), current)
})

test('messageFeedEffectiveScope can require a thread for chat timeline feeds', () => {
  assert.deepEqual(messageFeedEffectiveScope({
    localSessionId: ' session_1 ',
    requireThread: true,
  }), {
    sessionId: '',
    threadId: '',
  })
  assert.deepEqual(messageFeedEffectiveScope({
    localSessionId: ' session_1 ',
    localThreadId: ' thread_1 ',
    requireThread: true,
  }), {
    sessionId: 'session_1',
    threadId: 'thread_1',
  })
})

test('feedMessageToChatMessage derives generation jobs from activity events', () => {
  const chatMessage = feedMessageToChatMessage(message({
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

test('feedMessageToChatMessage preserves supported feed meta and runtime refs', () => {
  const chatMessage = feedMessageToChatMessage(message({
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
  assert.equal(chatMessage.meta?.planRevision?.id, 'plan_revision_1')
  assert.equal(chatMessage.meta?.runtimeStatus?.workId, 'work_1')
  assert.equal(chatMessage.meta?.runtimeMessage?.messageId, 'msg_plan')
  assert.equal(chatMessage.meta?.runtimeMessage?.runId, 'run_1')
})

test('feedMessageToChatMessage only projects transcript text messages into chat', () => {
  assert.equal(isTranscriptFeedMessage(message({ role: 'assistant', kind: 'text' })), true)
  assert.equal(isTranscriptFeedMessage(message({ role: 'user', kind: 'text' })), true)
  assert.equal(isTranscriptFeedMessage(message({ role: 'tool', kind: 'tool_result', content: 'tool result' })), false)
  assert.equal(isTranscriptFeedMessage(message({ role: 'system', kind: 'status', content: 'status' })), false)
  assert.equal(feedMessageToChatMessage(message({ role: 'tool', kind: 'tool_result', content: 'tool result' })), undefined)
  assert.equal(feedMessageToChatMessage(message({ role: 'assistant', kind: 'tool_call', content: 'call' })), undefined)
})

test('localFeedMessageMatchesScope keeps optimistic events in the active feed scope', () => {
  assert.equal(localFeedMessageMatchesScope(
    message({ threadId: 'thread_1', sessionId: undefined }),
    { sessionId: 'session_1' },
  ), false)
  assert.equal(localFeedMessageMatchesScope(
    message({ threadId: 'thread_1', sessionId: 'session_1' }),
    { sessionId: 'session_1' },
  ), true)
  assert.equal(localFeedMessageMatchesScope(
    message({ threadId: 'thread_1', sessionId: 'session_old' }),
    { sessionId: 'session_new' },
  ), false)
  assert.equal(localFeedMessageMatchesScope(
    message({ threadId: 'thread_1', sessionId: undefined }),
    { sessionId: 'session_1', threadId: 'thread_1' },
  ), true)
  assert.equal(localFeedMessageMatchesScope(
    message({ threadId: 'thread_old', sessionId: 'session_1' }),
    { sessionId: 'session_1', threadId: 'thread_new' },
  ), false)
})

function state(patch: Partial<FeedViewState> = {}): FeedViewState {
  return {
    messages: [],
    hasMoreBefore: false,
    snapshotRevision: 0,
    lastRevision: 0,
    needsReset: false,
    postResetMessageIds: [],
    scopeKey: '',
    loaded: false,
    loading: false,
    ...patch,
  }
}

function message(patch: Partial<AgentFeedMessage> = {}): AgentFeedMessage {
  const id = patch.id ?? 'message_1'
  const createdAt = patch.createdAt ?? '2026-05-19T00:00:01.000Z'
  return {
    id,
    threadId: 'thread_1',
    role: 'assistant',
    kind: 'text',
    content: '',
    createdAt,
    updatedAt: createdAt,
    revision: 1,
    cursor: `1:${encodeURIComponent(id)}`,
    runtimeRefs: { threadId: 'thread_1' },
    ...patch,
  }
}
