import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertPlannerRunCanUseTaskGraph,
  attachPlannerRunToPlanState,
  findThreadTaskGraph,
  requirePlannerRunState,
  selectReplanPlannerRunId,
  selectPlannerRunPlanId,
} from './planRunBinding.js'
import type { AgentTaskGraph, AgentRun } from './types.js'

test('requirePlannerRunState rejects worker runs', () => {
  assert.throws(() => requirePlannerRunState(makeRun({ role: 'worker' })), /is not a planner run/)
})

test('findThreadTaskGraph returns the taskGraph for the same thread', () => {
  const taskGraph = makeTaskGraph({ id: 'task_graph_2', threadId: 'thread_2' })
  assert.equal(findThreadTaskGraph([makeTaskGraph(), taskGraph], 'thread_2'), taskGraph)
})

test('selectPlannerRunPlanId prefers explicit input then attached run then thread taskGraph', () => {
  const plannerRun = makeRun({ taskGraphId: 'task_graph_attached' })
  const threadTaskGraph = makeTaskGraph({ id: 'task_graph_thread' })

  assert.equal(selectPlannerRunPlanId({ plannerRun, inputPlanId: ' task_graph_input ', threadTaskGraph, source: 'tool' }), 'task_graph_input')
  assert.equal(selectPlannerRunPlanId({ plannerRun, threadTaskGraph, source: 'tool' }), 'task_graph_attached')
  assert.equal(selectPlannerRunPlanId({ plannerRun: makeRun(), threadTaskGraph, source: 'tool' }), 'task_graph_thread')
  assert.throws(() => selectPlannerRunPlanId({ plannerRun: makeRun(), source: 'tool' }), /requires taskGraphId/)
})

test('assertPlannerRunCanUseTaskGraph protects thread and attached taskGraph boundaries', () => {
  assert.doesNotThrow(() => assertPlannerRunCanUseTaskGraph({
    plannerRun: makeRun({ taskGraphId: 'task_graph_1' }),
    taskGraph: makeTaskGraph({ id: 'task_graph_1' }),
    action: 'inspect',
  }))
  assert.throws(() => assertPlannerRunCanUseTaskGraph({
    plannerRun: makeRun({ taskGraphId: 'task_graph_2' }),
    taskGraph: makeTaskGraph({ id: 'task_graph_1' }),
    action: 'inspect',
  }), /cannot inspect taskGraph task_graph_1/)
  assert.throws(() => assertPlannerRunCanUseTaskGraph({
    plannerRun: makeRun({ threadId: 'thread_2' }),
    taskGraph: makeTaskGraph({ threadId: 'thread_1' }),
    action: 'inspect',
  }), /cannot inspect taskGraph task_graph_1/)
})

test('selectReplanPlannerRunId prefers explicit input then planner run then parent then taskGraph root', () => {
  assert.equal(selectReplanPlannerRunId({
    run: makeRun({ id: 'run_current' }),
    taskGraph: makeTaskGraph({ rootRunId: 'run_root' }),
    inputPlannerRunId: ' run_input ',
  }), 'run_input')
  assert.equal(selectReplanPlannerRunId({
    run: makeRun({ id: 'run_current', role: 'planner' }),
    taskGraph: makeTaskGraph({ rootRunId: 'run_root' }),
  }), 'run_current')
  assert.equal(selectReplanPlannerRunId({
    run: makeRun({ role: 'worker', parentRunId: 'run_parent' }),
    taskGraph: makeTaskGraph({ rootRunId: 'run_root' }),
  }), 'run_parent')
  assert.equal(selectReplanPlannerRunId({
    run: makeRun({ role: 'worker' }),
    taskGraph: makeTaskGraph({ rootRunId: 'run_root' }),
  }), 'run_root')
  assert.throws(() => selectReplanPlannerRunId({
    run: makeRun({ role: 'worker' }),
    taskGraph: makeTaskGraph(),
  }), /has no plannerRunId/)
})

test('attachPlannerRunToPlanState updates run and repairs missing or stale taskGraph root', () => {
  const run = makeRun()
  const taskGraph = makeTaskGraph()
  const result = attachPlannerRunToPlanState({
    run,
    taskGraph,
    source: 'tool',
    now: '2026-01-01T00:00:01.000Z',
  })

  assert.equal(result.planUpdated, true)
  assert.equal(run.taskGraphId, taskGraph.id)
  assert.equal(run.progress, 0)
  assert.equal(run.metadata?.attachedPlanByTool, 'tool')
  assert.equal(taskGraph.rootRunId, run.id)
})

test('attachPlannerRunToPlanState keeps a valid existing root run', () => {
  const rootRun = makeRun({ id: 'run_root' })
  const run = makeRun({ id: 'run_child' })
  const taskGraph = makeTaskGraph({ rootRunId: rootRun.id })
  const result = attachPlannerRunToPlanState({
    run,
    taskGraph,
    rootRun,
    source: 'tool',
    now: '2026-01-01T00:00:01.000Z',
  })

  assert.equal(result.planUpdated, false)
  assert.equal(taskGraph.rootRunId, rootRun.id)
})

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    role: 'planner',
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

function makeTaskGraph(overrides: Partial<AgentTaskGraph> = {}): AgentTaskGraph {
  return {
    id: 'task_graph_1',
    threadId: 'thread_1',
    title: 'TaskGraph',
    status: 'pending',
    progress: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}
