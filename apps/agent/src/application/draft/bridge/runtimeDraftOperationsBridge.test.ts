import test from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryAgentDraftStore, validateDraft } from '../../../drafts/store/draftStore.js'
import type { RuntimeDraftBackendApplyResult } from '../../../ports/draft/backend/runtimeDraftBackendApplyPort.js'
import { createRuntimeDraftOperationsBridge } from './runtimeDraftOperationsBridge.js'

test('createRuntimeDraftOperationsBridge wires draft CRUD and apply helpers', async () => {
  const draftStore = new InMemoryAgentDraftStore()
  const backendApply: RuntimeDraftBackendApplyResult = { performed: false, skippedReason: 'test' }
  const backendApplyPort = {
    previewApplyReview: async () => ({ ok: true, backendApply } as const),
    applyReview: async () => backendApply,
  }
  const bridge = createRuntimeDraftOperationsBridge({
    draftStore,
    backendApplyPort,
    now: () => '2026-01-01T00:00:00.000Z',
  })

  const draft = bridge.createLocalDraft({
    projectId: 42,
    kind: 'project_standards_proposal',
    title: 'Script',
    content: JSON.stringify({
      schema: 'movscript.project_standards_proposal.v1',
      scope: 'project_standards_proposal',
      mode: 'snapshot',
      proposal: {
        project_style: {
          custom_rules: [],
        },
      },
    }),
  })
  const simulated = await bridge.simulateApplyDraft({
    draftId: draft.id,
    targetEntityType: 'script',
    targetEntityId: 1,
    targetField: 'content',
  }) as { ok?: boolean; backendApply?: RuntimeDraftBackendApplyResult }
  const rejected = bridge.rejectDraft({ draftId: draft.id, reason: 'not needed' })

  assert.equal(bridge.listDrafts({ projectId: 42 }).length, 1)
  assert.equal(bridge.getDraft(draft.id)?.id, draft.id)
  assert.equal(validateDraft(draft).ok, true)
  assert.equal(simulated.ok, true)
  assert.equal(simulated.backendApply, backendApply)
  assert.equal(rejected.status, 'draft')
  assert.equal(rejected.metadata?.lastReviewStatus, 'rejected')
})
