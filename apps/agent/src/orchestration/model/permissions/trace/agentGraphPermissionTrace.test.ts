import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildApprovalRequestedTrace,
  buildSkillActivationRepairTrace,
  buildUserInputRequiredTrace,
} from './agentGraphPermissionTrace.js'

const trace = { roundIndex: 1, roundLabel: 'Model turn 1', roundSource: 'model' as const }

test('buildUserInputRequiredTrace summarizes input requests without prompt text', () => {
  const event = buildUserInputRequiredTrace([{
    id: 'input_1',
    runId: 'run_1',
    title: 'Sensitive title',
    summary: 'Sensitive summary',
    question: 'Sensitive question',
    inputType: 'text',
    choices: [],
    allowCustomAnswer: true,
    status: 'pending',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }], trace)

  const json = JSON.stringify(event.data)
  assert.equal(event.summary, '1 user input request(s) required.')
  assert.match(json, /inputRequestSummary/)
  assert.match(json, /questionHash/)
  assert.doesNotMatch(json, /Sensitive title/)
  assert.doesNotMatch(json, /Sensitive summary/)
  assert.doesNotMatch(json, /Sensitive question/)
})

test('buildApprovalRequestedTrace summarizes approval reasons without reason text', () => {
  const event = buildApprovalRequestedTrace([{
    call: { name: 'tool_a', args: { prompt: 'secret prompt' } },
    reason: 'approval_required',
    message: 'Sensitive approval reason',
    tool: { name: 'tool_a', approval: 'always', permission: 'write', risk: 'write' } as never,
  }], trace)

  const json = JSON.stringify(event.data)
  assert.match(json, /reasonHash/)
  assert.doesNotMatch(json, /Sensitive approval reason/)
  assert.doesNotMatch(json, /secret prompt/)
})

test('buildSkillActivationRepairTrace summarizes repair tool args', () => {
  const event = buildSkillActivationRepairTrace({
    blockedToolCalls: [{
      call: { name: 'tool_a', args: { prompt: 'blocked prompt' } },
      reason: 'skill_scope',
      message: 'blocked',
    }],
    repairCalls: [{ name: 'skill_activate', args: { id: 'secret.skill' } }],
    trace,
  })

  const json = JSON.stringify(event.data)
  assert.match(json, /argsHash/)
  assert.doesNotMatch(json, /secret.skill/)
  assert.doesNotMatch(json, /blocked prompt/)
})
