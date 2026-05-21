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

test('buildPatchRequest rejects invalid target project ids', () => {
  for (const projectId of [0, 42.5, Number.NaN, Number.POSITIVE_INFINITY, '42']) {
    assert.throws(() => buildPatchRequest(review({
      projectId,
      entityType: 'content_unit',
      entityId: 7,
      field: 'description',
      proposedValue: 'Updated',
    })), /requires projectId/)
  }
})

test('buildPatchRequest rejects unsupported entity types', () => {
  assert.throws(() => buildPatchRequest(review({
    entityType: 'legacy_entity',
    entityId: 7,
    field: 'description',
    proposedValue: 'Updated',
  })), /does not support target entity type/)
})

test('previewApplyReview rejects invalid proposal project ids', async () => {
  const client = new BackendApplyClient({ baseURL: 'http://backend' })
  await assert.rejects(
    () => client.previewApplyReview({
      draftId: 'draft_project',
      draftTitle: 'Project standards proposal',
      draftKind: 'setting_proposal',
      target: { entityType: 'project', entityId: '42', field: 'proposal' },
      currentValue: null,
      proposedValue: { proposal: {} },
      risk: 'write',
      sideEffect: 'test',
      requiresBackendApply: true,
    }),
    /requires projectId for proposal apply/,
  )
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
      mode: 'snapshot',
      production_id: 9,
      proposal: {
        segments: [{
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

test('BackendApplyClient drops invalid auth user ids from backend headers', async () => {
  const originalFetch = globalThis.fetch
  const calls: Array<{ url: string; init: RequestInit }> = []
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(JSON.stringify({ ok: true }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  try {
    const client = new BackendApplyClient({ baseURL: 'http://backend' })
    await client.applyProposal(42, {
      mode: 'snapshot',
      proposal: {},
    }, {
      userId: 7.5,
      backendAuthToken: 'token_1',
    })

    assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer token_1')
    assert.equal((calls[0].init.headers as Record<string, string>)['X-User-ID'], undefined)
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
      mode: 'snapshot',
      productionId: 9,
      proposalScope: 'production',
      proposal: {
        segments: [{
          title: 'Opening',
          scene_moments: [{
            title: 'Wake up',
            creative_references: [{ id: 3, role: 'character' }],
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
      mode: 'snapshot',
      productionId: 9,
      proposalScope: 'production',
      production_id: 9,
      proposal_scope: 'production',
      proposal: {
        segments: [{
          title: 'Opening',
          scene_moments: [{
            title: 'Wake up',
            creative_references: [{ id: 3, role: 'character' }],
          }],
        }],
      },
    })
    assert.deepEqual(result.response, { dry_run: true, warnings: [] })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('previewApplyReview rejects legacy production proposal action drafts', async () => {
  const client = new BackendApplyClient({ baseURL: 'http://backend' })
  const proposedValue = JSON.stringify({
    schema: 'movscript.production_proposal.v1',
    mode: 'snapshot',
    productionId: 9,
    proposalScope: 'production',
    proposal: {
      segments: [{
        action: 'create',
        title: 'Opening',
        scene_moments: [],
      }],
    },
  })

  await assert.rejects(() => client.previewApplyReview({
    draftId: 'draft_production',
    draftTitle: 'Production proposal',
    draftKind: 'production_proposal',
    target: { projectId: 42, entityType: 'production', entityId: 9 },
    currentValue: null,
    proposedValue,
    risk: 'write',
    sideEffect: 'test',
    requiresBackendApply: true,
  }), /must not include action fields/)
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
      mode: 'snapshot',
      proposal: {
        creative_references: [{
          name: 'Lin Xia',
          kind: 'person',
          status: 'draft',
        }],
        asset_slots: [{ name: 'Should be dropped', kind: 'image' }],
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
    assert.equal(result.url, 'http://backend/api/v1/projects/42/entities/setting-proposals/apply')
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
      mode: 'snapshot',
      snapshot_base: { asset_slots: [] },
      proposal: {
        creative_references: [{ name: 'Should be dropped' }],
        asset_slots: [{
          owner: { type: 'creative_reference', id: 3 },
          name: 'Hero portrait',
          kind: 'image',
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

    assert.equal(result.url, 'http://backend/api/v1/projects/42/entities/asset-proposals/apply')
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

test('applyReview posts direct asset slot proposal snapshots', async () => {
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
      schema: 'movscript.asset_proposal.v1',
      mode: 'snapshot',
      snapshot_base: { asset_slots: [] },
      proposal: {
        creative_references: [{ name: 'Should be dropped' }],
        asset_slots: [{
          client_id: 'slot_001',
          owner_type: 'scene_moment',
          owner_id: 7,
          name: '周建国重生惊醒关键帧',
          kind: 'image',
          description: '对应情景ID=7的核心镜头',
          priority: 'high',
        }],
      },
    }

    await client.applyReview(review({
      draftKind: 'note',
      projectId: 4,
      entityType: 'project',
      entityId: 4,
      field: 'proposal',
      proposedValue: JSON.stringify(payload),
    }))

    assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
      ...payload,
      scope: 'asset_proposal',
      mode: 'snapshot',
      proposal: {
        creative_references: [],
        asset_slots: [{
          client_id: 'slot_001',
          owner_type: 'scene_moment',
          owner_id: 7,
          kind: 'image',
          name: '周建国重生惊醒关键帧',
          description: '对应情景ID=7的核心镜头',
          priority: 'high',
        }],
      },
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('applyReview rejects partial direct asset proposal snapshots before posting', async () => {
  const originalFetch = globalThis.fetch
  let fetchCalls = 0
  globalThis.fetch = (async () => {
    fetchCalls += 1
    return new Response(JSON.stringify({ ok: true }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  try {
    const client = new BackendApplyClient({ baseURL: 'http://backend' })
    await assert.rejects(
      () => client.applyReview(review({
        draftKind: 'asset_proposal',
        projectId: 42,
        entityType: 'project',
        entityId: 42,
        field: 'proposal',
        proposedValue: JSON.stringify({
          schema: 'movscript.asset_proposal.v1',
          mode: 'snapshot',
          snapshot_base: {
            asset_slots: [
              { id: 11, name: 'Keep this slot', kind: 'image', status: 'active' },
              { id: 12, name: 'Edited slot', kind: 'image', status: 'active' },
            ],
          },
          proposal: {
            asset_slots: [{ id: 12, name: 'Edited slot', kind: 'image', status: 'active' }],
          },
        }),
      })),
      /omit existing active asset slots.*11/s,
    )
    assert.equal(fetchCalls, 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('applyReview posts project standards proposal with only project style', async () => {
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
      scope: 'project_standards_proposal',
      mode: 'snapshot',
      proposal: {
        project_style: {
          aspect_ratio: '9:16',
          shot_size_system: [{
            key: 'CU',
            label: '特写',
            usage: '用于人物表情反转。',
            composition: '头肩构图。',
          }],
          visual_style: '竖屏短剧写实',
          custom_rules: [{
            key: 'character_consistency',
            label: '角色一致性',
            value: '主角发型、年龄感和服装气质必须保持一致。',
            prompt_role: 'constraint',
            enabled: true,
          }],
        },
      },
    }

    const result = await client.applyReview(review({
      draftKind: 'project_standards_proposal',
      projectId: 42,
      entityType: 'project',
      entityId: 42,
      field: 'proposal',
      proposedValue: JSON.stringify(payload),
    }))

    assert.equal(result.url, 'http://backend/api/v1/projects/42/entities/project-standards-proposals/apply')
    assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
      ...payload,
      scope: 'project_standards_proposal',
      proposal: {
        project_style: {
          ...payload.proposal.project_style,
          shot_size_system: ['CU 特写：用于人物表情反转。；头肩构图。'],
        },
      },
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('applyReview rejects project standards proposal list payloads', async () => {
  const client = new BackendApplyClient({ baseURL: 'http://backend' })
  const payload = {
    scope: 'project_standards_proposal',
    mode: 'snapshot',
    proposal: {
      project_style: { aspect_ratio: '9:16' },
      creative_references: [{ name: 'Should be setting_proposal' }],
    },
  }

  await assert.rejects(() => client.applyReview(review({
    draftKind: 'project_standards_proposal',
    projectId: 42,
    entityType: 'project',
    entityId: 42,
    field: 'proposal',
    proposedValue: JSON.stringify(payload),
  })), /project_standards_proposal only supports proposal\.project_style/)
})

function review(input: {
  projectId?: unknown
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
    } as ApplyDraftReview['target'],
    currentValue: null,
    proposedValue: input.proposedValue,
    risk: 'write',
    sideEffect: 'test',
    requiresBackendApply: true,
  }
}
