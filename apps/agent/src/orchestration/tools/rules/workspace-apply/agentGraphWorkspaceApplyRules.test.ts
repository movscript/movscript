import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../../../../catalog/manifest/agentManifest.js'
import type { AgentApprovalRequest, ToolCallOutcome } from '../../../../state/shared/types.js'
import { StaticToolRegistry } from '../../../../tools/registry/core/toolRegistry.js'
import {
  buildDefaultWorkspaceApplyCalls,
  remainingPendingApprovalsAfterForcedCalls,
} from './agentGraphWorkspaceApplyRules.js'

test('buildDefaultWorkspaceApplyCalls queues workspace workspaces in domain apply order only with explicit intent', () => {
  const registry = new StaticToolRegistry([{
    name: 'workspace_apply',
    description: 'Apply workspace',
    permission: 'workspace.apply',
    risk: 'write',
    projectScoped: false,
    requiresApprovalByDefault: true,
  }])
  const outcomes: ToolCallOutcome[] = [
    createdWorkspaceOutcome('workspace_asset', 'asset_workspace'),
    createdWorkspaceOutcome('workspace_setting', 'setting_workspace'),
  ]

  assert.equal(buildDefaultWorkspaceApplyCalls({
    outcomes,
    registry,
    manifest: DEFAULT_AGENT_MANIFEST,
    userMessage: 'create workspaces',
    makeId: () => 'call_ignored',
  }).length, 0)

  const calls = buildDefaultWorkspaceApplyCalls({
    outcomes,
    registry,
    manifest: DEFAULT_AGENT_MANIFEST,
    userMessage: '创建后应用这些 workspace',
    makeId: (prefix) => `${prefix}_fixed`,
  })

  assert.deepEqual(calls.map((call) => call.args?.workspaceId), ['workspace_setting', 'workspace_asset'])
  assert.deepEqual(calls.map((call) => call.args?.workspaceKind), ['setting_workspace', 'asset_workspace'])
  assert.equal(calls[0]?.id, 'call_fixed')
})

test('remainingPendingApprovalsAfterForcedCalls filters executed approval ids', () => {
  const pendingApprovals: AgentApprovalRequest[] = [
    approval('approval_1'),
    approval('approval_2'),
  ]
  const remaining = remainingPendingApprovalsAfterForcedCalls({ pendingApprovals }, [{
    call: { id: 'call_approval_1', name: 'workspace_apply', args: {} },
    result: {},
  }])

  assert.deepEqual(remaining.map((item) => item.id), ['approval_2'])
})

function createdWorkspaceOutcome(workspaceId: string, workspaceKind: string): ToolCallOutcome {
  return {
    call: { name: 'workspace_open', args: {} },
    result: {
      status: 'created',
      workspaceId,
      workspace: {
        id: workspaceId,
        kind: workspaceKind,
      },
    },
  } as ToolCallOutcome
}

function approval(id: string): AgentApprovalRequest {
  return {
    id,
    runId: 'run_1',
    toolName: 'workspace_apply',
    args: {},
    risk: 'write',
    permission: 'workspace.apply',
    reason: 'Apply workspace',
    status: 'pending',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}
