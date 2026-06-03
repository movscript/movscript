import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isVisibleAssistantChatMessage,
  isUiOnlyAssistantChatMessage,
  latestVisibleTranscriptChatMessage,
  visibleAssistantActivityRunId,
  visibleAssistantRelatedRunId,
  visibleAssistantRuntimeMessageRunId,
  visibleTranscriptChatMessages,
} from '@/features/agent/domain/agentMessageBoundaries'
import type { ChatMessage } from '@/features/agent/state/agentStore'

test('isUiOnlyAssistantChatMessage classifies assistant UI-only anchors', () => {
  assert.equal(isUiOnlyAssistantChatMessage(message({
    meta: {
      runtimeStatus: {
        kind: 'async_work_handoff',
        title: '异步任务已提交',
        detail: '异步任务已提交。',
      },
    },
  })), true)
  assert.equal(isUiOnlyAssistantChatMessage(message({
    meta: {
      contextDiagnostic: {
        schema: 'movscript.local_context_diagnostic.v1',
        modelGatewayCalled: false,
        messages: [],
        debugParts: [],
        tools: { available: [], blocked: [], discoveredCount: 0, modelTools: [] },
        skills: [],
        warnings: [],
      },
    },
  })), true)
  assert.equal(isUiOnlyAssistantChatMessage(message({
    meta: {
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
  })), true)
})

test('isUiOnlyAssistantChatMessage keeps user messages and final activity-bearing assistants visible', () => {
  assert.equal(isUiOnlyAssistantChatMessage(message({
    role: 'user',
    meta: {
      runtimeStatus: {
        kind: 'async_work_handoff',
        title: '异步任务已提交',
        detail: '异步任务已提交。',
      },
    },
  })), false)
  assert.equal(isUiOnlyAssistantChatMessage(message({
    meta: {
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
  })), false)
})

test('visible transcript helpers omit UI-only assistant anchors from previews and counts', () => {
  const user = message({ id: 'user_message', role: 'user', content: '开始生成' })
  const status = message({
    id: 'runtime_status',
    content: '任务正在后台运行。',
    meta: {
      runtimeStatus: {
        kind: 'async_work_handoff',
        title: '异步任务已提交',
        detail: '任务正在后台运行。',
      },
    },
  })
  const final = message({ id: 'final_message', content: '生成完成。' })

  assert.deepEqual(visibleTranscriptChatMessages([user, status, final]).map((item) => item.id), ['user_message', 'final_message'])
  assert.equal(latestVisibleTranscriptChatMessage([user, status])?.id, 'user_message')
  assert.equal(latestVisibleTranscriptChatMessage([status]), undefined)
})

test('visible assistant run helpers keep runtime and activity run ids distinct', () => {
  const runtimeAndActivityMessage = message({
    meta: {
      runtimeMessage: { threadId: 'thread_1', messageId: 'msg_1', runId: ' run_runtime ' },
      localRunActivity: {
        runId: ' run_activity ',
        threadId: 'thread_1',
        status: 'completed',
        createdAt: '2026-05-19T00:00:00.000Z',
        updatedAt: '2026-05-19T00:00:01.000Z',
        steps: [],
        events: [],
      },
    },
  })
  const activityMessage = message({
    meta: {
      localRunActivity: {
        runId: ' run_activity ',
        threadId: 'thread_1',
        status: 'completed',
        createdAt: '2026-05-19T00:00:00.000Z',
        updatedAt: '2026-05-19T00:00:01.000Z',
        steps: [],
        events: [],
      },
    },
  })
  const uiOnlyMessage = message({
    meta: {
      runtimeStatus: {
        kind: 'async_work_handoff',
        title: '异步任务已提交',
        detail: '任务正在后台运行。',
      },
      runtimeMessage: { threadId: 'thread_1', messageId: 'msg_status', runId: 'run_status' },
      localRunActivity: {
        runId: 'run_status_activity',
        threadId: 'thread_1',
        status: 'running',
        createdAt: '2026-05-19T00:00:00.000Z',
        updatedAt: '2026-05-19T00:00:01.000Z',
        steps: [],
        events: [],
      },
    },
  })

  assert.equal(isVisibleAssistantChatMessage(runtimeAndActivityMessage), true)
  assert.equal(visibleAssistantRuntimeMessageRunId(runtimeAndActivityMessage), 'run_runtime')
  assert.equal(visibleAssistantRelatedRunId(runtimeAndActivityMessage), 'run_runtime')
  assert.equal(visibleAssistantActivityRunId(runtimeAndActivityMessage), 'run_activity')
  assert.equal(visibleAssistantRuntimeMessageRunId(activityMessage), undefined)
  assert.equal(visibleAssistantActivityRunId(activityMessage), 'run_activity')
  assert.equal(visibleAssistantRelatedRunId(activityMessage), 'run_activity')
  assert.equal(isVisibleAssistantChatMessage(uiOnlyMessage), false)
  assert.equal(visibleAssistantRuntimeMessageRunId(uiOnlyMessage), undefined)
  assert.equal(visibleAssistantActivityRunId(uiOnlyMessage), undefined)
  assert.equal(visibleAssistantRelatedRunId(uiOnlyMessage), undefined)
})

function message(patch: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message_1',
    role: 'assistant',
    content: '',
    timestamp: 1,
    ...patch,
  }
}
