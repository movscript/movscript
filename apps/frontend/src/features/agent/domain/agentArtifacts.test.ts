import assert from 'node:assert/strict'
import test from 'node:test'
import { extractAgentTaskArtifacts } from '@/features/agent/domain/agentArtifacts'
import type { AgentRun } from '@movscript/core/agent/protocol'

test('extractAgentTaskArtifacts ignores non-plain workspace result objects', () => {
  class ProviderWorkspaceResult {
    id = 'workspace_runtime'
    kind = 'project_standards_workspace'
  }

  const run = {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'completed',
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:01.000Z',
    providerSessionLimits: { approvalMode: 'interactive', maxToolCalls: 10, maxIterations: 6, allowNetwork: false, allowFileBytes: false },
    steps: [{
      id: 'step_1',
      runId: 'run_1',
      type: 'tool_call',
      status: 'completed',
      result: new ProviderWorkspaceResult(),
      createdAt: '2026-05-17T00:00:00.000Z',
    }],
  } as unknown as AgentRun

  assert.deepEqual(extractAgentTaskArtifacts(run), [])
})
