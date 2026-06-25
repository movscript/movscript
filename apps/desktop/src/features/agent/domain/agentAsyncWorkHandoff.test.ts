import assert from 'node:assert/strict'
import test from 'node:test'
import {
  hasAgentAsyncWorkHandoffActivity,
  isAgentAsyncWorkHandoffRun,
} from '@/features/agent/domain/agentAsyncWorkHandoff'
import type { AgentRun } from '@movscript/agent-protocol'
import type { ChatRunActivity } from '@/features/agent/state/agentStore'

test('hasAgentAsyncWorkHandoffActivity detects explicit generation and editing handoffs', () => {
  assert.equal(hasAgentAsyncWorkHandoffActivity({
    activity: activity({
      steps: [{
        id: 'step_1',
        type: 'tool_call',
        status: 'completed',
        toolName: 'generation_submit',
        createdAt: '2026-05-23T00:00:00.000Z',
        completedAt: '2026-05-23T00:00:01.000Z',
      }],
      events: [{
        id: 'event_1',
        kind: 'tool_call',
        title: 'Generation job submitted',
        status: 'completed',
        toolName: 'editing_task_render_create',
        data: { taskId: 'task_1', status: 'running' },
        createdAt: '2026-05-23T00:00:00.000Z',
        completedAt: '2026-05-23T00:00:01.000Z',
      }],
    }),
  }), true)
  assert.equal(hasAgentAsyncWorkHandoffActivity({
    activity: activity({
      steps: [],
      events: [],
    }),
  }), false)
})

test('isAgentAsyncWorkHandoffRun only unlocks terminal handoff runs', () => {
  assert.equal(isAgentAsyncWorkHandoffRun(run({ status: 'completed' })), true)
  assert.equal(isAgentAsyncWorkHandoffRun(run({ status: 'in_progress' })), false)
  assert.equal(isAgentAsyncWorkHandoffRun({ ...run({ status: 'completed' }), steps: [] }), false)
})

test('legacy core work start remains a handoff for old transcripts', () => {
  assert.equal(isAgentAsyncWorkHandoffRun(run({
    status: 'completed',
    steps: [{
      id: 'step_legacy',
      runId: 'run_1',
      type: 'tool_call',
      status: 'completed',
      toolName: 'core_work_start',
      createdAt: '2026-05-23T00:00:00.000Z',
      completedAt: '2026-05-23T00:00:01.000Z',
    }],
  })), true)
})

function activity(overrides: Partial<ChatRunActivity> = {}): ChatRunActivity {
  return {
    runId: 'run_1',
    threadId: 'thread_1',
    status: 'completed',
    createdAt: '2026-05-23T00:00:00.000Z',
    updatedAt: '2026-05-23T00:00:01.000Z',
    steps: [{
      id: 'step_1',
      type: 'tool_call',
      status: 'completed',
      toolName: 'generation_submit',
      createdAt: '2026-05-23T00:00:00.000Z',
      completedAt: '2026-05-23T00:00:01.000Z',
    }],
    events: [],
    ...overrides,
  }
}

function run(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'completed',
    providerSessionLimits: { approvalMode: 'interactive',
      maxToolCalls: 8,
      maxIterations: 4,
      allowNetwork: false,
      allowFileBytes: true,
    },
    createdAt: '2026-05-23T00:00:00.000Z',
    updatedAt: '2026-05-23T00:00:01.000Z',
    steps: [{
      id: 'step_1',
      runId: 'run_1',
      type: 'tool_call',
      status: 'completed',
      toolName: 'generation_submit',
      result: { jobId: 42, status: 'pending' },
      createdAt: '2026-05-23T00:00:00.000Z',
      completedAt: '2026-05-23T00:00:01.000Z',
    }],
    ...overrides,
  }
}
