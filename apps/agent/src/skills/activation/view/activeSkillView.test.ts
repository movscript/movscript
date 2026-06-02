import assert from 'node:assert/strict'
import test from 'node:test'
import { activeSkillIdsFromRun } from './activeSkillView.js'
import type { AgentTraceEvent } from '../../../state/shared/types.js'

test('activeSkillIdsFromRun reads skills from the latest runtime context event', () => {
  const older = contextEvent('trace_1', 'Runtime context resolved', ['core.rules.runtime'])
  const newer = contextEvent('trace_2', 'Runtime context resolved from fallback', ['core.rules.runtime', 'generation.visual_execution'])

  assert.deepEqual(activeSkillIdsFromRun({ traceEvents: [older, newer] }), ['core.rules.runtime', 'generation.visual_execution'])
})

test('activeSkillIdsFromRun ignores malformed skill entries', () => {
  const event: AgentTraceEvent = {
    ...contextEvent('trace_1', 'Runtime context resolved', []),
    data: {
      skills: [
        { id: 'core.rules.runtime' },
        { id: 123 },
        null,
        { name: 'missing id' },
      ],
    },
  }

  assert.deepEqual(activeSkillIdsFromRun({ traceEvents: [event] }), ['core.rules.runtime'])
})

test('activeSkillIdsFromRun returns an empty list without context events', () => {
  assert.deepEqual(activeSkillIdsFromRun({ traceEvents: [contextEvent('trace_1', 'Other event', ['core.rules.runtime'])] }), [])
  assert.deepEqual(activeSkillIdsFromRun({}), [])
})

test('activeSkillIdsFromRun falls back to metadata skill state', () => {
  assert.deepEqual(activeSkillIdsFromRun({
    metadata: {
      activeSkillIds: ['core.rules.runtime'],
      skillState: {
        loadedSkillIds: ['generation.visual_execution'],
        unloadedSkillIds: ['core.rules.runtime'],
      },
    },
  }), ['generation.visual_execution'])
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
