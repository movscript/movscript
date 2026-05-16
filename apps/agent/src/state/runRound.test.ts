import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRunRound } from './runRound.js'

test('buildRunRound creates stable round metadata ids from the round index', () => {
  assert.deepEqual(buildRunRound(3, 'Model turn 3', 'model'), {
    roundId: 'round_3',
    roundIndex: 3,
    roundLabel: 'Model turn 3',
    roundSource: 'model',
  })
})
