import assert from 'node:assert/strict'
import test from 'node:test'

import { agentMessageDividerLabel } from '@/features/agent/domain/agentMessageDivider'
import type { ChatRunActivity } from '@/features/agent/state/agentStore'

test('agentMessageDividerLabel counts model-only replies as one call', () => {
  assert.equal(agentMessageDividerLabel('10:00', activity({
    events: [{
      id: 'event_model',
      kind: 'model_call',
      title: 'Model HTTP response received',
      status: 'completed',
      roundIndex: 1,
      data: { usage: { total_tokens: 9498 } },
      createdAt: '2026-05-22T01:00:00.000Z',
    }],
  })), '10:00 · 耗时 2s · 模型调用 1 次 · Token 9,498')
})

test('agentMessageDividerLabel shows model and tool metrics when tools were called', () => {
  assert.equal(agentMessageDividerLabel('10:00', activity({
    completedAt: '2026-05-22T01:00:02.000Z',
    steps: [{
      id: 'step_tool',
      type: 'tool_call',
      status: 'completed',
      toolName: 'movscript_read_project',
      createdAt: '2026-05-22T01:00:00.000Z',
      completedAt: '2026-05-22T01:00:01.000Z',
    }],
    events: [{
      id: 'event_model',
      kind: 'model_call',
      title: 'Model HTTP response received',
      status: 'completed',
      roundIndex: 1,
      data: { usage: { input_tokens: 40, output_tokens: 2 } },
      createdAt: '2026-05-22T01:00:01.000Z',
    }],
  })), '10:00 · 耗时 2s · 模型调用 1 次 · 工具 1 次 · Token 42')
})

test('agentMessageDividerLabel does not show empty tool or token metrics for failed runs without tools', () => {
  assert.equal(agentMessageDividerLabel('10:00', activity({
    status: 'failed',
    failedAt: '2026-05-22T01:00:02.000Z',
    error: 'Model request failed',
  })), '10:00 · 耗时 2s')
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
