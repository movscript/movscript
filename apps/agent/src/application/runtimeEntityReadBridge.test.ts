import test from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentPlan, AgentRun, AgentTask } from '../state/types.js'
import { createRuntimeEntityReadBridge } from './runtimeEntityReadBridge.js'

test('createRuntimeEntityReadBridge wires run and plan read projections', () => {
  const store = new InMemoryAgentStore()
  const planner = makeRun('run_planner')
  const worker = makeRun('run_worker', { parentRunId: planner.id, planId: 'plan_1', taskId: 'task_1' })
  const plan = makePlan()
  const task = {
    id: 'task_1',
    planId: plan.id,
    title: 'Task',
    status: 'pending',
    progress: 0,
    deps: [],
    artifacts: [],
    createdAt: 'now',
    updatedAt: 'now',
  } as AgentTask
  store.createRun(planner)
  store.createRun(worker)
  store.createPlan(plan)
  store.createTask(task)
  const bridge = createRuntimeEntityReadBridge({ store })

  assert.deepEqual(bridge.listRuns().map((run) => run.id), ['run_planner', 'run_worker'])
  assert.deepEqual(bridge.listRunsByParent(planner.id).map((run) => run.id), ['run_worker'])
  assert.equal(bridge.getRun(worker.id)?.id, worker.id)
  assert.deepEqual(bridge.getChildRuns(planner.id).map((run) => run.id), ['run_worker'])
  assert.deepEqual(bridge.listPlans().map((item) => item.id), ['plan_1'])
  assert.equal(bridge.getPlan(plan.id)?.id, plan.id)
  assert.deepEqual(bridge.getTaskTree(plan.id).map((item) => item.id), ['task_1'])
  assert.deepEqual(bridge.getPlanSnapshot(plan.id).runs.map((run) => run.id), ['run_worker'])
})

function makeRun(id: string, input: Partial<AgentRun> = {}): AgentRun {
  return {
    id,
    threadId: 'thread_1',
    status: 'pending',
    role: 'planner',
    createdAt: 'now',
    updatedAt: 'now',
    steps: [],
    traceEvents: [],
    ...input,
  } as AgentRun
}

function makePlan(): AgentPlan {
  return {
    id: 'plan_1',
    threadId: 'thread_1',
    title: 'Plan',
    status: 'running',
    progress: 0,
    createdAt: 'now',
    updatedAt: 'now',
  }
}
