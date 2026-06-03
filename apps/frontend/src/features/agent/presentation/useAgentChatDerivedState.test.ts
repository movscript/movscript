import assert from 'node:assert/strict'
import test from 'node:test'

import { agentMessagesContainRunActivity, assistantMessageCompletesStreamingRun, filterActivityEventsForRun } from '@/features/agent/presentation/useAgentChatDerivedState'
import type { ChatMessage, ChatRunActivityEvent } from '@/features/agent/state/agentStore'

test('agentMessagesContainRunActivity ignores assistant stream messages without activity snapshots', () => {
  const messages: ChatMessage[] = [message({
    id: 'stream_message',
    role: 'assistant',
    content: '正在输出最终回复',
    meta: {
      runtimeMessage: {
        threadId: 'thread_1',
        messageId: 'msg_stream',
        runId: 'run_1',
      },
    },
  })]

  assert.equal(agentMessagesContainRunActivity(messages, 'run_1'), false)
})

test('agentMessagesContainRunActivity detects persisted run activity snapshots', () => {
  const messages: ChatMessage[] = [message({
    id: 'final_message',
    role: 'assistant',
    content: '完成',
    meta: {
      runtimeMessage: {
        threadId: 'thread_1',
        messageId: 'msg_final',
        runId: 'run_1',
      },
      localRunActivity: {
        runId: 'run_1',
        threadId: 'thread_1',
        status: 'completed',
        createdAt: '2026-05-19T00:00:00.000Z',
        updatedAt: '2026-05-19T00:00:01.000Z',
        steps: [],
        events: [],
      },
    },
  })]

  assert.equal(agentMessagesContainRunActivity(messages, 'run_1'), true)
})

test('agentMessagesContainRunActivity ignores UI-only assistant activity anchors', () => {
  const messages: ChatMessage[] = [message({
    id: 'runtime_status_message',
    role: 'assistant',
    content: '任务正在后台运行。',
    meta: {
      runtimeMessage: {
        threadId: 'thread_1',
        messageId: 'msg_status',
        runId: 'run_1',
      },
      runtimeStatus: {
        kind: 'async_work_handoff',
        workId: 'work_1',
        title: '异步任务已提交',
        detail: '任务正在后台运行。',
      },
      localRunActivity: {
        runId: 'run_1',
        threadId: 'thread_1',
        status: 'completed',
        createdAt: '2026-05-19T00:00:00.000Z',
        updatedAt: '2026-05-19T00:00:01.000Z',
        steps: [],
        events: [],
      },
    },
  })]

  assert.equal(agentMessagesContainRunActivity(messages, 'run_1'), false)
})

test('filterActivityEventsForRun drops prior run activity but keeps unscoped pending local events', () => {
  const events: ChatRunActivityEvent[] = [
    activityEvent({ id: 'http-request-1', kind: 'runtime', title: 'HTTP', status: 'started' }),
    activityEvent({ id: 'trace_old', runId: 'run_1', kind: 'tool_call', title: '旧工具结果', status: 'completed' }),
    activityEvent({ id: 'trace_current', runId: 'run_2', kind: 'model_call', title: '当前模型', status: 'started' }),
  ]

  assert.deepEqual(filterActivityEventsForRun(events, 'run_2').map((event) => event.id), ['http-request-1', 'trace_current'])
  assert.deepEqual(filterActivityEventsForRun(events, undefined).map((event) => event.id), ['http-request-1'])
})

test('assistantMessageCompletesStreamingRun ignores UI-only assistant anchors for the same run', () => {
  const planRevisionMessage = message({
    id: 'message_plan_revision',
    meta: {
      runtimeMessage: {
        threadId: 'thread_1',
        messageId: 'message_plan_revision',
        runId: 'run_1',
      },
      planRevision: {
        schema: 'movscript.agent.plan-revision.v1',
        id: 'plan_revision_1',
        planId: 'plan_1',
        threadId: 'thread_1',
        createdAt: '2026-05-19T00:00:00.000Z',
        snapshot: {
          schema: 'movscript.agent.plan.v1',
          id: 'plan_1',
          threadId: 'thread_1',
          items: [],
          completedCount: 0,
          totalCount: 0,
          createdAt: '2026-05-19T00:00:00.000Z',
          updatedAt: '2026-05-19T00:00:00.000Z',
        },
      },
    },
  })
  const runtimeStatusMessage = message({
    id: 'message_runtime_status',
    meta: {
      runtimeMessage: {
        threadId: 'thread_1',
        messageId: 'message_runtime_status',
        runId: 'run_1',
      },
      runtimeStatus: {
        kind: 'async_work_handoff',
        workId: 'work_1',
        title: '等待异步任务',
        detail: '任务正在后台运行，完成后会自动接续。',
        workStatus: 'waiting',
      },
    },
  })
  const diagnosticMessage = message({
    id: 'message_diagnostic',
    meta: {
      runtimeMessage: {
        threadId: 'thread_1',
        messageId: 'message_diagnostic',
        runId: 'run_1',
      },
      contextDiagnostic: {
        schema: 'movscript.local_context_diagnostic.v1',
        modelGatewayCalled: false,
        messages: [],
        debugParts: [],
        tools: {
          available: [],
          blocked: [],
          discoveredCount: 0,
          modelTools: [],
        },
        skills: [],
        warnings: [],
      },
    },
  })

  assert.equal(assistantMessageCompletesStreamingRun(planRevisionMessage, 'run_1'), false)
  assert.equal(assistantMessageCompletesStreamingRun(runtimeStatusMessage, 'run_1'), false)
  assert.equal(assistantMessageCompletesStreamingRun(diagnosticMessage, 'run_1'), false)
})

test('assistantMessageCompletesStreamingRun only accepts final assistant messages for the matching run', () => {
  const finalAssistantMessage = message({
    id: 'assistant_run_1',
    content: '最终回复',
    meta: {
      runtimeMessage: {
        threadId: 'thread_1',
        messageId: 'assistant_run_1',
        runId: ' run_1 ',
      },
    },
  })

  assert.equal(assistantMessageCompletesStreamingRun(finalAssistantMessage, 'run_1'), true)
  assert.equal(assistantMessageCompletesStreamingRun(finalAssistantMessage, 'run_2'), false)
  assert.equal(assistantMessageCompletesStreamingRun({ ...finalAssistantMessage, role: 'user' }, 'run_1'), false)
})

test('assistantMessageCompletesStreamingRun allows final messages that carry run activity snapshots', () => {
  const finalAssistantMessage = message({
    id: 'assistant_run_1',
    content: '最终回复',
    meta: {
      runtimeMessage: {
        threadId: 'thread_1',
        messageId: 'assistant_run_1',
        runId: 'run_1',
      },
      localRunActivity: {
        runId: 'run_1',
        threadId: 'thread_1',
        status: 'completed',
        createdAt: '2026-05-19T00:00:00.000Z',
        updatedAt: '2026-05-19T00:00:01.000Z',
        steps: [],
        events: [],
      },
    },
  })

  assert.equal(assistantMessageCompletesStreamingRun(finalAssistantMessage, 'run_1'), true)
})

function message(patch: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'message_1',
    role: 'assistant',
    content: '',
    timestamp: 1,
    ...patch,
  }
}

function activityEvent(patch: Partial<ChatRunActivityEvent>): ChatRunActivityEvent {
  return {
    id: 'trace_1',
    kind: 'tool_call',
    title: 'Tool',
    status: 'started',
    createdAt: '2026-05-19T00:00:00.000Z',
    ...patch,
  }
}
