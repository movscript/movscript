import assert from 'node:assert/strict'
import test from 'node:test'
import { BackendApplyClient } from './backendApplyClient.js'
import type { ApplyWorkspaceReview } from '../../apply/workspaceApply.js'

test('BackendApplyClient skips direct workspace writes because apply is MCP-owned', async () => {
  const client = new BackendApplyClient({ baseURL: 'http://backend' })
  const review = makeReview()

  assert.deepEqual(await client.applyReview(review), {
    performed: false,
    skippedReason: 'workspace apply is owned by MCP; the agent backend client does not encode application entity routes.',
  })
  assert.deepEqual(await client.previewApplyReview(review), {
    performed: false,
    skippedReason: 'workspace validation is owned by MCP; the agent backend client does not encode application entity routes.',
  })
  assert.deepEqual(await client.applyWorkspace(42, { workspace: {} }), {
    performed: false,
    skippedReason: 'workspace apply is owned by MCP; direct backend workspace apply is not implemented in the agent.',
  })
  assert.deepEqual(await client.getProject(42), {
    performed: false,
    skippedReason: 'project reads are owned by MCP; direct backend project reads are not implemented in the agent.',
  })
})

test('BackendApplyClient keeps generic JSON backend reads available', async () => {
  const originalFetch = globalThis.fetch
  const calls: Array<{ url: string; init: RequestInit }> = []
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch

  try {
    const client = new BackendApplyClient({ baseURL: 'http://backend/api' })
    const result = await client.getJSON('/health', { backendAuthToken: 'token_1' })

    assert.equal(result.performed, true)
    assert.equal(result.method, 'GET')
    assert.equal(result.url, 'http://backend/api/api/v1/health')
    assert.deepEqual(result.response, { ok: true })
    assert.equal((calls[0]?.init.headers as Record<string, string> | undefined)?.Authorization, 'Bearer token_1')
  } finally {
    globalThis.fetch = originalFetch
  }
})

function makeReview(): ApplyWorkspaceReview {
  return {
    workspaceId: 'workspace_1',
    workspaceTitle: 'Workspace',
    workspaceKind: 'custom_workspace',
    target: { projectId: 42, entityType: 'custom_entity', entityId: 7, field: 'workspace' },
    currentValue: null,
    proposedValue: { workspace: {} },
    risk: 'write',
    sideEffect: 'test',
    requiresBackendApply: true,
  }
}
