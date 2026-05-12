import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeAgentSettings } from './agentStore'

test('normalizeAgentSettings preserves valid planner dispatch preferences', () => {
  const settings = normalizeAgentSettings({
    planMaxWorkers: 4,
    planMaxTaskAttempts: 3,
    planWorkerTimeoutMs: 60 * 60_000,
  })

  assert.equal(settings.planMaxWorkers, 4)
  assert.equal(settings.planMaxTaskAttempts, 3)
  assert.equal(settings.planWorkerTimeoutMs, 60 * 60_000)
})

test('normalizeAgentSettings falls back from invalid persisted planner dispatch preferences', () => {
  const settings = normalizeAgentSettings({
    planMaxWorkers: 99,
    planMaxTaskAttempts: 0,
    planWorkerTimeoutMs: 1234,
  })

  assert.equal(settings.planMaxWorkers, 2)
  assert.equal(settings.planMaxTaskAttempts, 2)
  assert.equal(settings.planWorkerTimeoutMs, 15 * 60_000)
})
