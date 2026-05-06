import assert from 'node:assert/strict'
import test from 'node:test'
import { BackendApplyClient, buildPatchRequest } from './backendApplyClient.js'
import type { ApplyDraftReview } from './draftApply.js'

test('buildPatchRequest maps supported entity and field to backend PATCH payload', () => {
  const request = buildPatchRequest(review({
    projectId: 42,
    entityType: 'content_unit',
    entityId: 7,
    field: 'description',
    proposedValue: 'New content-unit description',
  }))

  assert.equal(request.path, '/projects/42/entities/content-units/7')
  assert.deepEqual(request.payload, { description: 'New content-unit description' })
})

test('buildPatchRequest rejects unsupported fields', () => {
  assert.throws(() => buildPatchRequest(review({
    projectId: 42,
    entityType: 'content_unit',
    entityId: 7,
    field: 'project_id',
    proposedValue: 1,
  })), /cannot write field project_id/)
})

test('buildPatchRequest rejects unsupported entity types', () => {
  assert.throws(() => buildPatchRequest(review({
    entityType: 'legacy_entity',
    entityId: 7,
    field: 'description',
    proposedValue: 'Updated',
  })), /does not support target entity type/)
})

test('applyProposal posts production proposal payload with auth headers', async () => {
  const originalFetch = globalThis.fetch
  const calls: Array<{ url: string; init: RequestInit }> = []
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(JSON.stringify({ counts: { segments_created: 1 } }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  try {
    const client = new BackendApplyClient({ baseURL: 'http://backend' })
    const payload = {
      production_id: 9,
      proposal: {
        segments: [{
          action: 'create',
          title: 'Opening',
          scene_moments: [],
        }],
      },
    }

    const result = await client.applyProposal(42, payload, {
      userId: 7,
      backendAuthToken: 'token_1',
    })

    assert.equal(result.performed, true)
    assert.equal(result.method, 'POST')
    assert.equal(result.url, 'http://backend/api/v1/projects/42/entities/production-proposals/apply')
    assert.deepEqual(result.payload, payload)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].init.method, 'POST')
    assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer token_1')
    assert.equal((calls[0].init.headers as Record<string, string>)['X-User-ID'], '7')
    assert.deepEqual(JSON.parse(String(calls[0].init.body)), payload)
    assert.deepEqual(result.response, { counts: { segments_created: 1 } })
  } finally {
    globalThis.fetch = originalFetch
  }
})

function review(input: {
  projectId?: number | string
  entityType: string
  entityId: number | string
  field: string
  proposedValue: string | number | boolean | null
}): ApplyDraftReview {
  return {
    draftId: 'draft_test',
    draftTitle: 'Draft',
    draftKind: 'note',
    target: {
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      entityType: input.entityType,
      entityId: input.entityId,
      field: input.field,
    },
    currentValue: null,
    proposedValue: input.proposedValue,
    risk: 'write',
    sideEffect: 'test',
    requiresBackendApply: true,
  }
}
