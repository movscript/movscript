import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentTaskGraph, AgentTaskGraphSnapshot, AgentRun, AgentTask } from '../state/types.js'
import {
  listRuntimeSubagents,
  waitRuntimeSubagent,
} from './runtimeSubagentRead.js'

const now = '2026-01-01T00:00:01.000Z'

test('listRuntimeSubagents resolves the planner taskGraph and returns a subagent snapshot', () => {
  const store = makeStore()

  const result = listRuntimeSubagents({
    store,
    plannerRunId: 'run_planner',
    request: { taskGraphId: 'task_graph_1' },
    now,
    getTaskGraphSnapshot: (taskGraphId) => snapshot(store, taskGraphId),
  })

  assert.equal(result.status, 'ok')
  assert.equal(result.taskGraphId, 'task_graph_1')
  assert.equal(result.plannerRunId, 'run_planner')
  assert.equal((result.snapshot.summary as Record<string, unknown>).taskCount, 1)
})

test('waitRuntimeSubagent resolves named task targets without touching trace state', async () => {
  const store = makeStore()

  const result = await waitRuntimeSubagent({
    store,
    plannerRunId: 'run_planner',
    request: { taskGraphId: 'task_graph_1', subagentName: 'Einstein', timeoutMs: 0 },
    now,
    getTaskGraphSnapshot: (taskGraphId) => snapshot(store, taskGraphId),
  })

  assert.equal(result.status, 'completed')
  assert.equal(result.done, true)
  assert.equal(result.taskGraphId, 'task_graph_1')
  assert.equal(result.target.kind, 'run')
  assert.equal((result.target.run as Record<string, unknown>).id, 'run_worker')
})

test('waitRuntimeSubagent polls until the target is done or the deadline is reached', async () => {
  const store = makeStore({ taskStatus: 'running', runStatus: 'in_progress' })
  let current = 0
  let sleepCalls = 0

  const result = await waitRuntimeSubagent({
    store,
    plannerRunId: 'run_planner',
    request: { taskGraphId: 'task_graph_1', runId: 'run_worker', timeoutMs: 200 },
    now,
    currentTimeMs: () => current,
    sleep: async () => {
      sleepCalls += 1
      current += 100
      if (sleepCalls === 1) {
        store.updateRun(makeRun({
          id: 'run_worker',
          role: 'worker',
          parentRunId: 'run_planner',
          taskGraphId: 'task_graph_1',
          taskId: 'task_1',
          status: 'completed',
        }))
      }
    },
    getTaskGraphSnapshot: (taskGraphId) => snapshot(store, taskGraphId),
  })

  assert.equal(sleepCalls, 1)
  assert.equal(result.status, 'completed')
  assert.equal(result.done, true)
  assert.equal((result.target.run as Record<string, unknown>).id, 'run_worker')
})

function makeStore(input: {
  taskStatus?: AgentTask['status']
  runStatus?: AgentRun['status']
} = {}): InMemoryAgentStore {
  const store = new InMemoryAgentStore()
  store.createTaskGraph(makeTaskGraph())
  store.createTask(makeTask({ status: input.taskStatus ?? 'done' }))
  store.createRun(makeRun({ id: 'run_planner', role: 'planner', taskGraphId: 'task_graph_1' }))
  store.createRun(makeRun({
    id: 'run_worker',
    role: 'worker',
    parentRunId: 'run_planner',
    taskGraphId: 'task_graph_1',
    taskId: 'task_1',
    status: input.runStatus ?? 'completed',
  }))
  return store
}

function snapshot(store: InMemoryAgentStore, taskGraphId: string): AgentTaskGraphSnapshot {
  const taskGraph = store.getTaskGraph(taskGraphId)
  assert.ok(taskGraph)
  return {
    taskGraph,
    tasks: store.listTasks(taskGraphId),
    runs: store.listRuns({ taskGraphId }),
  }
}

function makeTaskGraph(overrides: Partial<AgentTaskGraph> = {}): AgentTaskGraph {
  return {
    id: 'task_graph_1',
    threadId: 'thread_1',
    rootRunId: 'run_planner',
    title: 'TaskGraph',
    status: 'running',
    progress: 0.5,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'task_1',
    taskGraphId: 'task_graph_1',
    deps: [],
    title: 'Task',
    status: 'done',
    progress: 1,
    ownerRunId: 'run_worker',
    artifacts: [],
    metadata: { subagentName: 'Einstein' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
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
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    steps: [],
    ...overrides,
  }
}
