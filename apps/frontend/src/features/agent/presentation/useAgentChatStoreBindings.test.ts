import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveAgentChatProviderSessionBindingIds } from '@/features/agent/presentation/useAgentChatStoreBindings'

test('resolveAgentChatProviderSessionBindingIds falls back to live provider-session thread before session-level aggregation', () => {
  const ids = resolveAgentChatProviderSessionBindingIds({
    conversation: {
      id: 'conv_1',
      providerSessionId: 'session_1',
    },
    conversationProviderSessionState: {
      sessionId: 'session_runtime',
      threadId: 'thread_runtime',
    },
  })

  assert.deepEqual(ids, {
    providerSessionId: 'session_1',
    providerThreadId: 'thread_runtime',
  })
})

test('resolveAgentChatProviderSessionBindingIds keeps conversation thread bindings authoritative', () => {
  const ids = resolveAgentChatProviderSessionBindingIds({
    conversation: {
      id: 'conv_1',
      providerSessionId: 'session_conversation',
      providerThreadId: 'thread_conversation',
    },
    conversationThreadBinding: {
      providerSessionTreeId: ' session_tree_binding ',
      providerThreadId: ' thread_binding ',
    },
    conversationProviderSessionState: {
      sessionId: 'session_runtime',
      threadId: 'thread_runtime',
    },
    providerSessionId: ' session_local ',
    providerThreadId: ' thread_local ',
  })

  assert.deepEqual(ids, {
    providerSessionId: 'session_tree_binding',
    providerThreadId: 'thread_binding',
  })
})

test('resolveAgentChatProviderSessionBindingIds falls back to explicit legacy input after bindings', () => {
  const ids = resolveAgentChatProviderSessionBindingIds({
    conversation: {
      id: 'conv_1',
      providerSessionId: 'session_conversation',
      providerThreadId: 'thread_conversation',
    },
    conversationProviderSessionState: {
      sessionId: 'session_runtime',
      threadId: 'thread_runtime',
    },
    providerSessionId: ' session_local ',
    providerThreadId: ' thread_local ',
  })

  assert.deepEqual(ids, {
    providerSessionId: 'session_local',
    providerThreadId: 'thread_local',
  })
})
