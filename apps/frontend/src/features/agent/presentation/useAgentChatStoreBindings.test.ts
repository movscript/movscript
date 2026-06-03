import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveAgentChatRuntimeBindingIds } from '@/features/agent/presentation/useAgentChatStoreBindings'

test('resolveAgentChatRuntimeBindingIds falls back to live runtime thread before session-level aggregation', () => {
  const ids = resolveAgentChatRuntimeBindingIds({
    conversation: {
      id: 'conv_1',
      runtimeSessionId: 'session_1',
    },
    conversationRuntime: {
      sessionId: 'session_runtime',
      threadId: 'thread_runtime',
    },
  })

  assert.deepEqual(ids, {
    localSessionId: 'session_1',
    localThreadId: 'thread_runtime',
  })
})

test('resolveAgentChatRuntimeBindingIds keeps persisted local bindings authoritative', () => {
  const ids = resolveAgentChatRuntimeBindingIds({
    conversation: {
      id: 'conv_1',
      runtimeSessionId: 'session_conversation',
      runtimeThreadId: 'thread_conversation',
    },
    conversationRuntime: {
      sessionId: 'session_runtime',
      threadId: 'thread_runtime',
    },
    localSessionId: ' session_local ',
    localThreadId: ' thread_local ',
  })

  assert.deepEqual(ids, {
    localSessionId: 'session_local',
    localThreadId: 'thread_local',
  })
})
