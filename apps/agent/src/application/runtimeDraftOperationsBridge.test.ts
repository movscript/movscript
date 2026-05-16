import test from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryAgentDraftStore } from '../drafts/draftStore.js'
import type { BackendApplyResult } from '../drafts/backendApplyClient.js'
import { createRuntimeDraftOperationsBridge } from './runtimeDraftOperationsBridge.js'

test('createRuntimeDraftOperationsBridge wires draft CRUD and apply helpers', async () => {
  const draftStore = new InMemoryAgentDraftStore()
  const backendApply: BackendApplyResult = { performed: false, skippedReason: 'test' }
  const backendApplyClient = {
    previewApplyReview: async () => backendApply,
    applyReview: async () => backendApply,
  }
  const bridge = createRuntimeDraftOperationsBridge({
    draftStore,
    backendApplyClient,
    now: () => '2026-01-01T00:00:00.000Z',
  })

  const draft = bridge.createLocalDraft({
    projectId: 42,
    kind: 'script',
    title: 'Script',
    content: JSON.stringify({ body: 'Draft content' }),
  })
  const patched = bridge.patchDraft({
    draftId: draft.id,
    ops: [{ op: 'replace', path: '/body', value: 'Patched content' }],
  }) as { status?: string; validation?: { ok?: boolean } }
  const simulated = await bridge.simulateApplyDraft({
    draftId: draft.id,
    targetEntityType: 'script',
    targetEntityId: 1,
    targetField: 'content',
  }) as { ok?: boolean; backendApply?: BackendApplyResult }
  const rejected = bridge.rejectDraft({ draftId: draft.id, reason: 'not needed' })

  assert.equal(bridge.listDrafts({ projectId: 42 }).length, 1)
  assert.equal(bridge.getDraft(draft.id)?.id, draft.id)
  assert.equal(patched.status, 'patched')
  assert.equal(patched.validation?.ok, true)
  assert.equal((bridge.validateDraft({ draftId: draft.id }) as { ok?: boolean }).ok, true)
  assert.equal(simulated.ok, true)
  assert.equal(simulated.backendApply, backendApply)
  assert.equal(rejected.status, 'rejected')
})
