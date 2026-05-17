import assert from 'node:assert/strict'
import test from 'node:test'
import { compactRunActivity, liveTraceEventKey } from './agentRunActivity'
import type { AgentRun } from './localAgentClient'
import type { ChatRunActivityEvent } from '@/store/agentStore'

test('liveTraceEventKey ignores non-plain live tool call payloads', () => {
  class RuntimeToolCall {
    index = 7
  }

  const event: ChatRunActivityEvent = {
    id: 'trace_event_1',
    kind: 'tool_call',
    title: 'Model tool call delta',
    status: 'running',
    data: {
      stream: {
        toolCall: new RuntimeToolCall(),
      },
    },
    createdAt: '2026-05-17T00:00:00.000Z',
  }

  assert.equal(liveTraceEventKey(event), 'model-tool-call-stream:0')
})

test('compactRunActivity preserves top-level step and trace durations', () => {
  const run: AgentRun = {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'completed',
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 4,
      maxIterations: 2,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:03.000Z',
    steps: [{
      id: 'step_1',
      runId: 'run_1',
      type: 'tool_call',
      status: 'completed',
      title: 'Tool call',
      durationMs: 1250,
      createdAt: '2026-05-17T00:00:01.000Z',
      completedAt: '2026-05-17T00:00:02.250Z',
    }],
    traceEvents: [{
      id: 'trace_1',
      runId: 'run_1',
      kind: 'tool_call',
      title: 'Tool finished',
      status: 'completed',
      durationMs: 1250,
      createdAt: '2026-05-17T00:00:01.000Z',
      completedAt: '2026-05-17T00:00:02.250Z',
    }],
  }

  const activity = compactRunActivity(run)

  assert.equal(activity.steps[0]?.durationMs, 1250)
  assert.equal(activity.events[0]?.durationMs, 1250)
})
