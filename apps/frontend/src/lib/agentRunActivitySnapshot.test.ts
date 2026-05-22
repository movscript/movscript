import assert from 'node:assert/strict'
import test from 'node:test'

import { buildRunActivitySnapshot } from './agentRunActivitySnapshot'
import type { ChatRunActivity, ChatRunActivityEvent } from '@/store/agentStore'

test('buildRunActivitySnapshot preserves all live model rounds and totals token usage', () => {
  const snapshot = buildRunActivitySnapshot({
    events: [
      modelEvent('req_1', 'Model HTTP request sent', 1, 'started', '2026-05-22T01:00:00.000Z'),
      modelEvent('res_1', 'Model HTTP response received', 1, 'completed', '2026-05-22T01:00:01.000Z', {
        durationMs: 1000,
        data: { usage: { input_tokens: 40, output_tokens: 2 } },
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
    { inputTokens: 40, outputTokens: 2, totalTokens: 42 },
    { inputTokens: 60, outputTokens: 8, totalTokens: 68 },
  ])
  assert.deepEqual(snapshot?.totals.usage, {
    inputTokens: 100,
    outputTokens: 10,
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

test('buildRunActivitySnapshot normalizes event order and replaces volatile duplicates', () => {
  const snapshot = buildRunActivitySnapshot({
    events: [
      toolDelta('trace_live_model-tool-call-stream:1:0', 'draft_', '2026-05-22T01:00:03.000Z'),
      modelEvent('res_1', 'Model HTTP response received', 1, 'completed', '2026-05-22T01:00:02.000Z'),
      modelEvent('req_1', 'Model HTTP request sent', 1, 'started', '2026-05-22T01:00:01.000Z'),
      toolDelta('trace_live_model-tool-call-stream:1:0', 'draft_create', '2026-05-22T01:00:04.000Z'),
    ],
  })

  assert.deepEqual(snapshot?.activity.events.map((event) => event.id), [
    'req_1',
    'res_1',
    'trace_live_model-tool-call-stream:1:0',
  ])
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
  status: string,
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
