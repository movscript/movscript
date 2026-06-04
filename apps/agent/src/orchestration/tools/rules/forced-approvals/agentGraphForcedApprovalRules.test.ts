import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentApprovalRequest } from '../../../../state/shared/types.js'
import { remainingPendingApprovalsAfterForcedCalls } from './agentGraphForcedApprovalRules.js'

test('remainingPendingApprovalsAfterForcedCalls filters executed approval ids', () => {
  const pendingApprovals: AgentApprovalRequest[] = [
    approval('approval_1'),
    approval('approval_2'),
  ]
  const remaining = remainingPendingApprovalsAfterForcedCalls({ pendingApprovals }, [{
    call: { id: 'call_approval_1', name: 'core_write', args: {} },
    result: {},
  }])

  assert.deepEqual(remaining.map((item) => item.id), ['approval_2'])
})

function approval(id: string): AgentApprovalRequest {
  return {
    id,
    runId: 'run_1',
    toolName: 'core_write',
    args: {},
    risk: 'write',
    permission: 'core.write',
    reason: 'Apply write',
    status: 'pending',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}
