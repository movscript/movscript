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

test('previewApplyReview posts production proposal draft payload to apply-preview', async () => {
  const originalFetch = globalThis.fetch
  const calls: Array<{ url: string; init: RequestInit }> = []
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(JSON.stringify({ dry_run: true, warnings: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  try {
    const client = new BackendApplyClient({ baseURL: 'http://backend' })
    const proposedValue = JSON.stringify({
      schema: 'movscript.production_proposal.v1',
      productionId: 9,
      proposalScope: 'production',
      proposal: {
        segments: [{
          action: 'create',
          title: 'Opening',
          scene_moments: [{
            action: 'create',
            title: 'Wake up',
            creative_references: [{ action: 'reuse', id: 3, role: 'character' }],
          }],
        }],
      },
    })

    const result = await client.previewApplyReview({
      draftId: 'draft_production',
      draftTitle: 'Production proposal',
      draftKind: 'production_proposal',
      target: { projectId: 42, entityType: 'production', entityId: 9 },
      currentValue: null,
      proposedValue,
      risk: 'write',
      sideEffect: 'test',
      requiresBackendApply: true,
    })

    assert.equal(result.performed, true)
    assert.equal(result.method, 'POST')
    assert.equal(result.url, 'http://backend/api/v1/projects/42/entities/production-proposals/apply-preview')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].init.method, 'POST')
    assert.equal((calls[0].init.headers as Record<string, string>)['Content-Type'], 'application/json')
    assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
      schema: 'movscript.production_proposal.v1',
      productionId: 9,
      proposalScope: 'production',
      production_id: 9,
      proposal_scope: 'production',
      proposal: {
        segments: [{
          action: 'create',
          title: 'Opening',
          scene_moments: [{
            action: 'create',
            title: 'Wake up',
            creative_references: [{ action: 'reuse', id: 3, role: 'character' }],
          }],
        }],
      },
    })
    assert.deepEqual(result.response, { dry_run: true, warnings: [] })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('applyReview posts setting proposal payload with auth headers', async () => {
  const originalFetch = globalThis.fetch
  const calls: Array<{ url: string; init: RequestInit }> = []
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(JSON.stringify({ counts: { creative_references_created: 1 } }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  try {
    const client = new BackendApplyClient({ baseURL: 'http://backend' })
    const payload = {
      scope: 'setting_proposal',
      proposal: {
        creative_references: [{
          fields: { name: 'Lin Xia', kind: 'person', status: 'draft' },
        }],
        asset_slots: [{ fields: { name: 'Should be dropped', kind: 'image' } }],
      },
    }

    const result = await client.applyReview(review({
      draftKind: 'setting_proposal',
      projectId: 42,
      entityType: 'project',
      entityId: 42,
      field: 'proposal',
      proposedValue: JSON.stringify(payload),
    }), {
      userId: 7,
      backendAuthToken: 'token_1',
    })

    assert.equal(result.performed, true)
    assert.equal(result.method, 'POST')
    assert.equal(result.url, 'http://backend/api/v1/projects/42/entities/project-proposals/apply')
    assert.deepEqual(result.payload, {
      ...payload,
      proposal: {
        creative_references: payload.proposal.creative_references,
        asset_slots: [],
      },
    })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].init.method, 'POST')
    assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer token_1')
    assert.equal((calls[0].init.headers as Record<string, string>)['X-User-ID'], '7')
    assert.deepEqual(JSON.parse(String(calls[0].init.body)), result.payload)
    assert.deepEqual(result.response, { counts: { creative_references_created: 1 } })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('applyReview posts asset slot proposal with settings filtered out', async () => {
  const originalFetch = globalThis.fetch
  const calls: Array<{ url: string; init: RequestInit }> = []
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(JSON.stringify({ counts: { asset_slots_created: 1 } }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  try {
    const client = new BackendApplyClient({ baseURL: 'http://backend' })
    const payload = {
      scope: 'asset_proposal',
      proposal: {
        creative_references: [{ fields: { name: 'Should be dropped' } }],
        asset_slots: [{
          owner: { type: 'creative_reference', id: 3 },
          fields: { name: 'Hero portrait', kind: 'image' },
        }],
      },
    }

    const result = await client.applyReview(review({
      draftKind: 'asset_proposal',
      projectId: 42,
      entityType: 'project',
      entityId: 42,
      field: 'proposal',
      proposedValue: JSON.stringify(payload),
    }))

    assert.equal(result.url, 'http://backend/api/v1/projects/42/entities/project-proposals/apply')
    assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
      ...payload,
      proposal: {
        creative_references: [],
        asset_slots: payload.proposal.asset_slots,
      },
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('applyReview posts project proposal with only project style', async () => {
  const originalFetch = globalThis.fetch
  const calls: Array<{ url: string; init: RequestInit }> = []
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(JSON.stringify({ counts: { project_style_updated: 1 } }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  try {
    const client = new BackendApplyClient({ baseURL: 'http://backend' })
    const payload = {
      scope: 'project_proposal',
      proposal: {
        project_style: {
          aspect_ratio: '9:16',
          visual_style: '竖屏短剧写实',
        },
        creative_references: [{ fields: { name: 'Should be dropped' } }],
        asset_slots: [{ fields: { name: 'Also dropped', kind: 'image' } }],
      },
    }

    const result = await client.applyReview(review({
      draftKind: 'project_proposal',
      projectId: 42,
      entityType: 'project',
      entityId: 42,
      field: 'proposal',
      proposedValue: JSON.stringify(payload),
    }))

    assert.equal(result.url, 'http://backend/api/v1/projects/42/entities/project-proposals/apply')
    assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
      ...payload,
      proposal: {
        project_style: payload.proposal.project_style,
        creative_references: [],
        asset_slots: [],
      },
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

function review(input: {
  projectId?: number | string
  entityType: string
  entityId: number | string
  field: string
  draftKind?: ApplyDraftReview['draftKind']
  proposedValue: string | number | boolean | null
}): ApplyDraftReview {
  return {
    draftId: 'draft_test',
    draftTitle: 'Draft',
    draftKind: input.draftKind ?? 'note',
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
