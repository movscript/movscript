import assert from 'node:assert/strict'
import test from 'node:test'
import { extractAgentTaskArtifacts } from './agentArtifacts'
import type { AgentRun } from './localAgentClient'

test('extractAgentTaskArtifacts ignores non-plain draft result objects', () => {
  class RuntimeDraftResult {
    id = 'draft_runtime'
    kind = 'project_standards_proposal'
  }

  const run = {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'completed',
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:01.000Z',
    policy: { maxToolCalls: 10, maxIterations: 6 },
    steps: [{
      id: 'step_1',
      runId: 'run_1',
      type: 'tool_call',
      status: 'completed',
      result: new RuntimeDraftResult(),
      createdAt: '2026-05-17T00:00:00.000Z',
    }],
  } as AgentRun

  assert.deepEqual(extractAgentTaskArtifacts(run), [])
})
