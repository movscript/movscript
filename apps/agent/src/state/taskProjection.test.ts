import assert from 'node:assert/strict'
import test from 'node:test'
import { projectRunOntoTask } from './taskProjection.js'
import type { AgentRun, AgentTask } from './types.js'

const now = '2026-05-16T00:00:00.000Z'

test('projectRunOntoTask completes tasks and records run artifact provenance', () => {
  const task = buildTask()
  const run = buildRun({
    status: 'completed_with_warnings',
    role: 'worker',
    parentRunId: 'run_planner',
    completedAt: '2026-05-16T00:00:01.000Z',
    metadata: { subagentName: 'Einstein' },
  })

  assert.equal(projectRunOntoTask(task, run, now), true)
  assert.equal(task.status, 'done')
  assert.equal(task.progress, 1)
  assert.equal(task.completedAt, '2026-05-16T00:00:01.000Z')
  assert.equal(task.artifacts.length, 1)
  assert.deepEqual(task.artifacts[0]?.metadata, {
    createdFrom: 'worker_completion',
    sourceRunId: 'run_1',
    threadId: 'thread_1',
    runStatus: 'completed_with_warnings',
    sourceRunRole: 'worker',
    parentRunId: 'run_planner',
    planId: 'plan_1',
    sourceTaskId: 'task_1',
    subagentName: 'Einstein',
  })
})

test('projectRunOntoTask adds rollback policy artifacts once', () => {
  const task = buildTask()
  const run = buildRun({
    status: 'completed',
    metadata: {
      rollbackRecords: [{
        call: { name: 'movscript_create_project' },
        rollback: { policy: 'manual_compensation', reason: 'External write completed.' },
      }],
    },
  })

  projectRunOntoTask(task, run, now)
  projectRunOntoTask(task, run, now)

  assert.equal(task.artifacts.filter((artifact) => artifact.type === 'run').length, 1)
  assert.equal(task.artifacts.filter((artifact) => artifact.type === 'rollback-policy').length, 1)
  assert.equal(task.artifacts.find((artifact) => artifact.type === 'rollback-policy')?.metadata?.policy, 'manual_compensation')
})

test('projectRunOntoTask ignores non-plain rollback and subagent metadata records', () => {
  class RunMetadata {
    subagentName = 'Einstein'
    rollbackRecords = [{
      call: { name: 'movscript_create_project' },
      rollback: { policy: 'manual_compensation', reason: 'External write completed.' },
    }]
  }

  const task = buildTask()
  const run = buildRun({
    status: 'completed',
    metadata: new RunMetadata() as never,
  })

  projectRunOntoTask(task, run, now)

  assert.equal(task.artifacts.length, 1)
  assert.equal(task.artifacts[0]?.metadata?.subagentName, undefined)
  assert.equal(task.artifacts.some((artifact) => artifact.type === 'rollback-policy'), false)
})

test('projectRunOntoTask blocks tasks for pending user input or approval', () => {
  const needsInputTask = buildTask({ progress: 0.1 })
  const needsInputRun = buildRun({
    status: 'requires_action',
    progress: 0.25,
    pendingInputRequests: [{
      id: 'input_1',
      runId: 'run_1',
      title: 'Need input',
      question: 'Choose',
      inputType: 'text',
      choices: [],
      allowCustomAnswer: true,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    }],
  })
  projectRunOntoTask(needsInputTask, needsInputRun, now)

  assert.equal(needsInputTask.status, 'blocked')
  assert.equal(needsInputTask.progress, 0.25)
  assert.equal(needsInputTask.blockedReason, 'Worker run needs user input.')
  assert.equal(needsInputTask.metadata?.blockedKind, 'needs_input')

  const approvalTask = buildTask({ progress: 0.1 })
  projectRunOntoTask(approvalTask, buildRun({ status: 'requires_action' }), now)
  assert.equal(approvalTask.status, 'blocked')
  assert.equal(approvalTask.progress, 0.5)
  assert.equal(approvalTask.blockedReason, 'Worker run needs approval.')
  assert.equal(approvalTask.metadata?.blockedKind, 'approval')
})

test('projectRunOntoTask maps failed and cancelled terminal states', () => {
  const failedTask = buildTask()
  projectRunOntoTask(failedTask, buildRun({
    status: 'failed',
    error: 'model failed',
    failedAt: '2026-05-16T00:00:02.000Z',
  }), now)
  assert.equal(failedTask.status, 'failed')
  assert.equal(failedTask.blockedReason, 'model failed')
  assert.equal(failedTask.failedAt, '2026-05-16T00:00:02.000Z')

  const cancelledTask = buildTask()
  projectRunOntoTask(cancelledTask, buildRun({
    status: 'cancelled',
    warnings: ['cancelled by user'],
    cancelledAt: '2026-05-16T00:00:03.000Z',
  }), now)
  assert.equal(cancelledTask.status, 'cancelled')
  assert.equal(cancelledTask.blockedReason, 'cancelled by user')
  assert.equal(cancelledTask.cancelledAt, '2026-05-16T00:00:03.000Z')
})

test('projectRunOntoTask ignores non-terminal active runs', () => {
  const task = buildTask()
  assert.equal(projectRunOntoTask(task, buildRun({ status: 'in_progress' }), now), false)
  assert.equal(task.status, 'pending')
  assert.equal(task.updatedAt, now)
})

function buildTask(input: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'task_1',
    planId: 'plan_1',
    deps: [],
    title: 'Task',
    status: 'pending',
    progress: 0,
    artifacts: [],
    createdAt: now,
    updatedAt: now,
    ...input,
  }
}

function buildRun(input: Partial<AgentRun>): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'queued',
    planId: 'plan_1',
    taskId: 'task_1',
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 20,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: now,
    updatedAt: now,
    steps: [],
    ...input,
  }
}
