import assert from 'node:assert/strict'
import test from 'node:test'
import {
  EMPTY_AGENT_MESSAGE_FEED_STATE,
  applyMessageFeedEvent,
  mergeMessageFeedPage,
  mergeMessageFeedResetPage,
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

test('message feed state reset reload drops pre-reset stale messages even when their revisions are newer than the snapshot', () => {
  const current = {
    ...replaceMessageFeedPage(page([
      message({ id: 'message:old_run', cursor: '1:message%3Aold_run', content: 'Old run', revision: 1 }),
      message({ id: 'assistant:run_live', cursor: '5:assistant%3Arun_live', content: 'Live stream', revision: 5 }),
    ], { snapshotRevision: 1 })),
    needsReset: true,
    lastRevision: 5,
    postResetMessageIds: [],
  }

  const merged = mergeMessageFeedResetPage(current, page([
    message({ id: 'message:final', cursor: '3:message%3Afinal', content: 'Final', revision: 3 }),
  ], { snapshotRevision: 4 }))

  assert.deepEqual(merged.messages.map((item) => item.id), [
    'message:final',
  ])
  assert.equal(merged.needsReset, false)
  assert.deepEqual(merged.postResetMessageIds, [])
  assert.equal(merged.snapshotRevision, 4)
  assert.equal(merged.lastRevision, 5)
})

test('message feed state reset reload keeps only streams that arrived after reset was requested', () => {
  const current = replaceMessageFeedPage(page([
    message({ id: 'message:old_run', cursor: '1:message%3Aold_run', content: 'Old run', revision: 1 }),
  ], { snapshotRevision: 1 }))
  const reset = applyMessageFeedEvent(current, {
    type: 'messages.reset_required',
    revision: 2,
    reason: 'gap',
  })
  const concurrent = applyMessageFeedEvent(reset, {
    type: 'message.updated',
    revision: 5,
    message: message({ id: 'assistant:run_live', cursor: '5:assistant%3Arun_live', content: 'Live stream', revision: 5 }),
  })
  const merged = mergeMessageFeedResetPage(concurrent, page([
    message({ id: 'message:final', cursor: '3:message%3Afinal', content: 'Final', revision: 3 }),
  ], { snapshotRevision: 4 }))

  assert.equal(concurrent.needsReset, true)
  assert.deepEqual(concurrent.postResetMessageIds, ['assistant:run_live'])
  assert.deepEqual(merged.messages.map((item) => item.id), [
    'message:final',
    'assistant:run_live',
  ])
  assert.equal(merged.needsReset, false)
  assert.deepEqual(merged.postResetMessageIds, [])
  assert.equal(merged.lastRevision, 5)
})

test('message feed state sorts timestamp cursors numerically', () => {
  const state = replaceMessageFeedPage(page([
    message({ id: 'message:old', cursor: '999:message%3Aold', content: 'Old', revision: 1 }),
    message({ id: 'message:new', cursor: '1000:message%3Anew', content: 'New', revision: 2 }),
  ], { snapshotRevision: 2 }))

  assert.deepEqual(state.messages.map((item) => item.id), ['message:old', 'message:new'])
})

test('message feed state honors semantic cursor ranks for same-timestamp feed messages', () => {
  const state = replaceMessageFeedPage(page([
    message({ id: 'assistant:run_1', cursor: '1000:30:assistant%3Arun_1', content: 'Final', revision: 3 }),
    message({ id: 'message:msg_status', cursor: '1000:20:message%3Amsg_status', content: 'Status', revision: 2 }),
    message({ id: 'message:msg_user', role: 'user', cursor: '1000:10:message%3Amsg_user', content: 'User', revision: 1 }),
  ], { snapshotRevision: 3 }))

  assert.deepEqual(state.messages.map((item) => item.id), [
    'message:msg_user',
    'message:msg_status',
    'assistant:run_1',
  ])
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
