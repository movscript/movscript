import assert from 'node:assert/strict'
import test from 'node:test'
import { actionableRunForPlan, activeWorkerRunCount, buildPlanArtifactSummary, buildPlanNameConflictViews, buildPlanOverviewStats, buildPlanStatusExplanation, buildPlanTaskViews, buildTaskArtifactViews, plannerRunIdForPlanAction, runNeedsUserAction, shouldPollPlanSnapshot } from './agentPlanUi'
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

function snapshot(input: { plan?: Partial<AgentPlanSnapshot['plan']>; tasks?: AgentPlanSnapshot['tasks']; runs?: AgentPlanSnapshot['runs']; nameConflicts?: AgentPlanSnapshot['nameConflicts']; summary?: AgentPlanSnapshot['summary'] } = {}): AgentPlanSnapshot {
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
    nameConflicts: input.nameConflicts,
    summary: input.summary,
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

test('activeWorkerRunCount ignores active planner runs', () => {
  assert.equal(activeWorkerRunCount(snapshot({
    runs: [
      run({ id: 'run_planner', role: 'planner', status: 'in_progress', planId: 'plan_1' }),
      run({ id: 'run_worker', role: 'worker', status: 'requires_action', planId: 'plan_1' }),
      run({ id: 'run_done_worker', role: 'worker', status: 'completed', planId: 'plan_1' }),
    ],
  })), 1)
})

test('buildPlanNameConflictViews exposes duplicate subagent names', () => {
  const planSnapshot = snapshot({
    nameConflicts: [{ subagentName: 'Einstein', taskIds: ['task_a', 'task_b'] }],
    tasks: [
      task({ id: 'task_a', title: 'Research', status: 'running', ownerRunId: 'run_a' }),
      task({ id: 'task_b', title: 'Draft', status: 'blocked' }),
    ],
    runs: [
      run({ id: 'run_a', role: 'worker', status: 'in_progress', taskId: 'task_a', planId: 'plan_1' }),
    ],
  })

  assert.deepEqual(buildPlanNameConflictViews(planSnapshot), [{
    subagentName: 'Einstein',
    taskIds: ['task_a', 'task_b'],
    taskTitles: ['Research', 'Draft'],
    entries: [
      { taskId: 'task_a', taskTitle: 'Research', taskStatus: 'running', ownerRunId: 'run_a', ownerRunStatus: 'in_progress' },
      { taskId: 'task_b', taskTitle: 'Draft', taskStatus: 'blocked', ownerRunId: undefined, ownerRunStatus: undefined },
    ],
    label: 'Einstein: Research, Draft',
  }])
  assert.equal(buildPlanStatusExplanation(planSnapshot), '1 个子代理重名 · 1 个执行器运行中 · 1 个被阻塞')
})

test('buildPlanTaskViews merges subagent names, blockers, actions, and artifacts', () => {
  const planSnapshot = snapshot({
    tasks: [
      task({
        id: 'task_source',
        title: 'Source task',
        status: 'done',
      }),
      task({
        id: 'task_named',
        title: 'Named worker',
        status: 'blocked',
        ownerRunId: 'run_worker',
        blockedReason: 'Need storyboard direction',
        metadata: { subagentName: 'Einstein', retryAttempt: 2, maxTaskAttempts: 3, previousOwnerRunId: 'run_previous', previousStatus: 'failed', timedOutRunId: 'run_timeout', workerTimeoutMs: 900000 },
        artifacts: [
          { id: 'artifact_1', type: 'draft', title: 'Storyboard notes', metadata: { subagentName: 'Einstein', sourceRunId: 'run_worker', sourceTaskId: 'task_source' }, createdAt: '2026-05-12T00:00:00.000Z' },
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

  const view = buildPlanTaskViews(planSnapshot).find((item) => item.task.id === 'task_named')

  assert.equal(view?.subagentName, 'Einstein')
  assert.equal(view?.ownerLabel, 'Einstein')
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
  assert.equal(view?.maxTaskAttempts, 3)
  assert.equal(view?.previousOwnerRunId, 'run_previous')
  assert.equal(view?.previousStatus, 'failed')
  assert.equal(view?.timedOutRunId, 'run_timeout')
  assert.equal(view?.workerTimeoutMs, 900000)
  assert.equal(view?.statusExplanation, '等待 1 个用户输入。')
  assert.deepEqual(view?.artifactLabels, ['Storyboard notes · Einstein', 'rollback-policy · run_worker'])
  assert.deepEqual(view?.artifactDetails.map((artifact) => ({
    id: artifact.id,
    sourceRunId: artifact.sourceRunId,
    sourceTaskId: artifact.sourceTaskId,
    sourceTaskTitle: artifact.sourceTaskTitle,
    subagentName: artifact.subagentName,
    policy: artifact.policy,
  })), [
    { id: 'artifact_1', sourceRunId: 'run_worker', sourceTaskId: 'task_source', sourceTaskTitle: 'Source task', subagentName: 'Einstein', policy: undefined },
    { id: 'artifact_2', sourceRunId: 'run_worker', sourceTaskId: undefined, sourceTaskTitle: undefined, subagentName: undefined, policy: undefined },
  ])
  assert.equal(view?.blocker, 'Need storyboard direction')
})

test('buildPlanTaskViews falls back to worker subagent name when task metadata is missing it', () => {
  const planSnapshot = snapshot({
    tasks: [
      task({
        id: 'task_run_named',
        title: 'Run named worker',
        status: 'running',
        ownerRunId: 'run_named_worker',
      }),
    ],
    runs: [
      run({
        id: 'run_named_worker',
        role: 'worker',
        status: 'in_progress',
        planId: 'plan_1',
        taskId: 'task_run_named',
        metadata: { subagentName: 'Hawking' },
      }),
    ],
  })

  const view = buildPlanTaskViews(planSnapshot)[0]

  assert.equal(view?.subagentName, 'Hawking')
  assert.equal(view?.ownerLabel, 'Hawking')
  assert.equal(view?.worker?.subagentName, 'Hawking')
})

test('buildPlanStatusExplanation summarizes plan health from task and run state', () => {
  const explanation = buildPlanStatusExplanation(snapshot({
    tasks: [
      task({ id: 'task_pending', title: 'Pending', status: 'pending' }),
      task({ id: 'task_blocked', title: 'Blocked', status: 'blocked' }),
      task({ id: 'task_review', title: 'Review', status: 'needs_review' }),
      task({ id: 'task_failed', title: 'Failed', status: 'failed' }),
      task({ id: 'task_done', title: 'Done', status: 'done' }),
    ],
    runs: [
      run({ id: 'run_planner', role: 'planner', status: 'in_progress', planId: 'plan_1' }),
      run({ id: 'run_active', role: 'worker', status: 'in_progress', planId: 'plan_1' }),
    ],
  }))

  assert.equal(explanation, '1 个执行器运行中 · 1 个被阻塞 · 1 个待复核 · 1 个失败 · 1 个待开始')
  assert.equal(buildPlanStatusExplanation(snapshot({
    tasks: [task({ id: 'task_done', title: 'Done', status: 'done' })],
    plan: { status: 'done' },
  })), '所有任务已完成。')
  assert.equal(buildPlanStatusExplanation(snapshot({ tasks: [] })), '还没有计划任务。')
})

test('buildPlanStatusExplanation prefers backend summary when available', () => {
  const explanation = buildPlanStatusExplanation(snapshot({
    tasks: [task({ id: 'task_done', title: 'Done', status: 'done' })],
    summary: {
      taskCount: 3,
      taskStatusCounts: { pending: 2, running: 0, blocked: 1, needs_review: 0, done: 0, failed: 0, cancelled: 0 },
      workerCount: 4,
      activeWorkerCount: 2,
      artifactCount: 5,
      nameConflictCount: 1,
      blockedTaskIds: ['task_blocked'],
      needsReviewTaskIds: [],
      failedTaskIds: [],
    },
  }))

  assert.equal(explanation, '1 个子代理重名 · 2 个执行器运行中 · 1 个被阻塞 · 2 个待开始')
})

test('buildPlanOverviewStats prefers backend summary and falls back locally', () => {
  const withSummary = snapshot({
    tasks: [task({ id: 'task_done', title: 'Done', status: 'done' })],
    runs: [run({ id: 'run_worker', role: 'worker', status: 'in_progress', planId: 'plan_1' })],
    nameConflicts: [{ subagentName: 'Einstein', taskIds: ['task_a', 'task_b'] }],
    summary: {
      taskCount: 4,
      taskStatusCounts: { pending: 1, running: 1, blocked: 0, needs_review: 0, done: 2, failed: 0, cancelled: 0 },
      workerCount: 3,
      activeWorkerCount: 2,
      artifactCount: 7,
      nameConflictCount: 5,
      blockedTaskIds: [],
      needsReviewTaskIds: [],
      failedTaskIds: [],
    },
  })
  assert.deepEqual(buildPlanOverviewStats(withSummary), {
    taskCount: 4,
    completedTaskCount: 2,
    activeWorkerCount: 2,
    artifactCount: 7,
    nameConflictCount: 5,
  })

  const withoutSummary = snapshot({
    tasks: [
      task({ id: 'task_done', title: 'Done', status: 'done', artifacts: [{ id: 'artifact_1', type: 'draft', title: 'Draft', createdAt: '2026-05-12T00:00:00.000Z' }] }),
      task({ id: 'task_pending', title: 'Pending', status: 'pending' }),
    ],
    runs: [
      run({ id: 'run_worker', role: 'worker', status: 'requires_action', planId: 'plan_1' }),
      run({ id: 'run_planner', role: 'planner', status: 'in_progress', planId: 'plan_1' }),
    ],
    nameConflicts: [{ subagentName: 'Hawking', taskIds: ['task_done', 'task_pending'] }],
  })
  assert.deepEqual(buildPlanOverviewStats(withoutSummary), {
    taskCount: 2,
    completedTaskCount: 1,
    activeWorkerCount: 1,
    artifactCount: 1,
    nameConflictCount: 1,
  })
})

test('buildPlanTaskViews explains task statuses for planner review and runnable work', () => {
  const views = buildPlanTaskViews(snapshot({
    tasks: [
      task({ id: 'task_review', title: 'Review', status: 'needs_review' }),
      task({ id: 'task_ready', title: 'Ready', status: 'pending' }),
      task({ id: 'task_done', title: 'Done', status: 'done' }),
    ],
  }))

  assert.deepEqual(views.map((view) => [view.task.id, view.statusExplanation]), [
    ['task_review', '等待规划器或用户复核。'],
    ['task_ready', '依赖满足且执行器有容量后即可开始。'],
    ['task_done', '任务已完成。'],
  ])
})

test('buildPlanTaskViews localizes active worker task explanations', () => {
  const views = buildPlanTaskViews(snapshot({
    tasks: [
      task({ id: 'task_running', title: 'Running', status: 'running', ownerRunId: 'run_worker' }),
      task({ id: 'task_blocked', title: 'Blocked', status: 'blocked' }),
      task({ id: 'task_failed', title: 'Failed', status: 'failed' }),
      task({ id: 'task_cancelled', title: 'Cancelled', status: 'cancelled' }),
    ],
    runs: [
      run({ id: 'run_worker', role: 'worker', status: 'in_progress', taskId: 'task_running', planId: 'plan_1' }),
    ],
  }))

  assert.deepEqual(views.map((view) => [view.task.id, view.statusExplanation]), [
    ['task_running', '执行器状态：运行中。'],
    ['task_blocked', '等待规划器解决下一步。'],
    ['task_failed', '执行器任务失败。'],
    ['task_cancelled', '执行器任务已取消。'],
  ])
})

test('buildPlanArtifactSummary aggregates plan artifacts by recency and type', () => {
  const summary = buildPlanArtifactSummary(snapshot({
    tasks: [
      task({
        id: 'task_a',
        title: 'First',
        status: 'done',
        ownerRunId: 'run_source',
        artifacts: [
          { id: 'artifact_old', type: 'draft', title: 'Older draft', metadata: { subagentName: 'Einstein', sourceRunId: 'run_a' }, createdAt: '2026-05-12T00:00:00.000Z' },
        ],
      }),
      task({
        id: 'task_b',
        title: 'Second',
        artifacts: [
          { id: 'artifact_new', type: 'draft', title: 'Newer draft', metadata: { sourceRunId: 'run_b' }, createdAt: '2026-05-12T00:01:00.000Z' },
          { id: 'artifact_policy', type: 'rollback-policy', title: 'Rollback', metadata: { sourceRunId: 'run_b', policy: 'manual_compensation' }, createdAt: '2026-05-12T00:02:00.000Z' },
          { id: 'artifact_cross_task', type: 'review', title: 'Cross task review', metadata: { sourceTaskId: 'task_a', sourceRunId: 'run_a' }, createdAt: '2026-05-12T00:03:00.000Z' },
        ],
      }),
    ],
  }))

  assert.equal(summary.totalCount, 4)
  assert.deepEqual(summary.byType, [
    { type: 'draft', count: 2 },
    { type: 'review', count: 1 },
    { type: 'rollback-policy', count: 1 },
  ])
  assert.deepEqual(summary.artifacts.map((artifact) => artifact.id), ['artifact_cross_task', 'artifact_policy', 'artifact_new', 'artifact_old'])
  assert.equal(summary.artifacts[0]?.sourceTaskTitle, 'First')
  assert.equal(summary.artifacts[0]?.sourceTaskStatus, 'done')
  assert.equal(summary.artifacts[0]?.sourceTaskOwnerRunId, 'run_source')
  assert.equal(summary.artifacts[1]?.policy, 'manual_compensation')
  assert.equal(summary.artifacts[1]?.taskId, 'task_b')
  assert.equal(summary.artifacts[1]?.taskTitle, 'Second')
})

test('buildTaskArtifactViews sorts task artifacts and preserves provenance', () => {
  const artifactTask = task({
    id: 'task_artifacts',
    title: 'Artifact task',
    artifacts: [
      { id: 'artifact_old', type: 'draft', title: 'Old draft', metadata: { sourceRunId: 'run_old' }, createdAt: '2026-05-12T00:00:00.000Z' },
      { id: 'artifact_new', type: 'review', title: 'New review', uri: 'agent://artifact/new', metadata: { sourceRunId: 'run_new', sourceTaskId: 'task_source', toolName: 'tool_review', subagentName: 'Hawking' }, createdAt: '2026-05-12T00:00:02.000Z' },
    ],
  })
  const views = buildTaskArtifactViews(artifactTask, 1, snapshot({
    tasks: [
      artifactTask,
      task({ id: 'task_source', title: 'Source task', status: 'running', ownerRunId: 'run_source' }),
    ],
  }))

  assert.deepEqual(views.map((artifact) => ({
    id: artifact.id,
    label: artifact.label,
    taskId: artifact.taskId,
    taskTitle: artifact.taskTitle,
    uri: artifact.uri,
    sourceRunId: artifact.sourceRunId,
    sourceTaskId: artifact.sourceTaskId,
    sourceTaskTitle: artifact.sourceTaskTitle,
    sourceTaskStatus: artifact.sourceTaskStatus,
    sourceTaskOwnerRunId: artifact.sourceTaskOwnerRunId,
    subagentName: artifact.subagentName,
    toolName: artifact.toolName,
  })), [
    {
      id: 'artifact_new',
      label: 'New review · Hawking',
      taskId: 'task_artifacts',
      taskTitle: 'Artifact task',
      uri: 'agent://artifact/new',
      sourceRunId: 'run_new',
      sourceTaskId: 'task_source',
      sourceTaskTitle: 'Source task',
      sourceTaskStatus: 'running',
      sourceTaskOwnerRunId: 'run_source',
      subagentName: 'Hawking',
      toolName: 'tool_review',
    },
  ])
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
      task({ id: 'task_named', title: 'Named worker', status: 'blocked', ownerRunId: 'run_worker', metadata: { subagentName: 'Einstein' } }),
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
