import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentRun, AgentRunStep } from '../state/types.js'
import type { AgentGraphTraceInput } from '../orchestration/agentGraph.js'
import type { GenerationEvent } from '../generation/generationEvents.js'
import {
  createRuntimeAgentGraphCallbacks,
  type RuntimeAgentGraphTraceInput,
} from './runtimeAgentGraphCallbacks.js'

const now = '2026-01-01T00:00:01.000Z'

test('createRuntimeAgentGraphCallbacks persists non-volatile graph traces and updates the run', () => {
  const store = new InMemoryAgentStore()
  const run = makeRun()
  store.createRun(run)
  const traces: RuntimeAgentGraphTraceInput[] = []
  const volatile: AgentGraphTraceInput[] = []

  const callbacks = createRuntimeAgentGraphCallbacks({
    store,
    run,
    now: () => now,
    recordTrace: (_run, trace) => traces.push(trace),
    emitVolatileTrace: (_run, trace) => volatile.push(trace),
    createStep: () => {
      throw new Error('step should not be created for trace callback')
    },
    emitRunSnapshot: () => {},
  })

  callbacks.onTrace({
    kind: 'model_call',
    title: 'Model called',
    summary: 'summary',
    status: 'completed',
    roundIndex: 2,
    roundLabel: 'Model',
    roundSource: 'model',
    stepId: 'step_1',
    toolName: 'tool_a',
    data: { ok: true },
    durationMs: 25,
  })
  callbacks.onTrace({
    kind: 'tool_call',
    title: 'Live delta',
    status: 'info',
    roundIndex: 2,
    roundLabel: 'Model',
    roundSource: 'model',
    volatile: true,
    volatileKey: 'tool_a',
  })

  assert.equal(traces.length, 1)
  assert.equal(traces[0]?.round?.roundId, 'round_2')
  assert.equal(traces[0]?.toolName, 'tool_a')
  assert.deepEqual(traces[0]?.data, { ok: true })
  assert.equal(volatile.length, 1)
  assert.equal(volatile[0]?.volatileKey, 'tool_a')
})

test('createRuntimeAgentGraphCallbacks converts generation events to tool traces', () => {
  const store = new InMemoryAgentStore()
  const run = makeRun()
  store.createRun(run)
  const traces: RuntimeAgentGraphTraceInput[] = []
  const callbacks = createRuntimeAgentGraphCallbacks({
    store,
    run,
    now: () => now,
    recordTrace: (_run, trace) => traces.push(trace),
    emitVolatileTrace: () => {},
    createStep: () => {
      throw new Error('step should not be created for generation callback')
    },
    emitRunSnapshot: () => {},
  })

  callbacks.onGenerationEvent?.(generationEvent(), {
    roundIndex: 3,
    roundLabel: 'Tool',
    roundSource: 'model',
    stepId: 'step_1',
    toolName: 'movscript_create_generation_job',
    durationMs: 10,
    volatile: false,
  })

  assert.equal(traces[0]?.kind, 'tool_call')
  assert.equal(traces[0]?.title, 'Generation completed: Job #321')
  assert.equal(traces[0]?.status, 'completed')
  assert.equal(traces[0]?.round?.roundId, 'round_3')
  assert.equal((traces[0]?.data as any)?.generation.jobId, 321)
})

test('createRuntimeAgentGraphCallbacks creates and completes graph steps', () => {
  const store = new InMemoryAgentStore()
  const run = makeRun()
  store.createRun(run)
  const snapshots: string[] = []
  let stepCount = 0
  const callbacks = createRuntimeAgentGraphCallbacks({
    store,
    run,
    now: () => now,
    recordTrace: () => {},
    emitVolatileTrace: () => {},
    createStep: (targetRun, type, round, toolName) => {
      stepCount += 1
      const step: AgentRunStep = {
        id: `step_${stepCount}`,
        runId: targetRun.id,
        type,
        status: 'in_progress',
        createdAt: '2026-01-01T00:00:00.000Z',
        roundId: round.roundId,
        roundIndex: round.roundIndex,
        roundLabel: round.roundLabel,
        roundSource: round.roundSource,
        ...(toolName ? { toolName } : {}),
      }
      targetRun.steps.push(step)
      return step
    },
    emitRunSnapshot: (targetRun) => snapshots.push(`${targetRun.id}:${targetRun.updatedAt}`),
  })

  const stepId = callbacks.onStepCreate('tool_call', 4, 'Tool', 'model', 'tool_a')
  callbacks.onStepComplete(stepId, { ok: true }, undefined, true)

  assert.equal(stepId, 'step_1')
  assert.equal(run.steps[0]?.status, 'completed')
  assert.deepEqual(run.steps[0]?.result, { ok: true })
  assert.equal(run.steps[0]?.sandboxed, true)
  assert.equal(run.steps[0]?.durationMs, 1000)
  assert.deepEqual(snapshots, ['run_1:2026-01-01T00:00:01.000Z'])
})

function makeRun(): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'in_progress',
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
  }
}

function generationEvent(): GenerationEvent {
  return {
    kind: 'generation_job',
    stage: 'completed',
    toolName: 'movscript_create_generation_job',
    jobId: 321,
    status: 'succeeded',
    terminal: true,
    message: 'Done.',
  }
}
