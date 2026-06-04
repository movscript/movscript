import assert from 'node:assert/strict'
import test from 'node:test'

import { runtimeInputDeliveryBadge } from '@/features/agent/presentation/agentRuntimeInputDeliveryBadge'
import type { ChatMessage } from '@/features/agent/state/agentStore'

test('runtimeInputDeliveryBadge projects runtime input delivery state for message bubbles', () => {
  assert.deepEqual(runtimeInputDeliveryBadge(message({
    meta: {
      runtimeInput: { deliveryStatus: 'pending' },
    },
  })), {
    status: 'pending',
    label: '正在同步到运行中对话',
    tone: 'neutral',
    icon: 'spinner',
  })
  assert.deepEqual(runtimeInputDeliveryBadge(message({
    meta: {
      runtimeInput: { deliveryStatus: 'accepted' },
    },
  })), {
    status: 'accepted',
    label: '已加入运行中对话',
    tone: 'neutral',
    icon: null,
  })
  assert.deepEqual(runtimeInputDeliveryBadge(message({
    meta: {
      runtimeInput: { deliveryStatus: 'consumed' },
    },
  })), {
    status: 'consumed',
    label: '已被模型读取',
    tone: 'neutral',
    icon: null,
  })
  assert.deepEqual(runtimeInputDeliveryBadge(message({
    meta: {
      runtimeInput: { deliveryStatus: 'failed', error: 'Runtime rejected input' },
    },
  })), {
    status: 'failed',
    label: '同步失败',
    tone: 'danger',
    title: 'Runtime rejected input',
    icon: 'error',
  })
})

function message(patch: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message_1',
    role: 'user',
    content: '',
    timestamp: 1,
    ...patch,
  }
}
