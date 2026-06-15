import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveAgentChatProviderSessionBindingIds } from '@/features/agent/presentation/useAgentChatStoreBindings'

test('resolveAgentChatProviderSessionBindingIds reads conversation registry bindings', () => {
  const ids = resolveAgentChatProviderSessionBindingIds({
    conversation: {
      id: 'conv_1',
      providerSessionId: 'session_1',
      providerThreadId: 'thread_1',
    },
  })

  assert.deepEqual(ids, {
    providerSessionId: 'session_1',
    providerThreadId: 'thread_1',
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
    providerSessionId: ' session_local ',
    providerThreadId: ' thread_local ',
  })

  assert.deepEqual(ids, {
    providerSessionId: 'session_tree_binding',
    providerThreadId: 'thread_binding',
  })
})

test('resolveAgentChatProviderSessionBindingIds falls back to explicit input after bindings', () => {
  const ids = resolveAgentChatProviderSessionBindingIds({
    conversation: {
      id: 'conv_1',
      providerSessionId: 'session_conversation',
      providerThreadId: 'thread_conversation',
    },
    providerSessionId: ' session_local ',
    providerThreadId: ' thread_local ',
  })

  assert.deepEqual(ids, {
    providerSessionId: 'session_local',
    providerThreadId: 'thread_local',
  })
})
