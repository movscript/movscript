import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isTerminalPlanStatus,
  isTerminalRunStatus,
  toSubagentRunSummary,
  waitStatusFromPlanStatus,
  waitStatusFromRunStatus,
  waitStatusFromTaskStatus,
} from './subagentRunView.js'
import type { AgentRun, AgentTask } from './types.js'

test('toSubagentRunSummary includes run fields and pending counts', () => {
  assert.deepEqual(toSubagentRunSummary(run({
    role: 'worker',
    parentRunId: 'run_parent',
    planId: 'plan_1',
    taskId: 'task_1',
    progress: 0.5,
    blockedReason: 'Need input',
    startedAt: 'started',
    completedAt: 'completed',
    warnings: ['warning'],
    metadata: { subagentName: 'Ada' },
    pendingApprovals: [
      { id: 'approval_1', runId: 'run_1', toolName: 'tool_a', args: {}, reason: 'Needs approval', status: 'pending', createdAt: 'created', updatedAt: 'created' },
      { id: 'approval_2', runId: 'run_1', toolName: 'tool_b', args: {}, reason: 'Approved already', status: 'approved', createdAt: 'created', updatedAt: 'created' },
    ],
    pendingInputRequests: [
      { id: 'input_1', runId: 'run_1', title: 'Question', question: 'Pick', inputType: 'choice', choices: [], allowCustomAnswer: false, status: 'pending', createdAt: 'created', updatedAt: 'created' },
    ],
    steps: [{ id: 'step_1', runId: 'run_1', type: 'message', status: 'completed', createdAt: 'created' }],
  })), {
    id: 'run_1',
    subagentName: 'Ada',
    threadId: 'thread_1',
    status: 'queued',
    role: 'worker',
    parentRunId: 'run_parent',
    planId: 'plan_1',
    taskId: 'task_1',
    progress: 0.5,
    blockedReason: 'Need input',
    createdAt: 'created',
    updatedAt: 'updated',
    startedAt: 'started',
    completedAt: 'completed',
    warnings: ['warning'],
    stepCount: 1,
    pendingApprovalCount: 1,
    pendingInputCount: 1,
  })
})

test('toSubagentRunSummary falls back to task subagent name', () => {
  assert.equal(toSubagentRunSummary(run({ taskId: 'task_1' }), task({ metadata: { subagentName: 'Turing' } })).subagentName, 'Turing')
})

test('terminal status helpers classify run and plan status', () => {
  assert.equal(isTerminalRunStatus('requires_action'), true)
  assert.equal(isTerminalRunStatus('in_progress'), false)
  assert.equal(isTerminalPlanStatus('done'), true)
  assert.equal(isTerminalPlanStatus('needs_review'), false)
})

test('wait status helpers map run task and plan statuses', () => {
  assert.equal(waitStatusFromRunStatus('completed_with_warnings'), 'completed')
  assert.equal(waitStatusFromRunStatus('requires_action'), 'blocked')
  assert.equal(waitStatusFromRunStatus('queued'), 'pending')
  assert.equal(waitStatusFromTaskStatus('done'), 'completed')
  assert.equal(waitStatusFromTaskStatus('needs_review'), 'needs_review')
  assert.equal(waitStatusFromTaskStatus('running'), 'pending')
  assert.equal(waitStatusFromPlanStatus('done'), 'completed')
  assert.equal(waitStatusFromPlanStatus('blocked'), 'blocked')
  assert.equal(waitStatusFromPlanStatus('running'), 'pending')
})

function run(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'queued',
    policy: {
      approvalMode: 'auto',
      sandboxMode: false,
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: 'created',
    updatedAt: 'updated',
    steps: [],
    ...overrides,
  }
}

function task(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'task_1',
    planId: 'plan_1',
    deps: [],
    title: 'Task',
    status: 'pending',
    progress: 0,
    artifacts: [],
    createdAt: 'created',
    updatedAt: 'updated',
    ...overrides,
  }
}
