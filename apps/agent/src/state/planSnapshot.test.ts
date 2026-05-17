import assert from 'node:assert/strict'
import test from 'node:test'
import { agentPlanSummary, buildAgentPlanSnapshot, taskArtifactReferences } from './planSnapshot.js'
import type { AgentPlan, AgentRun, AgentTask } from './types.js'

test('taskArtifactReferences includes task and provenance metadata', () => {
  const source = task({
    id: 'source_task',
    title: 'Source task',
    status: 'done',
    ownerRunId: 'run_source',
  })
  const owner = task({
    id: 'owner_task',
    metadata: { subagentName: 'Ada' },
    artifacts: [{
      id: 'artifact_1',
      type: 'file',
      title: 'Report',
      uri: 'file://report',
      metadata: {
        sourceTaskId: 'source_task',
        sourceRunId: 'run_1',
        toolName: 'tool_a',
        policy: 'manual',
      },
      createdAt: '2026-05-16T00:00:00.000Z',
    }],
  })
  assert.deepEqual(taskArtifactReferences([source, owner]), [{
    id: 'artifact_1',
    type: 'file',
    taskId: 'owner_task',
    title: 'Report',
    uri: 'file://report',
    subagentName: 'Ada',
    sourceRunId: 'run_1',
    sourceTaskId: 'source_task',
    sourceTaskTitle: 'Source task',
    sourceTaskStatus: 'done',
    sourceTaskOwnerRunId: 'run_source',
    toolName: 'tool_a',
    policy: 'manual',
  }])
})

test('taskArtifactReferences ignores non-plain artifact metadata records', () => {
  class RuntimeArtifactMetadata {
    sourceTaskId = 'source_task'
    sourceRunId = 'run_1'
    toolName = 'tool_a'
    policy = 'manual'
  }
  const source = task({ id: 'source_task', title: 'Source task', status: 'done' })
  const owner = task({
    id: 'owner_task',
    artifacts: [{
      id: 'artifact_1',
      type: 'file',
      metadata: new RuntimeArtifactMetadata() as any,
      createdAt: '2026-05-16T00:00:00.000Z',
    }],
  })

  assert.deepEqual(taskArtifactReferences([source, owner]), [{
    id: 'artifact_1',
    type: 'file',
    taskId: 'owner_task',
  }])
})

test('agentPlanSummary counts statuses workers artifacts and conflicts', () => {
  const tasks = [
    task({ id: 'task_1', status: 'pending' }),
    task({ id: 'task_2', status: 'running' }),
    task({ id: 'task_3', status: 'blocked' }),
    task({ id: 'task_4', status: 'needs_review' }),
    task({ id: 'task_5', status: 'done' }),
    task({ id: 'task_6', status: 'failed' }),
    task({ id: 'task_7', status: 'cancelled' }),
  ]
  assert.deepEqual(agentPlanSummary(
    tasks,
    [{ status: 'queued' }, { status: 'in_progress' }, { status: 'completed' }],
    [{ id: 'artifact_1', type: 'file', taskId: 'task_5' }],
    [{ subagentName: 'Ada', taskIds: ['task_1', 'task_2'] }],
  ), {
    taskCount: 7,
    taskStatusCounts: {
      pending: 1,
      running: 1,
      blocked: 1,
      needs_review: 1,
      done: 1,
      failed: 1,
      cancelled: 1,
    },
    workerCount: 3,
    activeWorkerCount: 2,
    artifactCount: 1,
    nameConflictCount: 1,
    blockedTaskIds: ['task_3'],
    needsReviewTaskIds: ['task_4'],
    failedTaskIds: ['task_6'],
  })
})

test('buildAgentPlanSnapshot projects conflicts and reusable summary', () => {
  const tasks = [
    task({ id: 'task_1', status: 'blocked', metadata: { subagentName: 'Ada' } }),
    task({ id: 'task_2', status: 'done', metadata: { subagentName: 'Ada' }, artifacts: [{
      id: 'artifact_1',
      type: 'file',
      createdAt: '2026-05-16T00:00:00.000Z',
    }] }),
  ]
  const snapshot = buildAgentPlanSnapshot({
    plan: plan(),
    tasks,
    runs: [run({ status: 'in_progress' })],
  })

  assert.equal(snapshot.plan.id, 'plan_1')
  assert.deepEqual(snapshot.nameConflicts, [{ subagentName: 'Ada', taskIds: ['task_1', 'task_2'] }])
  assert.ok(snapshot.summary)
  assert.equal(snapshot.summary.taskCount, 2)
  assert.equal(snapshot.summary.artifactCount, 1)
  assert.equal(snapshot.summary.activeWorkerCount, 1)
  assert.deepEqual(snapshot.summary.blockedTaskIds, ['task_1'])
})

function plan(overrides: Partial<AgentPlan> = {}): AgentPlan {
  return {
    id: 'plan_1',
    threadId: 'thread_1',
    title: 'Plan',
    status: 'running',
    progress: 0,
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z',
    ...overrides,
  }
}

function run(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'queued',
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z',
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
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z',
    ...overrides,
  }
}
