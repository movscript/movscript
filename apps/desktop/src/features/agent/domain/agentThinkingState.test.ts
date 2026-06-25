import assert from 'node:assert/strict'
import test from 'node:test'

import { getAgentThinkingState } from '@/features/agent/domain/agentThinkingState'
import type { AgentRun } from '@movscript/agent-protocol'
import type { ChatRunActivityEvent } from '@/features/agent/state/agentStore'

test('getAgentThinkingState reports active tool calls from run steps', () => {
  assert.deepEqual(getAgentThinkingState(run({
    steps: [{
      id: 'step_1',
      runId: 'run_1',
      type: 'tool_call',
      status: 'in_progress',
      toolName: 'movscript_test_tool',
      createdAt: '2026-05-19T00:00:00.000Z',
    }],
  }), []), {
    status: 'calling_tool',
    toolName: 'movscript_test_tool',
  })
})

test('getAgentThinkingState reports preparing tool calls from stream events', () => {
  assert.deepEqual(getAgentThinkingState(run(), [
    activityEvent({
      kind: 'tool_call',
      title: 'Model tool call delta',
      status: 'started',
      data: {
        stream: {
          toolCall: { name: 'movscript_test_tool' },
        },
      },
    }),
  ]), {
    status: 'preparing_tool_call',
    toolName: 'movscript_test_tool',
  })
})

test('getAgentThinkingState carries latest reasoning text', () => {
  assert.deepEqual(getAgentThinkingState(run(), [
    activityEvent({
      kind: 'reasoning',
      title: 'Model reasoning delta',
      status: 'info',
      data: {
        stream: {
          kind: 'reasoning',
          accumulated: '正在分析上下文',
        },
      },
    }),
  ]), {
    status: 'thinking',
    reasoning: '正在分析上下文',
  })
})

test('getAgentThinkingState prioritizes retry status over reasoning', () => {
  assert.deepEqual(getAgentThinkingState(run(), [
    activityEvent({
      kind: 'reasoning',
      title: 'Model reasoning delta',
      status: 'info',
      summary: '正在分析上下文',
    }),
    activityEvent({
      kind: 'model_call',
      title: 'Model retry scheduled',
      status: 'info',
      data: {
        retry: {
          nextAttempt: 2,
          maxAttempts: 3,
          delayMs: 1000,
        },
      },
    }),
  ]), {
    status: 'retrying_model',
    label: '模型请求暂时不可用，正在第 2/3 次重试，等待 1s',
  })
})

function run(patch: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'in_progress',
    providerSessionLimits: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:00.000Z',
    steps: [],
    ...patch,
  }
}

function activityEvent(patch: Partial<ChatRunActivityEvent>): ChatRunActivityEvent {
  return {
    id: 'trace_1',
    kind: 'model_call',
    title: 'Model',
    status: 'info',
    createdAt: '2026-05-19T00:00:00.000Z',
    ...patch,
  }
}
