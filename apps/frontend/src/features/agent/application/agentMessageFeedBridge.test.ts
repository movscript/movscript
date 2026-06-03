import assert from 'node:assert/strict'
import test from 'node:test'

import {
  acceptedSourceFeedCursor,
  feedMessageFromAcceptedSource,
  isAcceptedSourceFeedMessage,
} from '@/features/agent/application/agentMessageFeedBridge'
import type { AgentFeedMessage, AgentMessage, AgentRun } from '@/shared/infrastructure/localAgentClient'

test('accepted source feed bridge projects only user transcript messages', () => {
  const feed = feedMessageFromAcceptedSource(message({ role: 'user' }), run())

  assert.equal(feed?.id, 'message:msg_1')
  assert.equal(feed?.role, 'user')
  assert.equal(feed?.runtimeRefs.messageId, 'msg_1')
  assert.equal(feed?.runtimeRefs.runId, 'run_1')
  assert.equal(feed?.cursor, '1779148801000:10:message%3Amsg_1')
  assert.equal(isAcceptedSourceFeedMessage(feed), true)
})

test('accepted source feed bridge uses the same semantic cursor rank as server user feed messages', () => {
  assert.equal(
    acceptedSourceFeedCursor('2026-05-19T00:00:01.000Z', 'message:msg_1'),
    '1779148801000:10:message%3Amsg_1',
  )
})

test('accepted source feed bridge rejects assistant and cross-thread messages', () => {
  assert.equal(feedMessageFromAcceptedSource(message({ role: 'assistant' }), run()), undefined)
  assert.equal(feedMessageFromAcceptedSource(message({ threadId: 'thread_other' }), run()), undefined)
})

test('accepted source feed predicate rejects runtime-only or mismatched local feed events', () => {
  assert.equal(isAcceptedSourceFeedMessage(feedMessage({ id: 'assistant:run_1', role: 'assistant' })), false)
  assert.equal(isAcceptedSourceFeedMessage(feedMessage({
    id: 'message:other',
    role: 'user',
    runtimeRefs: { threadId: 'thread_1', messageId: 'msg_1', runId: 'run_1' },
  })), false)
  assert.equal(isAcceptedSourceFeedMessage(feedMessage({
    id: 'message:msg_1',
    role: 'user',
    runtimeRefs: { threadId: 'thread_1', messageId: 'msg_1' },
  })), false)
})

function message(patch: Partial<AgentMessage> = {}): AgentMessage {
  return {
    id: 'msg_1',
    threadId: 'thread_1',
    role: 'user',
    content: 'Hello',
    createdAt: '2026-05-19T00:00:01.000Z',
    ...patch,
  }
}

function run(patch: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'in_progress',
    createdAt: '2026-05-19T00:00:01.000Z',
    updatedAt: '2026-05-19T00:00:02.000Z',
    runtimeLimits: {
      approvalMode: 'interactive',
      maxToolCalls: 10,
      maxIterations: 10,
      allowNetwork: false,
      allowFileBytes: false,
    },
    steps: [],
    ...patch,
  }
}

function feedMessage(patch: Partial<AgentFeedMessage> = {}): AgentFeedMessage {
  const id = patch.id ?? 'message:msg_1'
  return {
    id,
    threadId: 'thread_1',
    role: 'user',
    kind: 'text',
    content: 'Hello',
    status: 'streaming',
    createdAt: '2026-05-19T00:00:01.000Z',
    updatedAt: '2026-05-19T00:00:02.000Z',
    revision: 1779148802000,
    cursor: `1779148801000:10:${encodeURIComponent(id)}`,
    runtimeRefs: { threadId: 'thread_1', messageId: 'msg_1', runId: 'run_1' },
    ...patch,
  }
}
