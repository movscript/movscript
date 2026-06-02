import assert from 'node:assert/strict'
import test from 'node:test'
import {
  EMPTY_AGENT_MESSAGE_FEED_STATE,
  applyMessageFeedEvent,
  mergeMessageFeedPage,
  replaceMessageFeedPage,
} from '@/features/agent/application/agentMessageFeedState'
import type { AgentFeedMessage, AgentFeedMessagePage } from '@/shared/infrastructure/localAgentClient'

test('message feed state replaces initial latest page', () => {
  const state = replaceMessageFeedPage(page([
    message({ id: 'message:2', cursor: '2:message%3A2', content: 'Two', revision: 2 }),
    message({ id: 'message:1', cursor: '1:message%3A1', content: 'One', revision: 1 }),
  ], { nextBefore: '1:message%3A1', hasMoreBefore: true, snapshotRevision: 2 }))

  assert.deepEqual(state.messages.map((item) => item.id), ['message:1', 'message:2'])
  assert.equal(state.nextBefore, '1:message%3A1')
  assert.equal(state.hasMoreBefore, true)
  assert.equal(state.lastRevision, 2)
})

test('message feed state merges older pages without duplicating newer messages', () => {
  const current = replaceMessageFeedPage(page([
    message({ id: 'message:2', cursor: '2:message%3A2', content: 'Two', revision: 2 }),
  ], { nextBefore: '2:message%3A2', hasMoreBefore: true, snapshotRevision: 2 }))

  const merged = mergeMessageFeedPage(current, page([
    message({ id: 'message:1', cursor: '1:message%3A1', content: 'One', revision: 1 }),
    message({ id: 'message:2', cursor: '2:message%3A2', content: 'Stale two', revision: 1 }),
  ], { hasMoreBefore: false, snapshotRevision: 2 }))

  assert.deepEqual(merged.messages.map((item) => `${item.id}:${item.content}`), ['message:1:One', 'message:2:Two'])
  assert.equal(merged.hasMoreBefore, false)
})

test('message feed state applies created and updated events as upserts', () => {
  const created = applyMessageFeedEvent(EMPTY_AGENT_MESSAGE_FEED_STATE, {
    type: 'message.created',
    revision: 1,
    message: message({ id: 'assistant:run_1', cursor: '1:assistant%3Arun_1', content: 'Hel', revision: 1 }),
  })
  const updated = applyMessageFeedEvent(created, {
    type: 'message.updated',
    revision: 2,
    message: message({ id: 'assistant:run_1', cursor: '1:assistant%3Arun_1', content: 'Hello', revision: 2 }),
  })

  assert.deepEqual(updated.messages.map((item) => `${item.id}:${item.content}:${item.revision}`), ['assistant:run_1:Hello:2'])
  assert.equal(updated.lastRevision, 2)
})

test('message feed state ignores stale updates and records reset requests', () => {
  const current = replaceMessageFeedPage(page([
    message({ id: 'assistant:run_1', cursor: '1:assistant%3Arun_1', content: 'Hello', revision: 2 }),
  ], { snapshotRevision: 2 }))

  const stale = applyMessageFeedEvent(current, {
    type: 'message.updated',
    revision: 3,
    message: message({ id: 'assistant:run_1', cursor: '1:assistant%3Arun_1', content: 'He', revision: 1 }),
  })
  const reset = applyMessageFeedEvent(stale, {
    type: 'messages.reset_required',
    revision: 4,
    reason: 'gap',
  })

  assert.equal(stale.messages[0]?.content, 'Hello')
  assert.equal(stale.lastRevision, 3)
  assert.equal(reset.needsReset, true)
  assert.equal(reset.lastRevision, 4)
})

function page(messages: AgentFeedMessage[], patch: Partial<AgentFeedMessagePage> = {}): AgentFeedMessagePage {
  return {
    messages,
    hasMoreBefore: false,
    snapshotRevision: 0,
    ...patch,
  }
}

function message(patch: Partial<AgentFeedMessage> = {}): AgentFeedMessage {
  const id = patch.id ?? 'message:1'
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
