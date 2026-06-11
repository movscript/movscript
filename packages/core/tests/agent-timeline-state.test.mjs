import assert from 'node:assert/strict'
import test from 'node:test'

import {
  EMPTY_AGENT_TIMELINE_STATE,
  applyTimelineEvent,
  mergeTimelinePage,
  mergeTimelineResetPage,
  replaceTimelinePage,
} from '../dist/agent/index.js'

test('core timeline state replaces initial latest page in item order', () => {
  const state = replaceTimelinePage(page([
    item({ id: 'item:2', content: 'Two', revision: 2 }),
    item({ id: 'item:1', content: 'One', revision: 1 }),
  ], { nextBefore: '1:message%3A1', hasMoreBefore: true, snapshotRevision: 2 }))

  assert.deepEqual(state.items.map((value) => value.id), ['item:1', 'item:2'])
  assert.equal(state.nextBefore, '1:message%3A1')
  assert.equal(state.hasMoreBefore, true)
  assert.equal(state.lastRevision, 2)
})

test('core timeline state merges older pages without overwriting newer revisions', () => {
  const current = replaceTimelinePage(page([
    item({ id: 'item:2', content: 'Two', revision: 2 }),
  ], { nextBefore: '2:message%3A2', hasMoreBefore: true, snapshotRevision: 2 }))

  const merged = mergeTimelinePage(current, page([
    item({ id: 'item:1', content: 'One', revision: 1 }),
    item({ id: 'item:2', content: 'Stale two', revision: 1 }),
  ], { hasMoreBefore: false, snapshotRevision: 2 }))

  assert.deepEqual(merged.items.map((value) => `${value.id}:${value.content}`), ['item:1:One', 'item:2:Two'])
  assert.equal(merged.hasMoreBefore, false)
})

test('core timeline state applies stream events and ignores stale updates', () => {
  const created = applyTimelineEvent(EMPTY_AGENT_TIMELINE_STATE, {
    type: 'timeline.item.created',
    revision: 1,
    item: item({ id: 'assistant:run_1', content: 'Hel', revision: 1 }),
  })
  const updated = applyTimelineEvent(created, {
    type: 'timeline.item.updated',
    revision: 2,
    item: item({ id: 'assistant:run_1', content: 'Hello', revision: 2 }),
  })
  const stale = applyTimelineEvent(updated, {
    type: 'timeline.item.updated',
    revision: 3,
    item: item({ id: 'assistant:run_1', content: 'He', revision: 1 }),
  })

  assert.deepEqual(stale.items.map((value) => `${value.id}:${value.content}:${value.revision}`), ['assistant:run_1:Hello:2'])
  assert.equal(stale.lastRevision, 3)
})

test('core timeline reset reload keeps only post-reset concurrent stream items', () => {
  const current = replaceTimelinePage(page([
    item({ id: 'item:old_run', content: 'Old run', revision: 1 }),
  ], { snapshotRevision: 1 }))
  const reset = applyTimelineEvent(current, {
    type: 'timeline.reset_required',
    revision: 2,
    reason: 'gap',
  })
  const concurrent = applyTimelineEvent(reset, {
    type: 'timeline.item.updated',
    revision: 5,
    item: item({
      id: 'assistant:run_live',
      createdAt: '2026-05-19T00:00:02.000Z',
      content: 'Live stream',
      revision: 5,
    }),
  })
  const merged = mergeTimelineResetPage(concurrent, page([
    item({
      id: 'item:final',
      createdAt: '2026-05-19T00:00:01.000Z',
      content: 'Final',
      revision: 3,
    }),
  ], { snapshotRevision: 4 }))

  assert.equal(concurrent.needsReset, true)
  assert.deepEqual(concurrent.postResetItemIds, ['assistant:run_live'])
  assert.deepEqual(merged.items.map((value) => value.id), ['item:final', 'assistant:run_live'])
  assert.equal(merged.snapshotRevision, 4)
  assert.equal(merged.lastRevision, 5)
  assert.deepEqual(merged.postResetItemIds, [])
})

test('core timeline state sorts by createdAt, sortRank, then id', () => {
  const createdAt = '2026-05-19T00:00:01.000Z'
  const state = replaceTimelinePage(page([
    item({ id: 'assistant:run_1', createdAt, sortRank: 50, content: 'Final', revision: 3 }),
    item({ id: 'item:msg_status', createdAt, sortRank: 20, content: 'Status', revision: 2 }),
    item({ id: 'item:msg_user', createdAt, sortRank: 10, content: 'User', revision: 1 }),
  ], { snapshotRevision: 3 }))

  assert.deepEqual(state.items.map((value) => value.id), [
    'item:msg_user',
    'item:msg_status',
    'assistant:run_1',
  ])
})

function page(items, patch = {}) {
  return {
    items,
    hasMoreBefore: false,
    snapshotRevision: 0,
    ...patch,
  }
}

function item(patch = {}) {
  const id = patch.id ?? 'item:1'
  const createdAt = patch.createdAt ?? '2026-05-19T00:00:01.000Z'
  return {
    id,
    createdAt,
    updatedAt: createdAt,
    revision: 1,
    sortRank: 50,
    content: '',
    ...patch,
  }
}
