import assert from 'node:assert/strict'
import test from 'node:test'

import { buildRunActivitySnapshot } from '@/features/agent/domain/agentRunActivitySnapshot'
import type { AgentRun } from '@movscript/agent-protocol'
import type { ChatRunActivity, ChatRunActivityEvent } from '@/features/agent/state/agentStore'

test('buildRunActivitySnapshot preserves all live model rounds and totals token usage', () => {
  const snapshot = buildRunActivitySnapshot({
    events: [
      modelEvent('req_1', 'Model HTTP request sent', 1, 'started', '2026-05-22T01:00:00.000Z'),
      modelEvent('res_1', 'Model HTTP response received', 1, 'completed', '2026-05-22T01:00:01.000Z', {
        durationMs: 1000,
        data: { usage: { input_tokens: 40, output_tokens: 2, input_tokens_details: { cached_tokens: 30 } } },
      }),
      modelEvent('req_2', 'Model HTTP request sent', 2, 'started', '2026-05-22T01:00:02.000Z'),
      modelEvent('res_2', 'Model HTTP response received', 2, 'completed', '2026-05-22T01:00:03.500Z', {
        durationMs: 1500,
        data: { usage: { input_tokens: 60, output_tokens: 8, total_tokens: 68 } },
      }),
    ],
  })

  assert.deepEqual(snapshot?.rounds.map((round) => round.index), [1, 2])
  assert.deepEqual(snapshot?.rounds.map((round) => round.usage), [
    { inputTokens: 40, outputTokens: 2, cachedInputTokens: 30, totalTokens: 42 },
    { inputTokens: 60, outputTokens: 8, totalTokens: 68 },
  ])
  assert.deepEqual(snapshot?.totals.usage, {
    inputTokens: 100,
    outputTokens: 10,
    cachedInputTokens: 30,
    totalTokens: 110,
  })
  assert.equal(snapshot?.totals.modelCallCount, 2)
})

test('buildRunActivitySnapshot merges live events into a historical activity without dropping older rounds', () => {
  const snapshot = buildRunActivitySnapshot({
    activity: activity({
      events: [
        modelEvent('req_1', 'Model HTTP request sent', 1, 'started', '2026-05-22T01:00:00.000Z'),
        modelEvent('res_1', 'Model HTTP response received', 1, 'completed', '2026-05-22T01:00:01.000Z', {
          data: { usage: { input_tokens: 10, output_tokens: 1 } },
        }),
      ],
    }),
    events: [
      modelEvent('req_2', 'Model HTTP request sent', 2, 'started', '2026-05-22T01:00:02.000Z'),
      modelEvent('res_2', 'Model HTTP response received', 2, 'completed', '2026-05-22T01:00:03.000Z', {
        data: { usage: { input_tokens: 20, output_tokens: 3 } },
      }),
    ],
  })

  assert.deepEqual(snapshot?.rounds.map((round) => round.index), [1, 2])
  assert.deepEqual(snapshot?.totals.usage, {
    inputTokens: 30,
    outputTokens: 4,
    totalTokens: 34,
  })
})

test('buildRunActivitySnapshot does not merge live events from a different run', () => {
  const snapshot = buildRunActivitySnapshot({
    activity: activity({
      runId: 'run_1',
      events: [
        modelEvent('req_1', 'Model HTTP request sent', 1, 'started', '2026-05-22T01:00:00.000Z', { runId: 'run_1' }),
      ],
    }),
    events: [
      modelEvent('req_2', 'Model HTTP request sent', 2, 'started', '2026-05-22T01:00:02.000Z', { runId: 'run_2' }),
      modelEvent('local_setup', 'Local runtime setup', 0, 'info', '2026-05-22T01:00:03.000Z'),
    ],
  })

  assert.deepEqual(snapshot?.activity.events.map((event) => event.id), ['req_1', 'local_setup'])
  assert.deepEqual(snapshot?.rounds.map((round) => round.index), [1])
})

test('buildRunActivitySnapshot normalizes event order and replaces volatile duplicates', () => {
  const snapshot = buildRunActivitySnapshot({
    events: [
      toolDelta('trace_live_model-tool-call-stream:1:0', 'workspace_', '2026-05-22T01:00:03.000Z'),
      modelEvent('res_1', 'Model HTTP response received', 1, 'completed', '2026-05-22T01:00:02.000Z'),
      modelEvent('req_1', 'Model HTTP request sent', 1, 'started', '2026-05-22T01:00:01.000Z'),
      toolDelta('trace_live_model-tool-call-stream:1:0', 'workspace_create', '2026-05-22T01:00:04.000Z'),
    ],
  })

  assert.deepEqual(snapshot?.activity.events.map((event) => event.id), [
    'req_1',
    'res_1',
    'trace_live_model-tool-call-stream:1:0',
  ])
})

test('buildRunActivitySnapshot keeps historical feed activity compact when a full run is also available', () => {
  const snapshot = buildRunActivitySnapshot({
    activity: activity({
      runId: 'run_test',
      steps: [{
        id: 'safe_step',
        type: 'tool_call',
        status: 'completed',
        toolName: 'core_work_start',
        createdAt: '2026-05-22T01:00:00.000Z',
      }],
      approvals: [{
        id: 'safe_approval',
        runId: 'run_test',
        toolName: 'generation_job_create',
        reason: 'Needs confirmation',
        status: 'approved',
        createdAt: '2026-05-22T01:00:00.000Z',
        updatedAt: '2026-05-22T01:00:01.000Z',
      }],
      events: [{
        id: 'safe_trace',
        runId: 'run_test',
        kind: 'tool_call',
        title: 'Generation progress',
        status: 'completed',
        toolName: 'generation_job_create',
        data: {
          generation: {
            jobId: 123,
            status: 'succeeded',
            terminal: true,
            outputResourceId: 456,
          },
        },
        createdAt: '2026-05-22T01:00:00.000Z',
      }],
    }),
    run: runWithDetailedActivity(),
  })

  assert.equal(JSON.stringify(snapshot?.activity).includes('SECRET_'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(snapshot?.activity.steps[0] ?? {}, 'args'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(snapshot?.activity.steps[0] ?? {}, 'result'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(snapshot?.activity.approvals?.[0] ?? {}, 'args'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(snapshot?.activity.approvals?.[0] ?? {}, 'preview'), false)
  assert.deepEqual(snapshot?.activity.events[0]?.data, {
    generation: {
      jobId: 123,
      status: 'succeeded',
      terminal: true,
      outputResourceId: 456,
    },
  })
})

function activity(overrides: Partial<ChatRunActivity> = {}): ChatRunActivity {
  return {
    runId: 'run_test',
    threadId: 'thread_test',
    status: 'completed',
    createdAt: '2026-05-22T01:00:00.000Z',
    updatedAt: '2026-05-22T01:00:02.000Z',
    steps: [],
    events: [],
    ...overrides,
  }
}

function runWithDetailedActivity(): AgentRun {
  return {
    id: 'run_test',
    threadId: 'thread_test',
    status: 'completed',
    providerSessionLimits: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    pendingApprovals: [{
      id: 'approval_secret',
      runId: 'run_test',
      toolName: 'generation_job_create',
      reason: 'Needs confirmation',
      status: 'approved',
      args: { secret: 'SECRET_APPROVAL_ARGS_SHOULD_NOT_BE_IN_FEED' },
      preview: { secret: 'SECRET_APPROVAL_PREVIEW_SHOULD_NOT_BE_IN_FEED' },
      createdAt: '2026-05-22T01:00:00.000Z',
      updatedAt: '2026-05-22T01:00:01.000Z',
    }],
    createdAt: '2026-05-22T01:00:00.000Z',
    updatedAt: '2026-05-22T01:00:02.000Z',
    steps: [{
      id: 'step_secret',
      runId: 'run_test',
      type: 'tool_call',
      status: 'completed',
      toolName: 'core_work_start',
      args: { secret: 'SECRET_TOOL_ARGS_SHOULD_NOT_BE_IN_FEED' },
      result: { secret: 'SECRET_TOOL_RESULT_SHOULD_NOT_BE_IN_FEED' },
      createdAt: '2026-05-22T01:00:00.000Z',
    }],
    traceEvents: [{
      id: 'trace_secret',
      runId: 'run_test',
      kind: 'tool_call',
      title: 'Tool call completed',
      status: 'completed',
      toolName: 'core_work_start',
      data: { secret: 'SECRET_TRACE_DATA_SHOULD_NOT_BE_IN_FEED' },
      createdAt: '2026-05-22T01:00:01.000Z',
    }],
  }
}

function toolDelta(id: string, name: string, createdAt: string): ChatRunActivityEvent {
  return {
    id,
    kind: 'tool_call',
    title: 'Model tool call delta',
    status: 'info',
    data: {
      stream: {
        kind: 'tool_call',
        toolCall: {
          index: 0,
          name,
        },
      },
    },
    createdAt,
  }
}

function modelEvent(
  id: string,
  title: string,
  roundIndex: number,
  status: ChatRunActivityEvent['status'],
  createdAt: string,
  overrides: Partial<ChatRunActivityEvent> = {},
): ChatRunActivityEvent {
  return {
    id,
    kind: 'model_call',
    title,
    status,
    roundIndex,
    roundLabel: `Model turn ${roundIndex}`,
    createdAt,
    ...overrides,
  }
}
