import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentDraftStore, validateDraft } from './draftStore.js'

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

test('validateDraft accepts canonical project proposal content', () => {
  const store = new InMemoryAgentDraftStore()
  const draft = store.createDraft({
    kind: 'project_proposal',
    title: 'project proposal',
    content: JSON.stringify({
      schema: 'movscript.project_proposal.v1',
      scope: 'project_proposal',
      summary: '整理项目设定与素材需求',
      proposal: {
        creative_references: [{
          action: 'create',
          entity: 'creativeReferences',
          payload: { name: '女主', kind: 'person' },
        }],
        asset_slots: [{
          action: 'create',
          entity: 'assetSlots',
          payload: { name: '女主参考图', kind: 'image' },
        }],
      },
      operations: [],
      impact_notes: [],
      createdAt: '2026-05-08T00:00:00.000Z',
    }),
  })

  const validation = validateDraft(draft)
  assert.equal(validation.ok, true)
  assert.equal(validation.issues.filter((issue) => issue.severity === 'error').length, 0)
})

test('validateDraft rejects placeholder project proposal merge ids', () => {
  const store = new InMemoryAgentDraftStore()
  const draft = store.createDraft({
    kind: 'project_proposal',
    title: 'project proposal',
    content: JSON.stringify({
      schema: 'movscript.project_proposal.v1',
      scope: 'project_proposal',
      summary: '整理项目设定与素材需求',
      proposal: {
        creative_references: [{
          action: 'merge',
          entity: 'creativeReferences',
          target_id: 0,
          source_ids: [0],
          payload: {},
        }],
        asset_slots: [],
      },
      operations: [{
        action: 'merge',
        entity: 'creativeReferences',
        target_id: 0,
        source_ids: [0],
        payload: {},
      }],
      impact_notes: [],
      createdAt: '2026-05-08T00:00:00.000Z',
    }),
  })

  const validation = validateDraft(draft)
  assert.equal(validation.ok, false)
  assert.match(JSON.stringify(validation.issues), /target_id/)
  assert.match(JSON.stringify(validation.issues), /source_ids/)
})
