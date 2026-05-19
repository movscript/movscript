import assert from 'node:assert/strict'
import test from 'node:test'
import { compactRunActivity, liveTraceEventKey, mergeLiveRunActivityEvent, projectLiveRunStreamTraceEvent } from './agentRunActivity'
import type { AgentRun, AgentRunStreamEvent } from './localAgentClient'
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

test('compactRunActivity preserves approval and input request state', () => {
  const run: AgentRun = {
    id: 'run_action',
    threadId: 'thread_1',
    status: 'requires_action',
    policy: {
      approvalMode: 'interactive',
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

test('projectLiveRunStreamTraceEvent maps visible trace events and pending assistant state', () => {
  const event: AgentRunStreamEvent = {
    type: 'trace',
    runId: 'run_1',
    event: {
      id: 'trace_tool',
      runId: 'run_1',
      kind: 'tool_call',
      title: 'Calling tool',
      status: 'started',
      toolName: 'movscript_read_context',
      createdAt: '2026-05-17T00:00:00.000Z',
    },
  }

  const projected = projectLiveRunStreamTraceEvent(event)

  assert.equal(projected?.activityEvent.id, 'trace_tool')
  assert.deepEqual(projected?.pendingAssistantState, {
    status: 'calling_tool',
    toolName: 'movscript_read_context',
  })
})

test('projectLiveRunStreamTraceEvent derives preparing tool state from model tool-call deltas', () => {
  const event: AgentRunStreamEvent = {
    type: 'trace',
    runId: 'run_1',
    event: {
      id: 'trace_model',
      runId: 'run_1',
      kind: 'model_call',
      title: 'Model tool call delta',
      status: 'info',
      data: {
        stream: {
          kind: 'tool_call',
          toolCall: {
            name: 'movscript_create_draft',
          },
        },
      },
      createdAt: '2026-05-17T00:00:00.000Z',
    },
  }

  const projected = projectLiveRunStreamTraceEvent(event)

  assert.deepEqual(projected?.pendingAssistantState, {
    status: 'preparing_tool_call',
    toolName: 'movscript_create_draft',
  })
})

test('projectLiveRunStreamTraceEvent clears pending state on terminal tool traces and ignores hidden kinds', () => {
  const completedTool: AgentRunStreamEvent = {
    type: 'trace',
    runId: 'run_1',
    event: {
      id: 'trace_done',
      runId: 'run_1',
      kind: 'tool_call',
      title: 'Tool finished',
      status: 'completed',
      createdAt: '2026-05-17T00:00:00.000Z',
    },
  }
  const hidden: AgentRunStreamEvent = {
    type: 'trace',
    runId: 'run_1',
    event: {
      id: 'trace_message',
      runId: 'run_1',
      kind: 'message',
      title: 'Internal message',
      status: 'info',
      createdAt: '2026-05-17T00:00:00.000Z',
    },
  }

  assert.equal(projectLiveRunStreamTraceEvent(completedTool)?.pendingAssistantState, null)
  assert.equal(projectLiveRunStreamTraceEvent(hidden), null)
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
