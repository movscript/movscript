import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import { runtimeInputDeliveryBadge } from '@/features/agent/presentation/agentRuntimeInputDeliveryBadge'
import { AGENT_RUNTIME_CHAT_INPUT_DELIVERY_STATUS_COVERAGE } from '@/shared/infrastructure/local-agent-client/agentRuntimeChatTimelineCoverage'
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

test('runtime input delivery coverage matches every MovScript delivery status', () => {
  const protocol = readFileSync(resolve('../../packages/protocol/src/index.ts'), 'utf8')
  const statuses = Object.keys(AGENT_RUNTIME_CHAT_INPUT_DELIVERY_STATUS_COVERAGE).sort() as Array<keyof typeof AGENT_RUNTIME_CHAT_INPUT_DELIVERY_STATUS_COVERAGE>
  const badges = statuses.map((status) => runtimeInputDeliveryBadge(message({
    meta: {
      runtimeInput: { deliveryStatus: status },
    },
  })))

  assert.deepEqual(statuses, protocolStringUnion(protocol, 'AgentRuntimeInputDeliveryStatus'))
  assert.deepEqual(badges.map((badge) => badge?.status), statuses.map((status) => AGENT_RUNTIME_CHAT_INPUT_DELIVERY_STATUS_COVERAGE[status].displayStatus))
  assert.deepEqual(badges.map((badge) => badge?.tone), statuses.map((status) => AGENT_RUNTIME_CHAT_INPUT_DELIVERY_STATUS_COVERAGE[status].badgeTone))
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

function protocolStringUnion(protocol: string, typeName: string): string[] {
  const unionType = protocol.match(new RegExp(`export type ${typeName} = ([^\\n]+)`))
  assert.ok(unionType)
  return Array.from(unionType[1].matchAll(/'([^']+)'/g), (match) => match[1]).sort()
}
