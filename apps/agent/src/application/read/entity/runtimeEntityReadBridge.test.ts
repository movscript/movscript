import test from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryAgentStore } from '../../../state/store/core/store.js'
import type { AgentTaskGraph, AgentRun, AgentTask } from '../../../state/shared/types.js'
import { createRuntimeEntityReadBridge } from './runtimeEntityReadBridge.js'

test('createRuntimeEntityReadBridge wires run and taskGraph read projections', () => {
  const store = new InMemoryAgentStore()
  const planner = makeRun('run_planner')
  const worker = makeRun('run_worker', { parentRunId: planner.id, taskGraphId: 'task_graph_1', taskId: 'task_1' })
  const taskGraph = makeTaskGraph()
  const task = {
    id: 'task_1',
    taskGraphId: taskGraph.id,
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
  store.createTaskGraph(taskGraph)
  store.createTask(task)
  const bridge = createRuntimeEntityReadBridge({ store })

  assert.deepEqual(bridge.listRuns().map((run) => run.id), ['run_planner', 'run_worker'])
  assert.deepEqual(bridge.listRunsByParent(planner.id).map((run) => run.id), ['run_worker'])
  assert.equal(bridge.getRun(worker.id)?.id, worker.id)
  assert.deepEqual(bridge.getChildRuns(planner.id).map((run) => run.id), ['run_worker'])
  assert.deepEqual(bridge.listTaskGraphs().map((item) => item.id), ['task_graph_1'])
  assert.equal(bridge.getTaskGraph(taskGraph.id)?.id, taskGraph.id)
  assert.deepEqual(bridge.getTaskTree(taskGraph.id).map((item) => item.id), ['task_1'])
  assert.deepEqual(bridge.getTaskGraphSnapshot(taskGraph.id).runs.map((run) => run.id), ['run_worker'])
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

function makeTaskGraph(): AgentTaskGraph {
  return {
    id: 'task_graph_1',
    threadId: 'thread_1',
    title: 'TaskGraph',
    status: 'running',
    progress: 0,
    createdAt: 'now',
    updatedAt: 'now',
  }
}
