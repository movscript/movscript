import assert from 'node:assert/strict'
import test from 'node:test'
import { MCPBackendApplyClient } from './mcpBackendApplyClient.js'
import type { JSONValue } from '../types.js'
import type { ApplyDraftReview } from './draftApply.js'

class FakeMCPClient {
  readonly calls: Array<{ name: string; args: Record<string, JSONValue> }> = []
  initialized = 0

  async initialize(): Promise<JSONValue> {
    this.initialized += 1
    return { ok: true }
  }

  async callTool(name: string, args: Record<string, JSONValue>): Promise<JSONValue> {
    this.calls.push({ name, args })
    return {
      data: {
        performed: true,
        method: name.includes('create_script') ? 'POST' : 'PATCH',
        url: 'http://frontend-mcp/backend-write',
        payload: {},
        response: { ok: true },
      },
    }
  }
}

test('MCPBackendApplyClient applies draft reviews through frontend MCP without backend auth passthrough', async () => {
  const mcpClient = new FakeMCPClient()
  const client = new MCPBackendApplyClient(mcpClient)
  const review: ApplyDraftReview = {
    draftId: 'draft-1',
    draftTitle: 'Draft',
    draftKind: 'content_unit',
    target: { projectId: 42, entityType: 'content_unit', entityId: 7, field: 'description' },
    currentValue: 'old',
    proposedValue: 'new',
    risk: 'write',
    sideEffect: 'write content unit',
    requiresBackendApply: true,
  }

  const result = await client.applyReview(review, {
    userId: 9,
    backendAuthToken: 'secret-token',
    backendAPIBaseURL: 'http://backend/api/v1',
  })

  assert.equal(result.performed, true)
  assert.equal(mcpClient.initialized, 1)
  assert.equal(mcpClient.calls[0]?.name, 'movscript_apply_draft_review')
  assert.deepEqual(mcpClient.calls[0]?.args, {
    review: review as unknown as JSONValue,
    userId: 9,
  })
})

test('MCPBackendApplyClient creates scripts through the internal MCP backend write tool', async () => {
  const mcpClient = new FakeMCPClient()
  const client = new MCPBackendApplyClient(mcpClient)

  await client.createScript(42, { title: 'Test', raw_source: 'Body', source_type: 'raw' }, { userId: 3 })

  assert.equal(mcpClient.calls[0]?.name, 'movscript_create_script_backend')
  assert.deepEqual(mcpClient.calls[0]?.args, {
    projectId: 42,
    payload: { title: 'Test', raw_source: 'Body', source_type: 'raw' },
    userId: 3,
  })
})

test('MCPBackendApplyClient drops invalid auth user ids from MCP args', async () => {
  const mcpClient = new FakeMCPClient()
  const client = new MCPBackendApplyClient(mcpClient)

  await client.createScript(42, { title: 'Test', raw_source: 'Body', source_type: 'raw' }, { userId: 3.5 })

  assert.equal(mcpClient.calls[0]?.name, 'movscript_create_script_backend')
  assert.deepEqual(mcpClient.calls[0]?.args, {
    projectId: 42,
    payload: { title: 'Test', raw_source: 'Body', source_type: 'raw' },
  })
})

test('MCPBackendApplyClient previews project proposal apply through the internal MCP tool', async () => {
  const mcpClient = new FakeMCPClient()
  const client = new MCPBackendApplyClient(mcpClient)

  await client.previewApplyReview({
    draftId: 'draft-2',
    draftTitle: 'Project proposal',
    draftKind: 'project_proposal',
    target: { projectId: 42, entityType: 'project', entityId: 42, field: 'proposal' },
    currentValue: null,
    proposedValue: { proposal: true },
    risk: 'write',
    sideEffect: 'apply proposal',
    requiresBackendApply: true,
  })

  assert.equal(mcpClient.calls[0]?.name, 'movscript_preview_apply_draft_review')
})

test('MCPBackendApplyClient rejects non-plain backend apply tool results', async () => {
  class RuntimeResult {
    performed = true
  }
  const mcpClient = new FakeMCPClient()
  mcpClient.callTool = async () => new RuntimeResult() as never
  const client = new MCPBackendApplyClient(mcpClient)

  await assert.rejects(() => client.createScript(42, { title: 'Test' }), /invalid backend apply result/)
})
