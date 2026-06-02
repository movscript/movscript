import assert from 'node:assert/strict'
import test from 'node:test'
import { MCPBackendApplyClient } from './mcpBackendApplyClient.js'
import type { JSONValue } from '../../../shared/protocol/types.js'
import type { ApplyWorkspaceReview } from '../../apply/workspaceApply.js'

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
        method: 'PATCH',
        url: 'http://frontend-mcp/backend-write',
        payload: {},
        response: { ok: true },
      },
    }
  }
}

test('MCPBackendApplyClient applies workspace reviews through frontend MCP without backend auth passthrough', async () => {
  const mcpClient = new FakeMCPClient()
  const client = new MCPBackendApplyClient(mcpClient)
  const review: ApplyWorkspaceReview = {
    workspaceId: 'workspace-1',
    workspaceTitle: 'Workspace',
    workspaceKind: 'content_unit_workspace',
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
  assert.equal(mcpClient.calls[0]?.name, 'workspace_review_apply')
  assert.deepEqual(mcpClient.calls[0]?.args, {
    review: review as unknown as JSONValue,
    userId: 9,
  })
})

test('MCPBackendApplyClient previews project standards workspace apply through the internal MCP tool', async () => {
  const mcpClient = new FakeMCPClient()
  const client = new MCPBackendApplyClient(mcpClient)

  await client.previewApplyReview({
    workspaceId: 'workspace-2',
    workspaceTitle: 'Project standards workspace',
    workspaceKind: 'project_standards_workspace',
    target: { projectId: 42, entityType: 'project', entityId: 42, field: 'workspace' },
    currentValue: null,
    proposedValue: { workspace: true },
    risk: 'write',
    sideEffect: 'apply workspace',
    requiresBackendApply: true,
  })

  assert.equal(mcpClient.calls[0]?.name, 'workspace_review_apply_preview')
})

test('MCPBackendApplyClient rejects non-plain backend apply tool results', async () => {
  class RuntimeResult {
    performed = true
  }
  const mcpClient = new FakeMCPClient()
  mcpClient.callTool = async () => new RuntimeResult() as never
  const client = new MCPBackendApplyClient(mcpClient)

  await assert.rejects(() => client.applyReview({
    workspaceId: 'workspace-3',
    workspaceTitle: 'Workspace',
    workspaceKind: 'content_unit_workspace',
    target: { projectId: 42, entityType: 'content_unit', entityId: 7, field: 'description' },
    currentValue: 'old',
    proposedValue: 'new',
    risk: 'write',
    sideEffect: 'write content unit',
    requiresBackendApply: true,
  }), /invalid backend apply result/)
})
