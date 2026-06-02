import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BackendApplyClient, buildPatchRequest } from './backendApplyClient.js'
import type { ApplyWorkspaceReview } from '../../apply/workspaceApply.js'

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

test('previewApplyReview rejects invalid workspace project ids', async () => {
  const client = new BackendApplyClient({ baseURL: 'http://backend' })
  await assert.rejects(
    () => client.previewApplyReview({
      workspaceId: 'workspace_project',
      workspaceTitle: 'Project standards workspace',
      workspaceKind: 'setting_workspace',
      target: { entityType: 'project', entityId: '42', field: 'workspace' },
      currentValue: null,
      proposedValue: { workspace: {} },
      risk: 'write',
      sideEffect: 'test',
      requiresBackendApply: true,
    }),
    /requires projectId for workspace apply/,
  )
})

test('applyWorkspace posts production workspace payload with auth headers', async () => {
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
      workspace: {
        segments: [{
          title: 'Opening',
          scene_moments: [],
        }],
      },
    }

    const result = await client.applyWorkspace(42, payload, {
      userId: 7,
      backendAuthToken: 'token_1',
    })

    assert.equal(result.performed, true)
    assert.equal(result.method, 'POST')
    assert.equal(result.url, 'http://backend/api/v1/projects/42/entities/production-workspaces/apply')
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
    await client.applyWorkspace(42, {
      mode: 'snapshot',
      workspace: {},
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

test('downloadResourceFile caches immutable backend resource bytes between reads', async () => {
  const originalFetch = globalThis.fetch
  const dir = await mkdtemp(join(tmpdir(), 'movscript-agent-resource-cache-test-'))
  let fetchCalls = 0
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    fetchCalls += 1
    assert.equal(String(url), 'http://backend/api/v1/resources/42/file')
    assert.equal(init?.method, 'GET')
    return new Response('resource-bytes', {
      status: 200,
      headers: {
        'content-type': 'image/png',
        'content-length': '14',
      },
    })
  }) as typeof fetch

  try {
    const client = new BackendApplyClient({ baseURL: 'http://backend', resourceCacheDir: join(dir, 'cache') })
    const firstPath = join(dir, 'first.bin')
    const secondPath = join(dir, 'second.bin')

    const first = await client.downloadResourceFile(42, firstPath, { userId: 7 })
    const second = await client.downloadResourceFile(42, secondPath, { userId: 7 })

    assert.equal(fetchCalls, 1)
    assert.equal(first.contentType, 'image/png')
    assert.equal(second.contentType, 'image/png')
    assert.equal(await readFile(firstPath, 'utf8'), 'resource-bytes')
    assert.equal(await readFile(secondPath, 'utf8'), 'resource-bytes')
  } finally {
    globalThis.fetch = originalFetch
    await rm(dir, { recursive: true, force: true })
  }
})

test('downloadResourceFile shares an in-flight immutable resource download', async () => {
  const originalFetch = globalThis.fetch
  const dir = await mkdtemp(join(tmpdir(), 'movscript-agent-resource-cache-inflight-test-'))
  let fetchCalls = 0
  let releaseFetch: (() => void) | undefined
  const fetchGate = new Promise<void>((resolve) => {
    releaseFetch = resolve
  })
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    fetchCalls += 1
    assert.equal(String(url), 'http://backend/api/v1/resources/42/file')
    assert.equal(init?.method, 'GET')
    await fetchGate
    return new Response('resource-bytes', {
      status: 200,
      headers: {
        'content-type': 'image/png',
        'content-length': '14',
      },
    })
  }) as typeof fetch

  try {
    const client = new BackendApplyClient({ baseURL: 'http://backend', resourceCacheDir: join(dir, 'cache') })
    const firstPath = join(dir, 'first.bin')
    const secondPath = join(dir, 'second.bin')

    const firstDownload = client.downloadResourceFile(42, firstPath, { userId: 7 })
    const secondDownload = client.downloadResourceFile(42, secondPath, { userId: 7 })
    await new Promise((resolve) => setImmediate(resolve))
    releaseFetch?.()
    const [first, second] = await Promise.all([firstDownload, secondDownload])

    assert.equal(fetchCalls, 1)
    assert.equal(first.contentType, 'image/png')
    assert.equal(second.contentType, 'image/png')
    assert.equal(await readFile(firstPath, 'utf8'), 'resource-bytes')
    assert.equal(await readFile(secondPath, 'utf8'), 'resource-bytes')
  } finally {
    globalThis.fetch = originalFetch
    await rm(dir, { recursive: true, force: true })
  }
})

test('downloadResourceFile separates immutable resource cache by backend auth token', async () => {
  const originalFetch = globalThis.fetch
  const dir = await mkdtemp(join(tmpdir(), 'movscript-agent-resource-cache-auth-test-'))
  let fetchCalls = 0
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    fetchCalls += 1
    const token = (init?.headers as Record<string, string> | undefined)?.Authorization ?? 'none'
    return new Response(`resource-bytes-${token}`, {
      status: 200,
      headers: {
        'content-type': 'image/png',
        'content-length': String(`resource-bytes-${token}`.length),
      },
    })
  }) as typeof fetch

  try {
    const client = new BackendApplyClient({ baseURL: 'http://backend', resourceCacheDir: join(dir, 'cache') })
    const firstPath = join(dir, 'first.bin')
    const secondPath = join(dir, 'second.bin')
    const thirdPath = join(dir, 'third.bin')

    await client.downloadResourceFile(42, firstPath, { userId: 7, backendAuthToken: 'token-one' })
    await client.downloadResourceFile(42, secondPath, { userId: 7, backendAuthToken: 'token-two' })
    await client.downloadResourceFile(42, thirdPath, { userId: 7, backendAuthToken: 'token-one' })

    assert.equal(fetchCalls, 2)
    assert.equal(await readFile(firstPath, 'utf8'), 'resource-bytes-Bearer token-one')
    assert.equal(await readFile(secondPath, 'utf8'), 'resource-bytes-Bearer token-two')
    assert.equal(await readFile(thirdPath, 'utf8'), 'resource-bytes-Bearer token-one')
  } finally {
    globalThis.fetch = originalFetch
    await rm(dir, { recursive: true, force: true })
  }
})

test('previewApplyReview posts production workspace workspace payload to apply-preview', async () => {
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
      schema: 'movscript.production_workspace.v1',
      scope: 'production_workspace',
      mode: 'snapshot',
      productionId: 9,
      workspaceScope: 'production',
      workspace: {
        segments: [{
          title: 'Opening',
          scene_moments: [{
            title: 'Wake up',
            creative_references: [{ id: 3, role: 'character' }],
          }],
        }],
      },
      impact_notes: [],
    })

    const result = await client.previewApplyReview({
      workspaceId: 'workspace_production',
      workspaceTitle: 'Production workspace',
      workspaceKind: 'production_workspace',
      target: { projectId: 42, entityType: 'production', entityId: 9 },
      currentValue: null,
      proposedValue,
      risk: 'write',
      sideEffect: 'test',
      requiresBackendApply: true,
    })

    assert.equal(result.performed, true)
    assert.equal(result.method, 'POST')
    assert.equal(result.url, 'http://backend/api/v1/projects/42/entities/production-workspaces/apply-preview')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].init.method, 'POST')
    assert.equal((calls[0].init.headers as Record<string, string>)['Content-Type'], 'application/json')
    assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
      schema: 'movscript.production_workspace.v1',
      scope: 'production_workspace',
      mode: 'snapshot',
      productionId: 9,
      workspaceScope: 'production',
      production_id: 9,
      workspace_scope: 'production',
      workspace: {
        segments: [{
          title: 'Opening',
          scene_moments: [{
            title: 'Wake up',
            creative_references: [{ id: 3, role: 'character' }],
          }],
        }],
      },
      impact_notes: [],
    })
    assert.deepEqual(result.response, { dry_run: true, warnings: [] })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('previewApplyReview rejects legacy production workspace action workspaces', async () => {
  const client = new BackendApplyClient({ baseURL: 'http://backend' })
  const proposedValue = JSON.stringify({
    schema: 'movscript.production_workspace.v1',
    scope: 'production_workspace',
    mode: 'snapshot',
    productionId: 9,
    workspaceScope: 'production',
    workspace: {
      segments: [{
        action: 'create',
        title: 'Opening',
        scene_moments: [],
      }],
    },
  })

  await assert.rejects(() => client.previewApplyReview({
    workspaceId: 'workspace_production',
    workspaceTitle: 'Production workspace',
    workspaceKind: 'production_workspace',
    target: { projectId: 42, entityType: 'production', entityId: 9 },
    currentValue: null,
    proposedValue,
    risk: 'write',
    sideEffect: 'test',
    requiresBackendApply: true,
  }), /must not include action fields/)
})

test('applyReview posts setting workspace payload with auth headers', async () => {
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
      scope: 'setting_workspace',
      mode: 'snapshot',
      workspace: {
        creative_references: [{
          name: 'Lin Xia',
          kind: 'person',
          status: 'workspace',
        }],
        asset_slots: [{ name: 'Should be dropped', kind: 'image' }],
      },
    }

    const result = await client.applyReview(review({
      workspaceKind: 'setting_workspace',
      projectId: 42,
      entityType: 'project',
      entityId: 42,
      field: 'workspace',
      proposedValue: JSON.stringify(payload),
    }), {
      userId: 7,
      backendAuthToken: 'token_1',
    })

    assert.equal(result.performed, true)
    assert.equal(result.method, 'POST')
    assert.equal(result.url, 'http://backend/api/v1/projects/42/entities/setting-workspaces/apply')
    assert.deepEqual(result.payload, {
      ...payload,
      workspace: {
        creative_references: payload.workspace.creative_references,
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

test('applyReview posts asset slot workspace with settings filtered out', async () => {
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
      scope: 'asset_workspace',
      mode: 'snapshot',
      workspace: {
        creative_references: [{ name: 'Should be dropped' }],
        asset_slots: [{
          owner: { type: 'creative_reference', id: 3 },
          name: 'Hero portrait',
          kind: 'image',
        }],
      },
    }

    const result = await client.applyReview(review({
      workspaceKind: 'asset_workspace',
      projectId: 42,
      entityType: 'project',
      entityId: 42,
      field: 'workspace',
      proposedValue: JSON.stringify(payload),
    }))

    assert.equal(result.url, 'http://backend/api/v1/projects/42/entities/asset-workspaces/apply')
    assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
      ...payload,
      workspace: {
        creative_references: [],
        asset_slots: payload.workspace.asset_slots,
      },
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('applyReview posts direct asset slot workspace snapshots', async () => {
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
      schema: 'movscript.asset_workspace.v1',
      mode: 'snapshot',
      workspace: {
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
      workspaceKind: 'asset_workspace',
      projectId: 4,
      entityType: 'project',
      entityId: 4,
      field: 'workspace',
      proposedValue: JSON.stringify(payload),
    }))

    assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
      ...payload,
      scope: 'asset_workspace',
      mode: 'snapshot',
      workspace: {
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

test('applyReview posts asset workspace snapshots without requiring snapshot base', async () => {
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
    await client.applyReview(review({
        workspaceKind: 'asset_workspace',
        projectId: 42,
        entityType: 'project',
        entityId: 42,
        field: 'workspace',
        proposedValue: JSON.stringify({
          schema: 'movscript.asset_workspace.v1',
          mode: 'snapshot',
          workspace: {
            asset_slots: [{ id: 12, name: 'Edited slot', kind: 'image', status: 'active' }],
          },
        }),
      }))
    assert.equal(fetchCalls, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('applyReview posts project standards workspace with only project style', async () => {
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
      scope: 'project_standards_workspace',
      mode: 'snapshot',
      workspace: {
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
      workspaceKind: 'project_standards_workspace',
      projectId: 42,
      entityType: 'project',
      entityId: 42,
      field: 'workspace',
      proposedValue: JSON.stringify(payload),
    }))

    assert.equal(result.url, 'http://backend/api/v1/projects/42/entities/project-standards-workspaces/apply')
    assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
      ...payload,
      scope: 'project_standards_workspace',
      workspace: {
        project_style: {
          ...payload.workspace.project_style,
          shot_size_system: ['CU 特写：用于人物表情反转。；头肩构图。'],
        },
      },
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('applyReview rejects project standards workspace list payloads', async () => {
  const client = new BackendApplyClient({ baseURL: 'http://backend' })
  const payload = {
    scope: 'project_standards_workspace',
    mode: 'snapshot',
    workspace: {
      project_style: { aspect_ratio: '9:16' },
      creative_references: [{ name: 'Should be setting_workspace' }],
    },
  }

  await assert.rejects(() => client.applyReview(review({
    workspaceKind: 'project_standards_workspace',
    projectId: 42,
    entityType: 'project',
    entityId: 42,
    field: 'workspace',
    proposedValue: JSON.stringify(payload),
  })), /project_standards_workspace only supports workspace\.project_style/)
})

function review(input: {
  projectId?: unknown
  entityType: string
  entityId: number | string
  field: string
  workspaceKind?: ApplyWorkspaceReview['workspaceKind']
  proposedValue: string | number | boolean | null
}): ApplyWorkspaceReview {
  return {
    workspaceId: 'workspace_test',
    workspaceTitle: 'Workspace',
    workspaceKind: input.workspaceKind ?? 'content_unit_workspace',
    target: {
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      entityType: input.entityType,
      entityId: input.entityId,
      field: input.field,
    } as ApplyWorkspaceReview['target'],
    currentValue: null,
    proposedValue: input.proposedValue,
    risk: 'write',
    sideEffect: 'test',
    requiresBackendApply: true,
  }
}
