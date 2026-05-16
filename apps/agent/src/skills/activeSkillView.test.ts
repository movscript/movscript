import assert from 'node:assert/strict'
import test from 'node:test'
import { activeSkillIdsFromRun } from './activeSkillView.js'
import type { AgentTraceEvent } from '../state/types.js'

test('activeSkillIdsFromRun reads skills from the latest runtime context event', () => {
  const older = contextEvent('trace_1', 'Runtime context resolved', ['policy.core'])
  const newer = contextEvent('trace_2', 'Runtime context resolved from fallback', ['policy.core', 'workflow.visual'])

  assert.deepEqual(activeSkillIdsFromRun({ traceEvents: [older, newer] }), ['policy.core', 'workflow.visual'])
})

test('activeSkillIdsFromRun ignores malformed skill entries', () => {
  const event: AgentTraceEvent = {
    ...contextEvent('trace_1', 'Runtime context resolved', []),
    data: {
      skills: [
        { id: 'policy.core' },
        { id: 123 },
        null,
        { name: 'missing id' },
      ],
    },
  }

  assert.deepEqual(activeSkillIdsFromRun({ traceEvents: [event] }), ['policy.core'])
})

test('activeSkillIdsFromRun returns an empty list without context events', () => {
  assert.deepEqual(activeSkillIdsFromRun({ traceEvents: [contextEvent('trace_1', 'Other event', ['policy.core'])] }), [])
  assert.deepEqual(activeSkillIdsFromRun({}), [])
})

function contextEvent(id: string, title: string, skillIds: string[]): AgentTraceEvent {
  return {
    id,
    runId: 'run_1',
    kind: 'context',
    title,
    status: 'completed',
    createdAt: '2026-01-01T00:00:00.000Z',
    data: {
      skills: skillIds.map((skillId) => ({ id: skillId })),
    },
  }
}
