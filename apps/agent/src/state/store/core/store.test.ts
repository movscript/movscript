import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../../../catalog/manifest/agentManifest.js'
import type { RuntimeWork } from '../../../runtime-work/core/runtimeWork.js'
import { InMemoryAgentStore } from './store.js'
import type { AgentRun, AgentTraceEvent, AgentThread, RuntimeContinuation, RuntimeInteraction } from '../../shared/types.js'

test('listRunTraceEvents paginates stably and returns an empty page for stale cursors', () => {
  const store = new InMemoryAgentStore()
  const run = buildRun()
  store.createRun(run)
  store.appendTraceEvent(buildTraceEvent('trace_2', '2026-05-06T00:00:02.000Z', 'tool_call'))
  store.appendTraceEvent(buildTraceEvent('trace_1', '2026-05-06T00:00:01.000Z', 'context'))
  store.appendTraceEvent(buildTraceEvent('trace_3', '2026-05-06T00:00:03.000Z', 'tool_call'))

  assert.deepEqual(store.listRunTraceEvents(run.id, { limit: 2 }).map((event) => event.id), ['trace_1', 'trace_2'])
  assert.deepEqual(store.listRunTraceEvents(run.id, { cursor: 'trace_2', limit: 2 }).map((event) => event.id), ['trace_3'])
  assert.deepEqual(store.listRunTraceEvents(run.id, { cursor: 'missing_trace', limit: 2 }), [])
  assert.deepEqual(store.listRunTraceEvents(run.id, { kind: 'tool_call' }).map((event) => event.id), ['trace_2', 'trace_3'])
  assert.equal(store.countRunTraceEvents(run.id), 3)
  assert.equal(store.countRunTraceEvents(run.id, { kind: 'tool_call' }), 2)

  const summary = store.summarizeRunTraceEvents(run.id)
  assert.equal(summary.total, 3)
  assert.equal(summary.byKind.context, 1)
  assert.equal(summary.byKind.tool_call, 2)
  assert.equal(summary.latestEvent?.id, 'trace_3')
})

test('summarizeRunTraceEvents treats same-timestamp later appends as latest', () => {
  const store = new InMemoryAgentStore()
  const run = buildRun()
  store.createRun(run)
  store.appendTraceEvent(buildTraceEvent('trace_1', '2026-05-06T00:00:01.000Z', 'context'))
  store.appendTraceEvent(buildTraceEvent('trace_2', '2026-05-06T00:00:01.000Z', 'tool_call'))

  const page = store.listRunTraceEvents(run.id)
  const summary = store.summarizeRunTraceEvents(run.id)

  assert.deepEqual(page.map((event) => event.id), ['trace_1', 'trace_2'])
  assert.equal(summary.latestEvent?.id, 'trace_2')
})

test('trace storage normalizes invalid persisted event durations', () => {
  const store = new InMemoryAgentStore()
  const run = {
    ...buildRun(),
    traceEvents: [
      buildTraceEvent('trace_1', '2026-05-06T00:00:01.000Z', 'context', -1),
      buildTraceEvent('trace_2', '2026-05-06T00:00:02.000Z', 'tool_call', 0),
    ],
  }
  store.createRun(run)
  store.appendTraceEvent(buildTraceEvent('trace_3', '2026-05-06T00:00:03.000Z', 'tool_call', Number.NaN))

  const events = store.listRunTraceEvents(run.id)

  assert.equal(events[0].durationMs, undefined)
  assert.equal(events[1].durationMs, 0)
  assert.equal(events[2].durationMs, undefined)
})

test('trace storage drops invalid JSON data instead of coercing non-finite numbers to null', () => {
  const store = new InMemoryAgentStore()
  const run = buildRun()
  store.createRun(run)
  store.appendTraceEvent({
    ...buildTraceEvent('trace_1', '2026-05-06T00:00:01.000Z', 'context'),
    data: { score: Number.POSITIVE_INFINITY } as never,
  })

  const event = store.listRunTraceEvents(run.id)[0]

  assert.equal(event.data, undefined)
})

test('trace storage maintains a bounded debug ledger projection per run', () => {
  const store = new InMemoryAgentStore()
  const run = buildRun()
  store.createRun(run)
  store.appendTraceEvent({
    ...buildTraceEvent('trace_1', '2026-05-06T00:00:01.000Z', 'prompt'),
    data: {
      eventType: 'prompt.composed',
      charCount: 900,
      messageCount: 3,
      skillIds: ['core.runtime'],
      availableToolNames: ['movscript_read_project'],
    },
  })
  store.appendTraceEvent({
    ...buildTraceEvent('trace_2', '2026-05-06T00:00:02.000Z', 'model_call'),
    data: {
      phase: 'request',
      request: { body: { model: 'gpt-test', messages: [{ role: 'user', content: 'hello' }] } },
    },
  })

  const ledger = store.getRunDebugLedger(run.id)

  assert.equal(ledger?.schema, 'movscript.agent.run-debug-ledger.v1')
  assert.equal(ledger?.context.promptChars, 900)
  assert.deepEqual(ledger?.context.activeSkillIds, ['core.runtime'])
  assert.equal(ledger?.modelCalls[0]?.model, 'gpt-test')
  assert.ok((ledger?.budget.estimatedChars ?? Number.POSITIVE_INFINITY) <= 32_000)
})

test('runtime wake event storage prunes inactive history while preserving active events', () => {
  const store = new InMemoryAgentStore()
  for (let index = 1; index <= 505; index += 1) {
    const minute = String(index).padStart(3, '0')
    store.createRuntimeWakeEvent({
      id: `wake_consumed_${index}`,
      threadId: 'thread_1',
      kind: 'thread.opened',
      status: 'consumed',
      payload: { consumed: true },
      dedupeKey: `thread.opened:thread_1:${index}`,
      createdAt: `2026-05-21T00:${minute}:00.000Z`,
      updatedAt: `2026-05-21T00:${minute}:00.000Z`,
      consumedAt: `2026-05-21T00:${minute}:00.000Z`,
    })
  }
  store.createRuntimeWakeEvent({
    id: 'wake_queued',
    threadId: 'thread_1',
    kind: 'thread.opened',
    status: 'queued',
    payload: { threadId: 'thread_1' },
    dedupeKey: 'thread.opened:thread_1',
    createdAt: '2026-05-21T00:000:00.000Z',
    updatedAt: '2026-05-21T00:000:00.000Z',
  })

  const events = store.listRuntimeWakeEvents()

  assert.equal(events.length, 500)
  assert.ok(events.some((event) => event.id === 'wake_queued'))
  assert.equal(store.getRuntimeWakeEvent('wake_consumed_1'), undefined)
  assert.equal(store.getRuntimeWakeEvent('wake_consumed_505')?.status, 'consumed')
})

test('deleteThread physically removes thread-owned state and trace projections', () => {
  const store = new InMemoryAgentStore()
  store.createThread(buildThread('thread_1'))
  store.createThread(buildThread('thread_2'))
  store.createRun(buildRun())
  store.createRun({ ...buildRun(), id: 'run_2', threadId: 'thread_2' })
  store.createTaskGraph({
    id: 'task_graph_1',
    threadId: 'thread_1',
    title: 'Plan',
    status: 'running',
    progress: 0,
    createdAt: '2026-05-06T00:00:00.000Z',
    updatedAt: '2026-05-06T00:00:00.000Z',
  })
  store.createTask({
    id: 'task_1',
    taskGraphId: 'task_graph_1',
    deps: [],
    title: 'Task',
    status: 'running',
    progress: 0,
    artifacts: [],
    createdAt: '2026-05-06T00:00:00.000Z',
    updatedAt: '2026-05-06T00:00:00.000Z',
  })
  store.createRuntimeWork(buildRuntimeWork())
  store.createRuntimeInteraction(buildRuntimeInteraction())
  store.createRuntimeContinuation(buildRuntimeContinuation())
  store.appendTraceEvent(buildTraceEvent('trace_1', '2026-05-06T00:00:01.000Z', 'context'))

  const deletion = store.deleteThread('thread_1')

  assert.equal(deletion.deleted, true)
  assert.deepEqual(deletion.deletedRunIds, ['run_1'])
  assert.deepEqual(deletion.deletedTaskGraphIds, ['task_graph_1'])
  assert.deepEqual(deletion.deletedTaskIds, ['task_1'])
  assert.deepEqual(deletion.deletedRuntimeWorkIds, ['work_1'])
  assert.deepEqual(deletion.deletedRuntimeInteractionIds, ['interaction_1'])
  assert.deepEqual(deletion.deletedRuntimeContinuationIds, ['continuation_1'])
  assert.equal(store.getThread('thread_1'), undefined)
  assert.equal(store.getRun('run_1'), undefined)
  assert.equal(store.getTaskGraph('task_graph_1'), undefined)
  assert.equal(store.getTask('task_1'), undefined)
  assert.equal(store.getRuntimeWork('work_1'), undefined)
  assert.equal(store.getRuntimeInteraction('interaction_1'), undefined)
  assert.equal(store.getRuntimeContinuation('continuation_1'), undefined)
  assert.deepEqual(store.listRunTraceEvents('run_1'), [])
  assert.equal(store.getRunDebugLedger('run_1'), undefined)
  assert.equal(store.getThread('thread_2')?.id, 'thread_2')
  assert.equal(store.getRun('run_2')?.id, 'run_2')
})

test('deleteAllThreads clears all persisted session history records', () => {
  const store = new InMemoryAgentStore()
  store.createThread(buildThread('thread_1'))
  store.createThread(buildThread('thread_2'))
  store.createRun(buildRun())
  store.createRun({ ...buildRun(), id: 'run_2', threadId: 'thread_2' })
  store.createRun({ ...buildRun(), id: 'run_orphan', threadId: 'thread_orphan' })
  store.appendTraceEvent(buildTraceEvent('trace_1', '2026-05-06T00:00:01.000Z', 'context'))
  store.appendTraceEvent({ ...buildTraceEvent('trace_2', '2026-05-06T00:00:02.000Z', 'tool_call'), runId: 'run_2' })

  const deletion = store.deleteAllThreads()

  assert.equal(deletion.deleted, true)
  assert.deepEqual(deletion.deletedThreadIds, ['thread_1', 'thread_2'])
  assert.deepEqual(deletion.deletedRunIds, ['run_1', 'run_2', 'run_orphan'])
  assert.deepEqual(store.listThreads(), [])
  assert.deepEqual(store.listRuns(), [])
  assert.deepEqual(store.listRunTraceEvents('run_1'), [])
  assert.deepEqual(store.listRunTraceEvents('run_2'), [])
})

function buildThread(id: string): AgentThread {
  return {
    id,
    createdAt: '2026-05-06T00:00:00.000Z',
    updatedAt: '2026-05-06T00:00:00.000Z',
    messages: [],
  }
}

function buildRun(): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    role: 'worker',
    status: 'in_progress',
    agentManifest: DEFAULT_AGENT_MANIFEST,
    runtimeLimits: { approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 20,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-05-06T00:00:00.000Z',
    updatedAt: '2026-05-06T00:00:00.000Z',
    steps: [],
    traceEvents: [],
  }
}

function buildTraceEvent(id: string, createdAt: string, kind: AgentTraceEvent['kind'], durationMs?: number): AgentTraceEvent {
  return {
    id,
    runId: 'run_1',
    kind,
    title: id,
    status: 'completed',
    createdAt,
    ...(durationMs !== undefined ? { durationMs } : {}),
  }
}

function buildRuntimeWork(): RuntimeWork {
  return {
    id: 'work_1',
    threadId: 'thread_1',
    runId: 'run_1',
    kind: 'generation_job',
    mode: 'async',
    status: 'running',
    request: {},
    createdAt: '2026-05-06T00:00:00.000Z',
    updatedAt: '2026-05-06T00:00:00.000Z',
  }
}

function buildRuntimeInteraction(): RuntimeInteraction {
  return {
    id: 'interaction_1',
    threadId: 'thread_1',
    runId: 'run_1',
    kind: 'input',
    status: 'pending',
    payload: {},
    createdAt: '2026-05-06T00:00:00.000Z',
    updatedAt: '2026-05-06T00:00:00.000Z',
  }
}

function buildRuntimeContinuation(): RuntimeContinuation {
  return {
    id: 'continuation_1',
    threadId: 'thread_1',
    runId: 'run_1',
    status: 'waiting',
    trigger: { type: 'manual' },
    createdAt: '2026-05-06T00:00:00.000Z',
    updatedAt: '2026-05-06T00:00:00.000Z',
  }
}
