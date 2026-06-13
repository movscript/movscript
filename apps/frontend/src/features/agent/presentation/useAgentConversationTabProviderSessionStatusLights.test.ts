import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildAgentConversationTabProviderSessionTargets,
  providerSessionStatusLightForTargetKeys,
  providerSessionStatusLightFromConversationState,
} from './useAgentConversationTabProviderSessionStatusLights'
import type { Conversation } from '@/features/agent/state/agentStore'

test('buildAgentConversationTabProviderSessionTargets prefers session anchors and keeps thread fallback', () => {
  const targets = buildAgentConversationTabProviderSessionTargets({
    conversations: [
      conversation({
        id: 'conv_session',
        providerSessionId: 'session_persisted',
        providerThreadId: 'thread_persisted',
      }),
      conversation({
        id: 'conv_compat',
        providerThreadId: 'thread_compat',
      }),
    ],
    conversationThreadBindings: {
      conv_session: {
        conversationId: 'conv_session',
        providerThreadId: 'thread_binding',
        providerSessionTreeId: 'session_tree_binding',
        updatedAt: 1,
      },
    },
  })

  assert.deepEqual(targets, [
    {
      conversationId: 'conv_session',
      sessionId: 'session_tree_binding',
      threadId: 'thread_binding',
    },
    {
      conversationId: 'conv_compat',
      threadId: 'thread_compat',
    },
  ])
})

test('buildAgentConversationTabProviderSessionTargets leaves unanchored conversations disconnected', () => {
  const targets = buildAgentConversationTabProviderSessionTargets({
    conversations: [
      conversation({ id: 'conv_empty' }),
    ],
  })

  assert.deepEqual(targets, [
    {
      conversationId: 'conv_empty',
      threadId: '',
    },
  ])
})

test('buildAgentConversationTabProviderSessionTargets skips app-server conversations', () => {
  const targets = buildAgentConversationTabProviderSessionTargets({
    conversations: [
      conversation({
        id: 'conv_app_server',
        providerThreadId: 'thread_app_server',
      }),
      conversation({
        id: 'conv_provider_session',
        providerThreadId: 'thread_provider_session',
      }),
    ],
    conversationsById: {
      conv_app_server: {
        id: 'conv_app_server',
        userId: 'user_1',
        providerProtocol: 'app-server',
        providerThreadId: 'thread_app_server',
        open: true,
        archived: false,
        createdAt: 1,
        updatedAt: 2,
      },
    },
  })

  assert.deepEqual(targets, [
    {
      conversationId: 'conv_provider_session',
      threadId: 'thread_provider_session',
    },
  ])
})

test('providerSessionStatusLightForTargetKeys prefers the highest-priority light across session and thread targets', () => {
  assert.equal(providerSessionStatusLightForTargetKeys({
    'session:session_1': {
      state: 'stopped',
      label: '停止',
      detail: 'Provider 会话当前不会自行触发新的 run。',
    },
    'thread:thread_1': {
      state: 'active',
      label: '运行',
      detail: 'Provider 会话正在触发 run 循环。',
    },
  }, ['session:session_1', 'thread:thread_1']).state, 'active')

  assert.equal(providerSessionStatusLightForTargetKeys({
    'session:session_1': {
      state: 'active',
      label: '运行',
      detail: 'Provider 会话正在触发 run 循环。',
    },
    'thread:thread_1': {
      state: 'error',
      label: '错误',
      detail: 'Provider 会话已失败。',
    },
  }, ['session:session_1', 'thread:thread_1']).state, 'error')

  assert.equal(providerSessionStatusLightForTargetKeys({
    'session:session_1': {
      state: 'waiting',
      label: '等待',
      detail: 'Provider 会话正在等待外部信息。',
    },
    'thread:thread_1': {
      state: 'active',
      label: '运行',
      detail: 'Provider 会话正在触发 run 循环。',
    },
  }, ['session:session_1', 'thread:thread_1']).state, 'active')

  assert.equal(providerSessionStatusLightForTargetKeys({}, ['session:session_1']).state, 'stopped')
})

test('providerSessionStatusLightFromConversationState treats local terminal thread state as authoritative', () => {
  assert.deepEqual(providerSessionStatusLightFromConversationState({
    id: 'thread_done',
    userId: 'user_1',
    providerThreadId: 'thread_done',
    status: 'completed',
    open: true,
    archived: false,
    createdAt: 1,
    updatedAt: 2,
  }, undefined), {
    terminal: true,
    light: {
      state: 'stopped',
      label: '停止',
      detail: 'Provider 会话当前不会自行触发新的 run，需要新的用户输入。',
    },
  })

  assert.equal(providerSessionStatusLightFromConversationState(undefined, {
    conversationId: 'thread_failed',
    status: 'failed',
    loading: false,
    building: false,
    approving: false,
    stopping: false,
    stopRequested: false,
    updatedAt: 2,
  })?.light.state, 'error')
})

test('providerSessionStatusLightFromConversationState does not mark queued drafts active', () => {
  assert.deepEqual(providerSessionStatusLightFromConversationState({
    id: 'thread_queued',
    userId: 'user_1',
    providerThreadId: 'thread_queued',
    status: 'queued',
    open: true,
    archived: false,
    createdAt: 1,
    updatedAt: 2,
  }, undefined), {
    terminal: true,
    light: {
      state: 'stopped',
      label: '停止',
      detail: 'Provider 会话当前不会自行触发新的 run，需要新的用户输入。',
    },
  })
})

function conversation(overrides: Partial<Conversation>): Conversation {
  return {
    id: 'conv_1',
    title: 'Conversation',
    transcriptMessages: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}
