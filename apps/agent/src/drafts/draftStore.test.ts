import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentDraftStore } from './draftStore.js'

test('listDrafts filters by threadId and runId', () => {
  const store = new InMemoryAgentDraftStore()

  const threadDraft = store.createDraft({
    projectId: 1,
    kind: 'script_split',
    title: 'thread draft',
    content: '{}',
    createdByThreadId: 'thread-1',
  })
  const sourceThreadDraft = store.createDraft({
    projectId: 1,
    kind: 'production_proposal',
    title: 'source thread draft',
    content: '{}',
    source: { threadId: 'thread-2', runId: 'run-2' },
  })
  store.createDraft({
    projectId: 1,
    kind: 'note',
    title: 'other draft',
    content: '{}',
    createdByRunId: 'run-9',
  })

  assert.deepEqual(
    store.listDrafts({ threadId: 'thread-1' }).map((draft) => draft.id),
    [threadDraft.id],
  )
  assert.deepEqual(
    store.listDrafts({ threadId: 'thread-2' }).map((draft) => draft.id),
    [sourceThreadDraft.id],
  )
  assert.deepEqual(
    store.listDrafts({ runId: 'run-2' }).map((draft) => draft.id),
    [sourceThreadDraft.id],
  )
  assert.deepEqual(
    store.listDrafts({ runId: 'run-9' }).map((draft) => draft.kind),
    ['note'],
  )
})

test('listDrafts filters by multiple statuses', () => {
  const store = new InMemoryAgentDraftStore()
  const activeDraft = store.createDraft({ title: 'active', content: 'draft' })
  const appliedDraft = store.createDraft({ title: 'applied', content: 'done' })
  const rejectedDraft = store.createDraft({ title: 'rejected', content: 'no' })
  store.updateDraft(appliedDraft.id, { status: 'applied' })
  store.updateDraft(rejectedDraft.id, { status: 'rejected' })

  assert.deepEqual(
    store.listDrafts({ statuses: ['draft', 'applied'] }).map((draft) => draft.id).sort(),
    [activeDraft.id, appliedDraft.id].sort(),
  )
})
