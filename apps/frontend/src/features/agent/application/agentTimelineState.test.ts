import assert from 'node:assert/strict'
import test from 'node:test'
import {
  EMPTY_AGENT_TIMELINE_STATE,
  applyTimelineEvent,
  mergeTimelinePage,
  mergeTimelineResetPage,
  replaceTimelinePage,
} from '@/features/agent/application/agentTimelineState'
import type { AgentTimelineItem, AgentTimelinePage } from '@/shared/infrastructure/providerSessionClient'

test('timeline state replaces initial latest page', () => {
  const state = replaceTimelinePage(page([
    item({ id: 'item:2', cursor: '2:message%3A2', content: 'Two', revision: 2 }),
    item({ id: 'item:1', cursor: '1:message%3A1', content: 'One', revision: 1 }),
  ], { nextBefore: '1:message%3A1', hasMoreBefore: true, snapshotRevision: 2 }))

  assert.deepEqual(state.items.map((item) => item.id), ['item:1', 'item:2'])
  assert.equal(state.nextBefore, '1:message%3A1')
  assert.equal(state.hasMoreBefore, true)
  assert.equal(state.lastRevision, 2)
})

test('timeline state merges older pages without duplicating newer messages', () => {
  const current = replaceTimelinePage(page([
    item({ id: 'item:2', cursor: '2:message%3A2', content: 'Two', revision: 2 }),
  ], { nextBefore: '2:message%3A2', hasMoreBefore: true, snapshotRevision: 2 }))

  const merged = mergeTimelinePage(current, page([
    item({ id: 'item:1', cursor: '1:message%3A1', content: 'One', revision: 1 }),
    item({ id: 'item:2', cursor: '2:message%3A2', content: 'Stale two', revision: 1 }),
  ], { hasMoreBefore: false, snapshotRevision: 2 }))

  assert.deepEqual(merged.items.map((item) => `${item.id}:${item.content}`), ['item:1:One', 'item:2:Two'])
  assert.equal(merged.hasMoreBefore, false)
})

test('timeline state applies created and updated events as upserts', () => {
  const created = applyTimelineEvent(EMPTY_AGENT_TIMELINE_STATE, {
    type: 'timeline.item.created',
    revision: 1,
    item: item({ id: 'assistant:run_1', cursor: '1:assistant%3Arun_1', content: 'Hel', revision: 1 }),
  })
  const updated = applyTimelineEvent(created, {
    type: 'timeline.item.updated',
    revision: 2,
    item: item({ id: 'assistant:run_1', cursor: '1:assistant%3Arun_1', content: 'Hello', revision: 2 }),
  })

  assert.deepEqual(updated.items.map((item) => `${item.id}:${item.content}:${item.revision}`), ['assistant:run_1:Hello:2'])
  assert.equal(updated.lastRevision, 2)
})

test('timeline state reset reload drops pre-reset stale items even when their revisions are newer than the snapshot', () => {
  const current = {
    ...replaceTimelinePage(page([
      item({ id: 'item:old_run', cursor: '1:message%3Aold_run', content: 'Old run', revision: 1 }),
      item({ id: 'assistant:run_live', cursor: 'opaque-live', createdAt: '2026-05-19T00:00:02.000Z', content: 'Live stream', revision: 5 }),
    ], { snapshotRevision: 1 })),
    needsReset: true,
    lastRevision: 5,
    postResetItemIds: [],
  }

  const merged = mergeTimelineResetPage(current, page([
    item({ id: 'item:final', cursor: 'opaque-final', createdAt: '2026-05-19T00:00:01.000Z', content: 'Final', revision: 3 }),
  ], { snapshotRevision: 4 }))

  assert.deepEqual(merged.items.map((item) => item.id), [
    'item:final',
  ])
  assert.equal(merged.needsReset, false)
  assert.deepEqual(merged.postResetItemIds, [])
  assert.equal(merged.snapshotRevision, 4)
  assert.equal(merged.lastRevision, 5)
})

test('timeline state reset reload keeps only streams that arrived after reset was requested', () => {
  const current = replaceTimelinePage(page([
    item({ id: 'item:old_run', cursor: '1:message%3Aold_run', content: 'Old run', revision: 1 }),
  ], { snapshotRevision: 1 }))
  const reset = applyTimelineEvent(current, {
    type: 'timeline.reset_required',
    revision: 2,
    reason: 'gap',
  })
  const concurrent = applyTimelineEvent(reset, {
    type: 'timeline.item.updated',
    revision: 5,
    item: item({ id: 'assistant:run_live', cursor: 'opaque-live', createdAt: '2026-05-19T00:00:02.000Z', content: 'Live stream', revision: 5 }),
  })
  const merged = mergeTimelineResetPage(concurrent, page([
    item({ id: 'item:final', cursor: 'opaque-final', createdAt: '2026-05-19T00:00:01.000Z', content: 'Final', revision: 3 }),
  ], { snapshotRevision: 4 }))

  assert.equal(concurrent.needsReset, true)
  assert.deepEqual(concurrent.postResetItemIds, ['assistant:run_live'])
  assert.deepEqual(merged.items.map((item) => item.id), [
    'item:final',
    'assistant:run_live',
  ])
  assert.equal(merged.needsReset, false)
  assert.deepEqual(merged.postResetItemIds, [])
  assert.equal(merged.lastRevision, 5)
})

test('timeline state sorts by explicit item timestamps instead of cursor text', () => {
  const state = replaceTimelinePage(page([
    item({ id: 'item:new', cursor: 'opaque-new', createdAt: '2026-05-19T00:00:02.000Z', content: 'New', revision: 2 }),
    item({ id: 'item:old', cursor: 'opaque-old', createdAt: '2026-05-19T00:00:01.000Z', content: 'Old', revision: 1 }),
  ], { snapshotRevision: 2 }))

  assert.deepEqual(state.items.map((item) => item.id), ['item:old', 'item:new'])
})

test('timeline state honors explicit sortRank for same-timestamp timeline items', () => {
  const createdAt = '2026-05-19T00:00:01.000Z'
  const state = replaceTimelinePage(page([
    item({ id: 'assistant:run_1', createdAt, cursor: 'opaque-final', content: 'Final', revision: 3 }),
    item({ id: 'item:msg_status', createdAt, origin: 'provider_session', purpose: 'status', surface: 'status_strip', contentPromptEligibility: 'exclude', sortRank: 20, cursor: 'opaque-status', content: 'Status', revision: 2 }),
    item({ id: 'item:msg_user', createdAt, origin: 'user', sortRank: 10, cursor: 'opaque-user', content: 'User', revision: 1 }),
  ], { snapshotRevision: 3 }))

  assert.deepEqual(state.items.map((item) => item.id), [
    'item:msg_user',
    'item:msg_status',
    'assistant:run_1',
  ])
})

test('timeline state ignores stale updates and records reset requests', () => {
  const current = replaceTimelinePage(page([
    item({ id: 'assistant:run_1', cursor: '1:assistant%3Arun_1', content: 'Hello', revision: 2 }),
  ], { snapshotRevision: 2 }))

  const stale = applyTimelineEvent(current, {
    type: 'timeline.item.updated',
    revision: 3,
    item: item({ id: 'assistant:run_1', cursor: '1:assistant%3Arun_1', content: 'He', revision: 1 }),
  })
  const reset = applyTimelineEvent(stale, {
    type: 'timeline.reset_required',
    revision: 4,
    reason: 'gap',
  })

  assert.equal(stale.items[0]?.content, 'Hello')
  assert.equal(stale.lastRevision, 3)
  assert.equal(reset.needsReset, true)
  assert.equal(reset.lastRevision, 4)
})

function page(items: AgentTimelineItem[], patch: Partial<AgentTimelinePage> = {}): AgentTimelinePage {
  return {
    items,
    hasMoreBefore: false,
    snapshotRevision: 0,
    ...patch,
  }
}

function item(patch: Partial<AgentTimelineItem> = {}): AgentTimelineItem {
  const id = patch.id ?? 'item:1'
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
    providerSessionRefs: { threadId: 'thread_1' },
    ...patch,
  }
}
