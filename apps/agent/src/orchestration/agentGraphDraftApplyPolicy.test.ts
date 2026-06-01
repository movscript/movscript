import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../catalog/agentManifest.js'
import type { AgentApprovalRequest, ToolCallOutcome } from '../state/types.js'
import { StaticToolRegistry } from '../tools/toolRegistry.js'
import {
  buildDefaultDraftApplyCalls,
  remainingPendingApprovalsAfterForcedCalls,
} from './agentGraphDraftApplyPolicy.js'

test('buildDefaultDraftApplyCalls queues proposal drafts in domain apply order only with explicit intent', () => {
  const registry = new StaticToolRegistry([{
    name: 'draft_apply',
    description: 'Apply draft',
    permission: 'draft.apply',
    risk: 'write',
    projectScoped: false,
    requiresApprovalByDefault: true,
  }])
  const outcomes: ToolCallOutcome[] = [
    createdDraftOutcome('draft_asset', 'asset_proposal'),
    createdDraftOutcome('draft_setting', 'setting_proposal'),
  ]

  assert.equal(buildDefaultDraftApplyCalls({
    outcomes,
    registry,
    manifest: DEFAULT_AGENT_MANIFEST,
    userMessage: 'create proposals',
    makeId: () => 'call_ignored',
  }).length, 0)

  const calls = buildDefaultDraftApplyCalls({
    outcomes,
    registry,
    manifest: DEFAULT_AGENT_MANIFEST,
    userMessage: '创建后应用这些 proposal',
    makeId: (prefix) => `${prefix}_fixed`,
  })

  assert.deepEqual(calls.map((call) => call.args?.draftId), ['draft_setting', 'draft_asset'])
  assert.deepEqual(calls.map((call) => call.args?.draftKind), ['setting_proposal', 'asset_proposal'])
  assert.equal(calls[0]?.id, 'call_fixed')
})

test('remainingPendingApprovalsAfterForcedCalls filters executed approval ids', () => {
  const pendingApprovals: AgentApprovalRequest[] = [
    approval('approval_1'),
    approval('approval_2'),
  ]
  const remaining = remainingPendingApprovalsAfterForcedCalls({ pendingApprovals }, [{
    call: { id: 'call_approval_1', name: 'draft_apply', args: {} },
    result: {},
  }])

  assert.deepEqual(remaining.map((item) => item.id), ['approval_2'])
})

function createdDraftOutcome(draftId: string, draftKind: string): ToolCallOutcome {
  return {
    call: { name: 'draft_create', args: {} },
    result: {
      status: 'created',
      draftId,
      draft: {
        id: draftId,
        kind: draftKind,
      },
    },
  } as ToolCallOutcome
}

function approval(id: string): AgentApprovalRequest {
  return {
    id,
    runId: 'run_1',
    toolName: 'draft_apply',
    args: {},
    risk: 'write',
    permission: 'draft.apply',
    reason: 'Apply draft',
    status: 'pending',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}
