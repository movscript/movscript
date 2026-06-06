import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildAgentChatConversationProjectionState,
} from '@/features/agent/presentation/agentChatConversationProjectionState'
import type { AgentConversationProjectionItem } from '@/features/agent/domain/agentConversationProjectionTypes'
import type { AgentRun } from '@/shared/infrastructure/providerSessionClient'
import type { ChatMessage } from '@/features/agent/state/agentStore'

test('buildAgentChatConversationProjectionState suppresses streaming text after the final assistant message lands', () => {
  const streamingOnly = buildAgentChatConversationProjectionState({
    activeRun: null,
    buildingSendWorkspace: false,
    inputBlockingLoading: false,
    interactionRuns: [],
    messages: [],
    pendingAssistantState: null,
    pendingSendWorkspace: null,
    streamingAssistantMessageId: 'stream-run_1',
    streamingAssistantText: '正在回答',
    timelineItems: [],
    visibleActivityEvents: [],
  })
  const finalMessageLanded = buildAgentChatConversationProjectionState({
    activeRun: null,
    buildingSendWorkspace: false,
    inputBlockingLoading: false,
    interactionRuns: [],
    messages: [
      message({
        id: 'assistant_run_1',
        content: '最终回复',
        meta: {
          runtimeMessage: {
            threadId: 'thread_1',
            messageId: 'assistant_run_1',
            runId: 'run_1',
          },
        },
      }),
    ],
    pendingAssistantState: null,
    pendingSendWorkspace: null,
    streamingAssistantMessageId: 'stream-run_1',
    streamingAssistantText: '正在回答',
    timelineItems: [],
    visibleActivityEvents: [],
  })

  assert.deepEqual(projectionContentTypes(streamingOnly.conversationProjection.items), ['assistant_stream'])
  assert.deepEqual(projectionContentTypes(finalMessageLanded.conversationProjection.items), ['message'])
})

test('buildAgentChatConversationProjectionState filters run interaction answer echoes from projected messages', () => {
  const state = buildAgentChatConversationProjectionState({
    activeRun: null,
    buildingSendWorkspace: false,
    inputBlockingLoading: false,
    interactionRuns: [run({
      id: 'run_1',
      status: 'requires_action',
      pendingInputRequests: [{
        id: 'input_1',
        runId: 'run_1',
        title: '需要补充信息',
        question: '请补充约束',
        inputType: 'text',
        choices: [],
        allowCustomAnswer: true,
        status: 'answered',
        answer: { text: '你好' },
        createdAt: '2026-05-19T00:00:00.000Z',
        updatedAt: '2026-05-19T00:00:01.000Z',
        answeredAt: '2026-05-19T00:00:01.000Z',
      }],
    })],
    messages: [
      message({
        id: 'trigger',
        role: 'user',
        content: '开始',
        meta: { runtimeMessage: { threadId: 'thread_1', messageId: 'trigger', runId: 'run_1' } },
      }),
      message({
        id: 'answer_echo',
        role: 'user',
        content: '回答：需要补充信息\n补充：你好',
        meta: {
          runtimeMessage: { threadId: 'thread_1', messageId: 'answer_echo', runId: 'run_1' },
          runtimeInput: { threadId: 'thread_1', messageId: 'answer_echo', runId: 'run_1', deliveryStatus: 'accepted' },
        },
      }),
    ],
    pendingAssistantState: null,
    pendingSendWorkspace: null,
    streamingAssistantText: '',
    timelineItems: [],
    visibleActivityEvents: [],
  })

  assert.deepEqual(projectionMessageIds(state.conversationProjection.items), ['trigger'])
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

function run(patch: Partial<AgentRun>): AgentRun {
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

function projectionContentTypes(items: AgentConversationProjectionItem[]): string[] {
  return items.flatMap((item) => item.type === 'run_turn'
    ? projectionContentTypes(item.items)
    : [item.type])
}

function projectionMessageIds(items: AgentConversationProjectionItem[]): string[] {
  return items.flatMap((item) => {
    if (item.type === 'run_turn') return projectionMessageIds(item.items)
    return item.type === 'message' ? [item.item.message.id] : []
  })
}
