import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import { activeRunInputDeliveryBadge } from '@/features/agent/presentation/agentActiveRunInputDeliveryBadge'
import { PROVIDER_SESSION_INPUT_DELIVERY_STATUS_COVERAGE } from '@/shared/infrastructure/provider-session-client/providerSessionTimelineCoverage'
import type { ChatMessage } from '@/features/agent/state/agentStore'

test('activeRunInputDeliveryBadge projects active run input delivery state for message bubbles', () => {
  assert.deepEqual(activeRunInputDeliveryBadge(message({
    meta: {
      providerSessionInput: { deliveryStatus: 'pending' },
    },
  })), {
    status: 'pending',
    label: '正在同步到运行中对话',
    tone: 'neutral',
    icon: 'spinner',
  })
  assert.deepEqual(activeRunInputDeliveryBadge(message({
    meta: {
      providerSessionInput: { deliveryStatus: 'accepted' },
    },
  })), {
    status: 'accepted',
    label: '已加入运行中对话',
    tone: 'neutral',
    icon: null,
  })
  assert.deepEqual(activeRunInputDeliveryBadge(message({
    meta: {
      providerSessionInput: { deliveryStatus: 'consumed' },
    },
  })), {
    status: 'consumed',
    label: '已被模型读取',
    tone: 'neutral',
    icon: null,
  })
  assert.deepEqual(activeRunInputDeliveryBadge(message({
    meta: {
      providerSessionInput: { deliveryStatus: 'failed', error: 'Provider session rejected input' },
    },
  })), {
    status: 'failed',
    label: '同步失败',
    tone: 'danger',
    title: 'Provider session rejected input',
    icon: 'error',
  })
})

test('activeRunInputDeliveryBadge accepts compatibility input refs only through the provider-session helper', () => {
  assert.equal(activeRunInputDeliveryBadge(message({
    meta: {
      runtimeInput: { deliveryStatus: 'pending' },
    },
  }))?.status, 'pending')
})

test('active run input delivery coverage matches every MovScript delivery status', () => {
  const protocol = readFileSync(resolve('../../packages/core/src/agent/protocol.ts'), 'utf8')
  const statuses = Object.keys(PROVIDER_SESSION_INPUT_DELIVERY_STATUS_COVERAGE).sort() as Array<keyof typeof PROVIDER_SESSION_INPUT_DELIVERY_STATUS_COVERAGE>
  const badges = statuses.map((status) => activeRunInputDeliveryBadge(message({
    meta: {
      providerSessionInput: { deliveryStatus: status },
    },
  })))

  assert.deepEqual(statuses, protocolStringUnion(protocol, 'ProviderSessionInputDeliveryStatus'))
  assert.deepEqual(badges.map((badge) => badge?.status), statuses.map((status) => PROVIDER_SESSION_INPUT_DELIVERY_STATUS_COVERAGE[status].displayStatus))
  assert.deepEqual(badges.map((badge) => badge?.tone), statuses.map((status) => PROVIDER_SESSION_INPUT_DELIVERY_STATUS_COVERAGE[status].badgeTone))
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
