import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentDebugContextPanel, AgentPlan, AgentRun, AgentTask } from '../state/types.js'
import { attachRuntimePlanDebugContext } from './runtimePlanContext.js'

test('attachRuntimePlanDebugContext adds plan state from the runtime store', () => {
  const store = new InMemoryAgentStore()
  const plan = makePlan()
  const planner = makeRun({ id: 'run_planner', role: 'planner', planId: plan.id })
  const task = makeTask({ id: 'task_1', metadata: { subagentName: 'Writer' }, ownerRunId: 'run_worker' })
  const worker = makeRun({ id: 'run_worker', role: 'worker', planId: plan.id, parentRunId: planner.id, taskId: task.id })
  store.createPlan(plan)
  store.createTask(task)
  store.createRun(planner)
  store.createRun(worker)

  const result = attachRuntimePlanDebugContext({ store, context: debugContext(), run: planner })

  assert.equal(result.agentPlan?.id, plan.id)
  assert.equal(result.agentPlan?.tasks[0]?.subagentName, 'Writer')
  assert.equal(result.agentPlan?.workers[0]?.id, worker.id)
})

test('attachRuntimePlanDebugContext leaves context unchanged without plan state', () => {
  const store = new InMemoryAgentStore()
  const context = debugContext()

  assert.equal(attachRuntimePlanDebugContext({
    store,
    context,
    run: makeRun({ planId: undefined }),
  }), context)

  assert.equal(attachRuntimePlanDebugContext({
    store,
    context,
    run: makeRun({ planId: 'missing_plan' }),
  }), context)
})

function debugContext(): AgentDebugContextPanel {
  return {
    route: { pathname: '/' },
    projects: [],
    selection: null,
    recentResources: [],
    attachments: [],
    memories: [],
    labels: [],
  }
}

function makePlan(overrides: Partial<AgentPlan> = {}): AgentPlan {
  return {
    id: 'plan_1',
    threadId: 'thread_1',
    title: 'Plan',
    status: 'running',
    progress: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'task_1',
    planId: 'plan_1',
    deps: [],
    title: 'Task',
    status: 'running',
    progress: 0.5,
    artifacts: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'in_progress',
    role: 'planner',
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    steps: [],
    ...overrides,
  }
}
