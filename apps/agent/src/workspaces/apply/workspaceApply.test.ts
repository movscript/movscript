import assert from 'node:assert/strict'
import test from 'node:test'
import { buildApplyWorkspacePreview } from './workspaceApply.js'
import { InMemoryAgentWorkspaceStore } from '../store/workspaceStore.js'

test('buildApplyWorkspacePreview rejects non-finite JSON values and uses safe fallbacks', () => {
  const store = new InMemoryAgentWorkspaceStore()
  const workspace = store.createWorkspace({
    kind: 'content_patch',
    title: 'Workspace',
    content: 'safe proposed value',
    target: {
      entityType: 'script',
      entityId: 42,
    },
  })

  const preview = buildApplyWorkspacePreview(store, {
    workspaceId: workspace.id,
    currentValue: Number.POSITIVE_INFINITY,
    proposedValue: {
      score: Number.NEGATIVE_INFINITY,
    },
  })

  assert.equal(preview.review.currentValue, null)
  assert.equal(preview.review.proposedValue, 'safe proposed value')
})

test('buildApplyWorkspacePreview drops invalid target project ids', () => {
  const store = new InMemoryAgentWorkspaceStore()
  const workspace = store.createWorkspace({
    kind: 'content_patch',
    title: 'Workspace',
    content: 'safe proposed value',
    target: {
      entityType: 'script',
      entityId: 42,
      projectId: 42.5,
    },
  })

  const preview = buildApplyWorkspacePreview(store, {
    workspaceId: workspace.id,
    projectId: '42',
  })

  assert.deepEqual(preview.review.target, {
    entityType: 'script',
    entityId: 42,
  })
})

test('buildApplyWorkspacePreview drops invalid numeric target entity ids', () => {
  const store = new InMemoryAgentWorkspaceStore()
  const workspace = store.createWorkspace({
    kind: 'content_patch',
    title: 'Workspace',
    content: 'safe proposed value',
    target: {
      entityType: 'script',
      entityId: 42,
    },
  })

  assert.throws(
    () => buildApplyWorkspacePreview(store, {
      workspaceId: workspace.id,
      target: {
        entityType: 'script',
        entityId: 42.5,
      },
    }),
    /apply_workspace requires target entityType and entityId/,
  )
})
