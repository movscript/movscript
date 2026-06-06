import assert from 'node:assert/strict'
import test from 'node:test'

import {
  agentChatPlanItemView,
  agentChatPlanStatusIntent,
  agentChatReasoningItemView,
} from '@/features/agent/domain/agentChatProcessItemViews'

test('agent chat reasoning item view builds meta tone and text blocks', () => {
  const view = agentChatReasoningItemView({
    type: 'reasoning',
    id: 'reason_1',
    title: 'Checked constraints',
    status: 'failed',
    source: 'final',
    roundId: 'round_final',
    roundIndex: 2,
    roundLabel: 'Final response',
    durationMs: 44,
    summary: ['Checked constraints'],
    content: ['Minor warning'],
    result: { findings: 0 },
    error: { code: 'E_MINOR' },
    raw: { provider: 'codex', type: 'reasoning' },
  })

  assert.deepEqual(view, {
    title: 'Checked constraints',
    meta: ['failed', 'final', 'Final response', 'round 2', 'round id round_final', '44ms', '1 summary part(s)', '1 trace part(s)'],
    tone: 'diagnostic',
    summary: 'Checked constraints',
    trace: 'Minor warning',
    resultDetails: { findings: 0 },
    errorDetails: { code: 'E_MINOR' },
    rawDetails: { provider: 'codex', type: 'reasoning' },
    visible: true,
  })
})

test('agent chat plan item view parses bracketed lines into steps', () => {
  const view = agentChatPlanItemView({
    type: 'plan',
    id: 'plan_1',
    text: 'Align UI messages\n[completed] Inspect protocol\n[inProgress] Tune renderer',
  })

  assert.equal(view.visible, true)
  assert.equal(view.intro, 'Align UI messages')
  assert.equal(view.text, 'Align UI messages\n[completed] Inspect protocol\n[inProgress] Tune renderer')
  assert.deepEqual(view.steps, [
    { status: 'completed', text: 'Inspect protocol' },
    { status: 'inProgress', text: 'Tune renderer' },
  ])
  assert.equal(view.details, undefined)
})

test('agent chat plan item view preserves structured steps in details', () => {
  const view = agentChatPlanItemView({
    type: 'plan',
    id: 'plan_structured',
    text: 'Runtime plan',
    items: [
      { text: 'Inspect provider session event', status: 'completed', raw: { id: 'step_1', owner: 'runtime' } },
      { text: 'Render neutral plan item', status: 'in_progress', raw: { id: 'step_2', priority: 'high' } },
    ],
    raw: {
      explanation: 'Runtime plan',
      plan: [{ step: 'Inspect provider session event', status: 'completed', id: 'step_1' }],
    },
  })

  assert.equal(view.intro, 'Runtime plan')
  assert.deepEqual(view.steps.map((step) => [step.text, step.status]), [
    ['Inspect provider session event', 'completed'],
    ['Render neutral plan item', 'in_progress'],
  ])
  assert.deepEqual(view.details, {
    raw: {
      explanation: 'Runtime plan',
      plan: [{ step: 'Inspect provider session event', status: 'completed', id: 'step_1' }],
    },
    steps: [
      { index: 1, text: 'Inspect provider session event', status: 'completed', raw: { id: 'step_1', owner: 'runtime' } },
      { index: 2, text: 'Render neutral plan item', status: 'in_progress', raw: { id: 'step_2', priority: 'high' } },
    ],
  })
})

test('agent chat plan status intent maps known statuses', () => {
  assert.equal(agentChatPlanStatusIntent('completed'), 'success')
  assert.equal(agentChatPlanStatusIntent('in_progress'), 'info')
  assert.equal(agentChatPlanStatusIntent('running'), 'info')
  assert.equal(agentChatPlanStatusIntent('blocked'), 'warning')
  assert.equal(agentChatPlanStatusIntent('failed'), 'danger')
  assert.equal(agentChatPlanStatusIntent('queued'), 'neutral')
})
