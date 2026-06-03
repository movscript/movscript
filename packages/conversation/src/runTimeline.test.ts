import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAgentRunTimeline } from './index'
import type { AgentRunActivity } from '@movscript/protocol'

test('buildAgentRunTimeline orders rounds, decisions, tools, approvals, then results structurally', () => {
  const timeline = buildAgentRunTimeline(activity({
    events: [{
      id: 'event_decision',
      kind: 'model_call',
      title: 'Model tool calls requested',
      status: 'completed',
      roundIndex: 1,
      data: {
        tool_calls: [
          { id: 'call_read', name: 'movscript_focus_get', args: {} },
          { id: 'call_write', name: 'candidate_asset_slot_attach', args: { asset_slot_id: 9, resource_id: 88 } },
        ],
      },
      createdAt: '2026-05-22T01:00:00.000Z',
    }],
    approvals: [{
      id: 'approval_write',
      toolName: 'candidate_asset_slot_attach',
      args: { resource_id: 88, asset_slot_id: 9 },
      reason: 'confirm write',
      status: 'approved',
      createdAt: '2026-05-22T01:00:00.100Z',
      updatedAt: '2026-05-22T01:00:02.000Z',
      approvedAt: '2026-05-22T01:00:02.000Z',
    }],
    steps: [{
      id: 'step_read',
      type: 'tool_call',
      status: 'completed',
      roundIndex: 1,
      toolName: 'movscript_focus_get',
      createdAt: '2026-05-22T01:00:00.500Z',
      completedAt: '2026-05-22T01:00:00.800Z',
    }, {
      id: 'step_write',
      type: 'tool_call',
      status: 'completed',
      roundIndex: 1,
      toolName: 'candidate_asset_slot_attach',
      args: { asset_slot_id: 9, resource_id: 88 },
      result: { message: 'candidate created' },
      createdAt: '2026-05-22T01:00:03.000Z',
      completedAt: '2026-05-22T01:00:04.000Z',
    }],
  }))

  assert.deepEqual(timeline.rounds.map((round) => round.index), [1])
  assert.deepEqual(timeline.rounds[0]?.decisions[0]?.toolCalls.map((call) => call.name), [
    'movscript_focus_get',
    'candidate_asset_slot_attach',
  ])
  assert.deepEqual(timeline.rounds[0]?.toolExecutions.map((tool) => tool.id), [
    'step-step_read',
    'step-step_write',
  ])
  assert.deepEqual(timeline.rounds[0]?.toolExecutions.map((tool) => tool.decisionOrder), [0, 1])
  const write = timeline.rounds[0]?.toolExecutions[1]
  assert.equal(write?.approvals[0]?.id, 'approval_write')
  assert.equal(write?.step?.id, 'step_write')
})

test('buildAgentRunTimeline falls back to recorded step order when timestamps are unstable', () => {
  const timeline = buildAgentRunTimeline(activity({
    steps: [{
      id: 'step_models',
      type: 'tool_call',
      status: 'completed',
      roundIndex: 1,
      toolName: 'generation_model_list',
      createdAt: '2026-05-22T01:00:02.000Z',
      completedAt: '2026-05-22T01:00:02.100Z',
    }, {
      id: 'step_work',
      type: 'tool_call',
      status: 'completed',
      roundIndex: 1,
      toolName: 'core_work_start',
      createdAt: '2026-05-22T01:00:01.000Z',
      completedAt: '2026-05-22T01:00:01.100Z',
    }],
  }))

  assert.deepEqual(timeline.rounds[0]?.toolExecutions.map((tool) => tool.toolName), [
    'generation_model_list',
    'core_work_start',
  ])
})

test('buildAgentRunTimeline keeps approval-only tools as executions before results exist', () => {
  const timeline = buildAgentRunTimeline(activity({
    approvals: [{
      id: 'approval_write',
      toolName: 'candidate_asset_slot_attach',
      args: { asset_slot_id: 9 },
      reason: 'confirm write',
      status: 'pending',
      createdAt: '2026-05-22T01:00:01.000Z',
      updatedAt: '2026-05-22T01:00:01.000Z',
    }],
  }))

  assert.equal(timeline.rounds.length, 1)
  assert.deepEqual(timeline.rounds[0]?.toolExecutions.map((tool) => ({
    id: tool.id,
    toolName: tool.toolName,
    approvalIds: tool.approvals.map((approval) => approval.id),
    hasStep: Boolean(tool.step),
  })), [{
    id: 'approval-approval_write',
    toolName: 'candidate_asset_slot_attach',
    approvalIds: ['approval_write'],
    hasStep: false,
  }])
})

test('buildAgentRunTimeline keeps late approval-only tools in their decision round', () => {
  const timeline = buildAgentRunTimeline(activity({
    events: [{
      id: 'event_decision_first',
      kind: 'model_call',
      title: 'Model tool calls requested',
      status: 'completed',
      roundIndex: 1,
      roundLabel: 'First tool round',
      roundSource: 'model',
      data: {
        tool_calls: [
          { id: 'call_create', name: 'core_work_start', args: { kind: 'generation_job', prompt: 'A' } },
        ],
      },
      createdAt: '2026-05-22T01:00:00.000Z',
    }, {
      id: 'event_decision_second',
      kind: 'model_call',
      title: 'Model tool calls requested',
      status: 'completed',
      roundIndex: 2,
      data: {
        tool_calls: [
          { id: 'call_wait', name: 'core_work_wait', args: { workId: 'work_1' } },
        ],
      },
      createdAt: '2026-05-22T01:00:05.000Z',
    }],
    approvals: [{
      id: 'approval_create',
      toolName: 'core_work_start',
      args: { kind: 'generation_job', prompt: 'A' },
      reason: 'confirm generation',
      status: 'pending',
      createdAt: '2026-05-22T01:00:06.000Z',
      updatedAt: '2026-05-22T01:00:06.000Z',
    }],
  }))

  assert.deepEqual(timeline.rounds.map((round) => round.index), [1, 2])
  assert.deepEqual(timeline.rounds[0]?.toolExecutions.map((tool) => ({
    id: tool.id,
    roundIndex: tool.roundIndex,
    roundLabel: tool.roundLabel,
    approvalIds: tool.approvals.map((approval) => approval.id),
  })), [{
    id: 'approval-approval_create',
    roundIndex: 1,
    roundLabel: 'First tool round',
    approvalIds: ['approval_create'],
  }])
  assert.deepEqual(timeline.rounds[1]?.toolExecutions, [])
})

test('buildAgentRunTimeline treats blocked input traces as waiting instead of failures', () => {
  const timeline = buildAgentRunTimeline(activity({
    events: [{
      id: 'event_input_required',
      kind: 'input',
      title: 'User input required',
      status: 'blocked',
      roundIndex: 1,
      createdAt: '2026-05-22T01:00:00.000Z',
    }],
    inputs: [{
      id: 'input_1',
      title: 'Need input',
      question: 'What next?',
      inputType: 'text',
      choices: [],
      allowCustomAnswer: true,
      status: 'pending',
      createdAt: '2026-05-22T01:00:00.000Z',
      updatedAt: '2026-05-22T01:00:00.000Z',
    }],
  }))

  assert.equal(timeline.rounds[0]?.failed, false)
  assert.deepEqual(timeline.rounds[0]?.inputs.map((input) => input.id), ['input_1'])
})

test('buildAgentRunTimeline preserves final round metadata', () => {
  const timeline = buildAgentRunTimeline(activity({
    events: [{
      id: 'event_final',
      kind: 'assistant',
      title: 'Assistant message created',
      status: 'completed',
      roundIndex: 999,
      roundLabel: 'Final response',
      roundSource: 'final',
      createdAt: '2026-05-22T01:00:00.000Z',
    }],
  }))

  assert.equal(timeline.rounds[0]?.index, 999)
  assert.equal(timeline.rounds[0]?.label, 'Final response')
  assert.equal(timeline.rounds[0]?.source, 'final')
})

function activity(overrides: Partial<AgentRunActivity> = {}): AgentRunActivity {
  return {
    runId: 'run_1',
    threadId: 'thread_1',
    status: 'completed',
    createdAt: '2026-05-22T01:00:00.000Z',
    updatedAt: '2026-05-22T01:00:05.000Z',
    steps: [],
    events: [],
    ...overrides,
  }
}
