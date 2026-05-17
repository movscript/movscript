import assert from 'node:assert/strict'
import test from 'node:test'
import { buildApplyDraftPreview } from './draftApply.js'
import { InMemoryAgentDraftStore } from './draftStore.js'

test('buildApplyDraftPreview rejects non-finite JSON values and uses safe fallbacks', () => {
  const store = new InMemoryAgentDraftStore()
  const draft = store.createDraft({
    kind: 'content_patch',
    title: 'Draft',
    content: 'safe proposed value',
    target: {
      entityType: 'script',
      entityId: 42,
    },
  })

  const preview = buildApplyDraftPreview(store, {
    draftId: draft.id,
    currentValue: Number.POSITIVE_INFINITY,
    proposedValue: {
      score: Number.NEGATIVE_INFINITY,
    },
  })

  assert.equal(preview.review.currentValue, null)
  assert.equal(preview.review.proposedValue, 'safe proposed value')
})

test('buildApplyDraftPreview drops invalid target project ids', () => {
  const store = new InMemoryAgentDraftStore()
  const draft = store.createDraft({
    kind: 'content_patch',
    title: 'Draft',
    content: 'safe proposed value',
    target: {
      entityType: 'script',
      entityId: 42,
      projectId: 42.5,
    },
  })

  const preview = buildApplyDraftPreview(store, {
    draftId: draft.id,
    projectId: '42',
  })

  assert.deepEqual(preview.review.target, {
    entityType: 'script',
    entityId: 42,
  })
})

test('buildApplyDraftPreview drops invalid numeric target entity ids', () => {
  const store = new InMemoryAgentDraftStore()
  const draft = store.createDraft({
    kind: 'content_patch',
    title: 'Draft',
    content: 'safe proposed value',
    target: {
      entityType: 'script',
      entityId: 42,
    },
  })

  assert.throws(
    () => buildApplyDraftPreview(store, {
      draftId: draft.id,
      target: {
        entityType: 'script',
        entityId: 42.5,
      },
    }),
    /apply_draft requires target entityType and entityId/,
  )
})
