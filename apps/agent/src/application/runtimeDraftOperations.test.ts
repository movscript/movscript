import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentDraftStore } from '../drafts/draftStore.js'
import { BackendApplyHTTPError, type BackendApplyResult } from '../drafts/backendApplyClient.js'
import {
  applyRuntimeDraftFromUI,
  createRuntimeLocalDraft,
  getRuntimeDraft,
  listRuntimeDrafts,
  patchRuntimeDraft,
  previewRuntimeDraftApply,
  rejectRuntimeDraft,
  simulateRuntimeDraftApply,
  updateRuntimeDraft,
  validateRuntimeDraft,
  type RuntimeDraftBackendApplyClient,
} from './runtimeDraftOperations.js'

test('runtime draft CRUD helpers normalize inputs and project patch validation', () => {
  const draftStore = new InMemoryAgentDraftStore()
  const draft = createRuntimeLocalDraft({
    draftStore,
    draftInput: {
      projectId: 42,
      kind: 'script',
      title: 'Script',
      content: JSON.stringify({ body: 'Draft content' }),
      source: { threadId: 'thread_1', unsafe: new Date() },
    },
  })

  assert.equal(getRuntimeDraft({ draftStore, draftId: draft.id })?.id, draft.id)
  assert.equal(listRuntimeDrafts({ draftStore, query: { projectId: 42, kind: 'script' } }).length, 1)

  const updated = updateRuntimeDraft({
    draftStore,
    draftInput: { draftId: draft.id, title: 'Updated script', status: 'accepted' },
  })
  assert.equal(updated.title, 'Updated script')
  assert.equal(updated.status, 'accepted')

  const patched = patchRuntimeDraft({
    draftStore,
    patchInput: {
      draftId: draft.id,
      ops: [{ op: 'replace', path: '/body', value: 'Patched content' }],
    },
  }) as { status?: string; validation?: { ok?: boolean } }
  assert.equal(patched.status, 'patched')
  assert.equal(patched.validation?.ok, true)

  const preview = previewRuntimeDraftApply({
    draftStore,
    applyInput: { draftId: draft.id, targetEntityType: 'script', targetEntityId: 1, targetField: 'content' },
  }) as { status?: string; review?: { draftId?: string } }
  assert.equal(preview.status, 'preview')
  assert.equal(preview.review?.draftId, draft.id)

  const rejected = rejectRuntimeDraft({ draftStore, draftId: draft.id, reason: 'not needed' })
  assert.equal(rejected.status, 'rejected')
  assert.equal(rejected.rejectedReason, 'not needed')
})

test('validateRuntimeDraft validates existing drafts and rejects missing ids', () => {
  const draftStore = new InMemoryAgentDraftStore()
  const draft = draftStore.createDraft({
    kind: 'script',
    title: 'Script',
    content: 'Draft content',
  })

  const validation = validateRuntimeDraft({ draftStore, draftId: draft.id }) as { ok?: boolean; draftId?: string }

  assert.equal(validation.ok, true)
  assert.equal(validation.draftId, draft.id)
  assert.throws(() => validateRuntimeDraft({ draftStore, draftId: 'missing_draft' }), /draft not found: missing_draft/)
})

test('simulateRuntimeDraftApply returns local validation failures before backend calls', async () => {
  const draftStore = new InMemoryAgentDraftStore()
  const draft = draftStore.createDraft({
    kind: 'script',
    title: 'Script',
    content: '',
    target: { entityType: 'script', entityId: 1, field: 'content' },
  })
  const backend = fakeBackendApplyClient()

  const result = await simulateRuntimeDraftApply({
    draftStore,
    backendApplyClient: backend,
    applyInput: { draftId: draft.id },
  }) as { ok?: boolean; stage?: string }

  assert.equal(result.ok, false)
  assert.equal(result.stage, 'local_validation')
  assert.equal(backend.previewCalls, 0)
})

test('simulateRuntimeDraftApply projects backend preview errors without throwing', async () => {
  const draftStore = new InMemoryAgentDraftStore()
  const draft = draftStore.createDraft({
    kind: 'script',
    title: 'Script',
    content: 'Updated script',
    target: { entityType: 'script', entityId: 1, field: 'content' },
  })
  const backend = fakeBackendApplyClient({
    previewError: new BackendApplyHTTPError('failed', {
      method: 'POST',
      path: '/projects/1/entities/production-proposals/apply-preview',
      status: 422,
      responseText: '{"error":"invalid"}',
      response: { error: 'invalid' },
    }),
  })

  const result = await simulateRuntimeDraftApply({
    draftStore,
    backendApplyClient: backend,
    applyInput: { draftId: draft.id },
  }) as { ok?: boolean; stage?: string; backendError?: { status?: number } }

  assert.equal(result.ok, false)
  assert.equal(result.stage, 'backend_apply_preview')
  assert.equal(result.backendError?.status, 422)
})

test('applyRuntimeDraftFromUI marks asset planning drafts applied without backend writes', async () => {
  const draftStore = new InMemoryAgentDraftStore()
  const draft = draftStore.createDraft({
    kind: 'asset_proposal',
    title: 'Asset plan',
    content: JSON.stringify({ proposal: { asset_slots: [], candidates: [{ id: 'candidate_1' }] } }),
    target: { entityType: 'project_proposal', entityId: 1 },
  })
  const backend = fakeBackendApplyClient()

  const result = await applyRuntimeDraftFromUI({
    draftStore,
    backendApplyClient: backend,
    applyInput: { draftId: draft.id },
    now: () => '2026-01-01T00:00:00.000Z',
  }) as { status?: string; backendApply?: { performed?: boolean } }

  assert.equal(result.status, 'applied')
  assert.equal(result.backendApply?.performed, false)
  assert.equal(backend.applyCalls, 0)
  assert.equal(draftStore.getDraft(draft.id)?.status, 'applied')
})

test('applyRuntimeDraftFromUI applies backend results and records backend failures', async () => {
  const draftStore = new InMemoryAgentDraftStore()
  const draft = draftStore.createDraft({
    kind: 'script',
    title: 'Script',
    content: 'Updated script',
    target: { entityType: 'script', entityId: 1, field: 'content' },
  })
  const backend = fakeBackendApplyClient({
    applyResult: { performed: true, method: 'PATCH', url: 'http://backend/scripts/1', payload: { content: 'Updated script' } },
  })

  const result = await applyRuntimeDraftFromUI({
    draftStore,
    backendApplyClient: backend,
    applyInput: { draftId: draft.id, appliedByUserId: 12 },
    now: () => '2026-01-01T00:00:00.000Z',
  }) as { status?: string; backendApply?: BackendApplyResult }

  assert.equal(result.status, 'applied')
  assert.equal(result.backendApply?.performed, true)
  assert.equal(draftStore.getDraft(draft.id)?.appliedByUserId, 12)

  const failingDraft = draftStore.createDraft({
    kind: 'script',
    title: 'Script',
    content: 'Broken script',
    target: { entityType: 'script', entityId: 2, field: 'content' },
  })
  const failingBackend = fakeBackendApplyClient({ applyError: new Error('backend down') })
  await assert.rejects(() => applyRuntimeDraftFromUI({
    draftStore,
    backendApplyClient: failingBackend,
    applyInput: { draftId: failingDraft.id },
    now: () => '2026-01-01T00:00:00.000Z',
  }), /backend down/)
  assert.equal(draftStore.getDraft(failingDraft.id)?.metadata?.backendWritePerformed, false)
  assert.equal(draftStore.getDraft(failingDraft.id)?.metadata?.backendWriteError, 'backend down')
})

function fakeBackendApplyClient(options: {
  previewResult?: BackendApplyResult
  previewError?: Error
  applyResult?: BackendApplyResult
  applyError?: Error
} = {}): RuntimeDraftBackendApplyClient & { previewCalls: number; applyCalls: number } {
  return {
    previewCalls: 0,
    applyCalls: 0,
    async previewApplyReview() {
      this.previewCalls += 1
      if (options.previewError) throw options.previewError
      return options.previewResult ?? { performed: false, skippedReason: 'preview disabled' }
    },
    async applyReview() {
      this.applyCalls += 1
      if (options.applyError) throw options.applyError
      return options.applyResult ?? { performed: false, skippedReason: 'apply disabled' }
    },
  }
}
