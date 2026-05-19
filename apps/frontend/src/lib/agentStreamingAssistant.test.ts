import assert from 'node:assert/strict'
import test from 'node:test'

import { projectStreamingAssistantTurn } from './agentStreamingAssistant'

test('projectStreamingAssistantTurn creates a stable streaming message id per run', () => {
  const projected = projectStreamingAssistantTurn({
    currentMessageId: null,
    turns: new Map(),
    runId: 'run_1',
    text: 'Hello',
  })

  assert.equal(projected?.messageId, 'stream-run_1')
  assert.equal(projected?.text, 'Hello')
})

test('projectStreamingAssistantTurn keeps the first message id and merges round text in order', () => {
  const first = projectStreamingAssistantTurn({
    currentMessageId: null,
    turns: new Map(),
    runId: 'run_1',
    text: 'Second round',
    roundIndex: 1,
  })
  assert.ok(first)

  const second = projectStreamingAssistantTurn({
    currentMessageId: first.messageId,
    turns: first.turns,
    runId: 'run_2',
    text: 'First round',
    roundIndex: 0,
  })

  assert.equal(second?.messageId, 'stream-run_1')
  assert.equal(second?.text, 'First round\n\nSecond round')
})

test('projectStreamingAssistantTurn ignores blank deltas', () => {
  const projected = projectStreamingAssistantTurn({
    currentMessageId: null,
    turns: new Map(),
    runId: 'run_1',
    text: '   ',
  })

  assert.equal(projected, null)
})
