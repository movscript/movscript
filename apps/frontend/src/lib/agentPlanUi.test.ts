import assert from 'node:assert/strict'
import test from 'node:test'
import { actionableRunForPlan, buildPlanArtifactSummary, buildPlanTaskViews, plannerRunIdForPlanAction, runNeedsUserAction, shouldPollPlanSnapshot } from './agentPlanUi'
import type { AgentPlanSnapshot, AgentRun, AgentTask } from './localAgentClient'

function run(input: Partial<AgentRun> & { id: string }): AgentRun {
  return {
    id: input.id,
    threadId: input.threadId ?? 'thread_1',
    status: input.status ?? 'completed',
    role: input.role,
    parentRunId: input.parentRunId,
    planId: input.planId,
    taskId: input.taskId,
    progress: input.progress,
    blockedReason: input.blockedReason,
    pendingInputRequests: input.pendingInputRequests,
    pendingApprovals: input.pendingApprovals,
    policy: {
      approvalMode: 'auto',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    steps: input.steps ?? [],
    metadata: input.metadata,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    failedAt: input.failedAt,
    cancelledAt: input.cancelledAt,
    error: input.error,
    warnings: input.warnings,
    createdAt: '2026-05-12T00:00:00.000Z',
    updatedAt: '2026-05-12T00:00:00.000Z',
  }
}

function snapshot(input: { plan?: Partial<AgentPlanSnapshot['plan']>; tasks?: AgentPlanSnapshot['tasks']; runs?: AgentPlanSnapshot['runs'] } = {}): AgentPlanSnapshot {
  return {
    plan: {
      id: 'plan_1',
      threadId: 'thread_1',
      rootRunId: 'run_planner',
      title: 'Plan',
      status: 'running',
      progress: 0.5,
      createdAt: '2026-05-12T00:00:00.000Z',
      updatedAt: '2026-05-12T00:00:00.000Z',
      ...input.plan,
    },
    tasks: input.tasks ?? [],
    runs: input.runs ?? [],
  }
}

function task(input: Partial<AgentTask> & { id: string; title: string }): AgentTask {
  return {
    id: input.id,
    planId: input.planId ?? 'plan_1',
    deps: input.deps ?? [],
    title: input.title,
    description: input.description,
    status: input.status ?? 'pending',
    progress: input.progress ?? 0,
    ownerRunId: input.ownerRunId,
    blockedReason: input.blockedReason,
    artifacts: input.artifacts ?? [],
    metadata: input.metadata,
    createdAt: input.createdAt ?? '2026-05-12T00:00:00.000Z',
    updatedAt: input.updatedAt ?? '2026-05-12T00:00:00.000Z',
  }
}

test('plannerRunIdForPlanAction prefers the plan root when active run is a worker', () => {
  const activeWorker = run({ id: 'run_worker', role: 'worker', parentRunId: 'run_parent', planId: 'plan_1' })

  assert.equal(plannerRunIdForPlanAction(snapshot(), activeWorker), 'run_planner')
})

test('plannerRunIdForPlanAction falls back to worker parent without a snapshot', () => {
  const activeWorker = run({ id: 'run_worker', role: 'worker', parentRunId: 'run_parent', planId: 'plan_1' })

  assert.equal(plannerRunIdForPlanAction(undefined, activeWorker), 'run_parent')
})

test('shouldPollPlanSnapshot keeps polling while any worker run is active', () => {
  const planSnapshot = snapshot({
    plan: { status: 'done' },
    runs: [
      run({ id: 'run_planner', role: 'planner', status: 'completed', planId: 'plan_1' }),
      run({ id: 'run_worker', role: 'worker', status: 'in_progress', parentRunId: 'run_planner', planId: 'plan_1' }),
    ],
  })

  assert.equal(shouldPollPlanSnapshot(planSnapshot, run({ id: 'run_worker', status: 'in_progress', planId: 'plan_1' })), true)
})

test('shouldPollPlanSnapshot stops polling when plan and runs are terminal', () => {
  const planSnapshot = snapshot({
    plan: { status: 'done' },
    runs: [
      run({ id: 'run_planner', role: 'planner', status: 'completed', planId: 'plan_1' }),
      run({ id: 'run_worker', role: 'worker', status: 'completed', parentRunId: 'run_planner', planId: 'plan_1' }),
    ],
  })

  assert.equal(shouldPollPlanSnapshot(planSnapshot, run({ id: 'run_planner', status: 'completed', planId: 'plan_1' })), false)
})

test('buildPlanTaskViews merges subagent names, blockers, actions, and artifacts', () => {
  const planSnapshot = snapshot({
    tasks: [
      task({
        id: 'task_named',
        title: 'Named worker',
        status: 'blocked',
        ownerRunId: 'run_worker',
        blockedReason: 'Need storyboard direction',
        metadata: { subagentName: '爱因斯坦', retryAttempt: 2, previousOwnerRunId: 'run_previous', previousStatus: 'failed', timedOutRunId: 'run_timeout', workerTimeoutMs: 900000 },
        artifacts: [
          { id: 'artifact_1', type: 'draft', title: 'Storyboard notes', metadata: { subagentName: '爱因斯坦', sourceRunId: 'run_worker' }, createdAt: '2026-05-12T00:00:00.000Z' },
          { id: 'artifact_2', type: 'rollback-policy', metadata: { sourceRunId: 'run_worker' }, createdAt: '2026-05-12T00:00:01.000Z' },
        ],
      }),
    ],
    runs: [
      run({
        id: 'run_worker',
        role: 'worker',
        status: 'requires_action',
        planId: 'plan_1',
        taskId: 'task_named',
        blockedReason: 'Worker blocked',
        progress: 0.5,
        startedAt: '2026-05-12T00:00:00.000Z',
        completedAt: '2026-05-12T00:03:00.000Z',
        warnings: ['Needs review soon'],
        steps: [
          { id: 'step_1', runId: 'run_worker', type: 'message', status: 'completed', title: 'Initial note', createdAt: '2026-05-12T00:00:01.000Z' },
          { id: 'step_2', runId: 'run_worker', type: 'tool_call', status: 'failed', toolName: 'tool_write', error: 'Denied', sandboxed: true, createdAt: '2026-05-12T00:02:01.000Z' },
        ],
        pendingInputRequests: [
          { id: 'input_1', runId: 'run_worker', title: 'Question', question: 'Continue?', inputType: 'choice', choices: [{ id: 'yes', label: 'Yes' }], allowCustomAnswer: true, status: 'pending', createdAt: '2026-05-12T00:00:00.000Z', updatedAt: '2026-05-12T00:00:00.000Z' },
        ],
        pendingApprovals: [
          { id: 'approval_1', runId: 'run_worker', toolName: 'tool_write', reason: 'Write project data', risk: 'write', permission: 'project.write', status: 'pending', createdAt: '2026-05-12T00:00:00.000Z', updatedAt: '2026-05-12T00:00:00.000Z' },
        ],
      }),
    ],
  })

  const [view] = buildPlanTaskViews(planSnapshot)

  assert.equal(view?.subagentName, '爱因斯坦')
  assert.equal(view?.ownerLabel, '爱因斯坦')
  assert.deepEqual(view?.worker && {
    id: view.worker.id,
    status: view.worker.status,
    parentRunId: view.worker.parentRunId,
    taskId: view.worker.taskId,
    progress: view.worker.progress,
    startedAt: view.worker.startedAt,
    completedAt: view.worker.completedAt,
    warningCount: view.worker.warnings.length,
    stepCount: view.worker.stepCount,
    recentSteps: view.worker.recentSteps.map((step) => ({
      id: step.id,
      title: step.title,
      toolName: step.toolName,
      status: step.status,
      error: step.error,
      sandboxed: step.sandboxed,
    })),
  }, {
    id: 'run_worker',
    status: 'requires_action',
    parentRunId: undefined,
    taskId: 'task_named',
    progress: 0.5,
    startedAt: '2026-05-12T00:00:00.000Z',
    completedAt: '2026-05-12T00:03:00.000Z',
    warningCount: 1,
    stepCount: 2,
    recentSteps: [
      { id: 'step_2', title: 'tool_write', toolName: 'tool_write', status: 'failed', error: 'Denied', sandboxed: true },
      { id: 'step_1', title: 'Initial note', toolName: undefined, status: 'completed', error: undefined, sandboxed: undefined },
    ],
  })
  assert.equal(view?.waitingInputCount, 1)
  assert.equal(view?.waitingApprovalCount, 1)
  assert.deepEqual(view?.pendingInputs.map((input) => ({
    title: input.title,
    question: input.question,
    inputType: input.inputType,
    choiceLabels: input.choiceLabels,
    allowCustomAnswer: input.allowCustomAnswer,
  })), [
    { title: 'Question', question: 'Continue?', inputType: 'choice', choiceLabels: ['Yes'], allowCustomAnswer: true },
  ])
  assert.deepEqual(view?.pendingApprovals.map((approval) => ({
    toolName: approval.toolName,
    reason: approval.reason,
    risk: approval.risk,
    permission: approval.permission,
  })), [
    { toolName: 'tool_write', reason: 'Write project data', risk: 'write', permission: 'project.write' },
  ])
  assert.equal(view?.artifactCount, 2)
  assert.equal(view?.retryAttempt, 2)
  assert.equal(view?.previousOwnerRunId, 'run_previous')
  assert.equal(view?.previousStatus, 'failed')
  assert.equal(view?.timedOutRunId, 'run_timeout')
  assert.equal(view?.workerTimeoutMs, 900000)
  assert.deepEqual(view?.artifactLabels, ['Storyboard notes · 爱因斯坦', 'rollback-policy · run_worker'])
  assert.deepEqual(view?.artifactDetails.map((artifact) => ({
    id: artifact.id,
    sourceRunId: artifact.sourceRunId,
    sourceTaskId: artifact.sourceTaskId,
    subagentName: artifact.subagentName,
    policy: artifact.policy,
  })), [
    { id: 'artifact_1', sourceRunId: 'run_worker', sourceTaskId: undefined, subagentName: '爱因斯坦', policy: undefined },
    { id: 'artifact_2', sourceRunId: 'run_worker', sourceTaskId: undefined, subagentName: undefined, policy: undefined },
  ])
  assert.equal(view?.blocker, 'Need storyboard direction')
})

test('buildPlanArtifactSummary aggregates plan artifacts by recency and type', () => {
  const summary = buildPlanArtifactSummary(snapshot({
    tasks: [
      task({
        id: 'task_a',
        title: 'First',
        artifacts: [
          { id: 'artifact_old', type: 'draft', title: 'Older draft', metadata: { subagentName: '爱因斯坦', sourceRunId: 'run_a' }, createdAt: '2026-05-12T00:00:00.000Z' },
        ],
      }),
      task({
        id: 'task_b',
        title: 'Second',
        artifacts: [
          { id: 'artifact_new', type: 'draft', title: 'Newer draft', metadata: { sourceRunId: 'run_b' }, createdAt: '2026-05-12T00:01:00.000Z' },
          { id: 'artifact_policy', type: 'rollback-policy', title: 'Rollback', metadata: { sourceRunId: 'run_b', policy: 'manual_compensation' }, createdAt: '2026-05-12T00:02:00.000Z' },
        ],
      }),
    ],
  }))

  assert.equal(summary.totalCount, 3)
  assert.deepEqual(summary.byType, [
    { type: 'draft', count: 2 },
    { type: 'rollback-policy', count: 1 },
  ])
  assert.deepEqual(summary.artifacts.map((artifact) => artifact.id), ['artifact_policy', 'artifact_new', 'artifact_old'])
  assert.equal(summary.artifacts[0]?.policy, 'manual_compensation')
  assert.equal(summary.artifacts[0]?.taskId, 'task_b')
  assert.equal(summary.artifacts[0]?.taskTitle, 'Second')
})

test('actionableRunForPlan selects a blocked worker when the planner is active', () => {
  const activePlanner = run({ id: 'run_planner', role: 'planner', status: 'completed', planId: 'plan_1' })
  const worker = run({
    id: 'run_worker',
    role: 'worker',
    status: 'requires_action',
    planId: 'plan_1',
    taskId: 'task_named',
    pendingInputRequests: [
      { id: 'input_1', runId: 'run_worker', title: 'Question', question: 'Continue?', inputType: 'text', choices: [], allowCustomAnswer: true, status: 'pending', createdAt: '2026-05-12T00:00:00.000Z', updatedAt: '2026-05-12T00:00:00.000Z' },
    ],
  })
  const planSnapshot = snapshot({
    tasks: [
      task({ id: 'task_named', title: 'Named worker', status: 'blocked', ownerRunId: 'run_worker', metadata: { subagentName: '爱因斯坦' } }),
    ],
    runs: [activePlanner, worker],
  })

  assert.equal(actionableRunForPlan(planSnapshot, activePlanner)?.id, 'run_worker')
  assert.equal(runNeedsUserAction(worker), true)
})

test('actionableRunForPlan prefers the active run when it needs action', () => {
  const activeWorker = run({
    id: 'run_active_worker',
    role: 'worker',
    status: 'requires_action',
    planId: 'plan_1',
    pendingApprovals: [
      { id: 'approval_1', runId: 'run_active_worker', toolName: 'tool_write', reason: 'Write project data', status: 'pending', createdAt: '2026-05-12T00:00:00.000Z', updatedAt: '2026-05-12T00:00:00.000Z' },
    ],
  })
  const otherWorker = run({
    id: 'run_other_worker',
    role: 'worker',
    status: 'requires_action',
    planId: 'plan_1',
    pendingInputRequests: [
      { id: 'input_1', runId: 'run_other_worker', title: 'Question', question: 'Continue?', inputType: 'text', choices: [], allowCustomAnswer: true, status: 'pending', createdAt: '2026-05-12T00:00:00.000Z', updatedAt: '2026-05-12T00:00:00.000Z' },
    ],
  })

  assert.equal(actionableRunForPlan(snapshot({ runs: [otherWorker] }), activeWorker)?.id, 'run_active_worker')
})
