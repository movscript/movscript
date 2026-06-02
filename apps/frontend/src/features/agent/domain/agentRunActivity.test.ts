import assert from 'node:assert/strict'
import test from 'node:test'
import { compactRunActivity, liveTraceEventKey, mergeLiveRunActivityEvent, projectLiveRunRuntimeTraceEvent } from '@/features/agent/domain/agentRunActivity'
import type { AgentRun, AgentRuntimeEventV2, AgentTraceEvent } from '@/shared/infrastructure/localAgentClient'
import type { ChatRunActivityEvent } from '@/features/agent/state/agentStore'

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
    runtimeLimits: { approvalMode: 'interactive',
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

test('compactRunActivity preserves approval and input request state', () => {
  const run: AgentRun = {
    id: 'run_action',
    threadId: 'thread_1',
    status: 'requires_action',
    runtimeLimits: { approvalMode: 'interactive',
      maxToolCalls: 4,
      maxIterations: 2,
      allowNetwork: false,
      allowFileBytes: false,
    },
    pendingApprovals: [{
      id: 'approval_1',
      runId: 'run_action',
      toolName: 'movscript_publish_assets',
      reason: 'Publish reviewed asset metadata.',
      risk: 'write',
      permission: 'project.assets.write',
      status: 'approved',
      createdAt: '2026-05-17T00:00:01.000Z',
      updatedAt: '2026-05-17T00:00:02.000Z',
      approvedAt: '2026-05-17T00:00:02.000Z',
    }],
    pendingInputRequests: [{
      id: 'input_1',
      runId: 'run_action',
      title: '选择方向',
      question: '继续哪个方案？',
      inputType: 'choice',
      choices: [{ id: 'a', label: 'A' }],
      allowCustomAnswer: false,
      status: 'answered',
      answer: { choiceIds: ['a'] },
      createdAt: '2026-05-17T00:00:03.000Z',
      updatedAt: '2026-05-17T00:00:04.000Z',
      answeredAt: '2026-05-17T00:00:04.000Z',
    }],
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:04.000Z',
    steps: [],
    traceEvents: [],
  }

  const activity = compactRunActivity(run)

  assert.equal(activity.approvals?.[0]?.status, 'approved')
  assert.equal(activity.approvals?.[0]?.permission, 'project.assets.write')
  assert.equal(activity.inputs?.[0]?.status, 'answered')
  assert.deepEqual(activity.inputs?.[0]?.answer, { choiceIds: ['a'] })
})

test('projectLiveRunRuntimeTraceEvent maps visible trace events and pending assistant state', () => {
  const event = runtimeTraceEvent({
    id: 'trace_tool',
    runId: 'run_1',
    kind: 'tool_call',
    title: 'Calling tool',
    status: 'started',
    toolName: 'movscript_read_context',
    createdAt: '2026-05-17T00:00:00.000Z',
  })

  const projected = projectLiveRunRuntimeTraceEvent(event)

  assert.equal(projected?.activityEvent.id, 'trace_tool')
  assert.deepEqual(projected?.pendingAssistantState, {
    status: 'calling_tool',
    toolName: 'movscript_read_context',
  })
})

test('projectLiveRunRuntimeTraceEvent derives preparing tool state from model tool-call deltas', () => {
  const event = runtimeTraceEvent({
    id: 'trace_model',
    runId: 'run_1',
    kind: 'model_call',
    title: 'Model tool call delta',
    status: 'info',
    data: {
      stream: {
        kind: 'tool_call',
        toolCall: {
          name: 'draft_create',
        },
      },
    },
    createdAt: '2026-05-17T00:00:00.000Z',
  })

  const projected = projectLiveRunRuntimeTraceEvent(event)

  assert.deepEqual(projected?.pendingAssistantState, {
    status: 'preparing_tool_call',
    toolName: 'draft_create',
  })
})

test('projectLiveRunRuntimeTraceEvent derives thinking state from reasoning deltas', () => {
  const event = runtimeTraceEvent({
    id: 'trace_live_model-reasoning-stream:1',
    runId: 'run_1',
    kind: 'reasoning',
    title: 'Model reasoning delta',
    status: 'info',
    roundIndex: 1,
    roundLabel: 'Model',
    data: {
      stream: {
        kind: 'reasoning',
        delta: '检查上下文',
        accumulated: '正在检查上下文',
      },
    },
    createdAt: '2026-05-17T00:00:00.000Z',
  })

  const projected = projectLiveRunRuntimeTraceEvent(event)

  assert.equal(projected?.activityEvent.kind, 'reasoning')
  assert.deepEqual(projected?.pendingAssistantState, {
    status: 'thinking',
    reasoning: '正在检查上下文',
  })
})

test('projectLiveRunRuntimeTraceEvent clears pending state on terminal tool traces and ignores hidden kinds', () => {
  const completedTool = runtimeTraceEvent({
    id: 'trace_done',
    runId: 'run_1',
    kind: 'tool_call',
    title: 'Tool finished',
    status: 'completed',
    createdAt: '2026-05-17T00:00:00.000Z',
  })
  const hidden = runtimeTraceEvent({
    id: 'trace_message',
    runId: 'run_1',
    kind: 'message',
    title: 'Internal message',
    status: 'info',
    createdAt: '2026-05-17T00:00:00.000Z',
  })

  assert.equal(projectLiveRunRuntimeTraceEvent(completedTool)?.pendingAssistantState, null)
  assert.equal(projectLiveRunRuntimeTraceEvent(hidden), null)
})

test('mergeLiveRunActivityEvent replaces reasoning stream events by live key', () => {
  const first: ChatRunActivityEvent = {
    id: 'trace_live_model-reasoning-stream:1',
    kind: 'reasoning',
    title: 'Model reasoning delta',
    status: 'info',
    roundIndex: 1,
    data: { stream: { kind: 'reasoning', accumulated: '正在检查' } },
    createdAt: '2026-05-17T00:00:01.000Z',
  }
  const replacement: ChatRunActivityEvent = {
    ...first,
    id: 'trace_live_model-reasoning-stream:1',
    data: { stream: { kind: 'reasoning', accumulated: '正在检查上下文' } },
    createdAt: '2026-05-17T00:00:02.000Z',
  }

  const merged = mergeLiveRunActivityEvent([first], replacement)

  assert.equal(merged.length, 1)
  assert.deepEqual(merged[0]?.data, { stream: { kind: 'reasoning', accumulated: '正在检查上下文' } })
})

test('mergeLiveRunActivityEvent replaces by live key and keeps http setup events outside runtime limit', () => {
  const http: ChatRunActivityEvent = {
    id: 'http-request-1',
    kind: 'runtime',
    title: 'HTTP',
    status: 'started',
    createdAt: '2026-05-17T00:00:00.000Z',
  }
  const first: ChatRunActivityEvent = {
    id: 'trace_live_tool_1',
    kind: 'tool_call',
    title: 'Model tool call delta',
    status: 'started',
    data: { stream: { toolCall: { index: 1 } } },
    createdAt: '2026-05-17T00:00:01.000Z',
  }
  const replacement: ChatRunActivityEvent = {
    ...first,
    id: 'trace_tool_complete',
    status: 'completed',
  }
  const next: ChatRunActivityEvent = {
    id: 'trace_context',
    kind: 'context',
    title: 'Context',
    status: 'info',
    createdAt: '2026-05-17T00:00:02.000Z',
  }

  const merged = mergeLiveRunActivityEvent(mergeLiveRunActivityEvent([http, first], replacement, { runtimeLimit: 1 }), next, { runtimeLimit: 1 })

  assert.deepEqual(merged.map((event) => event.id), ['http-request-1', 'trace_context'])
})

test('mergeLiveRunActivityEvent keeps complete live history unless a caller asks for a limit', () => {
  const first: ChatRunActivityEvent = {
    id: 'trace_context_1',
    kind: 'context',
    title: 'Context 1',
    status: 'info',
    createdAt: '2026-05-17T00:00:01.000Z',
  }
  const second: ChatRunActivityEvent = {
    id: 'trace_context_2',
    kind: 'context',
    title: 'Context 2',
    status: 'info',
    createdAt: '2026-05-17T00:00:02.000Z',
  }
  const third: ChatRunActivityEvent = {
    id: 'trace_context_3',
    kind: 'context',
    title: 'Context 3',
    status: 'info',
    createdAt: '2026-05-17T00:00:03.000Z',
  }

  const merged = [first, second, third].reduce((current, event) => mergeLiveRunActivityEvent(current, event), [] as ChatRunActivityEvent[])

  assert.deepEqual(merged.map((event) => event.id), ['trace_context_1', 'trace_context_2', 'trace_context_3'])
})

function runtimeTraceEvent(trace: AgentTraceEvent): AgentRuntimeEventV2 {
  return {
    schema: 'movscript.agent.runtime-event.v2',
    protocolVersion: 'movscript.agent.protocol.v1',
    id: `runtime-event:${trace.id}`,
    scope: { type: 'thread', id: 'thread_1' },
    ordinal: 1,
    cursor: `runtime-event:${trace.id}`,
    emittedAt: trace.createdAt,
    kind: 'trace.upserted',
    causality: { threadId: 'thread_1', runId: trace.runId, traceId: trace.id },
    entity: { type: 'trace', value: trace },
  }
}
