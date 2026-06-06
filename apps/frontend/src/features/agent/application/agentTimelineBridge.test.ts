import assert from 'node:assert/strict'
import test from 'node:test'

import {
  acceptedSourceTimelineCursor,
  timelineItemFromAcceptedSource,
  isAcceptedSourceTimelineItem,
} from '@/features/agent/application/agentTimelineBridge'
import type { AgentTimelineItem, AgentMessage, AgentRun } from '@/shared/infrastructure/providerSessionClient'

test('accepted source timeline bridge projects only user transcript messages', () => {
  const item = timelineItemFromAcceptedSource(message({ role: 'user' }), run())

  assert.equal(item?.id, 'message:msg_1')
  assert.equal(item?.origin, 'user')
  assert.equal(item?.purpose, 'transcript')
  assert.equal(item?.surface, 'message_stream')
  assert.equal(item?.contentPromptEligibility, 'include')
  assert.equal(item?.sortRank, 10)
  assert.equal(item?.providerSessionRefs.messageId, 'msg_1')
  assert.equal(item?.providerSessionRefs.runId, 'run_1')
  assert.equal(item?.cursor, '1779148801000:10:message%3Amsg_1')
  assert.equal(isAcceptedSourceTimelineItem(item), true)
})

test('accepted source timeline bridge preserves completed-with-warnings status', () => {
  const item = timelineItemFromAcceptedSource(message({ role: 'user' }), run({ status: 'completed_with_warnings' }))

  assert.equal(item?.status, 'completed_with_warnings')
})

test('accepted source timeline bridge uses the same semantic cursor rank as server user timeline items', () => {
  assert.equal(
    acceptedSourceTimelineCursor('2026-05-19T00:00:01.000Z', 'message:msg_1'),
    '1779148801000:10:message%3Amsg_1',
  )
})

test('accepted source timeline bridge rejects assistant and cross-thread messages', () => {
  assert.equal(timelineItemFromAcceptedSource(message({ role: 'assistant' }), run()), undefined)
  assert.equal(timelineItemFromAcceptedSource(message({ threadId: 'thread_other' }), run()), undefined)
})

test('accepted source item predicate rejects runtime-only or mismatched local item events', () => {
  assert.equal(isAcceptedSourceTimelineItem(timelineItem({ id: 'assistant:run_1', origin: 'agent' })), false)
  assert.equal(isAcceptedSourceTimelineItem(timelineItem({
    id: 'message:other',
    providerSessionRefs: { threadId: 'thread_1', messageId: 'msg_1', runId: 'run_1' },
  })), false)
  assert.equal(isAcceptedSourceTimelineItem(timelineItem({
    id: 'message:msg_1',
    providerSessionRefs: { threadId: 'thread_1', messageId: 'msg_1' },
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
    providerSessionLimits: {
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

function timelineItem(patch: Partial<AgentTimelineItem> = {}): AgentTimelineItem {
  const id = patch.id ?? 'message:msg_1'
  return {
    id,
    threadId: 'thread_1',
    origin: 'user',
    purpose: 'transcript',
    surface: 'message_stream',
    contentPromptEligibility: 'include',
    sortRank: 10,
    content: 'Hello',
    status: 'streaming',
    createdAt: '2026-05-19T00:00:01.000Z',
    updatedAt: '2026-05-19T00:00:02.000Z',
    revision: 1779148802000,
    cursor: `1779148801000:10:${encodeURIComponent(id)}`,
    providerSessionRefs: { threadId: 'thread_1', messageId: 'msg_1', runId: 'run_1' },
    ...patch,
  }
}
