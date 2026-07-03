import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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
        providerProtocol: 'provider-session',
        providerSessionId: 'session_persisted',
        providerThreadId: 'thread_persisted',
      } as Partial<Conversation> & { providerProtocol: string }),
      conversation({
        id: 'conv_compat',
        providerProtocol: 'provider-session',
        providerThreadId: 'thread_compat',
      } as Partial<Conversation> & { providerProtocol: string }),
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
      providerSessionTreeId: 'session_tree_binding',
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

test('buildAgentConversationTabProviderSessionTargets keeps runtime-thread conversations', () => {
  const targets = buildAgentConversationTabProviderSessionTargets({
    conversations: [
      conversation({
        id: 'conv_sdk',
        providerProtocol: 'sdk',
        providerThreadId: 'thread_sdk',
      } as Partial<Conversation> & { providerProtocol: string }),
      conversation({
        id: 'conv_provider_session',
        providerProtocol: 'provider-session',
        providerThreadId: 'thread_provider_session',
      }),
    ],
    conversationsById: {
      conv_sdk: {
        id: 'conv_sdk',
        userId: 'user_1',
        providerProtocol: 'sdk',
        providerThreadId: 'thread_sdk',
        open: true,
        archived: false,
        createdAt: 1,
        updatedAt: 2,
      },
    },
  })

  assert.deepEqual(targets, [
    {
      conversationId: 'conv_sdk',
      threadId: '',
    },
    {
      conversationId: 'conv_provider_session',
      threadId: 'thread_provider_session',
    },
  ])
})

test('buildAgentConversationTabProviderSessionTargets does not stream SDK runtime ids through provider-session endpoints', () => {
  const targets = buildAgentConversationTabProviderSessionTargets({
    conversations: [
      conversation({
        id: 'conv_codex',
        providerProtocol: 'sdk',
        providerSessionId: 'codex-codex-sdk',
        providerThreadId: 'codex_thread_1',
      } as Partial<Conversation> & { providerProtocol: string }),
      conversation({
        id: 'conv_claude',
        providerProtocol: 'claude-code',
        providerSessionId: 'claude-sdk',
        providerThreadId: 'claude_thread_1',
      } as Partial<Conversation> & { providerProtocol: string }),
      conversation({
        id: 'conv_registry_codex',
        providerSessionId: 'codex-codex-sdk',
        providerThreadId: 'codex_thread_2',
      }),
    ],
    conversationThreadBindings: {
      conv_codex: {
        conversationId: 'conv_codex',
        providerSessionTreeId: 'codex-codex-sdk',
        providerThreadId: 'codex_thread_1',
        updatedAt: 1,
      },
    },
    conversationsById: {
      conv_registry_codex: {
        id: 'conv_registry_codex',
        userId: 'user_1',
        providerProtocol: 'sdk',
        providerThreadId: 'codex_thread_2',
        providerSessionId: 'codex-codex-sdk',
        open: true,
        archived: false,
        createdAt: 1,
        updatedAt: 2,
      },
    },
  })

  assert.deepEqual(targets, [
    {
      conversationId: 'conv_codex',
      threadId: '',
    },
    {
      conversationId: 'conv_claude',
      threadId: '',
    },
    {
      conversationId: 'conv_registry_codex',
      threadId: '',
    },
  ])
})

test('providerSessionStatusLightForTargetKeys prefers the highest-priority light across session and thread targets', () => {
  assert.equal(providerSessionStatusLightForTargetKeys({
    'session:session_1': {
      state: 'stopped',
      label: '停止',
      detail: 'Runtime 会话当前不会自行触发新的 run。',
    },
    'thread:thread_1': {
      state: 'active',
      label: '运行',
      detail: 'Runtime 会话正在触发 run 循环。',
    },
  }, ['session:session_1', 'thread:thread_1']).state, 'active')

  assert.equal(providerSessionStatusLightForTargetKeys({
    'session:session_1': {
      state: 'active',
      label: '运行',
      detail: 'Runtime 会话正在触发 run 循环。',
    },
    'thread:thread_1': {
      state: 'error',
      label: '错误',
      detail: 'Runtime 会话已失败。',
    },
  }, ['session:session_1', 'thread:thread_1']).state, 'error')

  assert.equal(providerSessionStatusLightForTargetKeys({
    'session:session_1': {
      state: 'waiting',
      label: '等待',
      detail: 'Runtime 会话正在等待外部信息。',
    },
    'thread:thread_1': {
      state: 'active',
      label: '运行',
      detail: 'Runtime 会话正在触发 run 循环。',
    },
  }, ['session:session_1', 'thread:thread_1']).state, 'active')

  assert.equal(providerSessionStatusLightForTargetKeys({}, ['session:session_1']).state, 'stopped')
})

test('providerSessionStatusLightFromConversationState treats shell thread state as authoritative', () => {
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
      detail: 'Runtime 会话当前不会自行触发新的 run，需要新的用户输入。',
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
      detail: 'Runtime 会话当前不会自行触发新的 run，需要新的用户输入。',
    },
  })
})

test('conversation tab provider-session lights read session state through split stores', () => {
  const source = readFileSync(resolve('src/features/agent/presentation/useAgentConversationTabProviderSessionStatusLights.ts'), 'utf8')

  assert.match(source, /agentConversationRegistryStore/)
  assert.match(source, /agentConversationRuntimeStore/)
  assert.doesNotMatch(source, /useAgentSessionStore/)
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
